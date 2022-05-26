// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { Chainlink } from "@chainlink/contracts/src/v0.8/Chainlink.sol";
import { FulfillMode } from "../DRCoordinator.sol";
import { FulfillChainlinkExternalRequestBase } from "../FulfillChainlinkExternalRequestBase.sol";
import { IDRCoordinator } from "../IDRCoordinator.sol";
import { console } from "hardhat/console.sol";

contract DRCoordinatorConsumerTestHelper is FulfillChainlinkExternalRequestBase {
    using Chainlink for Chainlink.Request;

    error FulfillModeUnsupported(FulfillMode fulfillmode);
    error FulfillUint256Failed();
    error LinkTransferFailed(address to, uint256 amount);

    event FundsWithdrawn(address payee, uint256 amount);
    event RequestFulfilledNothing(bytes32 indexed requestId, bytes result);
    event RequestFulfilledUint256(bytes32 indexed requestId, uint256 result);

    constructor(address _link) {
        _setChainlinkToken(_link);
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    function cancelRequest(
        address _drCoordinator,
        bytes32 _requestId,
        uint256 _expiration,
        FulfillMode _fulfillMode
    ) external {
        IDRCoordinator(_drCoordinator).cancelRequest(_requestId, _expiration, _fulfillMode);
    }

    // Function signature: 0xf43c62ab
    function fulfillNothing(bytes32 _requestId, bytes calldata _result)
        external
        recordChainlinkFulfillment(_requestId)
    // solhint-disable-next-line no-empty-blocks
    {
        emit RequestFulfilledNothing(_requestId, _result);
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

    function requestNothing(
        address _drCoordinator,
        address _oracle,
        bytes32 _specId,
        uint48 _callbackGasLimit,
        uint8 _callbackMinConfirmations,
        FulfillMode _fulfillMode
    ) external {
        Chainlink.Request memory req;
        // NB: Chainlink.Request 'callbackAddr' and 'callbackFunctionId' will be overwritten by DRCoordiantor
        req.initialize(_specId, address(this), this.fulfillNothing.selector);

        _requestUint256(_drCoordinator, _oracle, _callbackGasLimit, _callbackMinConfirmations, _fulfillMode, req);
    }

    function requestUint256(
        address _drCoordinator,
        address _oracle,
        bytes32 _specId,
        uint48 _callbackGasLimit,
        uint8 _callbackMinConfirmations,
        FulfillMode _fulfillMode
    ) external {
        Chainlink.Request memory req;
        // NB: Chainlink.Request 'callbackAddr' and 'callbackFunctionId' will be overwritten by DRCoordiantor
        req.initialize(_specId, address(this), this.fulfillUint256.selector);

        _requestUint256(_drCoordinator, _oracle, _callbackGasLimit, _callbackMinConfirmations, _fulfillMode, req);
    }

    function requestUint256Externally(
        address _drCoordinator,
        address _oracle,
        bytes32 _specId,
        uint48 _callbackGasLimit,
        uint8 _callbackMinConfirmations,
        address _callbackAddr,
        bytes4 _callbackFunctionId,
        FulfillMode _fulfillMode
    ) external {
        Chainlink.Request memory req;
        // NB: Chainlink.Request 'callbackAddr' and 'callbackFunctionId' will be overwritten by DRCoordiantor
        req.initialize(_specId, _callbackAddr, _callbackFunctionId);

        _requestUint256(_drCoordinator, _oracle, _callbackGasLimit, _callbackMinConfirmations, _fulfillMode, req);
    }

    function withdraw(address payable _payee, uint256 _amount) external {
        emit FundsWithdrawn(_payee, _amount);
        _requireLinkTransfer(LINK.transfer(_payee, _amount), _payee, _amount);
    }

    function withdrawFunds(
        address _drCoordinator,
        address _payee,
        uint96 _amount
    ) external {
        IDRCoordinator(_drCoordinator).withdrawFunds(_payee, _amount);
    }

    /* ========== EXTERNAL PURE FUNCTIONS ========== */

    function initializeChainlinkRequest(
        bytes32 _specId,
        address _callbackAddr,
        bytes4 _callbackFuncSelector
    ) external pure returns (Chainlink.Request memory) {
        Chainlink.Request memory req;
        return req.initialize(_specId, _callbackAddr, _callbackFuncSelector);
    }

    /* ========== PRIVATE FUNCTIONS ========== */

    function _requestUint256(
        address _drCoordinator,
        address _oracle,
        uint48 _callbackGasLimit,
        uint8 _callbackMinConfirmations,
        FulfillMode _fulfillMode,
        Chainlink.Request memory req
    ) private {
        bytes32 requestId;
        if (_fulfillMode == FulfillMode.FALLBACK) {
            requestId = IDRCoordinator(_drCoordinator).requestDataViaFallback(
                _oracle,
                _callbackGasLimit,
                _callbackMinConfirmations,
                req
            );
        } else if (_fulfillMode == FulfillMode.FULFILL_DATA) {
            requestId = IDRCoordinator(_drCoordinator).requestDataViaFulfillData(
                _oracle,
                _callbackGasLimit,
                _callbackMinConfirmations,
                req
            );
        } else {
            revert FulfillModeUnsupported(_fulfillMode);
        }
        _addChainlinkExternalRequest(_drCoordinator, requestId);
    }

    /* ========== PRIVATE PURE FUNCTIONS ========== */

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
