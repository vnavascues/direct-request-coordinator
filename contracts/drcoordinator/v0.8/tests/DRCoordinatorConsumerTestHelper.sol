// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { Chainlink, DRCoordinatorClient, IDRCoordinator } from "../DRCoordinatorClient.sol";

contract DRCoordinatorConsumerTestHelper is DRCoordinatorClient {
    using Chainlink for Chainlink.Request;

    error FulfillUint256Failed();
    error LinkTransferFailed(address to, uint256 amount);

    event FundsWithdrawn(address payee, uint256 amount);
    event RequestFulfilledNothing(bytes32 indexed requestId, bytes result);
    event RequestFulfilledUint256(bytes32 indexed requestId, uint256 result);

    constructor(address _linkAddr) {
        _setLink(_linkAddr);
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    function cancelRequest(address _drCoordinatorAddr, bytes32 _requestId) external {
        IDRCoordinator(_drCoordinatorAddr).cancelRequest(_requestId);
    }

    // Function signature: 0xf43c62ab
    function fulfillNothing(bytes32 _requestId, bytes calldata _result) external recordFulfillment(_requestId) {
        emit RequestFulfilledNothing(_requestId, _result);
    }

    // Function signature: 0x5e9b81e1
    function fulfillUint256(
        bytes32 _requestId,
        uint256 _result,
        bool _revert
    ) external recordFulfillment(_requestId) {
        if (_revert) {
            revert FulfillUint256Failed();
        }
        emit RequestFulfilledUint256(_requestId, _result);
    }

    function requestNothing(
        address _drCoordinatorAddr,
        address _operatorAddr,
        bytes32 _specId,
        uint32 _callbackGasLimit,
        uint96 _consumerMaxPayment
    ) external {
        Chainlink.Request memory req;
        // NB: Chainlink.Request 'callbackAddr' and 'callbackFunctionId' will be overwritten by DRCoordinator
        req.initialize(_specId, address(this), this.fulfillNothing.selector);
        _sendRequestTo(IDRCoordinator(_drCoordinatorAddr), _operatorAddr, _callbackGasLimit, _consumerMaxPayment, req);
    }

    function requestUint256(
        address _drCoordinatorAddr,
        address _operatorAddr,
        bytes32 _specId,
        uint32 _callbackGasLimit,
        uint96 _consumerMaxPayment
    ) external {
        Chainlink.Request memory req;
        // NB: Chainlink.Request 'callbackAddr' and 'callbackFunctionId' will be overwritten by DRCoordinator
        req.initialize(_specId, address(this), this.fulfillUint256.selector);
        _sendRequestTo(IDRCoordinator(_drCoordinatorAddr), _operatorAddr, _callbackGasLimit, _consumerMaxPayment, req);
    }

    function requestUint256Externally(
        address _drCoordinatorAddr,
        address _operatorAddr,
        bytes32 _specId,
        uint32 _callbackGasLimit,
        uint96 _consumerMaxPayment,
        address _callbackAddr,
        bytes4 _callbackFunctionId
    ) external {
        Chainlink.Request memory req;
        // NB: Chainlink.Request 'callbackAddr' and 'callbackFunctionId' will be overwritten by DRCoordinator
        req.initialize(_specId, _callbackAddr, _callbackFunctionId);
        _sendRequestTo(IDRCoordinator(_drCoordinatorAddr), _operatorAddr, _callbackGasLimit, _consumerMaxPayment, req);
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
        bytes4 _callbackFuncId
    ) external pure returns (Chainlink.Request memory) {
        Chainlink.Request memory req;
        return req.initialize(_specId, _callbackAddr, _callbackFuncId);
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
