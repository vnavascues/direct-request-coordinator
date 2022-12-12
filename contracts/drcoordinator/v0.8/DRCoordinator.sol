// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { Chainlink } from "@chainlink/contracts/src/v0.8/Chainlink.sol";
import { ConfirmedOwner } from "@chainlink/contracts/src/v0.8/ConfirmedOwner.sol";
import { AggregatorV3Interface } from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import { LinkTokenInterface } from "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";
import { OperatorInterface } from "@chainlink/contracts/src/v0.8/interfaces/OperatorInterface.sol";
import { TypeAndVersionInterface } from "@chainlink/contracts/src/v0.8/interfaces/TypeAndVersionInterface.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IDRCoordinator } from "./interfaces/IDRCoordinator.sol";
import { IDRCoordinatorCallable } from "./interfaces/IDRCoordinatorCallable.sol";
import { IChainlinkExternalFulfillment } from "./interfaces/IChainlinkExternalFulfillment.sol";
import { FeeType, PaymentType, Spec, SpecLibrary } from "./libraries/internal/SpecLibrary.sol";
import { InsertedAddressLibrary as AuthorizedConsumerLibrary } from "./libraries/internal/InsertedAddressLibrary.sol";

/**
 * @title The DRCoordinator (coOperator) contract.
 * @author Víctor Navascués.
 * @notice Node operators (NodeOp(s)) can deploy this contract to enable dynamic LINK payments on Direct Request
 * (Any API), syncing the job price (in LINK) with the network gas token (GASTKN) and its conditions.
 * @dev Uses @chainlink/contracts 0.5.1.
 * @dev This contract cooperates with the Chainlink Operator contract. DRCoordinator interfaces 1..N DRCoordinatorClient
 * contracts (Consumer(s)) with 1..N Operator contracts (Operator(s)) by forwarding Chainlink requests and responses.
 * This is a high level overview of a DRCoordinator Direct Request:
 *
 * 1. Adding the job on the Chainlink node
 * ---------------------------------------
 * NodeOps have to add a DRCoordinator-friendly TOML spec, which only requires to:
 * - Set the `minContractPaymentLinkJuels` field to 0 Juels. Make sure to set first the node env var
 * `MINIMUM_CONTRACT_PAYMENT_LINK_JUELS` to 0 as well.
 * - Add the DRCoordinator address in `requesters` to prevent the job being spammed (due to 0 Juels payment).
 * - Add an extra encoding as `(bytes32 requestId, bytes data)` before encoding the `fulfillOracleRequest2` tx.
 *
 * 2. Making the job requestable
 * -----------------------------
 * NodeOps have to:
 * 1. Create the `Spec` (see `SpecLibrary.sol`) of the TOML spec added above and upload it in the DRCoordinator storage
 * via `DRCoordinator.setSpec()`.
 * 2. Use `DRCoordinator.addSpecAuthorizedConsumers()` if on-chain whitelisting of consumers is desired.
 * 3. Share/communicate the `Spec` details (via its key) so the Consumer devs can monitor the `Spec` and act upon any
 * change on it, e.g. `fee`, `payment`, etc.
 *
 * 3. Implementing the Consumer
 * ----------------------------
 * Devs have to:
 * - Make Consumer inherit from `DRCoordinatorClient.sol` (an equivalent of `ChainlinkClient.sol` for DRCoordinator
 * requests). This library only builds the `Chainlink.Request` and then sends it to DRCoordinator (via
 * `DRCoordinator.requestData()`), which is responsible for extending it and ultimately send it to Operator.
 * - Request a `Spec` by passing the Operator address, the maximum amount of gas willing to spend, the maximum amount of
 * LINK willing to pay and the `Chainlink.Request` (which includes the `Spec.specId` as `id` and the request parameters
 * CBOR encoded).
 *
 * Devs can time the request with any of these strategies if gas prices are a concern:
 * - Call `DRCoordinator.calculateMaxPaymentAmount()`.
 * - Call `DRCoordinator.calculateSpotPaymentAmount()`.
 * - Call `DRCoordinator.getFeedData()`.
 *
 * 4. Requesting the job spec
 * --------------------------
 * When Consumer calls `DRCoordinator.requestData()` DRCoordinator does:
 * 1. Validates the arguments.
 * 2. Calculates MAX LINK payment amount, which is the amount of LINK Consumer would pay if all the
 * `callbackGasLimit` was used fulfilling the request (tx `gasLimit`).
 * 3. Checks that the Consumer balance can afford MAX LINK payment and that Consumer is willing to pay the amount.
 * 4. Calculates the LINK payment amount (REQUEST LINK payment) to be hold in escrow by Operator. The payment can be
 * either a flat amount or a percentage (permyriad) of MAX LINK payment. The `paymentType` and `payment` are set in the
 * `Spec` by NodeOp.
 * 5. Updates Consumer balancee.
 * 6. Stores essential data from Consumer, `Chainlink.Request` and `Spec` in a `FulfillConfig` (by request ID) struct to
 * be used upon fulfillment.
 * 7. Extends the Consumer `Chainlink.Request` and sends it to Operator (paying the REQUEST LINK amount).
 *
 * 5. Fulfilling the request
 * -------------------------
 * 1. Validates the request and its caller.
 * 2. Loads the request configuration (`FulfillConfig`) and attempts to fulfill the request by calling the Consumer
 * callback method passing the response data.
 * 3. Calculates SPOT LINK payment, which is the equivalent gas amount used fulfilling the request in LINK, minus
 * the REQUEST LINK payment, plus the fulfillment fee. The fee can be either a flat amount of a percentage (permyriad)
 * of SPOT LINK payment. The `feeType` and `fee` are set in the `Spec` by NodeOp.
 * 4. Checks that the Consumer balance can afford SPOT LINK payment and that Consumer is willing to pay the amount.
 * It is worth mentioning that DRCoordinator can refund Consumer if REQUEST LINK payment was greater than SPOT LINK
 * payment and DRCoordinator's balance is greater or equal than SPOT payment. Tuning the `Spec.payment` and `Spec.fee`
 * should make this particular case very rare.
 * 5.Updates Consumer and DRCoordinator balances.
 *
 * @dev The MAX and SPOT LINK payment amounts are calculated using Chainlink Price Feeds on the network (configured by
 * NodeOp on deployment), which provide the GASTKN wei amount per unit of LINK. The ideal scenario is to use the
 * LINK / GASTKN Price Feed on the network, however two Price Feed (GASTKN / TKN (priceFeed1) & LINK / TKN (priceFeed2))
 * can be set up on deployment.
 * @dev This contract implements the following Chainlink Price Feed risk mitigation strategies: stale answer.
 * The wei value per unit of LINK will default to `fallbackWeiPerUnitLink` (set by NodeOp).
 * @dev This contract implements the following L2 Sequencer Uptime Status Feed risk mitigation strategies: availability
 * and grace period. The wei value per unit of LINK will default to `fallbackWeiPerUnitLink` (set by NodeOp).
 * @dev BE AWARE: this contract currently does not take into account L1 fees when calculating MAX & SPOT LINK payment
 * amounts on L2s.
 * @dev This contract implements an emergency stop mechanism (triggered by NodeOp). Only request data, and fulfill
 * data are the functionalities disabled when the contract is paused.
 * @dev This contract allows CRUD `Spec`. A `Spec` is the representation of a `directrequest` job spec for DRCoordinator
 * requests. Composed of `directrequest` spec unique fields (e.g. `specId`, `operator`) DRCoordinator specific variables
 * to address the LINK payment, e.g. `fee`, `feeType`, etc.
 * @dev This contract allows CRD authorized consumers (whitelisted `requesters`) per `Spec` on-chain. Unfortunately,
 * off-chain whitelisting at TOML job spec level via the `requesters` field is not possible.
 * @dev This contract allows to fulfill requests in a contract different than Consumer who built the `Chainlink.Request`
 * (aka. Chainlink external requests).
 * @dev This contract has an internal LINK balances for itself and any Consumer. Any address (EOA/contract) can fund
 * them. Only the NodeOp (owner) is able to withdraw LINK from the DRCoordinator balance. Only the Consumer is able to
 * withdraw LINK from its balance. Be aware that the REQUEST LINK payment amount is located in the Operator contract
 * (either held in escrow or as earned LINK).
 */
