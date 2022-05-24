// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { Chainlink } from "@chainlink/contracts/src/v0.8/Chainlink.sol";
import { FulfillChainlinkExternalRequestBase } from "../FulfillChainlinkExternalRequestBase.sol";
import { IDRCoordinator } from "../IDRCoordinator.sol";
import { console } from "hardhat/console.sol";

contract DRCoordinatorConsumer1TestHelper is FulfillChainlinkExternalRequestBase {
    using Chainlink for Chainlink.Request;

    error FulfillUint256Failed();
    error LinkTransferFailed(address to, uint256 amount);

    event FundsWithdrawn(address payee, uint256 amount);
    event RequestFulfilledUint256(bytes32 indexed requestId, uint256 result);

    constructor(address _link) {
        _setChainlinkToken(_link);
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    function approve(address _drCoordinator, uint96 _amount) external {
        LINK.approve(_drCoordinator, _amount);
    }

    // Function signature: 0x7c1f72a0
    function fulfillUint256(
        bytes32 _requestId,
        uint256 _result,
        bool _revert
    ) external recordChainlinkFulfillment(_requestId) {
        if (_revert) {
            revert FulfillUint256Failed();
        }
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
        // NB: Chainlink.Request callbackAddr must be address(DRCoordiantor)
        req.initialize(_specId, _drCoordinator, this.fulfillUint256.selector);
        bytes32 requestId = IDRCoordinator(_drCoordinator).requestData(
            _oracle,
            _specId,
            address(this),
            _callbackGasLimit,
            _callbackMinConfirmations,
            req
        );
        _addChainlinkExternalRequest(_drCoordinator, requestId);
    }

    function withdraw(address payable _payee, uint256 _amount) external {
        emit FundsWithdrawn(_payee, _amount);
        _requireLinkTransfer(LINK.transfer(_payee, _amount), _payee, _amount);
    }

    function _requireLinkTransfer(
        bool _success,
        address _to,
        uint256 _amount
    ) private pure {
        if (!_success) {
            revert LinkTransferFailed(_to, _amount);
        }
    }
}
