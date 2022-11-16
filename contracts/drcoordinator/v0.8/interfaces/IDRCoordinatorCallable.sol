// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { Chainlink } from "@chainlink/contracts/src/v0.8/Chainlink.sol";
import { AggregatorV3Interface } from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import { LinkTokenInterface } from "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";
import { FeeType, PaymentType, Spec } from "../libraries/internal/SpecLibrary.sol";

/**
 * @notice Contract writers can inherit this contract in order to interact with a DRCoordinator.
 */
interface IDRCoordinatorCallable {
    // Used in the function that calculates the LINK payment amount to execute a specific logic.
    enum PaymentPreFeeType {
        MAX,
        SPOT
    }

    error DRCoordinator__CallbackAddrIsDRCoordinator(address callbackAddr);
    error DRCoordinator__CallbackAddrIsNotContract(address callbackAddr);
    error DRCoordinator__CallbackGasLimitIsGtSpecGasLimit(uint32 callbackGasLimit, uint32 specGasLimit);
    error DRCoordinator__CallbackGasLimitIsLtMinRequestGasLimit(uint32 callbackGasLimit, uint32 minRequestGasLimit);
    error DRCoordinator__CallerIsNotAuthorizedConsumer(bytes32 key, address operatorAddr, bytes32 specId);
    error DRCoordinator__CallerIsNotRequester(address requester);
    error DRCoordinator__CallerIsNotRequestOperator(address operatorAddr);
    error DRCoordinator__CallIsReentrant();
    error DRCoordinator__FeedAnswerIsNotGtZero(address priceFeed, int256 answer);
    error DRCoordinator__FeeTypeIsUnsupported(FeeType feeType);
    error DRCoordinator__LinkAllowanceIsInsufficient(address payer, uint96 allowance, uint96 amount);
    error DRCoordinator__LinkBalanceIsInsufficient(address payer, uint96 balance, uint96 amount);
    error DRCoordinator__LinkPaymentIsGtConsumerMaxPayment(uint96 payment, uint96 consumerMaxPayment);
    error DRCoordinator__LinkPaymentIsGtLinkTotalSupply(uint96 payment, uint96 linkTotalSupply);
    error DRCoordinator__LinkTransferAndCallFailed(address to, uint96 amount, bytes encodedRequest);
    error DRCoordinator__LinkTransferFailed(address to, uint96 amount);
    error DRCoordinator__LinkTransferFromFailed(address from, address to, uint96 amount);
    error DRCoordinator__PaymentPreFeeTypeIsUnsupported(PaymentPreFeeType paymentPreFeeType);
    error DRCoordinator__PaymentTypeIsUnsupported(PaymentType paymentType);
    error DRCoordinator__RequestIsNotPending();

    /**
     * @notice Stores the essential `Spec` request data to be used by DRCoordinator when fulfilling the request.
     * @dev Size = slot0 (32) + slot1 (32) + slot2 (26) = 90 bytes
     * @member msgSender The Consumer address.
     * @member payment The LINK amount Operator holds in escrow (aka. REQUEST LINK payment).
     * @member callbackAddr The Consumer address where to fulfill the request.
     * @member fee From `Spec.fee`. The LINK amount that DRCoordinator charges Consumer when fulfilling the request.
     * It depends on the `feeType`.
     * @member consumerMaxPayment The maximum LINK amount Consumer is willing to pay for the request.
     * @member gasLimit The maximum gas amount Consumer is willing to set on the fulfillment transaction, plus the fixed
     * amount of gas DRCoordinator requires when executing the fulfillment logic.
     * @member feeType From `Spec.feeType`. The kind of `fee`; a fixed amount or a percentage of the LINK required to
     * cover the gas costs incurred.
     * @member callbackFunctionId The Consumer function signature to call when fulfilling the request.
     * @member expiration The UNIX timestamp before Consumer can cancel the unfulfilled request.
     */
    struct FulfillConfig {
        address msgSender; // 20 bytes -> slot0
        uint96 payment; // 12 bytes -> slot0
        address callbackAddr; // 20 bytes -> slot1
        uint96 fee; // 12 bytes -> slot 1
        uint96 consumerMaxPayment; // 12 bytes -> slot 2
        uint32 gasLimit; // 4 bytes -> slot2
        FeeType feeType; // 1 byte -> slot2
        bytes4 callbackFunctionId; // 4 bytes -> slot2
        uint40 expiration; // 5 bytes -> slot2
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    /**
     * @notice Allows to top-up any Consumer LINK balances.
     * @param _consumer The Consumer address.
     * @param _amount The LINK amount.
     */
    function addFunds(address _consumer, uint96 _amount) external;

    /**
     * @notice Allows Consumer to cancel an unfulfilled request.
     * @param _requestId The request ID.
     */
    function cancelRequest(bytes32 _requestId) external;

