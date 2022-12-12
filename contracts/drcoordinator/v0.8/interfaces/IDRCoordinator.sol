// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IDRCoordinatorCallable } from "./IDRCoordinatorCallable.sol";
import { FeeType, PaymentType, Spec } from "../libraries/internal/SpecLibrary.sol";

interface IDRCoordinator is IDRCoordinatorCallable {
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
    error DRCoordinator__SpecFieldFeeIsGtMaxPermyriadFee(bytes32 key, uint96 fee, uint256 maxPermyriadFee);
    error DRCoordinator__SpecFieldGasLimitIsLtMinRequestGasLimit(
        bytes32 key,
        uint32 gasLimit,
        uint32 minRequestGasLimit
    );
    error DRCoordinator__SpecFieldOperatorIsDRCoordinator(bytes32 key, address operator);
    error DRCoordinator__SpecFieldOperatorIsNotContract(bytes32 key, address operator);
    error DRCoordinator__SpecFieldPaymentIsGtLinkTotalSupply(bytes32 key, uint96 payment, uint96 linkTotalSupply);
    error DRCoordinator__SpecFieldPaymentIsGtPermyriad(bytes32 key, uint96 payment, uint16 permyriad);
    error DRCoordinator__SpecFieldPaymentTypeIsUnsupported(bytes32 key, PaymentType paymentType);
    error DRCoordinator__SpecFieldSpecIdIsZero(bytes32 key);
    error DRCoordinator__SpecIsNotInserted(bytes32 key);

    /* ========== EXTERNAL FUNCTIONS ========== */

    /**
     * @notice Authorizes consumer addresses on the given `Spec` (by key).
     * @param _key The `Spec` key.
     * @param _authConsumers The array of consumer addresses.
     */
    function addSpecAuthorizedConsumers(bytes32 _key, address[] calldata _authConsumers) external;

    /**
     * @notice Authorizes consumer addresses on the given specs (by keys).
     * @param _keys The array of `Spec` keys.
     * @param _authConsumersArray The array of consumer addresses (per `Spec`).
     */
    function addSpecsAuthorizedConsumers(bytes32[] calldata _keys, address[][] calldata _authConsumersArray) external;

    /**
     * @notice Pauses DRCoordinator.
     */
    function pause() external;

    /**
     * @notice Withdrawns authorization for consumer addresses on the given `Spec` (by key).
     * @param _key The `Spec` key.
     * @param _authConsumers The array of consumer addresses.
     */
    function removeSpecAuthorizedConsumers(bytes32 _key, address[] calldata _authConsumers) external;

    /**
     * @notice Withdrawns authorization for consumer addresses on the given specs (by keys).
     * @param _keys The array of `Spec` keys.
     * @param _authConsumersArray The array of consumer addresses (per `Spec`).
     */
    function removeSpecsAuthorizedConsumers(bytes32[] calldata _keys, address[][] calldata _authConsumersArray)
        external;

    /**
     * @notice Removes a `Spec` by key.
     * @param _key The `Spec` key.
     */
    function removeSpec(bytes32 _key) external;

    /**
     * @notice Removes specs by keys.
     * @param _keys The array of `Spec` keys.
     */
    function removeSpecs(bytes32[] calldata _keys) external;

    /**
     * @notice Sets the DRCoordinator description.
     * @param _description The explanation.
     */
    function setDescription(string calldata _description) external;

    /**
     * @notice Sets the fallback amount of GASTKN wei per unit of LINK.
     * @dev This amount is used when any Price Feed answer is stale, or the L2 Sequencer Uptime Status Feed is down, or
     * its answer has been reported before the grace period.
     * @param _fallbackWeiPerUnitLink The wei amount.
     */
    function setFallbackWeiPerUnitLink(uint256 _fallbackWeiPerUnitLink) external;

    /**
     * @notice Sets the number of seconds to wait before trusting the L2 Sequencer Uptime Status Feed answer.
     * @param _l2SequencerGracePeriodSeconds The number of seconds.
     */
    function setL2SequencerGracePeriodSeconds(uint256 _l2SequencerGracePeriodSeconds) external;

    /**
     * @notice Sets the permyriad factor (1 by default).
     * @dev Allows to bump the fee percentage above 100%.
     * @param _permyriadFactor The factor.
     */
    function setPermyriadFeeFactor(uint8 _permyriadFactor) external;

    /**
     * @notice Sets a `Spec` by key.
     * @param _key The `Spec` key.
     * @param _spec The Spec` tuple.
     */
    function setSpec(bytes32 _key, Spec calldata _spec) external;

    /**
     * @notice Sets specs by keys.
     * @param _keys The array of `Spec` keys.
     * @param _specs The array of `Spec` tuples.
     */
    function setSpecs(bytes32[] calldata _keys, Spec[] calldata _specs) external;

    /**
     * @notice Sets the number of seconds after which any Price Feed answer is considered stale and invalid.
     * @param _stalenessSeconds The number of seconds.
     */
    function setStalenessSeconds(uint256 _stalenessSeconds) external;

    /**
     * @notice Unpauses DRCoordinator.
     */
    function unpause() external;
}
