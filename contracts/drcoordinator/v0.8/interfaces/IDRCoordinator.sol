// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

import { Chainlink } from "@chainlink/contracts/src/v0.8/Chainlink.sol";
import { FeeType, Spec, SpecLibrary } from "../libraries/internal/SpecLibrary.sol";

interface IDRCoordinator {
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

    function cancelRequest(bytes32 _requestId) external;

    function requestData(
        address _operatorAddr,
        uint32 _callbackGasLimit,
        uint8 _callbackMinConfirmations,
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

    function getNumberOfSpecs() external view returns (uint256);

    function getRequestCount() external view returns (uint256);

    function getPermiryadFeeFactor() external view returns (uint8);

    function getSpec(bytes32 _key) external view returns (Spec memory);

    function getSpecAuthorizedConsumers(bytes32 _key) external view returns (address[] memory);

    function getSpecKeyAtIndex(uint256 _index) external view returns (bytes32);

    function getSpecMapKeys() external view returns (bytes32[] memory);

    function getStalenessSeconds() external view returns (uint256);

    function isSpecAuthorizedConsumer(bytes32 _key, address _consumer) external view returns (bool);
}