    /**
     * @notice Called by `Operator.fulfillOracleRequest2()` to fulfill requests with multi-word support.
     * @param _requestId The request ID.
     * @param _data The data to return to Consumer.
     */
    function fulfillData(bytes32 _requestId, bytes calldata _data) external;

    /**
     * @notice Called by Consumer to send a Chainlink request to Operator.
     * @dev The Chainlink request has been built by Consumer and is extended by DRCoordinator.
     * @param _operatorAddr The Operator contract address.
     * @param _callbackGasLimit The amount of gas to attach to the fulfillment transaction. It is the `gasLimit`
     * parameter of the `ethtx` task of the `direcrequest` job.
     * @param _consumerMaxPayment The maximum amount of LINK willing to pay for the request (REQUEST LINK payment +
     * SPOT LINK payment). Set it to 0 if there is no hard cap.
     * @param _req The initialized `Chainlink.Request`.
     */
    function requestData(
        address _operatorAddr,
        uint32 _callbackGasLimit,
        uint96 _consumerMaxPayment,
        Chainlink.Request memory _req
    ) external returns (bytes32);

    /**
     * @notice Allows to withdraw Consumer LINK balances.
     * @param _payee The receiver address.
     * @param _amount The LINK amount.
     */
    function withdrawFunds(address _payee, uint96 _amount) external;

    /* ========== EXTERNAL VIEW FUNCTIONS ========== */

    /**
     * @notice Returns the LINK balance for the given address.
     * @dev The LINK earned by DRCoordinator are held in its own address.
     * @param _consumer The Consumer address.
     * @return The LINK balance.
     */
    function availableFunds(address _consumer) external view returns (uint96);

    /**
     * @notice Calculates the maximum LINK amount to pay for the request (aka. MAX LINK payment amount). The amount is
     * the result of simulating the usage of all the request `callbackGasLimit` (set by Consumer) with the current
     * LINK and GASTKN prices (via Chainlink Price Feeds on the network).
     * @dev Consumer can call this method to know in advance the request MAX LINK payment and act upon it.
     * @param _weiPerUnitGas The amount of LINK per unit of GASTKN.
     * @param _paymentInEscrow The REQUEST LINK payment amount (if exists) hold in escrow by Operator.
     * @param _gasLimit The `callbackGasLimit` set by the Consumer request.
     * @param _feeType The requested `Spec.feeType`.
     * @param _fee The requested `Spec.fee`.
     * @return The LINK payment amount.
     */
    function calculateMaxPaymentAmount(
        uint256 _weiPerUnitGas,
        uint96 _paymentInEscrow,
        uint32 _gasLimit,
        FeeType _feeType,
        uint96 _fee
    ) external view returns (int256);

    /**
     * @notice Estimates the LINK amount to pay for fulfilling the request (aka. SPOT LINK payment amount). The amount
     * is the result of calculating the LINK amount used to cover the gas costs with the current
     * LINK and GASTKN prices (via Chainlink Price Feeds on the network).
     * @dev This method has limitations. It does not take into account the gas incurrend by
     * `Operator.fulfillOracleRequest2()` nor `DRCoordinator.fulfillData()`. All of them are affected, among other
     * things, by the data size and the fulfillment method logic. Therefore it is needed to fine tune `startGas`.
     * @param _weiPerUnitGas The amount of LINK per unit of GASTKN.
     * @param _paymentInEscrow The REQUEST LINK payment amount (if exists) hold in escrow by Operator.
     * @param _feeType The requested `Spec.feeType`.
     * @param _fee The requested `Spec.fee`.
     * @return The LINK payment amount.
     */
    function calculateSpotPaymentAmount(
        uint32 _startGas,
        uint256 _weiPerUnitGas,
        uint96 _paymentInEscrow,
        FeeType _feeType,
        uint96 _fee
    ) external view returns (int256);

    /**
     * @notice Returns the contract description.
     * @return The description.
     */
    function getDescription() external view returns (string memory);

    /**
     * @notice Returns wei of GASTKN per unit of LINK.
     * @dev On a single Price Feed setup the value comes from LINK / GASTKN feed.
     * @dev On a multi Price Feed setup the value comes from GASTKN / TKN and LINK / TKN feeds.
     * @dev The returned value comes from `fallbackWeiPerUnitLink` if any Price Feed is unresponsive (stale answer).
     * @dev On a L2 Sequencer dependant setup the returned value comes from `fallbackWeiPerUnitLink` if the L2
     * Sequencer Uptime Status Feed answer is not valid or has not been reported after the grace period.
     * @return The wei amount.
     */
    function getFeedData() external view returns (uint256);

    /**
     * @notice Returns the default wei of GASTKN per unit of LINK.
     * @return The wei amount.
     */
    function getFallbackWeiPerUnitLink() external view returns (uint256);

