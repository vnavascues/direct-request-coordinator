// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { Chainlink, ChainlinkClient, LinkTokenInterface } from "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import { ConfirmedOwner } from "@chainlink/contracts/src/v0.8/ConfirmedOwner.sol";
import { AggregatorV3Interface } from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import { FlagsInterface } from "@chainlink/contracts/src/v0.8/interfaces/FlagsInterface.sol";
import { TypeAndVersionInterface } from "@chainlink/contracts/src/v0.8/interfaces/TypeAndVersionInterface.sol";
import { Pausable } from "@openzeppelin/contracts/security/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IExternalFulfillment } from "./IExternalFulfillment.sol";
import { FeeType, Spec, SpecLibrary } from "./SpecLibrary.sol";
import { console } from "hardhat/console.sol";

/**
 * Justify a Spec per (oracle, specId): same specId on different nodes/networks w/wo different payment and/or gas limits
 *
 * https://etherscan.io/address/0x271682DEB8C4E0901D1a1550aD2e64D568E69909#readContract
 */
contract DRCoordinator is TypeAndVersionInterface, ConfirmedOwner, Pausable, ReentrancyGuard, ChainlinkClient {
    using Address for address;
    using Chainlink for Chainlink.Request;
    using SpecLibrary for SpecLibrary.Map;

    enum PaymentNoFeeType {
        MAX,
        SPOT
    }
    /**
     * from: 1 or more -> array?
     * to: this contract, requester, or fulfillment won't work
     * data: ok
     * gasLimit: ok
     * txMeta: can't pass
     * minConfirmations: ok
     * evmChainID: ? I don't think multichain works with directrequest/operator.sol, discarded
     */
    struct FulfillConfig {
        address msgSender;
        address callbackAddr;
        uint256 payment;
        uint256 minConfirmations;
        uint256 gasLimit;
        uint256 fulfillmentFee;
        FeeType feeType;
    }

    uint256 private constant LINK_TOTAL_SUPPLY = 1e27;
    bytes32 private constant NO_SPEC_KEY = bytes32(0);
    uint8 private constant MIN_FALLBACK_MSG_DATA_LENGTH = 36;
    uint16 public constant MAX_REQUEST_CONFIRMATIONS = 200;
    bool public immutable IS_SEQUENCER_DEPENDANT;
    address public immutable FLAG_SEQUENCER_OFFLINE;
    FlagsInterface public immutable CHAINLINK_FLAGS;
    LinkTokenInterface public immutable LINK;
    AggregatorV3Interface public immutable LINK_TKN_FEED;
    bytes20 private s_sha1;
    // TODO config start: config, within a scruct?
    uint256 private s_fallbackWeiPerUnitLink;
    uint256 private s_gasAfterPaymentCalculation; // TODO: int32? - 33285
    uint256 private s_stalenessSeconds; // TODO: uint32 - 86400
    // TODO config end: config, within a scruct?
    string private s_description;
    mapping(bytes32 => FulfillConfig) private s_requestIdToFulfillConfig; /* requestId */ /* FulfillConfig */
    SpecLibrary.Map private s_keyToSpec; /* keccack256(oracle,specId) */ /* Spec */

    error DRCoordinator__ArraysLengthIsNotEqual();
    error DRCoordinator__CallbackAddrIsDRCoordinator();
    error DRCoordinator__CallbackAddrIsNotAContract();
    error DRCoordinator__FallbackMsgDataIsInvalid();
    error DRCoordinator__FeedAnswerIsNotPositive();
    error DRCoordinator__FeeTypeIsUnsupported(FeeType feeType);
    error DRCoordinator__GasLimitIsGreaterThanSpecGasLimit(uint256 gasLimit, uint256 specGasLimit);
    error DRCoordinator__GasLimitIsZero();
    error DRCoordinator__FulfillmentFeeIsGreaterThanLinkTotalSupply();
    error DRCoordinator__FulfillmentFeeIsZero();
    error DRCoordinator__LinkAllowanceIsInsufficient(uint256 allowance, uint256 payment);
    error DRCoordinator__LinkBalanceIsInsufficient(uint256 balance, uint256 payment);
    error DRCoordinator__LinkPaymentIsTooLarge();
    error DRCoordinator__LinkTransferFailed(address to, uint256 payment);
    error DRCoordinator__LinkTransferFromFailed(address from, address to, uint256 payment);
    error DRCoordinator__LinkWeiPriceIsZero();
    error DRCoordinator__MinConfirmationsIsGreaterThanMaxRequesetConfirmations();
    error DRCoordinator__MinConfirmationsIsGreaterThanSpecMinConfirmations(
        uint256 minConfirmations,
        uint256 specMinConfirmations
    );
    error DRCoordinator__OracleIsNotAContract();
    error DRCoordinator__PaymentIsGreaterThanLinkTotalSupply();
    error DRCoordinator__PaymentIsZero();
    error DRCoordinator__PaymentNoFeeIsZero();
    error DRCoordinator__PaymentNoFeeTypeUnsupported(PaymentNoFeeType paymentNoFeeType);
    error DRCoordinator__SpecIsNotInserted(bytes32 key);
    error DRCoordinator__SpecIdIsZero();
    error DRCoordinator__SpecKeysArraysIsEmpty();

    event FundsWithdrawn(address payee, uint256 amount);
    event RequestFulfilled(
        bytes32 indexed requestId,
        bool success,
        address indexed callbackAddr,
        bytes4 callbackFunctionSignature,
        bytes data
    );
    event SetChainlinkExternalRequestFailed(address indexed callbackAddr, bytes32 indexed requestId, bytes32 key);
    event SpecRemoved(bytes32 indexed key);
    event SpecSet(bytes32 indexed key, Spec spec);

    constructor(
        address _link,
        address _linkTknFeed,
        string memory _description,
        uint256 _fallbackWeiPerUnitLink,
        uint256 _gasAfterPaymentCalculation,
        uint256 _stalenessSeconds,
        bool _isSequencerDependant,
        string memory _sequencerOfflineFlag,
        address _chainlinkFlags
    ) ConfirmedOwner(msg.sender) {
        _requireLinkWeiPrice(_fallbackWeiPerUnitLink);
        setChainlinkToken(_link);
        LINK = LinkTokenInterface(_link);
        LINK_TKN_FEED = AggregatorV3Interface(_linkTknFeed);
        IS_SEQUENCER_DEPENDANT = _isSequencerDependant;
        FLAG_SEQUENCER_OFFLINE = _isSequencerDependant
            ? address(bytes20(bytes32(uint256(keccak256(abi.encodePacked(_sequencerOfflineFlag))) - 1)))
            : address(0);
        CHAINLINK_FLAGS = FlagsInterface(_chainlinkFlags);
        s_description = _description;
        s_fallbackWeiPerUnitLink = _fallbackWeiPerUnitLink;
        s_gasAfterPaymentCalculation = _gasAfterPaymentCalculation;
        s_stalenessSeconds = _stalenessSeconds;
    }

    // solhint-disable-next-line no-complex-fallback, payable-fallback
    fallback() external whenNotPaused nonReentrant {
        uint256 startGas = gasleft();

        // Validate requestId
        bytes4 callbackFunctionSignature = msg.sig; // bytes4(msg.data);
        bytes calldata data = msg.data;
        _requireFallbackMsgData(data);
        bytes32 requestId = abi.decode(data[4:], (bytes32));
        validateChainlinkCallback(requestId);

        // Retrieve FulfillConfig
        FulfillConfig memory fulfillConfig = s_requestIdToFulfillConfig[requestId];

        // Fulfill
        // TODO: deal with gasLimit? - .call(data){gas: fulfillConfig.gasLimit}
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = fulfillConfig.callbackAddr.call(data);
        // TODO: calculate gas from here
        // Make payment
        uint256 payment = _calculatePaymentAmount(
            PaymentNoFeeType.SPOT,
            startGas,
            s_gasAfterPaymentCalculation,
            tx.gasprice,
            fulfillConfig.payment,
            0,
            fulfillConfig.fulfillmentFee,
            fulfillConfig.feeType
        );
        _requireLinkAllowance(LINK.allowance(fulfillConfig.msgSender, address(this)), payment);
        _requireLinkBalance(LINK.balanceOf(fulfillConfig.msgSender), payment);
        _requireLinkTransferFrom(
            LINK.transferFrom(fulfillConfig.msgSender, address(this), payment),
            fulfillConfig.msgSender,
            address(this),
            payment
        );
        emit RequestFulfilled(requestId, success, fulfillConfig.callbackAddr, callbackFunctionSignature, data);
        delete s_requestIdToFulfillConfig[requestId];
        // TODO: calculate gas to here
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    function pause() external onlyOwner {
        _pause();
    }

    function requestData(
        address _oracle,
        bytes32 _specId,
        address _callbackAddr,
        uint256 _callbackGasLimit,
        uint256 _callbackMinConfirmations,
        Chainlink.Request memory _req
    ) external whenNotPaused nonReentrant returns (bytes32) {
        // Validate params
        _requireOracle(_oracle);
        _requireSpecId(_specId);
        _requireCallbackAddr(_callbackAddr);

        bytes32 key = _generateSpecKey(_oracle, _specId);
        _requireSpecIsInserted(key, s_keyToSpec.isInserted(key));
        // Check LINK funds (based on max gas limit)
        Spec memory spec = s_keyToSpec.getSpec(key);
        _requireMinConfirmations(spec.minConfirmations, _callbackMinConfirmations);
        _requireGasLimit(spec.gasLimit, _callbackGasLimit);

        uint256 maxPayment = _calculatePaymentAmount(
            PaymentNoFeeType.MAX,
            0,
            0,
            tx.gasprice,
            spec.payment,
            _callbackGasLimit,
            spec.fulfillmentFee,
            spec.feeType
        );
        _requireLinkAllowance(LINK.allowance(msg.sender, address(this)), maxPayment);
        _requireLinkBalance(LINK.balanceOf(msg.sender), maxPayment);

        // Extend Chainlink Request
        _req.addUint("minConfirmations", spec.minConfirmations);
        _req.addUint("gasLimit", spec.gasLimit);

        // Send Operator request
        bytes32 requestId = sendOperatorRequestTo(_oracle, _req, spec.payment);

        // Store fulfill config by request ID
        FulfillConfig memory fulfillConfig;
        fulfillConfig.msgSender = msg.sender;
        fulfillConfig.callbackAddr = _callbackAddr;
        fulfillConfig.payment = spec.payment;
        fulfillConfig.minConfirmations = _callbackMinConfirmations; // TODO: spec.minConfirmations;
        fulfillConfig.gasLimit = _callbackGasLimit + s_gasAfterPaymentCalculation; // TODO: spec.gasLimit;
        fulfillConfig.fulfillmentFee = spec.fulfillmentFee;
        fulfillConfig.feeType = spec.feeType;
        s_requestIdToFulfillConfig[requestId] = fulfillConfig;

        if (_callbackAddr != msg.sender) {
            // Set a new pending request on the callbackAddr (fulfillment contract)
            IExternalFulfillment fulfillmentContract = IExternalFulfillment(_callbackAddr);
            // solhint-disable-next-line no-empty-blocks
            try fulfillmentContract.setChainlinkExternalRequest(address(this), requestId) {} catch {
                // NB: revert could be the alternative
                emit SetChainlinkExternalRequestFailed(_callbackAddr, requestId, key);
            }
        }
        return requestId;
    }

    function removeSpec(bytes32 _key) external onlyOwner whenNotPaused {
        _removeSpec(_key);
        s_sha1 = bytes20(0);
    }

    function removeSpecs(bytes32[] calldata _keys) external onlyOwner whenNotPaused {
        uint256 keysLength = _keys.length;
        _requireSpecKeys(keysLength);
        for (uint256 i = 0; i < keysLength; ) {
            _removeSpec(_keys[i]);
            unchecked {
                ++i;
            }
        }
        s_sha1 = bytes20(0);
    }

    function setDescription(string calldata _description) external onlyOwner whenNotPaused {
        s_description = _description;
    }

    function setFallbackWeiPerUnitLink(uint256 _fallbackWeiPerUnitLink) external onlyOwner {
        _requireLinkWeiPrice(_fallbackWeiPerUnitLink);
        s_fallbackWeiPerUnitLink = _fallbackWeiPerUnitLink;
    }

    function setGasAfterPaymentCalculation(uint256 _gasAfterPaymentCalculation) external onlyOwner {
        s_gasAfterPaymentCalculation = _gasAfterPaymentCalculation;
    }

    function setSha1(bytes20 _sha1) external onlyOwner whenNotPaused {
        s_sha1 = _sha1;
    }

    function setSpec(bytes32 _key, Spec calldata _spec) external onlyOwner whenNotPaused {
        _setSpec(_key, _spec);
    }

    function setSpecs(bytes32[] calldata _keys, Spec[] calldata _specs) external onlyOwner whenNotPaused {
        uint256 keysLength = _keys.length;
        _requireSpecKeys(keysLength);
        _requireEqualLength(keysLength, _specs.length);
        for (uint256 i = 0; i < keysLength; ) {
            _setSpec(_keys[i], _specs[i]);
            unchecked {
                ++i;
            }
        }
    }

    function setStalenessSeconds(uint256 _stalenessSeconds) external onlyOwner {
        s_stalenessSeconds = _stalenessSeconds;
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdraw(address payable _payee, uint256 _amount) external onlyOwner {
        emit FundsWithdrawn(_payee, _amount);
        _requireLinkTransfer(LINK.transfer(_payee, _amount), _payee, _amount);
    }

    /* ========== EXTERNAL VIEW FUNCTIONS ========== */

    function availableFunds() external view returns (uint256) {
        return _availableFunds();
    }

    function calculateMaxPaymentAmount(
        uint256 _weiPerUnitGas,
        uint256 _payment,
        uint256 _gasLimit,
        uint256 _fulfillmentFee,
        FeeType _feeType
    ) external view returns (uint256) {
        // TODO: if purpose is simulation, discount fallback gas
        return
            _calculatePaymentAmount(
                PaymentNoFeeType.MAX,
                0,
                0,
                _weiPerUnitGas,
                _payment,
                _gasLimit,
                _fulfillmentFee,
                _feeType
            );
    }

    function calculateSpotPaymentAmount(
        uint256 _startGas,
        uint256 _gasAfterPaymentCalculation,
        uint256 _weiPerUnitGas,
        uint256 _payment,
        uint256 _fulfillmentFee,
        FeeType _feeType
    ) external view returns (uint256) {
        // TODO: if purpose is simulation, discount fallback gas
        return
            _calculatePaymentAmount(
                PaymentNoFeeType.SPOT,
                _startGas,
                _gasAfterPaymentCalculation,
                _weiPerUnitGas,
                _payment,
                0,
                _fulfillmentFee,
                _feeType
            );
    }

    function cancelRequest(
        bytes32 _requestId,
        uint256 _payment,
        bytes4 _callbackFunctionSignature,
        uint256 _expiration
    ) external onlyOwner {
        cancelChainlinkRequest(_requestId, _payment, _callbackFunctionSignature, _expiration);
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

    function getGasAfterPaymentCalculation() external view returns (uint256) {
        return s_gasAfterPaymentCalculation;
    }

    function getSha1() external view returns (bytes20) {
        return s_sha1;
    }

    function getStalenessSeconds() external view returns (uint256) {
        return s_stalenessSeconds;
    }

    /* ========== EXTERNAL PURE FUNCTIONS ========== */

    function typeAndVersion() external pure virtual override returns (string memory) {
        return "DRCoordinator 1.0.0";
    }

    /* ========== PRIVATE FUNCTIONS ========== */

    function _removeSpec(bytes32 _key) private {
        _requireSpecIsInserted(_key, s_keyToSpec.isInserted(_key));
        s_keyToSpec.remove(_key);
        emit SpecRemoved(_key);
    }

    function _setSpec(bytes32 _key, Spec calldata _spec) private {
        _requireSpecId(_spec.specId);
        _requireOracle(_spec.oracle);
        _requireSpecPayment(_spec.payment);
        _requireSpecMinConfirmations(_spec.minConfirmations);
        _requireSpecGasLimit(_spec.gasLimit);
        _requireSpecFulfillmentFee(_spec.fulfillmentFee);
        s_keyToSpec.set(_key, _spec);
        emit SpecSet(_key, _spec);
    }

    /* ========== PRIVATE VIEW FUNCTIONS ========== */

    function _availableFunds() private view returns (uint256) {
        return LINK.balanceOf(address(this));
    }

    function _calculatePaymentAmount(
        PaymentNoFeeType _paymentNoFeeType,
        uint256 _startGas,
        uint256 _gasAfterPaymentCalculation,
        uint256 _weiPerUnitGas,
        uint256 _payment,
        uint256 _gasLimit,
        uint256 _fulfillmentFee,
        FeeType _feeType
    ) private view returns (uint256) {
        uint256 weiPerUnitLink = _getFeedData();
        // (1e18 juels/link) (wei/gas * gas) / (wei/link) = juels
        uint256 paymentNoFee;
        if (_paymentNoFeeType == PaymentNoFeeType.MAX) {
            paymentNoFee = (1e18 * _weiPerUnitGas * _gasLimit) / weiPerUnitLink;
        } else if (_paymentNoFeeType == PaymentNoFeeType.SPOT) {
            paymentNoFee =
                (1e18 * _weiPerUnitGas * (_gasAfterPaymentCalculation + _startGas - gasleft())) /
                weiPerUnitLink;
        } else {
            revert DRCoordinator__PaymentNoFeeTypeUnsupported(_paymentNoFeeType);
        }
        paymentNoFee = paymentNoFee - _payment;
        if (paymentNoFee == 0) {
            revert DRCoordinator__PaymentNoFeeIsZero();
        }
        uint256 amount;
        if (_feeType == FeeType.FLAT) {
            amount = paymentNoFee + 1e12 * _fulfillmentFee;
        } else if (_feeType == FeeType.PERMIRYAD) {
            amount = paymentNoFee + (paymentNoFee * _fulfillmentFee) / 1e4;
        } else {
            revert DRCoordinator__FeeTypeIsUnsupported(_feeType);
        }
        if (amount > 1e27) {
            // Calculated amount cannot be more than all of the link in existence.
            revert DRCoordinator__LinkPaymentIsTooLarge();
        }
        return amount;
    }

    // TODO: currently only supports LINK_TKN feeds (1 hop). Enable a mode that supports TKN_USD to USD_LINK (2 hops)
    // on networks that do not have a LINK_TKN feed yet.
    function _getFeedData() private view returns (uint256) {
        if (IS_SEQUENCER_DEPENDANT && CHAINLINK_FLAGS.getFlag(FLAG_SEQUENCER_OFFLINE)) {
            return s_fallbackWeiPerUnitLink;
        }
        uint256 stalenessSeconds = s_stalenessSeconds; // TODO: uint32
        uint256 timestamp;
        int256 answer;
        uint256 weiPerUnitLink;
        (, answer, , timestamp, ) = LINK_TKN_FEED.latestRoundData();
        if (answer <= 0) {
            revert DRCoordinator__FeedAnswerIsNotPositive();
        }
        // solhint-disable-next-line not-rely-on-time
        if (stalenessSeconds > 0 && stalenessSeconds < block.timestamp - timestamp) {
            weiPerUnitLink = s_fallbackWeiPerUnitLink;
        } else {
            weiPerUnitLink = uint256(answer);
        }
        return weiPerUnitLink;
    }

    function _requireCallbackAddr(address _callbackAddr) private view {
        if (!_callbackAddr.isContract()) {
            revert DRCoordinator__CallbackAddrIsNotAContract();
        }
        if (_callbackAddr == address(this)) {
            revert DRCoordinator__CallbackAddrIsDRCoordinator();
        }
    }

    function _requireOracle(address _oracle) private view {
        if (!_oracle.isContract()) {
            revert DRCoordinator__OracleIsNotAContract();
        }
    }

    /* ========== PRIVATE PURE FUNCTIONS ========== */

    function _generateSpecKey(address _oracle, bytes32 _specId) private pure returns (bytes32) {
        return keccak256(abi.encode(_oracle, _specId));
    }

    function _requireEqualLength(uint256 _length1, uint256 _length2) private pure {
        if (_length1 != _length2) {
            revert DRCoordinator__ArraysLengthIsNotEqual();
        }
    }

    function _requireFallbackMsgData(bytes calldata _data) private pure {
        if (_data.length < MIN_FALLBACK_MSG_DATA_LENGTH) {
            revert DRCoordinator__FallbackMsgDataIsInvalid();
        }
    }

    function _requireFulfillmentFee(uint256 _fulfillmentFee) private pure {
        if (_fulfillmentFee == 0) {
            revert DRCoordinator__FulfillmentFeeIsZero();
        }
        if (_fulfillmentFee > LINK_TOTAL_SUPPLY) {
            revert DRCoordinator__FulfillmentFeeIsGreaterThanLinkTotalSupply();
        }
    }

    function _requireGasLimit(uint256 _specGasLimit, uint256 _gasLimit) private pure {
        if (_gasLimit > _specGasLimit) {
            revert DRCoordinator__GasLimitIsGreaterThanSpecGasLimit(_gasLimit, _specGasLimit);
        }
        _requireSpecGasLimit(_gasLimit);
    }

    function _requireLinkAllowance(uint256 _allowance, uint256 _payment) private pure {
        if (_allowance < _payment) {
            revert DRCoordinator__LinkAllowanceIsInsufficient(_allowance, _payment);
        }
    }

    function _requireLinkBalance(uint256 _balance, uint256 _payment) private pure {
        if (_balance < _payment) {
            revert DRCoordinator__LinkBalanceIsInsufficient(_balance, _payment);
        }
    }

    function _requireLinkWeiPrice(uint256 _linkWeiPrice) private pure {
        if (_linkWeiPrice == 0) {
            revert DRCoordinator__LinkWeiPriceIsZero();
        }
    }

    function _requireLinkTransfer(
        bool _success,
        address _to,
        uint256 _amount
    ) private pure {
        if (!_success) {
            revert DRCoordinator__LinkTransferFailed(_to, _amount);
        }
    }

    function _requireLinkTransferFrom(
        bool _success,
        address _from,
        address _to,
        uint256 _payment
    ) private pure {
        if (!_success) {
            revert DRCoordinator__LinkTransferFromFailed(_from, _to, _payment);
        }
    }

    function _requireMinConfirmations(uint256 _specMinConfirmations, uint256 _minConfirmations) private pure {
        if (_minConfirmations > _specMinConfirmations) {
            revert DRCoordinator__MinConfirmationsIsGreaterThanSpecMinConfirmations(
                _minConfirmations,
                _specMinConfirmations
            );
        }
        _requireSpecMinConfirmations(_minConfirmations);
    }

    function _requireSpecMinConfirmations(uint256 _minConfirmations) private pure {
        if (_minConfirmations > MAX_REQUEST_CONFIRMATIONS) {
            revert DRCoordinator__MinConfirmationsIsGreaterThanMaxRequesetConfirmations();
        }
    }

    function _requireSpecFulfillmentFee(uint256 _fulfillmentFee) private pure {
        if (_fulfillmentFee == 0) {
            revert DRCoordinator__FulfillmentFeeIsZero();
        }
        if (_fulfillmentFee > LINK_TOTAL_SUPPLY) {
            revert DRCoordinator__FulfillmentFeeIsGreaterThanLinkTotalSupply();
        }
    }

    function _requireSpecGasLimit(uint256 _gasLimit) private pure {
        if (_gasLimit == 0) {
            revert DRCoordinator__GasLimitIsZero();
        }
    }

    function _requireSpecId(bytes32 _specId) private pure {
        if (_specId == NO_SPEC_KEY) {
            revert DRCoordinator__SpecIdIsZero();
        }
    }

    function _requireSpecIsInserted(bytes32 _key, bool _isInserted) private pure {
        if (!_isInserted) {
            revert DRCoordinator__SpecIsNotInserted(_key);
        }
    }

    function _requireSpecKeys(uint256 keysLength) private pure {
        if (keysLength == 0) {
            revert DRCoordinator__SpecKeysArraysIsEmpty();
        }
    }

    function _requireSpecPayment(uint256 _payment) private pure {
        if (_payment == 0) {
            revert DRCoordinator__PaymentIsZero();
        }
        if (_payment > LINK_TOTAL_SUPPLY) {
            revert DRCoordinator__PaymentIsGreaterThanLinkTotalSupply();
        }
    }
}
