// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { FeeType, PaymentType, Spec } from "../libraries/internal/SpecLibrary.sol";

interface IDRCoordinatorOwnable {
    error DRCoordinator__ArrayIsEmpty(string arrayName);
    error DRCoordinator__ArrayLengthsAreNotEqual(
        string array1Name,
        uint256 array1Length,
        string array2Name,
        uint256 array2Length
    );
    error DRCoordinator__FallbackWeiPerUnitLinkIsZero();
    error DRCoordinator__L2SequencerFeedIsNotContract(address l2SequencerFeed);
    error DRCoordinator__PriceFeedIsNotContract(address priceFeedAddr);
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

    /* ========== EXTERNAL FUNCTIONS ========== */

    function addSpecAuthorizedConsumers(bytes32 _key, address[] calldata _authConsumers) external;

    function addSpecsAuthorizedConsumers(bytes32[] calldata _keys, address[][] calldata _authConsumersArray) external;

    function pause() external;

    function removeSpecAuthorizedConsumers(bytes32 _key, address[] calldata _authConsumers) external;

    function removeSpecsAuthorizedConsumers(bytes32[] calldata _keys, address[][] calldata _authConsumersArray)
        external;

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
}
