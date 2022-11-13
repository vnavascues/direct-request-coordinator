// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { Chainlink } from "@chainlink/contracts/src/v0.8/Chainlink.sol";
import { ConfirmedOwner } from "@chainlink/contracts/src/v0.8/ConfirmedOwner.sol";
import { AggregatorV3Interface } from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import { LinkTokenInterface } from "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";
import { OperatorInterface } from "@chainlink/contracts/src/v0.8/interfaces/OperatorInterface.sol";
import { TypeAndVersionInterface } from "@chainlink/contracts/src/v0.8/interfaces/TypeAndVersionInterface.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IDRCoordinatorCallable } from "./interfaces/IDRCoordinatorCallable.sol";
import { IDRCoordinatorOwnable } from "./interfaces/IDRCoordinatorOwnable.sol";
import { IChainlinkExternalFulfillment } from "./interfaces/IChainlinkExternalFulfillment.sol";
import { FeeType, PaymentType, Spec, SpecLibrary } from "./libraries/internal/SpecLibrary.sol";
import { InsertedAddressLibrary as AuthorizedConsumerLibrary } from "./libraries/internal/InsertedAddressLibrary.sol";

// NB: enum placed outside due to Slither bug https://github.com/crytic/slither/issues/1166
enum PaymentPreFeeType {
    MAX,
    SPOT
}

/**
 * @title The DRCoordinator (coOperator) contract.
 * @author LinkPool.
 * @notice Node operators can deploy this contract to enable dynamic LINK payments on Direct Request, syncing the job
 * price (in LINK) with the network gas and token conditions.
 * @dev Uses @chainlink/contracts 0.5.1.
 * @dev This contract cooperates with the Operator contract. DRCoordinator interfaces 1..N DRCoordinatorClient contracts
 * with 1..N Operator contracts, forwarding Chainlink requests and responses. Compared to the standard Direct Request
 * model/flow (via a ChainlinkClient and an Operator), DRCoordinator does:
 *
 * - Request: first, it stores essential client and request data to be used upon fulfillment. Then, it extends the
 * Chainlink.Request built by the DRCoordinatorClient. And finally, it sends the Chainlink.Request to the aimed Operator
 * (forward request). At this stage, the LINK payment amount sent to the Operator (and to be held in escrow) is either a
 * flat or a percentage amount (both configured by the operator). The latter is a percentage of the maximum LINK payment
 * amount (MAX) if all the gasLimit (configured per Spec by the operator) was used fulfilling the request.
 *
 * - Fulfillment: first, it loads the request data previously stored. Then, it fulfills the request (forwards response).
 * And finally, it deals with the LINK internal balances with regards to paying for the job done. At this stage, the
 * LINK payment amount (SPOT) is calculated using the exact gas amount used fulfilling the request and subtracting the
 * initial payment (held in escrow by the Operator contract) and optionally adding a fee (either a flat or a percentage
 * amount configured per Spec by the operator). It is worth mentioning that DRCoordinator can refund a consumer if the
 * initial payment amount was greater than the SPOT payment amount, and DRCoordinator's balance is greater or equal than
 * the SPOT payment amount. Tuning the Spec payment and fee properties should make this case very rare.
 *
 * @dev The MAX and SPOT LINK payment amounts are calculated using the Chainlink Price Feeds on the network (configured
 * by the operator on deployment), which provides the TKN wei amount per unit of LINK. The ideal scenario is to use the
 * LINK / TKN price feed, although two feeds can be configured, i.e. TKN / USD (priceFeed1) and LINK / USD (priceFeed2).
 * @dev This contract implements the following Chainlink Price Feed risk mitigation strategies for: stale answer, and
 * L2 Sequencer outage. The wei value per unit of LINK will default to a value set by the operator.
 * @dev This contract implements an emergency stop mechanism (triggered by the operator). Only request data, and fulfill
 * data are the functionalities disabled when the contract is paused.
 * @dev This contract allows CRUD Spec. A Spec is the Solidity representation of the essential data of a directrequest
 * TOML job spec. It also includes specific variables for dynamic LINK payments.
 * @dev This contract allows CRD authorized consumers (whitelisted requesters) per Spec on-chain. Off-chain
 * whitelisting at TOML job spec level using the 'requesters' field is unfortunately not possible.
 * @dev This contract allows to fulfill requests in a contract different from the one who built it (aka. Chainlink
 * external requests, splitted consumer pattern).
 * @dev This contract has internal LINK balances for itself and any consumer, and any address (EOA/contract) can fund
 * them. Only the operator (owner) is able to withdraw the LINK from the DRCoordinator balances. And only the consumer
 * is able to withdraw the LINK from its balances. Be aware that the initial LINK payment is in the Operator contract
 * (either held in escrow or as earned LINK).
 * @dev This contract provides a wide range of external view methods to query Spec, Spec authorized consumers, and
 * calculating the MAX and SPOT LINK payment amount (per Spec).
 */
