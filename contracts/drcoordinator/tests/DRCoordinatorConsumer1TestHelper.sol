// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { Chainlink } from "@chainlink/contracts/src/v0.8/Chainlink.sol";
import { FulfillChainlinkExternalRequestBase } from "../FulfillChainlinkExternalRequestBase.sol";
import { IDRCoordinator } from "../IDRCoordinator.sol";
import { console } from "hardhat/console.sol";

contract DRCoordinatorConsumer1TestHelper is FulfillChainlinkExternalRequestBase {
    using Chainlink for Chainlink.Request;

    event RequestFulfilledUint256(bytes32 indexed requestId, uint256 result);

    constructor(address _link) {
        _setChainlinkToken(_link);
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    function approve(address _drCoordinator, uint96 _amount) external {
        LINK.approve(_drCoordinator, _amount);
    }

    // Function signature: 0x7c1f72a0
    function fulfillUint256(bytes32 _requestId, uint256 _result) external recordChainlinkFulfillment(_requestId) {
        emit RequestFulfilledUint256(_requestId, _result);
    }

    function requestUint256(
        address _drCoordinator,
        address _oracle,
        bytes32 _specId,
        uint48 _callbackGasLimit,
        uint8 _callbackMinConfirmations
    ) external {
        Chainlink.Request memory req;
        // TODO: _drCoordinator vs _oracle vs address(this)
        req.initialize(_specId, _drCoordinator, this.fulfillUint256.selector);
        console.log("*** Consumer 1");
        bytes32 requestId = IDRCoordinator(_drCoordinator).requestData(
            _oracle,
            _specId,
            address(this),
            _callbackGasLimit,
            _callbackMinConfirmations,
            req
        );
        console.log("*** Consumer 2");
        _addChainlinkExternalRequest(_drCoordinator, requestId);
        console.log("*** Consumer 3");
    }
}
