// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { Chainlink } from "@chainlink/contracts/src/v0.8/Chainlink.sol";
import { AggregatorV3Interface } from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import { LinkTokenInterface } from "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";
import { FeeType, PaymentType, Spec } from "../libraries/internal/SpecLibrary.sol";
import { PaymentPreFeeType } from "../DRCoordinator.sol";

interface IDRCoordinatorCallable {
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

    // FulfillConfig size = slot0 (32) + slot1 (32) + slot2 (26) = 90 bytes
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

    function addFunds(address _consumer, uint96 _amount) external;

    function cancelRequest(bytes32 _requestId) external;

    function fulfillData(bytes32 _requestId, bytes calldata _data) external;

    function requestData(
        address _operatorAddr,
        uint32 _callbackGasLimit,
        uint96 _consumerMaxPayment,
        Chainlink.Request memory _req
    ) external returns (bytes32);

    function withdrawFunds(address _payee, uint96 _amount) external;

    /* ========== EXTERNAL VIEW FUNCTIONS ========== */

    function availableFunds(address _consumer) external view returns (uint96);

    function calculateMaxPaymentAmount(
        uint256 _weiPerUnitGas,
        uint96 _payment,
        uint32 _gasLimit,
        FeeType _feeType,
        uint96 _fee
    ) external view returns (int256);

    function calculateSpotPaymentAmount(
        uint32 _startGas,
        uint256 _weiPerUnitGas,
        uint96 _payment,
        FeeType _feeType,
        uint96 _fee
    ) external view returns (int256);

    function getDescription() external view returns (string memory);

    function getFeedData() external view returns (uint256);

    function getFallbackWeiPerUnitLink() external view returns (uint256);

    function getFulfillConfig(bytes32 _requestId) external view returns (FulfillConfig memory);

    function getIsL2SequencerDependant() external view returns (bool);

    function getIsMultiPriceFeedDependant() external view returns (bool);

    function getLinkToken() external view returns (LinkTokenInterface);

    function getL2SequencerFeed() external view returns (AggregatorV3Interface);

    function getL2SequencerGracePeriodSeconds() external view returns (uint256);

    function getNumberOfSpecs() external view returns (uint256);

    function getPermiryadFeeFactor() external view returns (uint8);

    function getPriceFeed1() external view returns (AggregatorV3Interface);

    function getPriceFeed2() external view returns (AggregatorV3Interface);

    function getRequestCount() external view returns (uint256);

    function getSpec(bytes32 _key) external view returns (Spec memory);

    function getSpecAuthorizedConsumers(bytes32 _key) external view returns (address[] memory);

    function getSpecKeyAtIndex(uint256 _index) external view returns (bytes32);

    function getSpecMapKeys() external view returns (bytes32[] memory);

    function getStalenessSeconds() external view returns (uint256);

    function isSpecAuthorizedConsumer(bytes32 _key, address _consumer) external view returns (bool);

    /* ========== EXTERNAL PURE FUNCTIONS ========== */

    function getGasAfterPaymentCalculation() external pure returns (uint32);
}
