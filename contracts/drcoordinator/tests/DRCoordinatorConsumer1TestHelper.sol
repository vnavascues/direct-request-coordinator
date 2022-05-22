// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { Chainlink } from "@chainlink/contracts/src/v0.8/Chainlink.sol";
import { FulfillChainlinkExternalRequestBase } from "../FulfillChainlinkExternalRequestBase.sol";
import { IDRCoordinator } from "../IDRCoordinator.sol";

contract DRCoordinatorConsumer1TestHelper is FulfillChainlinkExternalRequestBase {
    using Chainlink for Chainlink.Request;

    event RequestFulfilledUint256(bytes32 indexed requestId, uint256 result);

    /* ========== EXTERNAL FUNCTIONS ========== */

    // Function signature: 0x7c1f72a0
    function fulfillUint256(bytes32 _requestId, uint256 _result) external recordChainlinkFulfillment(_requestId) {
        emit RequestFulfilledUint256(_requestId, _result);
    }

    function requestUint256(
        address _drCoordinator,
        address _oracle,
        bytes32 _specId,
        uint256 _callbackGasLimit
    ) external {
        Chainlink.Request memory req;
        req.initialize(_specId, address(this), this.fulfillUint256.selector);
        bytes32 requestId = IDRCoordinator(_drCoordinator).requestData(
            _oracle,
            _specId,
            address(this),
            _callbackGasLimit,
            req
        );
        _addChainlinkExternalRequest(_drCoordinator, requestId);
    }
}