    /**
     * @notice Returns the `FulfillConfig` struct of the request.
     * @param _requestId The request ID.
     * @return The `FulfillConfig`.
     */
    function getFulfillConfig(bytes32 _requestId) external view returns (FulfillConfig memory);

    /**
     * @notice Returns whether DRCoordinator is set up to depend on a L2 Sequencer.
     * @return A boolean.
     */
    function getIsL2SequencerDependant() external view returns (bool);

    /**
     * @notice Returns whether DRCoordinator is set up to use two Price Feed to calculate the wei of GASTKN per unit of
     * LINK.
     * @return A boolean.
     */
    function getIsMultiPriceFeedDependant() external view returns (bool);

    /**
     * @notice Returns whether the DRCoordinator mutex is locked.
     * @dev The lock visibility is public to facilitate the understandment of the DRCoordinator state.
     * @return A boolean.
     */
    function getIsReentrancyLocked() external view returns (bool);

    /**
     * @notice Returns the LinkToken on the network.
     * @return The `LinkTokenInterface`.
     */
    function getLinkToken() external view returns (LinkTokenInterface);

    /**
     * @notice Returns the L2 Sequencer Uptime Status Feed address (as interface) on the network.
     * @return The `AggregatorV3Interface`.
     */
    function getL2SequencerFeed() external view returns (AggregatorV3Interface);

    /**
     * @notice Returns the number of seconds to wait before trusting the L2 Sequencer Uptime Status Feed answers.
     * @return The number of secods.
     */
    function getL2SequencerGracePeriodSeconds() external view returns (uint256);

    /**
     * @notice Returns the amount of `Spec` in DRCoordinator storage.
     * @return The amount of `Spec`.
     */
    function getNumberOfSpecs() external view returns (uint256);

    /**
     * @notice Returns the current permiryad factor that determines the maximum fee on permiryiad fee types.
     * @dev The number is multiplied by `PERMIRYAD` to calculate the `maxPeriryadFee`.
     * @return The factor.
     */
    function getPermiryadFeeFactor() external view returns (uint8);

    /**
     * @notice Returns the Price Feed 1 on the network.
     * @dev LINK / GASTKN on a single Price Feed setup.
     * @dev GASTKN / TKN on a multi Price Feed setup.
     * @return The `AggregatorV3Interface`.
     */
    function getPriceFeed1() external view returns (AggregatorV3Interface);

    /**
     * @notice Returns the Price Feed 2 on the network.
     * @dev Ignored (i.e. Zero address) on a single Price Feed setup.
     * @dev LINK / TKN on a multi Price Feed setup.
     * @return The `AggregatorV3Interface`.
     */
    function getPriceFeed2() external view returns (AggregatorV3Interface);

    /**
     * @notice Returns the number of Chainlink requests done by DRCoordinator.
     * @dev It is used to generate the Chainlink Request request ID and nonce.
     * @return The amount.
     */
    function getRequestCount() external view returns (uint256);

    /**
     * @notice Returns a `Spec` by key.
     * @param _key The `Spec` key.
     * @return The `Spec`.
     */
    function getSpec(bytes32 _key) external view returns (Spec memory);

    /**
     * @notice Returns the authorized consumer addresses (aka. requesters) by the given `Spec` (by key).
     * @param _key The `Spec` key.
     * @return The array of addresses.
     */
    function getSpecAuthorizedConsumers(bytes32 _key) external view returns (address[] memory);

    /**
     * @notice Returns the `Spec` key at the given position.
     * @dev Spec `key = keccak256(abi.encodePacked(operator, specId))`.
     * @param _index The `Spec` index.
     * @return The `Spec` key.
     */
    function getSpecKeyAtIndex(uint256 _index) external view returns (bytes32);

    /**
     * @notice Returns all the `Spec` keys.
     * @dev Spec `key = keccak256(abi.encodePacked(operator, specId))`.
     * @return The `Spec` keys array.
     */
    function getSpecMapKeys() external view returns (bytes32[] memory);

    /**
     * @notice Returns the number of seconds after which any Price Feed answer is considered stale and invalid.
     * @return The amount of seconds.
     */
    function getStalenessSeconds() external view returns (uint256);

    /**
     * @notice Returns whether Consumer (aka. requester) is authorized to request the given `Spec` (by key).
     * @param _key The `Spec` key.
     * @param _consumer The Consumer address.
     * @return A boolean.
     */
    function isSpecAuthorizedConsumer(bytes32 _key, address _consumer) external view returns (bool);

    /* ========== EXTERNAL PURE FUNCTIONS ========== */

    /**
     * @notice Returns the amount of gas needed by DRCoordinator to execute any fulfillment logic left on the
     * `fulfillData()` method after calling Consumer with the response data.
     * @return The gas units.
     */
    function getGasAfterPaymentCalculation() external pure returns (uint32);
}