contract DRCoordinator is ConfirmedOwner, Pausable, TypeAndVersionInterface, IDRCoordinator {
    using Address for address;
    using AuthorizedConsumerLibrary for AuthorizedConsumerLibrary.Map;
    using Chainlink for Chainlink.Request;
    using SpecLibrary for SpecLibrary.Map;

    uint256 private constant AMOUNT_OVERRIDE = 0;
    uint256 private constant OPERATOR_ARGS_VERSION = 2;
    uint256 private constant OPERATOR_REQUEST_EXPIRATION_TIME = 5 minutes;
    int256 private constant L2_SEQUENCER_IS_DOWN = 1;
    bytes32 private constant NO_SPEC_ID = bytes32(0);
    uint256 private constant TKN_TO_WEI_FACTOR = 1e18;
    address private constant SENDER_OVERRIDE = address(0);
    uint96 private constant LINK_TOTAL_SUPPLY = 1e27;
    uint64 private constant LINK_TO_JUELS_FACTOR = 1e18;
    bytes4 private constant OPERATOR_REQUEST_SELECTOR = OperatorInterface.operatorRequest.selector;
    bytes4 private constant FULFILL_DATA_SELECTOR = this.fulfillData.selector;
    uint16 private constant PERMYRIAD = 10_000;
    uint32 private constant MIN_REQUEST_GAS_LIMIT = 400_000; // From Operator.sol MINIMUM_CONSUMER_GAS_LIMIT
    // NB: with the current balance model & actions after calculating the payment, it is safe setting the
    // GAS_AFTER_PAYMENT_CALCULATION to 50_000 as a constant. Exact amount used is 42945 gas
    uint32 private constant GAS_AFTER_PAYMENT_CALCULATION = 50_000;
    LinkTokenInterface private immutable i_link;
    AggregatorV3Interface private immutable i_l2SequencerFeed;
    AggregatorV3Interface private immutable i_priceFeed1; // LINK/TKN (single feed) or TKN/USD (multi feed)
    AggregatorV3Interface private immutable i_priceFeed2; // address(0) (single feed) or LINK/USD (multi feed)
    bool private immutable i_isMultiPriceFeedDependant;
    bool private immutable i_isL2SequencerDependant;
    bool private s_isReentrancyLocked;
    uint8 private s_permyriadFeeFactor = 1;
    uint256 private s_requestCount = 1;
    uint256 private s_stalenessSeconds;
    uint256 private s_l2SequencerGracePeriodSeconds;
    uint256 private s_fallbackWeiPerUnitLink;
    string private s_description;
    mapping(bytes32 => address) private s_pendingRequests; /* requestId */ /* operatorAddr */
    mapping(address => uint96) private s_consumerToLinkBalance; /* mgs.sender */ /* LINK */
    mapping(bytes32 => FulfillConfig) private s_requestIdToFulfillConfig; /* requestId */ /* FulfillConfig */
    /* keccak256(abi.encodePacked(operatorAddr, specId)) */
    /* address */
    /* bool */
    mapping(bytes32 => AuthorizedConsumerLibrary.Map) private s_keyToAuthorizedConsumerMap;
    SpecLibrary.Map private s_keyToSpec; /* keccak256(abi.encodePacked(operatorAddr, specId)) */ /* Spec */

    /**
     * @notice versions:
     * - DRCoordinator 1.0.0: release Chainlink Hackaton Fall 2022
     *                      : adopt fulfillData as fulfillment method and remove fallback
     *                      : standardise and improve custom errors and remove unused ones
     *                      : standardise and improve events
     *                      : add paymentType (permyriad support on the requestData LINK payment)
     *                      : allow whitelist consumers per Spec (authorized consumers)
     *                      : add refund mode (DRC refunds LINK if the requestData payment exceeds the fulfillData one)
     *                      : add consumerMaxPayment (requestData & fulfillData revert if LINK payment is greater than)
     *                      : add multi Price Feed (2-hop mode via GASTKN / TKN and LINK / TKN feeds)
     *                      : replace L2 Sequencer Flag with L2 Sequencer Uptime Status Feed
     *                      : improve contract inheritance, e.g. add IDRCoordinator, remove ChainlinkClient, etc.
     *                      : make simple cancelRequest by storing payment and expiration
     *                      : add permyriadFactor (allow setting fees greater than 100%)
     *                      : remove the sha1 logic
     *                      : remove minConfirmations requirement
     *                      : add a public lock
     *                      : improve Consumer tools, e.g. DRCoordinatorClient, ChainlinkExternalFulfillmentCompatible
     *                      : apply Chainlink Solidity Style Guide (skipped args without '_', and contract layout)
     *                      : add NatSpec
     *                      : upgrade to solidity v0.8.17
     * - DRCoordinator 0.1.0: initial release Chainlink Hackaton Spring 2022
     */
    string public constant override typeAndVersion = "DRCoordinator 1.0.0";

    event AuthorizedConsumersAdded(bytes32 indexed key, address[] consumers);
    event AuthorizedConsumersRemoved(bytes32 indexed key, address[] consumers);
    event ChainlinkCancelled(bytes32 indexed id);
    event ChainlinkFulfilled(
        bytes32 indexed requestId,
        bool success,
        address indexed callbackAddr,
        bytes4 callbackFunctionId,
        uint96 requestPayment,
        int256 spotPayment
    );
    event ChainlinkRequested(bytes32 indexed id);
    event DescriptionSet(string description);
    event FallbackWeiPerUnitLinkSet(uint256 fallbackWeiPerUnitLink);
    event FundsAdded(address indexed from, address indexed to, uint96 amount);
    event FundsWithdrawn(address indexed from, address indexed to, uint96 amount);
    event GasAfterPaymentCalculationSet(uint32 gasAfterPaymentCalculation);
    event L2SequencerGracePeriodSecondsSet(uint256 l2SequencerGracePeriodSeconds);
    event PermyriadFeeFactorSet(uint8 permyriadFactor);
    event SetExternalPendingRequestFailed(address indexed callbackAddr, bytes32 indexed requestId, bytes32 key);
    event SpecRemoved(bytes32 indexed key);
    event SpecSet(bytes32 indexed key, Spec spec);
    event StalenessSecondsSet(uint256 stalenessSeconds);

    modifier nonReentrant() {
        if (s_isReentrancyLocked) {
            revert DRCoordinator__CallIsReentrant();
        }
        s_isReentrancyLocked = true;
        _;
        s_isReentrancyLocked = false;
    }

    constructor(
        address _link,
        bool _isMultiPriceFeedDependant,
        address _priceFeed1,
        address _priceFeed2,
        string memory _description,
        uint256 _fallbackWeiPerUnitLink,
        uint256 _stalenessSeconds,
        bool _isL2SequencerDependant,
        address _l2SequencerFeed,
        uint256 _l2SequencerGracePeriodSeconds
    ) ConfirmedOwner(msg.sender) {
        _requirePriceFeed(_isMultiPriceFeedDependant, _priceFeed1, _priceFeed2);
        _requireFallbackWeiPerUnitLinkIsGtZero(_fallbackWeiPerUnitLink);
        _requireL2SequencerFeed(_isL2SequencerDependant, _l2SequencerFeed);
        i_link = LinkTokenInterface(_link);
        i_isMultiPriceFeedDependant = _isMultiPriceFeedDependant;
        i_priceFeed1 = AggregatorV3Interface(_priceFeed1);
        i_priceFeed2 = _isMultiPriceFeedDependant
            ? AggregatorV3Interface(_priceFeed2)
            : AggregatorV3Interface(address(0));
        i_isL2SequencerDependant = _isL2SequencerDependant;
        i_l2SequencerFeed = _isL2SequencerDependant
            ? AggregatorV3Interface(_l2SequencerFeed)
            : AggregatorV3Interface(address(0));
        s_description = _description;
        s_fallbackWeiPerUnitLink = _fallbackWeiPerUnitLink;
        s_stalenessSeconds = _stalenessSeconds;
        s_l2SequencerGracePeriodSeconds = _isL2SequencerDependant ? _l2SequencerGracePeriodSeconds : 0;
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    /// @inheritdoc IDRCoordinatorCallable
    function addFunds(address _consumer, uint96 _amount) external nonReentrant {
        _requireLinkAllowanceIsSufficient(msg.sender, uint96(i_link.allowance(msg.sender, address(this))), _amount);
        _requireLinkBalanceIsSufficient(msg.sender, uint96(i_link.balanceOf(msg.sender)), _amount);
        s_consumerToLinkBalance[_consumer] += _amount;
        emit FundsAdded(msg.sender, _consumer, _amount);
        if (!i_link.transferFrom(msg.sender, address(this), _amount)) {
            revert DRCoordinator__LinkTransferFromFailed(msg.sender, address(this), _amount);
        }
    }

    /// @inheritdoc IDRCoordinator
    function addSpecAuthorizedConsumers(bytes32 _key, address[] calldata _authConsumers) external onlyOwner {
        _addSpecAuthorizedConsumers(_key, _authConsumers);
    }

    /// @inheritdoc IDRCoordinator
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

    /// @inheritdoc IDRCoordinatorCallable
    function cancelRequest(bytes32 _requestId) external nonReentrant {
        address operatorAddr = s_pendingRequests[_requestId];
        _requireRequestIsPending(operatorAddr);
        FulfillConfig memory fulfillConfig = s_requestIdToFulfillConfig[_requestId];
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

    /// @inheritdoc IDRCoordinatorCallable
    function fulfillData(bytes32 _requestId, bytes calldata _data) external whenNotPaused nonReentrant {
        // Validate sender is the request Operator
        _requireCallerIsRequestOperator(s_pendingRequests[_requestId]);
        delete s_pendingRequests[_requestId];
        // Retrieve the request `FulfillConfig` by request ID
        FulfillConfig memory fulfillConfig = s_requestIdToFulfillConfig[_requestId];
        // Format off-chain data
        bytes memory data = abi.encodePacked(fulfillConfig.callbackFunctionId, _data);
        // Fulfill just with the gas amount requested by Consumer
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = fulfillConfig.callbackAddr.call{
            gas: fulfillConfig.gasLimit - GAS_AFTER_PAYMENT_CALCULATION
        }(data);
        // Calculate SPOT LINK payment
        int256 spotPaymentInt = _calculatePaymentAmount(
            PaymentPreFeeType.SPOT,
            fulfillConfig.gasLimit,
            tx.gasprice,
            fulfillConfig.payment,
            0,
            fulfillConfig.feeType,
            fulfillConfig.fee
        );
        // NB: statemens below cost 42945 gas -> GAS_AFTER_PAYMENT_CALCULATION = 50k gas
        // Calculate SPOT LINK payment to either pay (Consumer -> DRCoordinator) or refund (DRCoordinator -> Consumer)
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
        // Check whether Consumer is willing to pay REQUEST LINK payment + SPOT LINK payment
        if (fulfillConfig.consumerMaxPayment > 0) {
            _requireLinkPaymentIsWithinConsumerMaxPaymentRange(
                spotPaymentInt >= 0 ? fulfillConfig.payment + spotPayment : fulfillConfig.payment - spotPayment,
                fulfillConfig.consumerMaxPayment
            );
        }
        // Check whether payer has enough LINK balance
        _requireLinkBalanceIsSufficient(payer, payerLinkBalance, spotPayment);
        // Update Consumer and DRCoordinator LINK balances
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

    /// @inheritdoc IDRCoordinator
    function pause() external onlyOwner {
        _pause();
    }

    /// @inheritdoc IDRCoordinator
    function removeSpecAuthorizedConsumers(bytes32 _key, address[] calldata _authConsumers) external onlyOwner {
        AuthorizedConsumerLibrary.Map storage s_authorizedConsumerMap = s_keyToAuthorizedConsumerMap[_key];
        _removeSpecAuthorizedConsumers(_key, _authConsumers, s_authorizedConsumerMap, true);
    }

    /// @inheritdoc IDRCoordinator
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

    /// @inheritdoc IDRCoordinatorCallable
    function requestData(
        address _operatorAddr,
        uint32 _callbackGasLimit,
        uint96 _consumerMaxPayment,
        Chainlink.Request memory _req
    ) external whenNotPaused nonReentrant returns (bytes32) {
        // Validate parameters
        bytes32 key = _generateSpecKey(_operatorAddr, _req.id);
        _requireSpecIsInserted(key);
        address callbackAddr = _req.callbackAddress;
        _validateCallbackAddress(callbackAddr); // NB: prevents malicious loops
        // Validate Consumer is authorized to request the `Spec`
        _requireCallerIsAuthorizedConsumer(key, _operatorAddr, _req.id);
        // Validate arguments against `Spec` parameters
        Spec memory spec = s_keyToSpec._getSpec(key);
        _validateCallbackGasLimit(_callbackGasLimit, spec.gasLimit);
        // Calculate MAX LINK payment amount
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
        // Check whether Consumer is willing to pay MAX LINK payment
        if (_consumerMaxPayment > 0) {
            _requireLinkPaymentIsWithinConsumerMaxPaymentRange(maxPayment, _consumerMaxPayment);
        }
        // Re-calculate MAX LINK payment (from `Spec.payment`) and calculate REQUEST LINK payment (to be hold in escrow
        // by Operator)
        uint96 consumerLinkBalance = s_consumerToLinkBalance[msg.sender];
        (
            uint96 requiredConsumerLinkBalance,
            uint96 requestPayment
        ) = _calculateRequiredConsumerLinkBalanceAndRequestPayment(maxPayment, spec.paymentType, spec.payment);
        // Check whether Consumer has enough LINK balance and update it
        _requireLinkBalanceIsSufficient(msg.sender, consumerLinkBalance, requiredConsumerLinkBalance);
        s_consumerToLinkBalance[msg.sender] = consumerLinkBalance - requestPayment;
        // Initialise the fulfill configuration
        FulfillConfig memory fulfillConfig;
        fulfillConfig.msgSender = msg.sender;
        fulfillConfig.payment = requestPayment;
        fulfillConfig.callbackAddr = callbackAddr;
        fulfillConfig.fee = spec.fee;
        fulfillConfig.consumerMaxPayment = _consumerMaxPayment;
        fulfillConfig.gasLimit = _callbackGasLimit + GAS_AFTER_PAYMENT_CALCULATION;
        fulfillConfig.feeType = spec.feeType;
        fulfillConfig.callbackFunctionId = _req.callbackFunctionId;
        fulfillConfig.expiration = uint40(block.timestamp + OPERATOR_REQUEST_EXPIRATION_TIME);
        // Replace `callbackAddress` & `callbackFunctionId` in `Chainlink.Request`. Extend its `buffer` with `gasLimit`.
        _req.callbackAddress = address(this);
        _req.callbackFunctionId = FULFILL_DATA_SELECTOR;
        _req.addUint("gasLimit", uint256(fulfillConfig.gasLimit));
        // Send an Operator request, and store the fulfill configuration by request ID
        bytes32 requestId = _sendOperatorRequestTo(_operatorAddr, _req, requestPayment);
        s_requestIdToFulfillConfig[requestId] = fulfillConfig;
        // In case of "external request" (i.e. r`equester !== callbackAddr`) notify the fulfillment contract about the
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

    /// @inheritdoc IDRCoordinator
    function removeSpec(bytes32 _key) external onlyOwner {
        // Remove first `Spec` authorized consumers
        AuthorizedConsumerLibrary.Map storage s_authorizedConsumerMap = s_keyToAuthorizedConsumerMap[_key];
        if (s_authorizedConsumerMap._size() > 0) {
            _removeSpecAuthorizedConsumers(_key, s_authorizedConsumerMap.keys, s_authorizedConsumerMap, false);
        }
        _removeSpec(_key);
    }

    /// @inheritdoc IDRCoordinator
    function removeSpecs(bytes32[] calldata _keys) external onlyOwner {
        uint256 keysLength = _keys.length;
        _requireArrayIsNotEmpty("keys", keysLength);
        for (uint256 i = 0; i < keysLength; ) {
            bytes32 key = _keys[i];
            // Remove first `Spec` authorized consumers
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

    /// @inheritdoc IDRCoordinator
    function setDescription(string calldata _description) external onlyOwner {
        s_description = _description;
        emit DescriptionSet(_description);
    }

    /// @inheritdoc IDRCoordinator
    function setFallbackWeiPerUnitLink(uint256 _fallbackWeiPerUnitLink) external onlyOwner {
        _requireFallbackWeiPerUnitLinkIsGtZero(_fallbackWeiPerUnitLink);
        s_fallbackWeiPerUnitLink = _fallbackWeiPerUnitLink;
        emit FallbackWeiPerUnitLinkSet(_fallbackWeiPerUnitLink);
    }

    /// @inheritdoc IDRCoordinator
    function setL2SequencerGracePeriodSeconds(uint256 _l2SequencerGracePeriodSeconds) external onlyOwner {
        s_l2SequencerGracePeriodSeconds = _l2SequencerGracePeriodSeconds;
        emit L2SequencerGracePeriodSecondsSet(_l2SequencerGracePeriodSeconds);
    }

    /// @inheritdoc IDRCoordinator
    function setPermyriadFeeFactor(uint8 _permyriadFactor) external onlyOwner {
        s_permyriadFeeFactor = _permyriadFactor;
        emit PermyriadFeeFactorSet(_permyriadFactor);
    }

    /// @inheritdoc IDRCoordinator
    function setSpec(bytes32 _key, Spec calldata _spec) external onlyOwner {
        _setSpec(_key, _spec);
    }

    /// @inheritdoc IDRCoordinator
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

    /// @inheritdoc IDRCoordinator
    function setStalenessSeconds(uint256 _stalenessSeconds) external onlyOwner {
        s_stalenessSeconds = _stalenessSeconds;
        emit StalenessSecondsSet(_stalenessSeconds);
    }

    /// @inheritdoc IDRCoordinator
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @inheritdoc IDRCoordinatorCallable
    function withdrawFunds(address _payee, uint96 _amount) external nonReentrant {
        address consumer = msg.sender == owner() ? address(this) : msg.sender;
        uint96 consumerLinkBalance = s_consumerToLinkBalance[consumer];
        _requireLinkBalanceIsSufficient(consumer, consumerLinkBalance, _amount);
        s_consumerToLinkBalance[consumer] = consumerLinkBalance - _amount;
        emit FundsWithdrawn(consumer, _payee, _amount);
        if (!i_link.transfer(_payee, _amount)) {
            revert DRCoordinator__LinkTransferFailed(_payee, _amount);
        }
    }

    /* ========== EXTERNAL VIEW FUNCTIONS ========== */

    /// @inheritdoc IDRCoordinatorCallable
    function availableFunds(address _consumer) external view returns (uint96) {
        return s_consumerToLinkBalance[_consumer];
    }

    /// @inheritdoc IDRCoordinatorCallable
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

    /// @inheritdoc IDRCoordinatorCallable
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

    /// @inheritdoc IDRCoordinatorCallable
    function getDescription() external view returns (string memory) {
        return s_description;
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getFeedData() external view returns (uint256) {
        return _getFeedData();
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getFallbackWeiPerUnitLink() external view returns (uint256) {
        return s_fallbackWeiPerUnitLink;
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getFulfillConfig(bytes32 _requestId) external view returns (FulfillConfig memory) {
        return s_requestIdToFulfillConfig[_requestId];
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getIsL2SequencerDependant() external view returns (bool) {
        return i_isL2SequencerDependant;
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getIsMultiPriceFeedDependant() external view returns (bool) {
        return i_isMultiPriceFeedDependant;
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getIsReentrancyLocked() external view returns (bool) {
        return s_isReentrancyLocked;
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getLinkToken() external view returns (LinkTokenInterface) {
        return i_link;
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getL2SequencerFeed() external view returns (AggregatorV3Interface) {
        return i_l2SequencerFeed;
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getL2SequencerGracePeriodSeconds() external view returns (uint256) {
        return s_l2SequencerGracePeriodSeconds;
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getNumberOfSpecs() external view returns (uint256) {
        return s_keyToSpec._size();
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getPermyriadFeeFactor() external view returns (uint8) {
        return s_permyriadFeeFactor;
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getPriceFeed1() external view returns (AggregatorV3Interface) {
        return i_priceFeed1;
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getPriceFeed2() external view returns (AggregatorV3Interface) {
        return i_priceFeed2;
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getRequestCount() external view returns (uint256) {
        return s_requestCount;
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getSpec(bytes32 _key) external view returns (Spec memory) {
        _requireSpecIsInserted(_key);
        return s_keyToSpec._getSpec(_key);
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getSpecAuthorizedConsumers(bytes32 _key) external view returns (address[] memory) {
        // NB: `s_authorizedConsumerMap` only stores keys that exist in `s_keyToSpec`
        _requireSpecIsInserted(_key);
        return s_keyToAuthorizedConsumerMap[_key].keys;
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getSpecKeyAtIndex(uint256 _index) external view returns (bytes32) {
        return s_keyToSpec._getKeyAtIndex(_index);
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getSpecMapKeys() external view returns (bytes32[] memory) {
        return s_keyToSpec.keys;
    }

    /// @inheritdoc IDRCoordinatorCallable
    function getStalenessSeconds() external view returns (uint256) {
        return s_stalenessSeconds;
    }

    /// @inheritdoc IDRCoordinatorCallable
    function isSpecAuthorizedConsumer(bytes32 _key, address _consumer) external view returns (bool) {
        // NB: `s_authorizedConsumerMap` only stores keys that exist in `s_keyToSpec`
        _requireSpecIsInserted(_key);
        return s_keyToAuthorizedConsumerMap[_key]._isInserted(_consumer);
    }

    /* ========== EXTERNAL PURE FUNCTIONS ========== */

    /// @inheritdoc IDRCoordinatorCallable
    function getGasAfterPaymentCalculation() external pure returns (uint32) {
        return GAS_AFTER_PAYMENT_CALCULATION;
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
                revert DRCoordinator__SpecIsNotInserted(_key);
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
            SENDER_OVERRIDE, // Sender value - overridden by `onTokenTransfer()` by the requesting contract's address
            AMOUNT_OVERRIDE, // Amount value - overridden by `onTokenTransfer()` by the actual amount of LINK sent
            _req.id,
            _req.callbackFunctionId,
            nonce,
            OPERATOR_ARGS_VERSION,
            _req.buf.buf
        );
        bytes32 requestId = keccak256(abi.encodePacked(this, nonce));
        s_pendingRequests[requestId] = _operatorAddr;
        emit ChainlinkRequested(requestId);
        if (!i_link.transferAndCall(_operatorAddr, _payment, encodedRequest)) {
            revert DRCoordinator__LinkTransferAndCallFailed(_operatorAddr, _payment, encodedRequest);
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
            revert DRCoordinator__PaymentPreFeeTypeIsUnsupported(_paymentPreFeeType);
        }
        uint256 paymentAfterFee;
        if (_feeType == FeeType.FLAT) {
            paymentAfterFee = paymentPreFee + _fee;
        } else if (_feeType == FeeType.PERMYRIAD) {
            paymentAfterFee = paymentPreFee + (paymentPreFee * _fee) / PERMYRIAD;
        } else {
            revert DRCoordinator__FeeTypeIsUnsupported(_feeType);
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
            revert DRCoordinator__FeedAnswerIsNotGtZero(address(_priceFeed), answer);
        }
        // solhint-disable-next-line not-rely-on-time
        if (_stalenessSeconds > 0 && _stalenessSeconds < block.timestamp - timestamp) {
            return s_fallbackWeiPerUnitLink;
        }
        return _isPriceFeed1Case ? uint256(answer) : (uint256(answer) * TKN_TO_WEI_FACTOR) / _weiPerUnitLink;
    }

    function _getFeedData() private view returns (uint256) {
        if (i_isL2SequencerDependant) {
            (, int256 answer, , uint256 startedAt, ) = i_l2SequencerFeed.latestRoundData();
            if (answer == L2_SEQUENCER_IS_DOWN || block.timestamp - startedAt <= s_l2SequencerGracePeriodSeconds) {
                return s_fallbackWeiPerUnitLink;
            }
        }
        uint256 stalenessSeconds = s_stalenessSeconds;
        uint256 weiPerUnitLink = _calculateWeiPerUnitLink(true, i_priceFeed1, stalenessSeconds, 0);
        if (!i_isMultiPriceFeedDependant) return weiPerUnitLink;
        return _calculateWeiPerUnitLink(false, i_priceFeed2, stalenessSeconds, weiPerUnitLink);
    }

    function _requireCallerIsAuthorizedConsumer(
        bytes32 _key,
        address _operatorAddr,
        bytes32 _specId
    ) private view {
        AuthorizedConsumerLibrary.Map storage s_authorizedConsumerMap = s_keyToAuthorizedConsumerMap[_key];
        if (s_authorizedConsumerMap._size() > 0 && !s_authorizedConsumerMap._isInserted(msg.sender)) {
            revert DRCoordinator__CallerIsNotAuthorizedConsumer(_key, _operatorAddr, _specId);
        }
    }

    function _requireCallerIsRequester(address _requester) private view {
        if (_requester != msg.sender) {
            revert DRCoordinator__CallerIsNotRequester(_requester);
        }
    }

    function _requireCallerIsRequestOperator(address _operatorAddr) private view {
        if (_operatorAddr != msg.sender) {
            _requireRequestIsPending(_operatorAddr);
            revert DRCoordinator__CallerIsNotRequestOperator(_operatorAddr);
        }
    }

    function _requireSpecIsInserted(bytes32 _key) private view {
        if (!s_keyToSpec._isInserted(_key)) {
            revert DRCoordinator__SpecIsNotInserted(_key);
        }
    }

    function _validateCallbackAddress(address _callbackAddr) private view {
        if (!_callbackAddr.isContract()) {
            revert DRCoordinator__CallbackAddrIsNotContract(_callbackAddr);
        }
        if (_callbackAddr == address(this)) {
            revert DRCoordinator__CallbackAddrIsDRCoordinator(_callbackAddr);
        }
    }

    function _validateSpecFieldFee(
        bytes32 _key,
        FeeType _feeType,
        uint96 _fee
    ) private view {
        if (_feeType == FeeType.FLAT) {
            if (_fee > LINK_TOTAL_SUPPLY) {
                revert DRCoordinator__SpecFieldFeeIsGtLinkTotalSupply(_key, _fee, LINK_TOTAL_SUPPLY);
            }
        } else if (_feeType == FeeType.PERMYRIAD) {
            uint256 maxPermyriadFee = PERMYRIAD * s_permyriadFeeFactor;
            if (_fee > maxPermyriadFee) {
                revert DRCoordinator__SpecFieldFeeIsGtMaxPermyriadFee(_key, _fee, maxPermyriadFee);
            }
        } else {
            revert DRCoordinator__SpecFieldFeeTypeIsUnsupported(_key, _feeType);
        }
    }

    function _validateSpecFieldOperator(bytes32 _key, address _operator) private view {
        if (!_operator.isContract()) {
            revert DRCoordinator__SpecFieldOperatorIsNotContract(_key, _operator);
        }
        if (_operator == address(this)) {
            revert DRCoordinator__SpecFieldOperatorIsDRCoordinator(_key, _operator);
        }
    }

    /* ========== PRIVATE PURE FUNCTIONS ========== */

    function _calculateRequiredConsumerLinkBalanceAndRequestPayment(
        uint96 _maxPayment,
        PaymentType _paymentType,
        uint96 _payment
    ) private pure returns (uint96, uint96) {
        if (_paymentType == PaymentType.FLAT) {
            // NB: `Spec.payment` could be greater than MAX LINK payment
            uint96 requiredConsumerLinkBalance = _maxPayment >= _payment ? _maxPayment : _payment;
            return (requiredConsumerLinkBalance, _payment);
        } else if (_paymentType == PaymentType.PERMYRIAD) {
            return (_maxPayment, (_maxPayment * _payment) / PERMYRIAD);
        } else {
            revert DRCoordinator__PaymentTypeIsUnsupported(_paymentType);
        }
    }

    function _generateSpecKey(address _operatorAddr, bytes32 _specId) private pure returns (bytes32) {
        // `(operatorAddr, specId)` composite key allows storing N specs with the same `externalJobID` but different
        // Operator address
        return keccak256(abi.encodePacked(_operatorAddr, _specId));
    }

    function _requireArrayIsNotEmpty(string memory _arrayName, uint256 _arrayLength) private pure {
        if (_arrayLength == 0) {
            revert DRCoordinator__ArrayIsEmpty(_arrayName);
        }
    }

    function _requireArrayLengthsAreEqual(
        string memory _array1Name,
        uint256 _array1Length,
        string memory _array2Name,
        uint256 _array2Length
    ) private pure {
        if (_array1Length != _array2Length) {
            revert DRCoordinator__ArrayLengthsAreNotEqual(_array1Name, _array1Length, _array2Name, _array2Length);
        }
    }

    function _requireFallbackWeiPerUnitLinkIsGtZero(uint256 _fallbackWeiPerUnitLink) private pure {
        if (_fallbackWeiPerUnitLink == 0) {
            revert DRCoordinator__FallbackWeiPerUnitLinkIsZero();
        }
    }

    function _requireLinkAllowanceIsSufficient(
        address _payer,
        uint96 _allowance,
        uint96 _amount
    ) private pure {
        if (_allowance < _amount) {
            revert DRCoordinator__LinkAllowanceIsInsufficient(_payer, _allowance, _amount);
        }
    }

    function _requireLinkBalanceIsSufficient(
        address _payer,
        uint96 _balance,
        uint96 _amount
    ) private pure {
        if (_balance < _amount) {
            revert DRCoordinator__LinkBalanceIsInsufficient(_payer, _balance, _amount);
        }
    }

    function _requireLinkPaymentIsInRange(uint96 _payment) private pure {
        if (_payment > LINK_TOTAL_SUPPLY) {
            revert DRCoordinator__LinkPaymentIsGtLinkTotalSupply(_payment, LINK_TOTAL_SUPPLY);
        }
    }

    function _requireLinkPaymentIsWithinConsumerMaxPaymentRange(uint96 _payment, uint96 _consumerMaxPayment)
        private
        pure
    {
        if (_payment > _consumerMaxPayment) {
            revert DRCoordinator__LinkPaymentIsGtConsumerMaxPayment(_payment, _consumerMaxPayment);
        }
    }

    function _requireL2SequencerFeed(bool _isL2SequencerDependant, address _l2SequencerFeed) private view {
        if (_isL2SequencerDependant && !_l2SequencerFeed.isContract()) {
            revert DRCoordinator__L2SequencerFeedIsNotContract(_l2SequencerFeed);
        }
    }

    function _requirePriceFeed(
        bool _isMultiPriceFeedDependant,
        address _priceFeed1,
        address _priceFeed2
    ) private view {
        if (!_priceFeed1.isContract()) {
            revert DRCoordinator__PriceFeedIsNotContract(_priceFeed1);
        }
        if (_isMultiPriceFeedDependant && !_priceFeed2.isContract()) {
            revert DRCoordinator__PriceFeedIsNotContract(_priceFeed2);
        }
    }

    function _requireRequestIsPending(address _operatorAddr) private pure {
        if (_operatorAddr == address(0)) {
            revert DRCoordinator__RequestIsNotPending();
        }
    }

    function _validateCallbackGasLimit(uint32 _callbackGasLimit, uint32 _specGasLimit) private pure {
        if (_callbackGasLimit > _specGasLimit) {
            revert DRCoordinator__CallbackGasLimitIsGtSpecGasLimit(_callbackGasLimit, _specGasLimit);
        }
        if (_callbackGasLimit < MIN_REQUEST_GAS_LIMIT) {
            revert DRCoordinator__CallbackGasLimitIsLtMinRequestGasLimit(_callbackGasLimit, MIN_REQUEST_GAS_LIMIT);
        }
    }

    function _validateSpecFieldGasLimit(bytes32 _key, uint32 _gasLimit) private pure {
        if (_gasLimit < MIN_REQUEST_GAS_LIMIT) {
            revert DRCoordinator__SpecFieldGasLimitIsLtMinRequestGasLimit(_key, _gasLimit, MIN_REQUEST_GAS_LIMIT);
        }
    }

    function _validateSpecFieldPayment(
        bytes32 _key,
        PaymentType _paymentType,
        uint96 _payment
    ) private pure {
        if (_paymentType == PaymentType.FLAT) {
            if (_payment > LINK_TOTAL_SUPPLY) {
                revert DRCoordinator__SpecFieldPaymentIsGtLinkTotalSupply(_key, _payment, LINK_TOTAL_SUPPLY);
            }
        } else if (_paymentType == PaymentType.PERMYRIAD) {
            if (_payment > PERMYRIAD) {
                revert DRCoordinator__SpecFieldPaymentIsGtPermyriad(_key, _payment, PERMYRIAD);
            }
        } else {
            revert DRCoordinator__SpecFieldPaymentTypeIsUnsupported(_key, _paymentType);
        }
    }

    function _validateSpecFieldSpecId(bytes32 _key, bytes32 _specId) private pure {
        if (_specId == NO_SPEC_ID) {
            revert DRCoordinator__SpecFieldSpecIdIsZero(_key);
        }
    }
}
