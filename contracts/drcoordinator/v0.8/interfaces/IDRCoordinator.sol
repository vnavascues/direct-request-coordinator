// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { Chainlink } from "@chainlink/contracts/src/v0.8/Chainlink.sol";
import { FeeType, PaymentType, Spec, SpecLibrary } from "../libraries/internal/SpecLibrary.sol";
import { PaymentPreFeeType } from "../DRCoordinator.sol";

interface IDRCoordinator {
    error DRCoordinator__ArrayIsEmpty(string arrayName);
    error DRCoordinator__ArrayLengthsAreNotEqual(
        string array1Name,
        uint256 array1Length,
        string array2Name,
        uint256 array2Length
    );
    error DRCoordinator__CallbackAddrIsDRCoordinator(address callbackAddr);
    error DRCoordinator__CallbackAddrIsNotContract(address callbackAddr);
    error DRCoordinator__CallbackGasLimitIsGtSpecGasLimit(uint32 callbackGasLimit, uint32 specGasLimit);
    error DRCoordinator__CallbackGasLimitIsLtMinRequestGasLimit(uint32 callbackGasLimit, uint32 minRequestGasLimit);
    error DRCoordinator__CallbackMinConfirmationsIsGtSpecMinConfirmations(
        uint8 callbackMinConfirmations,
        uint8 specMinConfirmations
    );
    error DRCoordinator__CallerIsNotAuthorizedConsumer(bytes32 key, address operatorAddr, bytes32 specId);
    error DRCoordinator__CallerIsNotRequester(address requester);
    error DRCoordinator__CallerIsNotRequestOperator(address operatorAddr);
    error DRCoordinator__FallbackWeiPerUnitLinkIsZero();
    error DRCoordinator__FeedAnswerIsNotGtZero(address priceFeed, int256 answer);
    error DRCoordinator__FeeTypeIsUnsupported(FeeType feeType);
    error DRCoordinator__LinkAllowanceIsInsufficient(address payer, uint96 allowance, uint96 amount);
    error DRCoordinator__LinkBalanceIsInsufficient(address payer, uint96 balance, uint96 amount);
    error DRCoordinator__LinkPaymentIsGtLinkTotalSupply(uint96 payment, uint96 linkTotalSupply);
    error DRCoordinator__LinkTransferAndCallFailed(address to, uint96 amount, bytes encodedRequest);
    error DRCoordinator__LinkTransferFailed(address to, uint96 amount);
    error DRCoordinator__LinkTransferFromFailed(address from, address to, uint96 amount);
    error DRCoordinator__L2SequencerFeedIsNotContract(address l2SequencerFeed);
    error DRCoordinator__PaymentPreFeeTypeIsUnsupported(PaymentPreFeeType paymentPreFeeType);
    error DRCoordinator__PaymentTypeIsUnsupported(PaymentType paymentType);
    error DRCoordinator__PriceFeedIsNotContract(address priceFeedAddr);
    error DRCoordinator__Reentrant();
    error DRCoordinator__RequestIsNotPending();
    error DRCoordinator__SpecFieldFeeTypeIsUnsupported(bytes32 key, FeeType feeType);
    error DRCoordinator__SpecFieldFeeIsGtLinkTotalSupply(bytes32 key, uint96 fee, uint96 linkTotalSupply);
    error DRCoordinator__SpecFieldFeeIsGtMaxPermiryadFee(bytes32 key, uint96 fee, uint256 maxPermiryadFee);
    error DRCoordinator__SpecFieldGasLimitIsLtMinRequestGasLimit(
        bytes32 key,
        uint32 gasLimit,
        uint32 minRequestGasLimit
    );
    error DRCoordinator__SpecFieldMinConfirmationsIsGtMaxRequestConfirmations(
        bytes32 key,
        uint8 minConfirmations,
        uint8 maxRequestConfirmations
    );
    error DRCoordinator__SpecFieldOperatorIsDRCoordinator(bytes32 key, address operator);
    error DRCoordinator__SpecFieldOperatorIsNotContract(bytes32 key, address operator);
    error DRCoordinator__SpecFieldPaymentIsGtLinkTotalSupply(bytes32 key, uint96 payment, uint96 linkTotalSupply);
    error DRCoordinator__SpecFieldPaymentIsGtPermiryad(bytes32 key, uint96 payment, uint16 permiryad);
    error DRCoordinator__SpecFieldPaymentTypeIsUnsupported(bytes32 key, PaymentType paymentType);
    error DRCoordinator__SpecFieldSpecIdIsZero(bytes32 key);
    error DRCoordinator__SpecIsNotInserted(bytes32 key);

    // FulfillConfig size = slot0 (32) + slot1 (32) + slot2 (15) = 79 bytes
    struct FulfillConfig {
        address msgSender; // 20 bytes -> slot0
        uint96 payment; // 12 bytes -> slot0
        address callbackAddr; // 20 bytes -> slot1
        uint96 fee; // 12 bytes -> slot 1
        uint8 minConfirmations; // 1 byte -> slot2
        uint32 gasLimit; // 4 bytes -> slot2
        FeeType feeType; // 1 byte -> slot2
        bytes4 callbackFunctionId; // 4 bytes -> slot2
        uint40 expiration; // 5 bytes -> slot2
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    function addFunds(address _consumer, uint96 _amount) external;

    function addSpecAuthorizedConsumers(bytes32 _key, address[] calldata _authConsumers) external;

    function addSpecsAuthorizedConsumers(bytes32[] calldata _keys, address[][] calldata _authConsumersArray) external;

    function cancelRequest(bytes32 _requestId) external;

    function fulfillData(bytes32 _requestId, bytes calldata _data) external;

    function pause() external;

    function removeSpecAuthorizedConsumers(bytes32 _key, address[] calldata _authConsumers) external;

    function removeSpecsAuthorizedConsumers(bytes32[] calldata _keys, address[][] calldata _authConsumersArray)
        external;

    function requestData(
        address _operatorAddr,
        uint32 _callbackGasLimit,
        uint8 _callbackMinConfirmations,
        Chainlink.Request memory _req
    ) external returns (bytes32);

    function removeSpec(bytes32 _key) external;

    function removeSpecs(bytes32[] calldata _keys) external;

    function setDescription(string calldata _description) external;

    function setFallbackWeiPerUnitLink(uint256 _fallbackWeiPerUnitLink) external;

    function setL2SequencerGracePeriodSeconds(uint256 _l2SequencerGracePeriodSeconds) external;

    function setPermiryadFeeFactor(uint8 _permiryadFactor) external;

    function setSpec(bytes32 _key, Spec calldata _spec) external;

    function setSpecs(bytes32[] calldata _keys, Spec[] calldata _specs) external;

    function setStalenessSeconds(uint256 _stalenessSeconds) external;

    function unpause() external;

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

    function getL2SequencerGracePeriodSeconds() external view returns (uint256);

    function getNumberOfSpecs() external view returns (uint256);

    function getPermiryadFeeFactor() external view returns (uint8);

    function getRequestCount() external view returns (uint256);

    function getSpec(bytes32 _key) external view returns (Spec memory);

    function getSpecAuthorizedConsumers(bytes32 _key) external view returns (address[] memory);

    function getSpecKeyAtIndex(uint256 _index) external view returns (bytes32);

    function getSpecMapKeys() external view returns (bytes32[] memory);

    function getStalenessSeconds() external view returns (uint256);

    function isSpecAuthorizedConsumer(bytes32 _key, address _consumer) external view returns (bool);
}