contract DRCoordinator is
    ConfirmedOwner,
    Pausable,
    ReentrancyGuard,
    TypeAndVersionInterface,
    IDRCoordinatorCallable,
    IDRCoordinatorOwnable
{
    using Address for address;
    using AuthorizedConsumerLibrary for AuthorizedConsumerLibrary.Map;
    using Chainlink for Chainlink.Request;
    using SpecLibrary for SpecLibrary.Map;

    uint256 private constant AMOUNT_OVERRIDE = 0; // 32 bytes
    uint256 private constant OPERATOR_ARGS_VERSION = 2; // 32 bytes
    uint256 private constant OPERATOR_REQUEST_EXPIRATION_TIME = 5 minutes;
    bytes32 private constant NO_SPEC_ID = bytes32(0); // 32 bytes
    uint256 private constant TKN_TO_WEI_FACTOR = 1e18; // 32 bytes
    address private constant SENDER_OVERRIDE = address(0); // 20 bytes
    uint96 private constant LINK_TOTAL_SUPPLY = 1e27; // 12 bytes
    uint64 private constant LINK_TO_JUELS_FACTOR = 1e18; // 8 bytes
    bytes4 private constant OPERATOR_REQUEST_SELECTOR = OperatorInterface.operatorRequest.selector; // 4 bytes
    bytes4 private constant FULFILL_DATA_SELECTOR = this.fulfillData.selector; // 4 bytes
    uint16 public constant PERMIRYAD = 10_000; // 2 bytes
    uint32 private constant MIN_REQUEST_GAS_LIMIT = 400_000; // 6 bytes, from Operator.sol MINIMUM_CONSUMER_GAS_LIMIT
    // NB: with the current balance model & actions after calculating the payment, it is safe setting the
    // GAS_AFTER_PAYMENT_CALCULATION to 50_000 as a constant. Exact amount used is 42422 gas
    uint32 public constant GAS_AFTER_PAYMENT_CALCULATION = 50_000; // 6 bytes
    bool public immutable IS_SEQUENCER_DEPENDANT; // 1 byte
    LinkTokenInterface public immutable LINK; // 20 bytes
    AggregatorV3Interface public immutable L2_SEQUENCER_FEED; // 20 bytes
    AggregatorV3Interface public immutable PRICE_FEED_1; // 20 bytes - LINK/TKN (single feed) or TKN/USD (multi feed)
    AggregatorV3Interface public immutable PRICE_FEED_2; // 20 bytes - address(0) (single feed) or LINK/USD (multi feed)
    bool public immutable IS_MULTI_PRICE_FEED_DEPENDANT; // 1 byte
    uint8 private s_permiryadFeeFactor = 1; // 1 byte
    uint256 private s_requestCount = 1; // 32 bytes
    uint256 private s_stalenessSeconds; // 32 bytes
    uint256 private s_l2SequencerGracePeriodSeconds; // 32 bytes
    uint256 private s_fallbackWeiPerUnitLink; // 32 bytes
    string private s_description;
    mapping(bytes32 => address) private s_pendingRequests; /* requestId */ /* operatorAddr */
    mapping(address => uint96) private s_consumerToLinkBalance; /* mgs.sender */ /* LINK */
    mapping(bytes32 => FulfillConfig) private s_requestIdToFulfillConfig; /* requestId */ /* FulfillConfig */
    /* keccak256(abi.encodePacked(operatorAddr, specId)) */
    /* address */
    /* bool */
    mapping(bytes32 => AuthorizedConsumerLibrary.Map) private s_keyToAuthorizedConsumerMap;
    SpecLibrary.Map private s_keyToSpec; /* keccak256(abi.encodePacked(operatorAddr, specId)) */ /* Spec */

    string public constant override typeAndVersion = "DRCoordinator 1.0.0";

    event AuthorizedConsumersAdded(bytes32 indexed key, address[] consumers);
    event AuthorizedConsumersRemoved(bytes32 indexed key, address[] consumers);
    event ChainlinkCancelled(bytes32 indexed id);
    event ChainlinkFulfilled(
        bytes32 indexed requestId,
        bool success,
        address indexed callbackAddr,
        bytes4 callbackFunctionId,
        uint96 initialPayment,
        int256 spotPayment
    );
    event ChainlinkRequested(bytes32 indexed id);
    event DescriptionSet(string description);
    event FallbackWeiPerUnitLinkSet(uint256 fallbackWeiPerUnitLink);
    event FundsAdded(address indexed from, address indexed to, uint96 amount);
    event FundsWithdrawn(address indexed from, address indexed to, uint96 amount);
    event GasAfterPaymentCalculationSet(uint32 gasAfterPaymentCalculation);
    event L2SequencerGracePeriodSecondsSet(uint256 l2SequencerGracePeriodSeconds);
    event PermiryadFeeFactorSet(uint8 permiryadFactor);
    event SetExternalPendingRequestFailed(address indexed callbackAddr, bytes32 indexed requestId, bytes32 key);
    event SpecRemoved(bytes32 indexed key);
    event SpecSet(bytes32 indexed key, Spec spec);
    event StalenessSecondsSet(uint256 stalenessSeconds);

    constructor(
        address _link,
        bool _isMultiPriceFeedDependant,
        address _priceFeed1,
        address _priceFeed2,
        string memory _description,
        uint256 _fallbackWeiPerUnitLink,
        uint256 _stalenessSeconds,
        bool _isSequencerDependant,
        address _l2SequencerFeed,
        uint256 _l2SequencerGracePeriodSeconds
    ) ConfirmedOwner(msg.sender) {
        _requirePriceFeed(_isMultiPriceFeedDependant, _priceFeed1, _priceFeed2);
        _requireFallbackWeiPerUnitLinkIsGtZero(_fallbackWeiPerUnitLink);
        _requireL2SequencerFeed(_isSequencerDependant, _l2SequencerFeed);
        LINK = LinkTokenInterface(_link);
        IS_MULTI_PRICE_FEED_DEPENDANT = _isMultiPriceFeedDependant;
        PRICE_FEED_1 = AggregatorV3Interface(_priceFeed1);
        PRICE_FEED_2 = _isMultiPriceFeedDependant
            ? AggregatorV3Interface(_priceFeed2)
            : AggregatorV3Interface(address(0));
        IS_SEQUENCER_DEPENDANT = _isSequencerDependant;
        L2_SEQUENCER_FEED = _isSequencerDependant
            ? AggregatorV3Interface(_l2SequencerFeed)
            : AggregatorV3Interface(address(0));
        s_description = _description;
        s_fallbackWeiPerUnitLink = _fallbackWeiPerUnitLink;
        s_stalenessSeconds = _stalenessSeconds;
        s_l2SequencerGracePeriodSeconds = _isSequencerDependant ? _l2SequencerGracePeriodSeconds : 0;
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    function addFunds(address _consumer, uint96 _amount) external nonReentrant {
        _requireLinkAllowanceIsSufficient(msg.sender, uint96(LINK.allowance(msg.sender, address(this))), _amount);
        _requireLinkBalanceIsSufficient(msg.sender, uint96(LINK.balanceOf(msg.sender)), _amount);
        s_consumerToLinkBalance[_consumer] += _amount;
        emit FundsAdded(msg.sender, _consumer, _amount);
        if (!LINK.transferFrom(msg.sender, address(this), _amount)) {
            revert IDRCoordinatorCallable.DRCoordinator__LinkTransferFromFailed(msg.sender, address(this), _amount);
        }
    }

    function addSpecAuthorizedConsumers(bytes32 _key, address[] calldata _authConsumers) external onlyOwner {
        _addSpecAuthorizedConsumers(_key, _authConsumers);
    }

    function addSpecsAuthorizedConsumers(bytes32[] calldata _keys, address[][] calldata _authConsumersArray)
        external
        onlyOwner
    {
        uint256 keysLength = _keys.length;
        _requireArrayIsNotEmpty("keys", keysLength);
        _requireArrayLengthsAreEqual("keys", keysLength, "authConsumersArray", _authConsumersArray.length);
        for (uint256 i = 0; i < keysLength; ) {
            _addSpecAuthorizedConsumers(_keys[i], _authConsumersArray[i]);
            unchecked {
                ++i;
            }
        }
    }

    function cancelRequest(bytes32 _requestId) external nonReentrant {
        address operatorAddr = s_pendingRequests[_requestId];
        _requireRequestIsPending(operatorAddr);
        IDRCoordinatorCallable.FulfillConfig memory fulfillConfig = s_requestIdToFulfillConfig[_requestId];
        _requireCallerIsRequester(fulfillConfig.msgSender);
        s_consumerToLinkBalance[msg.sender] += fulfillConfig.payment;
        OperatorInterface operator = OperatorInterface(operatorAddr);
        delete s_pendingRequests[_requestId];
        emit ChainlinkCancelled(_requestId);
        operator.cancelOracleRequest(
            _requestId,
            fulfillConfig.payment,
            FULFILL_DATA_SELECTOR,
            fulfillConfig.expiration
        );
    }

    function fulfillData(bytes32 _requestId, bytes calldata _data) external whenNotPaused nonReentrant {
        // Validate sender is the Operator of the request
        _requireCallerIsRequestOperator(s_pendingRequests[_requestId]);
        delete s_pendingRequests[_requestId];
        // Retrieve FulfillConfig by request ID
        IDRCoordinatorCallable.FulfillConfig memory fulfillConfig = s_requestIdToFulfillConfig[_requestId];
        // Format off-chain data
        bytes memory data = abi.encodePacked(fulfillConfig.callbackFunctionId, _data);
        // Fulfill just with the gas amount requested by the consumer
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = fulfillConfig.callbackAddr.call{
            gas: fulfillConfig.gasLimit - GAS_AFTER_PAYMENT_CALCULATION
        }(data);
        // Calculate the SPOT LINK payment amount
        int256 spotPaymentInt = _calculatePaymentAmount(
            PaymentPreFeeType.SPOT,
            fulfillConfig.gasLimit,
            tx.gasprice,
            fulfillConfig.payment,
            0,
            fulfillConfig.feeType,
            fulfillConfig.fee
        );
        // NB: statemens below cost 42422 gas -> GAS_AFTER_PAYMENT_CALCULATION = 50k gas
        // Calculate the LINK payment to either pay (consumer -> DRCoordinator) or refund (DRCoordinator -> consumer),
        // check whether the payer has enough balance, and adjust their balances (payer and payee)
        uint96 consumerLinkBalance = s_consumerToLinkBalance[fulfillConfig.msgSender];
        uint96 drCoordinatorLinkBalance = s_consumerToLinkBalance[address(this)];
        uint96 spotPayment;
        address payer;
        uint96 payerLinkBalance;
        if (spotPaymentInt >= 0) {
            spotPayment = uint96(uint256(spotPaymentInt));
            payer = fulfillConfig.msgSender;
            payerLinkBalance = consumerLinkBalance;
        } else {
            spotPayment = uint96(uint256(-spotPaymentInt));
            payer = address(this);
            payerLinkBalance = drCoordinatorLinkBalance;
        }
        _requireLinkPaymentIsInRange(spotPayment);
        _requireLinkBalanceIsSufficient(payer, payerLinkBalance, spotPayment);
        if (spotPaymentInt >= 0) {
            consumerLinkBalance -= spotPayment;
            drCoordinatorLinkBalance += spotPayment;
        } else {
            consumerLinkBalance += spotPayment;
            drCoordinatorLinkBalance -= spotPayment;
        }
        s_consumerToLinkBalance[fulfillConfig.msgSender] = consumerLinkBalance;
        s_consumerToLinkBalance[address(this)] = drCoordinatorLinkBalance;
        delete s_requestIdToFulfillConfig[_requestId];
        emit ChainlinkFulfilled(
            _requestId,
            success,
            fulfillConfig.callbackAddr,
            fulfillConfig.callbackFunctionId,
            fulfillConfig.payment,
            spotPaymentInt
        );
    }

    function pause() external onlyOwner {
        _pause();
    }

    function removeSpecAuthorizedConsumers(bytes32 _key, address[] calldata _authConsumers) external onlyOwner {
        AuthorizedConsumerLibrary.Map storage s_authorizedConsumerMap = s_keyToAuthorizedConsumerMap[_key];
        _removeSpecAuthorizedConsumers(_key, _authConsumers, s_authorizedConsumerMap, true);
    }

    function removeSpecsAuthorizedConsumers(bytes32[] calldata _keys, address[][] calldata _authConsumersArray)
        external
        onlyOwner
    {
        uint256 keysLength = _keys.length;
        _requireArrayIsNotEmpty("keys", keysLength);
        _requireArrayLengthsAreEqual("keys", keysLength, "authConsumersArray", _authConsumersArray.length);
        for (uint256 i = 0; i < keysLength; ) {
            bytes32 key = _keys[i];
            AuthorizedConsumerLibrary.Map storage s_authorizedConsumerMap = s_keyToAuthorizedConsumerMap[key];
            _removeSpecAuthorizedConsumers(key, _authConsumersArray[i], s_authorizedConsumerMap, true);
            unchecked {
                ++i;
            }
        }
    }

    function requestData(
        address _operatorAddr,
        uint32 _callbackGasLimit,
        Chainlink.Request memory _req
    ) external whenNotPaused nonReentrant returns (bytes32) {
        // Validate parameters
        bytes32 key = _generateSpecKey(_operatorAddr, _req.id);
        _requireSpecIsInserted(key);
        address callbackAddr = _req.callbackAddress;
        _validateCallbackAddress(callbackAddr); // NB: prevents malicious loops
        // Validate consumer (requester) is authorized to request the Spec
        _requireCallerIsAuthorizedConsumer(key, _operatorAddr, _req.id);
        // Validate arguments against Spec parameters
        Spec memory spec = s_keyToSpec._getSpec(key);
        _validateCallbackGasLimit(_callbackGasLimit, spec.gasLimit);
        // Calculate the MAX LINK payment amount
        uint96 maxPayment = uint96(
            uint256(
                _calculatePaymentAmount(
                    PaymentPreFeeType.MAX,
                    0,
                    tx.gasprice,
                    0,
                    _callbackGasLimit,
                    spec.feeType,
                    spec.fee
                )
            )
        );
        _requireLinkPaymentIsInRange(maxPayment);
        // Calculate the required consumer LINK balance, the LINK payment amount to be held escrow by the Operator,
        // check whether the consumer has enough balance, and adjust its balance
        uint96 consumerLinkBalance = s_consumerToLinkBalance[msg.sender];
        (
            uint96 requiredConsumerLinkBalance,
            uint96 paymentInEscrow
        ) = _calculateRequiredConsumerLinkBalanceAndPaymentInEscrow(maxPayment, spec.paymentType, spec.payment);
        _requireLinkBalanceIsSufficient(msg.sender, consumerLinkBalance, requiredConsumerLinkBalance);
        s_consumerToLinkBalance[msg.sender] = consumerLinkBalance - paymentInEscrow;
        // Initialise the fulfill configuration
        IDRCoordinatorCallable.FulfillConfig memory fulfillConfig;
        fulfillConfig.msgSender = msg.sender;
        fulfillConfig.payment = paymentInEscrow;
        fulfillConfig.callbackAddr = callbackAddr;
        fulfillConfig.fee = spec.fee;
        fulfillConfig.gasLimit = _callbackGasLimit + GAS_AFTER_PAYMENT_CALCULATION;
        fulfillConfig.feeType = spec.feeType;
        fulfillConfig.callbackFunctionId = _req.callbackFunctionId;
        fulfillConfig.expiration = uint40(block.timestamp + OPERATOR_REQUEST_EXPIRATION_TIME);
        // Replace Chainlink.Request 'callbackAddress', 'callbackFunctionId'
        // and extend 'buffer' with the dynamic TOML jobspec params
        _req.callbackAddress = address(this);
        _req.callbackFunctionId = FULFILL_DATA_SELECTOR;
        _req.addUint("gasLimit", uint256(fulfillConfig.gasLimit));
        // Send an Operator request, and store the fulfill configuration by 'requestId'
        bytes32 requestId = _sendOperatorRequestTo(_operatorAddr, _req, paymentInEscrow);
        s_requestIdToFulfillConfig[requestId] = fulfillConfig;
        // In case of "external request" (i.e. requester !== callbackAddr) notify the fulfillment contract about the
        // pending request
        if (callbackAddr != msg.sender) {
            IChainlinkExternalFulfillment fulfillmentContract = IChainlinkExternalFulfillment(callbackAddr);
            // solhint-disable-next-line no-empty-blocks
            try fulfillmentContract.setExternalPendingRequest(address(this), requestId) {} catch {
                emit SetExternalPendingRequestFailed(callbackAddr, requestId, key);
            }
        }
        return requestId;
    }

    function removeSpec(bytes32 _key) external onlyOwner {
        // Remove first Spec authorized consumers
        AuthorizedConsumerLibrary.Map storage s_authorizedConsumerMap = s_keyToAuthorizedConsumerMap[_key];
        if (s_authorizedConsumerMap._size() > 0) {
            _removeSpecAuthorizedConsumers(_key, s_authorizedConsumerMap.keys, s_authorizedConsumerMap, false);
        }
        _removeSpec(_key);
    }

    function removeSpecs(bytes32[] calldata _keys) external onlyOwner {
        uint256 keysLength = _keys.length;
        _requireArrayIsNotEmpty("keys", keysLength);
        for (uint256 i = 0; i < keysLength; ) {
            bytes32 key = _keys[i];
            // Remove first Spec authorized consumers
            AuthorizedConsumerLibrary.Map storage s_authorizedConsumerMap = s_keyToAuthorizedConsumerMap[key];
            if (s_authorizedConsumerMap._size() > 0) {
                _removeSpecAuthorizedConsumers(key, s_authorizedConsumerMap.keys, s_authorizedConsumerMap, false);
            }
            _removeSpec(key);
            unchecked {
                ++i;
            }
        }
    }

    function setDescription(string calldata _description) external onlyOwner {
        s_description = _description;
        emit DescriptionSet(_description);
    }

    function setFallbackWeiPerUnitLink(uint256 _fallbackWeiPerUnitLink) external onlyOwner {
        _requireFallbackWeiPerUnitLinkIsGtZero(_fallbackWeiPerUnitLink);
        s_fallbackWeiPerUnitLink = _fallbackWeiPerUnitLink;
        emit FallbackWeiPerUnitLinkSet(_fallbackWeiPerUnitLink);
    }

    function setL2SequencerGracePeriodSeconds(uint256 _l2SequencerGracePeriodSeconds) external onlyOwner {
        s_l2SequencerGracePeriodSeconds = _l2SequencerGracePeriodSeconds;
        emit L2SequencerGracePeriodSecondsSet(_l2SequencerGracePeriodSeconds);
    }

    function setPermiryadFeeFactor(uint8 _permiryadFactor) external onlyOwner {
        s_permiryadFeeFactor = _permiryadFactor;
        emit PermiryadFeeFactorSet(_permiryadFactor);
    }

    function setSpec(bytes32 _key, Spec calldata _spec) external onlyOwner {
        _setSpec(_key, _spec);
    }

    function setSpecs(bytes32[] calldata _keys, Spec[] calldata _specs) external onlyOwner {
        uint256 keysLength = _keys.length;
        _requireArrayIsNotEmpty("keys", keysLength);
        _requireArrayLengthsAreEqual("keys", keysLength, "specConsumers", _specs.length);
        for (uint256 i = 0; i < keysLength; ) {
            _setSpec(_keys[i], _specs[i]);
            unchecked {
                ++i;
            }
        }
    }

    function setStalenessSeconds(uint256 _stalenessSeconds) external onlyOwner {
        s_stalenessSeconds = _stalenessSeconds;
        emit StalenessSecondsSet(_stalenessSeconds);
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdrawFunds(address _payee, uint96 _amount) external nonReentrant {
        address consumer = msg.sender == owner() ? address(this) : msg.sender;
        uint96 consumerLinkBalance = s_consumerToLinkBalance[consumer];
        _requireLinkBalanceIsSufficient(consumer, consumerLinkBalance, _amount);
        s_consumerToLinkBalance[consumer] = consumerLinkBalance - _amount;
        emit FundsWithdrawn(consumer, _payee, _amount);
        if (!LINK.transfer(_payee, _amount)) {
            revert IDRCoordinatorCallable.DRCoordinator__LinkTransferFailed(_payee, _amount);
        }
    }

    /* ========== EXTERNAL VIEW FUNCTIONS ========== */

    function availableFunds(address _consumer) external view returns (uint96) {
        return s_consumerToLinkBalance[_consumer];
    }

    function calculateMaxPaymentAmount(
        uint256 _weiPerUnitGas,
        uint96 _paymentInEscrow,
        uint32 _gasLimit,
        FeeType _feeType,
        uint96 _fee
    ) external view returns (int256) {
        return
            _calculatePaymentAmount(
                PaymentPreFeeType.MAX,
                0,
                _weiPerUnitGas,
                _paymentInEscrow,
                _gasLimit,
                _feeType,
                _fee
            );
    }

    // NB: this method has limitations. It does not take into account the gas incurrend by
    // Operator.fulfillOracleRequest2() nor DRCoordinator.fulfillData(). All of them are affected, among other things,
    // by the data size and fulfillment function. Therefore it is needed to fine tune 'startGas'
    function calculateSpotPaymentAmount(
        uint32 _startGas,
        uint256 _weiPerUnitGas,
        uint96 _paymentInEscrow,
        FeeType _feeType,
        uint96 _fee
    ) external view returns (int256) {
        return
            _calculatePaymentAmount(
                PaymentPreFeeType.SPOT,
                _startGas,
                _weiPerUnitGas,
                _paymentInEscrow,
                0,
                _feeType,
                _fee
            );
    }

    function getDescription() external view returns (string memory) {
        return s_description;
    }

    function getFeedData() external view returns (uint256) {
        return _getFeedData();
    }

    function getFallbackWeiPerUnitLink() external view returns (uint256) {
        return s_fallbackWeiPerUnitLink;
    }

    function getFulfillConfig(bytes32 _requestId) external view returns (IDRCoordinatorCallable.FulfillConfig memory) {
        return s_requestIdToFulfillConfig[_requestId];
    }

    function getL2SequencerGracePeriodSeconds() external view returns (uint256) {
        return s_l2SequencerGracePeriodSeconds;
    }

    function getNumberOfSpecs() external view returns (uint256) {
        return s_keyToSpec._size();
    }

    function getPermiryadFeeFactor() external view returns (uint8) {
        return s_permiryadFeeFactor;
    }

    function getRequestCount() external view returns (uint256) {
        return s_requestCount;
    }

    function getSpec(bytes32 _key) external view returns (Spec memory) {
        _requireSpecIsInserted(_key);
        return s_keyToSpec._getSpec(_key);
    }

    function getSpecAuthorizedConsumers(bytes32 _key) external view returns (address[] memory) {
        // NB: s_authorizedConsumerMap only stores keys that exist in s_keyToSpec
        _requireSpecIsInserted(_key);
        return s_keyToAuthorizedConsumerMap[_key].keys;
    }

    function getSpecKeyAtIndex(uint256 _index) external view returns (bytes32) {
        return s_keyToSpec._getKeyAtIndex(_index);
    }

    function getSpecMapKeys() external view returns (bytes32[] memory) {
        return s_keyToSpec.keys;
    }

    function getStalenessSeconds() external view returns (uint256) {
        return s_stalenessSeconds;
    }

    function isSpecAuthorizedConsumer(bytes32 _key, address _consumer) external view returns (bool) {
        // NB: s_authorizedConsumerMap only stores keys that exist in s_keyToSpec
        _requireSpecIsInserted(_key);
        return s_keyToAuthorizedConsumerMap[_key]._isInserted(_consumer);
    }

    /* ========== PRIVATE FUNCTIONS ========== */

    function _addSpecAuthorizedConsumers(bytes32 _key, address[] calldata _authConsumers) private {
        _requireSpecIsInserted(_key);
        uint256 authConsumersLength = _authConsumers.length;
        _requireArrayIsNotEmpty("authConsumers", authConsumersLength);
        AuthorizedConsumerLibrary.Map storage s_authorizedConsumerMap = s_keyToAuthorizedConsumerMap[_key];
        for (uint256 i = 0; i < authConsumersLength; ) {
            s_authorizedConsumerMap._add(_authConsumers[i]);
            unchecked {
                ++i;
            }
        }
        emit AuthorizedConsumersAdded(_key, _authConsumers);
    }

    function _removeSpec(bytes32 _key) private {
        _requireSpecIsInserted(_key);
        s_keyToSpec._remove(_key);
        emit SpecRemoved(_key);
    }

    function _removeSpecAuthorizedConsumers(
        bytes32 _key,
        address[] memory _authConsumers,
        AuthorizedConsumerLibrary.Map storage _s_authorizedConsumerMap,
        bool _isUncheckedCase
    ) private {
        uint256 authConsumersLength = _authConsumers.length;
        if (_isUncheckedCase) {
            if (_s_authorizedConsumerMap._size() == 0) {
                revert IDRCoordinatorOwnable.DRCoordinator__SpecIsNotInserted(_key);
            }
            _requireArrayIsNotEmpty("authConsumers", authConsumersLength);
        }
        for (uint256 i = 0; i < authConsumersLength; ) {
            _s_authorizedConsumerMap._remove(_authConsumers[i]);
            unchecked {
                ++i;
            }
        }
        emit AuthorizedConsumersRemoved(_key, _authConsumers);
    }

    function _sendOperatorRequestTo(
        address _operatorAddr,
        Chainlink.Request memory _req,
        uint96 _payment
    ) private returns (bytes32) {
        uint256 nonce = s_requestCount;
        s_requestCount = nonce + 1;
        bytes memory encodedRequest = abi.encodeWithSelector(
            OPERATOR_REQUEST_SELECTOR,
            SENDER_OVERRIDE, // Sender value - overridden by onTokenTransfer by the requesting contract's address
            AMOUNT_OVERRIDE, // Amount value - overridden by onTokenTransfer by the actual amount of LINK sent
            _req.id,
            _req.callbackFunctionId,
            nonce,
            OPERATOR_ARGS_VERSION,
            _req.buf.buf
        );
        bytes32 requestId = keccak256(abi.encodePacked(this, nonce));
        s_pendingRequests[requestId] = _operatorAddr;
        emit ChainlinkRequested(requestId);
        if (!LINK.transferAndCall(_operatorAddr, _payment, encodedRequest)) {
            revert IDRCoordinatorCallable.DRCoordinator__LinkTransferAndCallFailed(
                _operatorAddr,
                _payment,
                encodedRequest
            );
        }
        return requestId;
    }

    function _setSpec(bytes32 _key, Spec calldata _spec) private {
        _validateSpecFieldSpecId(_key, _spec.specId);
        _validateSpecFieldOperator(_key, _spec.operator);
        _validateSpecFieldFee(_key, _spec.feeType, _spec.fee);
        _validateSpecFieldGasLimit(_key, _spec.gasLimit);
        _validateSpecFieldPayment(_key, _spec.paymentType, _spec.payment);
        s_keyToSpec._set(_key, _spec);
        emit SpecSet(_key, _spec);
    }

    /* ========== PRIVATE VIEW FUNCTIONS ========== */

    function _calculatePaymentAmount(
        PaymentPreFeeType _paymentPreFeeType,
        uint32 _startGas,
        uint256 _weiPerUnitGas,
        uint96 _paymentInEscrow,
        uint32 _gasLimit,
        FeeType _feeType,
        uint96 _fee
    ) private view returns (int256) {
        // NB: parameters accept 0 to allow estimation calls
        uint256 weiPerUnitLink = _getFeedData();
        uint256 paymentPreFee;
        if (_paymentPreFeeType == PaymentPreFeeType.MAX) {
            paymentPreFee = (LINK_TO_JUELS_FACTOR * _weiPerUnitGas * _gasLimit) / weiPerUnitLink;
        } else if (_paymentPreFeeType == PaymentPreFeeType.SPOT) {
            paymentPreFee =
                (LINK_TO_JUELS_FACTOR * _weiPerUnitGas * (GAS_AFTER_PAYMENT_CALCULATION + _startGas - gasleft())) /
                weiPerUnitLink;
        } else {
            revert IDRCoordinatorCallable.DRCoordinator__PaymentPreFeeTypeIsUnsupported(_paymentPreFeeType);
        }
        uint256 paymentAfterFee;
        if (_feeType == FeeType.FLAT) {
            paymentAfterFee = paymentPreFee + _fee;
        } else if (_feeType == FeeType.PERMIRYAD) {
            paymentAfterFee = paymentPreFee + (paymentPreFee * _fee) / PERMIRYAD;
        } else {
            revert IDRCoordinatorCallable.DRCoordinator__FeeTypeIsUnsupported(_feeType);
        }
        return int256(paymentAfterFee) - int256(uint256(_paymentInEscrow));
    }

    function _calculateWeiPerUnitLink(
        bool _isPriceFeed1Case,
        AggregatorV3Interface _priceFeed,
        uint256 _stalenessSeconds,
        uint256 _weiPerUnitLink
    ) private view returns (uint256) {
        int256 answer;
        uint256 timestamp;
        (, answer, , timestamp, ) = _priceFeed.latestRoundData();
        if (answer < 1) {
            revert IDRCoordinatorCallable.DRCoordinator__FeedAnswerIsNotGtZero(address(_priceFeed), answer);
        }
        // solhint-disable-next-line not-rely-on-time
        if (_stalenessSeconds > 0 && _stalenessSeconds < block.timestamp - timestamp) {
            return s_fallbackWeiPerUnitLink;
        }
        return _isPriceFeed1Case ? uint256(answer) : (uint256(answer) * TKN_TO_WEI_FACTOR) / _weiPerUnitLink;
    }

    function _getFeedData() private view returns (uint256) {
        if (IS_SEQUENCER_DEPENDANT) {
            (, int256 answer, , uint256 startedAt, ) = L2_SEQUENCER_FEED.latestRoundData();
            if (answer == 1 || block.timestamp - startedAt <= s_l2SequencerGracePeriodSeconds) {
                return s_fallbackWeiPerUnitLink;
            }
        }
        uint256 stalenessSeconds = s_stalenessSeconds;
        uint256 weiPerUnitLink = _calculateWeiPerUnitLink(true, PRICE_FEED_1, stalenessSeconds, 0);
        if (!IS_MULTI_PRICE_FEED_DEPENDANT) return weiPerUnitLink;
        return _calculateWeiPerUnitLink(false, PRICE_FEED_2, stalenessSeconds, weiPerUnitLink);
    }

    function _requireCallerIsAuthorizedConsumer(
        bytes32 _key,
        address _operatorAddr,
        bytes32 _specId
    ) private view {
        AuthorizedConsumerLibrary.Map storage s_authorizedConsumerMap = s_keyToAuthorizedConsumerMap[_key];
        if (s_authorizedConsumerMap._size() > 0 && !s_authorizedConsumerMap._isInserted(msg.sender)) {
            revert IDRCoordinatorCallable.DRCoordinator__CallerIsNotAuthorizedConsumer(_key, _operatorAddr, _specId);
        }
    }

    function _requireCallerIsRequester(address _requester) private view {
        if (_requester != msg.sender) {
            revert IDRCoordinatorCallable.DRCoordinator__CallerIsNotRequester(_requester);
        }
    }

    function _requireCallerIsRequestOperator(address _operatorAddr) private view {
        if (_operatorAddr != msg.sender) {
            _requireRequestIsPending(_operatorAddr);
            revert IDRCoordinatorCallable.DRCoordinator__CallerIsNotRequestOperator(_operatorAddr);
        }
    }

    function _requireSpecIsInserted(bytes32 _key) private view {
        if (!s_keyToSpec._isInserted(_key)) {
            revert IDRCoordinatorOwnable.DRCoordinator__SpecIsNotInserted(_key);
        }
    }

    function _validateCallbackAddress(address _callbackAddr) private view {
        if (!_callbackAddr.isContract()) {
            revert IDRCoordinatorCallable.DRCoordinator__CallbackAddrIsNotContract(_callbackAddr);
        }
        if (_callbackAddr == address(this)) {
            revert IDRCoordinatorCallable.DRCoordinator__CallbackAddrIsDRCoordinator(_callbackAddr);
        }
    }

    function _validateSpecFieldFee(
        bytes32 _key,
        FeeType _feeType,
        uint96 _fee
    ) private view {
        if (_feeType == FeeType.FLAT) {
            if (_fee > LINK_TOTAL_SUPPLY) {
                revert IDRCoordinatorOwnable.DRCoordinator__SpecFieldFeeIsGtLinkTotalSupply(
                    _key,
                    _fee,
                    LINK_TOTAL_SUPPLY
                );
            }
        } else if (_feeType == FeeType.PERMIRYAD) {
            uint256 maxPermiryadFee = PERMIRYAD * s_permiryadFeeFactor;
            if (_fee > maxPermiryadFee) {
                revert IDRCoordinatorOwnable.DRCoordinator__SpecFieldFeeIsGtMaxPermiryadFee(
                    _key,
                    _fee,
                    maxPermiryadFee
                );
            }
        } else {
            revert IDRCoordinatorOwnable.DRCoordinator__SpecFieldFeeTypeIsUnsupported(_key, _feeType);
        }
    }

    function _validateSpecFieldOperator(bytes32 _key, address _operator) private view {
        if (!_operator.isContract()) {
            revert IDRCoordinatorOwnable.DRCoordinator__SpecFieldOperatorIsNotContract(_key, _operator);
        }
        if (_operator == address(this)) {
            revert IDRCoordinatorOwnable.DRCoordinator__SpecFieldOperatorIsDRCoordinator(_key, _operator);
        }
    }

    /* ========== PRIVATE PURE FUNCTIONS ========== */

    function _calculateRequiredConsumerLinkBalanceAndPaymentInEscrow(
        uint96 _maxPayment,
        PaymentType _paymentType,
        uint96 _payment
    ) private pure returns (uint96, uint96) {
        if (_paymentType == PaymentType.FLAT) {
            // NB: spec.payment could be greater than Max LINK payment
            uint96 requiredConsumerLinkBalance = _maxPayment >= _payment ? _maxPayment : _payment;
            return (requiredConsumerLinkBalance, _payment);
        } else if (_paymentType == PaymentType.PERMIRYAD) {
            return (_maxPayment, (_maxPayment * _payment) / PERMIRYAD);
        } else {
            revert IDRCoordinatorCallable.DRCoordinator__PaymentTypeIsUnsupported(_paymentType);
        }
    }

    function _generateSpecKey(address _operatorAddr, bytes32 _specId) private pure returns (bytes32) {
        // (operatorAddr, specId) composite key allows storing N specs with the same externalJobID but different
        // operator address
        return keccak256(abi.encodePacked(_operatorAddr, _specId));
    }

    function _requireArrayIsNotEmpty(string memory _arrayName, uint256 _arrayLength) private pure {
        if (_arrayLength == 0) {
            revert IDRCoordinatorOwnable.DRCoordinator__ArrayIsEmpty(_arrayName);
        }
    }

    function _requireArrayLengthsAreEqual(
        string memory _array1Name,
        uint256 _array1Length,
        string memory _array2Name,
        uint256 _array2Length
    ) private pure {
        if (_array1Length != _array2Length) {
            revert IDRCoordinatorOwnable.DRCoordinator__ArrayLengthsAreNotEqual(
                _array1Name,
                _array1Length,
                _array2Name,
                _array2Length
            );
        }
    }

    function _requireFallbackWeiPerUnitLinkIsGtZero(uint256 _fallbackWeiPerUnitLink) private pure {
        if (_fallbackWeiPerUnitLink == 0) {
            revert IDRCoordinatorOwnable.DRCoordinator__FallbackWeiPerUnitLinkIsZero();
        }
    }

    function _requireLinkAllowanceIsSufficient(
        address _payer,
        uint96 _allowance,
        uint96 _amount
    ) private pure {
        if (_allowance < _amount) {
            revert IDRCoordinatorCallable.DRCoordinator__LinkAllowanceIsInsufficient(_payer, _allowance, _amount);
        }
    }

    function _requireLinkBalanceIsSufficient(
        address _payer,
        uint96 _balance,
        uint96 _amount
    ) private pure {
        if (_balance < _amount) {
            revert IDRCoordinatorCallable.DRCoordinator__LinkBalanceIsInsufficient(_payer, _balance, _amount);
        }
    }

    function _requireLinkPaymentIsInRange(uint96 _payment) private pure {
        if (_payment > LINK_TOTAL_SUPPLY) {
            revert IDRCoordinatorCallable.DRCoordinator__LinkPaymentIsGtLinkTotalSupply(_payment, LINK_TOTAL_SUPPLY);
        }
    }

    function _requireL2SequencerFeed(bool _isSequencerDependant, address _l2SequencerFeed) private view {
        if (_isSequencerDependant && !_l2SequencerFeed.isContract()) {
            revert IDRCoordinatorOwnable.DRCoordinator__L2SequencerFeedIsNotContract(_l2SequencerFeed);
        }
    }

    function _requirePriceFeed(
        bool _isMultiPriceFeedDependant,
        address _priceFeed1,
        address _priceFeed2
    ) private view {
        if (!_priceFeed1.isContract()) {
            revert IDRCoordinatorOwnable.DRCoordinator__PriceFeedIsNotContract(_priceFeed1);
        }
        if (_isMultiPriceFeedDependant && !_priceFeed2.isContract()) {
            revert IDRCoordinatorOwnable.DRCoordinator__PriceFeedIsNotContract(_priceFeed2);
        }
    }

    function _requireRequestIsPending(address _operatorAddr) private pure {
        if (_operatorAddr == address(0)) {
            revert IDRCoordinatorCallable.DRCoordinator__RequestIsNotPending();
        }
    }

    function _validateCallbackGasLimit(uint32 _callbackGasLimit, uint32 _specGasLimit) private pure {
        if (_callbackGasLimit > _specGasLimit) {
            revert IDRCoordinatorCallable.DRCoordinator__CallbackGasLimitIsGtSpecGasLimit(
                _callbackGasLimit,
                _specGasLimit
            );
        }
        if (_callbackGasLimit < MIN_REQUEST_GAS_LIMIT) {
            revert IDRCoordinatorCallable.DRCoordinator__CallbackGasLimitIsLtMinRequestGasLimit(
                _callbackGasLimit,
                MIN_REQUEST_GAS_LIMIT
            );
        }
    }

    function _validateSpecFieldGasLimit(bytes32 _key, uint32 _gasLimit) private pure {
        if (_gasLimit < MIN_REQUEST_GAS_LIMIT) {
            revert IDRCoordinatorOwnable.DRCoordinator__SpecFieldGasLimitIsLtMinRequestGasLimit(
                _key,
                _gasLimit,
                MIN_REQUEST_GAS_LIMIT
            );
        }
    }

    function _validateSpecFieldPayment(
        bytes32 _key,
        PaymentType _paymentType,
        uint96 _payment
    ) private pure {
        if (_paymentType == PaymentType.FLAT) {
            if (_payment > LINK_TOTAL_SUPPLY) {
                revert IDRCoordinatorOwnable.DRCoordinator__SpecFieldPaymentIsGtLinkTotalSupply(
                    _key,
                    _payment,
                    LINK_TOTAL_SUPPLY
                );
            }
        } else if (_paymentType == PaymentType.PERMIRYAD) {
            if (_payment > PERMIRYAD) {
                revert IDRCoordinatorOwnable.DRCoordinator__SpecFieldPaymentIsGtPermiryad(_key, _payment, PERMIRYAD);
            }
        } else {
            revert IDRCoordinatorOwnable.DRCoordinator__SpecFieldPaymentTypeIsUnsupported(_key, _paymentType);
        }
    }

    function _validateSpecFieldSpecId(bytes32 _key, bytes32 _specId) private pure {
        if (_specId == NO_SPEC_ID) {
            revert IDRCoordinatorOwnable.DRCoordinator__SpecFieldSpecIdIsZero(_key);
        }
    }
}
