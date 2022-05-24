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
import "hardhat/console.sol";

// NB: enum placed outside due to Slither bug https://github.com/crytic/slither/issues/1166
enum PaymentPreFeeType {
    MAX,
    SPOT
}

contract DRCoordinator is TypeAndVersionInterface, ConfirmedOwner, Pausable, ReentrancyGuard, ChainlinkClient {
    using Address for address;
    using Chainlink for Chainlink.Request;
    using SpecLibrary for SpecLibrary.Map;

    struct FulfillConfig {
        address msgSender; // 20 bytes
        uint96 payment; // 12 bytes
        address callbackAddr; // 20 bytes
        uint96 fulfillmentFee; // 12 bytes
        uint8 minConfirmations; // 1 byte
        uint48 gasLimit; // 6 bytes
        FeeType feeType; // 1 byte
    }
    bytes32 private constant NO_SPEC_KEY = bytes32(0); // 32 bytes
    uint96 private constant LINK_TOTAL_SUPPLY = 1e27; // 12 bytes
    uint8 private constant MIN_FALLBACK_MSG_DATA_LENGTH = 36; // 1 byte
    uint8 public constant MAX_REQUEST_CONFIRMATIONS = 200; // 1 byte
    bool public immutable IS_SEQUENCER_DEPENDANT; // 1 byte
    address public immutable FLAG_SEQUENCER_OFFLINE; // 20 bytes
    FlagsInterface public immutable CHAINLINK_FLAGS; // 20 bytes
    LinkTokenInterface public immutable LINK; // 20 bytes
    AggregatorV3Interface public immutable LINK_TKN_FEED; // 20 bytes
    bytes20 private s_sha1; // 20 bytes
    uint48 private s_gasAfterPaymentCalculation; // 6 bytes
    uint256 private s_stalenessSeconds; // 32 bytes (or uint32 - 4 bytes)
    uint256 private s_fallbackWeiPerUnitLink; // 32 bytes
    string private s_description;
    mapping(bytes32 => FulfillConfig) private s_requestIdToFulfillConfig; /* requestId */ /* FulfillConfig */
    SpecLibrary.Map private s_keyToSpec; /* keccak256(abi.encodePacked(oracle, specId)) */ /* Spec */

    error DRCoordinator__ArraysLengthIsNotEqual();
    error DRCoordinator__CallbackAddrIsDRCoordinator();
    error DRCoordinator__CallbackAddrIsNotAContract();
    error DRCoordinator__FallbackMsgDataIsInvalid();
    error DRCoordinator__FeedAnswerIsNotGtZero(int256 answer);
    error DRCoordinator__FeeTypeIsUnsupported(FeeType feeType);
    error DRCoordinator__GasLimitIsGtSpecGasLimit(uint48 gasLimit, uint48 specGasLimit);
    error DRCoordinator__GasLimitIsZero();
    error DRCoordinator__FulfillmentFeeIsGtLinkTotalSupply();
    error DRCoordinator__FulfillmentFeeIsZero();
    error DRCoordinator__LinkAllowanceIsInsufficient(uint256 allowance, uint256 payment);
    error DRCoordinator__LinkBalanceIsInsufficient(uint256 balance, uint256 payment);
    error DRCoordinator__LinkTransferFailed(address to, uint256 payment);
    error DRCoordinator__LinkTransferFromFailed(address from, address to, uint256 payment);
    error DRCoordinator__LinkWeiPriceIsZero();
    error DRCoordinator__MinConfirmationsIsGtMaxRequesetConfirmations(
        uint8 minConfirmations,
        uint8 maxRequestConfirmations
    );
    error DRCoordinator__MinConfirmationsIsGtSpecMinConfirmations(uint8 minConfirmations, uint8 specMinConfirmations);
    error DRCoordinator__OracleIsNotAContract();
    error DRCoordinator__PaymentAfterFeeIsGtLinkTotalSupply(uint256 paymentAfterFee);
    error DRCoordinator__PaymentIsGtLinkTotalSupply();
    error DRCoordinator__PaymentIsZero();
    error DRCoordinator__PaymentPreFeeIsLtePayment(uint256 paymentPreFee, uint96 payment);
    error DRCoordinator__PaymentPreFeeTypeUnsupported(PaymentPreFeeType paymentPreFeeType);
    error DRCoordinator__SpecIsNotInserted(bytes32 key);
    error DRCoordinator__SpecIdIsZero();
    error DRCoordinator__SpecKeysArraysIsEmpty();

    event DRCoordinator__FallbackWeiPerUnitLinkSet(uint256 fallbackWeiPerUnitLink);
    event DRCoordinator__FundsWithdrawn(address payee, uint256 amount);
    event DRCoordinator__GasAfterPaymentCalculationSet(uint48 gasAfterPaymentCalculation);
    event DRCoordinator__RequestFulfilled(
        bytes32 indexed requestId,
        bool success,
        address indexed callbackAddr,
        bytes4 callbackFunctionSignature,
        bytes data,
        uint256 payment
    );
    event DRCoordinator__SetChainlinkExternalRequestFailed(
        address indexed callbackAddr,
        bytes32 indexed requestId,
        bytes32 key
    );
    event DRCoordinator__SpecRemoved(bytes32 indexed key);
    event DRCoordinator__SpecSet(bytes32 indexed key, Spec spec);
    event DRCoordinator__StalenessSecondsSet(uint256 stalenessSeconds);

    constructor(
        address _link,
        address _linkTknFeed,
        string memory _description,
        uint256 _fallbackWeiPerUnitLink,
        uint48 _gasAfterPaymentCalculation,
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
        // Validate requestId
        bytes4 callbackFunctionSignature = msg.sig; // bytes4(msg.data);
        bytes calldata data = msg.data;
        _requireFallbackMsgData(data);
        bytes32 requestId = abi.decode(data[4:], (bytes32));
        validateChainlinkCallback(requestId);

        // Retrieve FulfillConfig by request ID
        FulfillConfig memory fulfillConfig = s_requestIdToFulfillConfig[requestId];
        // Fulfill just with the gas amount requested by the consumer
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = fulfillConfig.callbackAddr.call{
            gas: fulfillConfig.gasLimit - s_gasAfterPaymentCalculation
        }(data);

        // Charge LINK payment
        uint256 payment = _calculatePaymentAmount(
            PaymentPreFeeType.SPOT,
            fulfillConfig.gasLimit,
            tx.gasprice,
            fulfillConfig.payment,
            0,
            fulfillConfig.fulfillmentFee,
            fulfillConfig.feeType
        );
        // NB: statemens below cost 53942 gas approx
        _requireLinkAllowance(LINK.allowance(fulfillConfig.msgSender, address(this)), payment);
        _requireLinkBalance(LINK.balanceOf(fulfillConfig.msgSender), payment);
        _requireLinkTransferFrom(
            LINK.transferFrom(fulfillConfig.msgSender, address(this), payment),
            fulfillConfig.msgSender,
            address(this),
            payment
        );
        delete s_requestIdToFulfillConfig[requestId];
        emit DRCoordinator__RequestFulfilled(
            requestId,
            success,
            fulfillConfig.callbackAddr,
            callbackFunctionSignature,
            data,
            payment
        );
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    function pause() external onlyOwner {
        _pause();
    }

    function requestData(
        address _oracle,
        bytes32 _specId,
        address _callbackAddr,
        uint48 _callbackGasLimit,
        uint8 _callbackMinConfirmations,
        Chainlink.Request memory _req
    ) external whenNotPaused nonReentrant returns (bytes32) {
        // Validate params
        _requireOracle(_oracle);
        _requireSpecId(_specId);
        _requireCallbackAddr(_callbackAddr);
        bytes32 key = _generateSpecKey(_oracle, _specId);
        _requireSpecIsInserted(key, s_keyToSpec.isInserted(key));
        Spec memory spec = s_keyToSpec.getSpec(key);
        _requireMinConfirmations(_callbackMinConfirmations, spec.minConfirmations);
        _requireGasLimit(_callbackGasLimit, spec.gasLimit);

        // Check whether caller has enough LINK funds (payment amount calculated using all the _callbackGasLimit)
        uint256 maxPayment = _calculatePaymentAmount(
            PaymentPreFeeType.MAX,
            0,
            tx.gasprice,
            spec.payment,
            _callbackGasLimit,
            spec.fulfillmentFee,
            spec.feeType
        );
        _requireLinkAllowance(LINK.allowance(msg.sender, address(this)), maxPayment);
        _requireLinkBalance(LINK.balanceOf(msg.sender), maxPayment);
        _requireLinkTransferFrom(
            LINK.transferFrom(msg.sender, address(this), spec.payment),
            msg.sender,
            address(this),
            spec.payment
        );

        // Extend the Chainlink.Request with the TOML jobspec dynamic params
        uint48 gasLimit = _callbackGasLimit + s_gasAfterPaymentCalculation;
        _req.addUint("gasLimit", uint256(gasLimit));
        _req.addUint("minConfirmations", uint256(spec.minConfirmations));

        // Send an Operator request
        bytes32 requestId = sendOperatorRequestTo(_oracle, _req, uint256(spec.payment));

        // Store the fulfillment configuration by request ID
        FulfillConfig memory fulfillConfig;
        fulfillConfig.msgSender = msg.sender;
        fulfillConfig.payment = spec.payment;
        fulfillConfig.callbackAddr = _callbackAddr;
        fulfillConfig.fulfillmentFee = spec.fulfillmentFee;
        fulfillConfig.minConfirmations = _callbackMinConfirmations;
        fulfillConfig.gasLimit = gasLimit;
        fulfillConfig.feeType = spec.feeType;
        s_requestIdToFulfillConfig[requestId] = fulfillConfig;
        // In case of "external request" (i.e. requester !== callbackAddr) notify the fulfillment contract about the
        // pending request
        if (_callbackAddr != msg.sender) {
            IExternalFulfillment fulfillmentContract = IExternalFulfillment(_callbackAddr);
            // solhint-disable-next-line no-empty-blocks
            try fulfillmentContract.setChainlinkExternalRequest(address(this), requestId) {} catch {
                emit DRCoordinator__SetChainlinkExternalRequestFailed(_callbackAddr, requestId, key);
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
        emit DRCoordinator__FallbackWeiPerUnitLinkSet(_fallbackWeiPerUnitLink);
    }

    function setGasAfterPaymentCalculation(uint48 _gasAfterPaymentCalculation) external onlyOwner {
        s_gasAfterPaymentCalculation = _gasAfterPaymentCalculation;
        emit DRCoordinator__GasAfterPaymentCalculationSet(_gasAfterPaymentCalculation);
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
        emit DRCoordinator__StalenessSecondsSet(_stalenessSeconds);
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdraw(address payable _payee, uint256 _amount) external onlyOwner {
        emit DRCoordinator__FundsWithdrawn(_payee, _amount);
        _requireLinkTransfer(LINK.transfer(_payee, _amount), _payee, _amount);
    }

    /* ========== EXTERNAL VIEW FUNCTIONS ========== */

    function availableFunds() external view returns (uint256) {
        return _availableFunds();
    }

    function calculateMaxPaymentAmount(
        uint256 _weiPerUnitGas,
        uint96 _payment,
        uint48 _gasLimit,
        uint96 _fulfillmentFee,
        FeeType _feeType
    ) external view returns (uint256) {
        return
            _calculatePaymentAmount(
                PaymentPreFeeType.MAX,
                0,
                _weiPerUnitGas,
                _payment,
                _gasLimit,
                _fulfillmentFee,
                _feeType
            );
    }

    function calculateSpotPaymentAmount(
        uint48 _startGas,
        uint256 _weiPerUnitGas,
        uint96 _payment,
        uint96 _fulfillmentFee,
        FeeType _feeType
    ) external view returns (uint256) {
        return
            _calculatePaymentAmount(
                PaymentPreFeeType.SPOT,
                _startGas,
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

    function getGasAfterPaymentCalculation() external view returns (uint48) {
        return s_gasAfterPaymentCalculation;
    }

    function getNumberOfSpecs() external view returns (uint256) {
        return s_keyToSpec.size();
    }

    function getSha1() external view returns (bytes20) {
        return s_sha1;
    }

    function getSpec(bytes32 _key) external view returns (Spec memory) {
        _requireSpecIsInserted(_key, s_keyToSpec.isInserted(_key));
        return s_keyToSpec.getSpec(_key);
    }

    function getSpecKeyAtIndex(uint256 _index) external view returns (bytes32) {
        return s_keyToSpec.getKeyAtIndex(_index);
    }

    function getSpecMapKeys() external view returns (bytes32[] memory) {
        return s_keyToSpec.keys;
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
        emit DRCoordinator__SpecRemoved(_key);
    }

    function _setSpec(bytes32 _key, Spec calldata _spec) private {
        _requireSpecId(_spec.specId);
        _requireOracle(_spec.oracle);
        _requireSpecPayment(_spec.payment);
        _requireSpecMinConfirmations(_spec.minConfirmations);
        _requireSpecGasLimit(_spec.gasLimit);
        _requireSpecFulfillmentFee(_spec.fulfillmentFee);
        s_keyToSpec.set(_key, _spec);
        emit DRCoordinator__SpecSet(_key, _spec);
    }

    /* ========== PRIVATE VIEW FUNCTIONS ========== */

    function _availableFunds() private view returns (uint256) {
        return LINK.balanceOf(address(this));
    }

    function _calculatePaymentAmount(
        PaymentPreFeeType _paymentPreFeeType,
        uint48 _startGas,
        uint256 _weiPerUnitGas,
        uint96 _payment,
        uint48 _gasLimit,
        uint96 _fulfillmentFee,
        FeeType _feeType
    ) private view returns (uint256) {
        // NB: parameters accept 0 to allow estimation calls
        uint256 weiPerUnitLink = _getFeedData();
        uint256 paymentPreFee = 0;
        if (_paymentPreFeeType == PaymentPreFeeType.MAX) {
            paymentPreFee = (1e18 * _weiPerUnitGas * _gasLimit) / weiPerUnitLink;
        } else if (_paymentPreFeeType == PaymentPreFeeType.SPOT) {
            paymentPreFee =
                (1e18 * _weiPerUnitGas * (s_gasAfterPaymentCalculation + _startGas - gasleft())) /
                weiPerUnitLink;
        } else {
            revert DRCoordinator__PaymentPreFeeTypeUnsupported(_paymentPreFeeType);
        }
        if (paymentPreFee <= _payment) {
            // NB: adjust the spec.payment if paymentPreFee - spec.payment <= 0 LINK
            revert DRCoordinator__PaymentPreFeeIsLtePayment(paymentPreFee, _payment);
        }
        paymentPreFee = paymentPreFee - _payment;
        uint256 paymentAfterFee = 0;
        if (_feeType == FeeType.FLAT) {
            paymentAfterFee = paymentPreFee + _fulfillmentFee;
        } else if (_feeType == FeeType.PERMIRYAD) {
            paymentAfterFee = paymentPreFee + (paymentPreFee * _fulfillmentFee) / 1e4;
        } else {
            revert DRCoordinator__FeeTypeIsUnsupported(_feeType);
        }
        if (paymentAfterFee > LINK_TOTAL_SUPPLY) {
            // Amount can't be > LINK total supply
            revert DRCoordinator__PaymentAfterFeeIsGtLinkTotalSupply(paymentAfterFee);
        }
        return paymentAfterFee;
    }

    // TODO: it currently calculates the 'weiPerUnitLink' via a single feed (LINK / TKN). Add a 2-hops feed support
    // (LINK / USD + TKN / USD, 2 hops) on networks that don't have yet a LINK / TKN feed, e.g. Moonbeam, Harmony
    function _getFeedData() private view returns (uint256) {
        if (IS_SEQUENCER_DEPENDANT && CHAINLINK_FLAGS.getFlag(FLAG_SEQUENCER_OFFLINE)) {
            return s_fallbackWeiPerUnitLink;
        }
        uint256 stalenessSeconds = s_stalenessSeconds;
        uint256 timestamp;
        int256 answer;
        uint256 weiPerUnitLink;
        (, answer, , timestamp, ) = LINK_TKN_FEED.latestRoundData();
        if (answer < 1) {
            revert DRCoordinator__FeedAnswerIsNotGtZero(answer);
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
        // (oracle, specId) composite key allows storing N specs with the same externalJobID but different Operator.sol
        return keccak256(abi.encodePacked(_oracle, _specId));
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

    function _requireGasLimit(uint48 _gasLimit, uint48 _specGasLimit) private pure {
        if (_gasLimit > _specGasLimit) {
            revert DRCoordinator__GasLimitIsGtSpecGasLimit(_gasLimit, _specGasLimit);
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

    function _requireMinConfirmations(uint8 _minConfirmations, uint8 _specMinConfirmations) private pure {
        if (_minConfirmations > _specMinConfirmations) {
            revert DRCoordinator__MinConfirmationsIsGtSpecMinConfirmations(_minConfirmations, _specMinConfirmations);
        }
        _requireSpecMinConfirmations(_minConfirmations);
    }

    function _requireSpecMinConfirmations(uint8 _minConfirmations) private pure {
        if (_minConfirmations > MAX_REQUEST_CONFIRMATIONS) {
            revert DRCoordinator__MinConfirmationsIsGtMaxRequesetConfirmations(
                _minConfirmations,
                MAX_REQUEST_CONFIRMATIONS
            );
        }
    }

    function _requireSpecFulfillmentFee(uint96 _fulfillmentFee) private pure {
        if (_fulfillmentFee == 0) {
            revert DRCoordinator__FulfillmentFeeIsZero();
        }
        if (_fulfillmentFee > LINK_TOTAL_SUPPLY) {
            revert DRCoordinator__FulfillmentFeeIsGtLinkTotalSupply();
        }
    }

    function _requireSpecGasLimit(uint48 _gasLimit) private pure {
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
            revert DRCoordinator__PaymentIsGtLinkTotalSupply();
        }
    }
}
