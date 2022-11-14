// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { Chainlink } from "@chainlink/contracts/src/v0.8/Chainlink.sol";
import { LinkTokenInterface } from "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";
import { IDRCoordinatorCallable as IDRCoordinator } from "./interfaces/IDRCoordinatorCallable.sol";
import { ChainlinkFulfillment } from "./ChainlinkFulfillment.sol";

/**
 * @title The DRCoordinatorClient contract.
 * @author LinkPool.
 * @notice Contract writers can inherit this contract in order to create requests for the Chainlink network via a
 * DRCoordinator contract.
 * @dev Uses @chainlink/contracts 0.4.2.
 * @dev Like a standard ChainlinkClient it builds and sends a Chainlink request. The difference between a
 * ChainlinkClient and a DRCoordinatorClient is that the former sends the Chainlink.Request to the Operator contract
 * attached in the LINK token via LINK.transferAndCall(), whilst the latter does not transfer LINK to the DRCoordinator
 * contract.
 */
contract DRCoordinatorClient is ChainlinkFulfillment {
    using Chainlink for Chainlink.Request;

    LinkTokenInterface internal s_link;
    IDRCoordinator internal s_drCoordinator;

    event ChainlinkCancelled(bytes32 indexed id);
    event ChainlinkRequested(bytes32 indexed id);

    /* ========== INTERNAL FUNCTIONS ========== */

    /**
     * @notice Allows a request to be cancelled if it has not been fulfilled.
     * @dev Cancelling a DRCoordinator request does not require to keep track of the expiration value (which equals
     * 5 minutes + block.timestamp) set & emitted by the operator contract due to it is stored.
     * @dev Calls IDRcoordinatior.cancelRequest().
     * @dev Deletes the request from the s_pendingRequests mapping.
     * @dev Emits the ChainlinkCancelled event.
     * @param _requestId The request ID.
     */
    function _cancelRequest(bytes32 _requestId) internal {
        IDRCoordinator drCoordinator = IDRCoordinator(s_pendingRequests[_requestId]);
        delete s_pendingRequests[_requestId];
        emit ChainlinkCancelled(_requestId);
        drCoordinator.cancelRequest(_requestId);
    }

    /**
     * @notice Sends a Chainlink request along with the other directrequest data to the stored DRCoordinator.
     * @dev This function supports multi-word response (Operator.operatorRequest() compatible).
     * @dev Calls sendDRCoordinatorRequestTo() with the stored DRCoordinator contract interface.
     * @dev It does not involve LINK.transferAndCall().
     * @param _operatorAddr The Operator contract address.
     * @param _callbackGasLimit The amount of gas to attach to directrequest fulfillment transaction. It is the gasLimit
     * parameter of the directrequest ethtx task.
     * @param _consumerMaxPayment The maximum amount of LINK willing to pay for the request (initial payment +
     * fulfill payment). Set it to 0 if there is no hard cap.
     * @param _req The initialized Chainlink.Request.
     * @return requestId The request ID.
     */
    function _sendRequest(
        address _operatorAddr,
        uint32 _callbackGasLimit,
        uint96 _consumerMaxPayment,
        Chainlink.Request memory _req
    ) internal returns (bytes32) {
        return _sendRequestTo(s_drCoordinator, _operatorAddr, _callbackGasLimit, _consumerMaxPayment, _req);
    }

    /**
     * @notice Sends a Chainlink request along with the other directrequest data to the DRCoordinator.
     * @dev This function supports multi-word response (Operator.operatorRequest() compatible).
     * @dev Calls IDRCoordinator.requestData(), which emits the ChainlinkRequested event.
     * @dev It does not involve LINK.transferAndCall().
     * @dev Emits the ChainlinkRequested event.
     * @param _drCoordinator The DRCoordinator contract interface.
     * @param _operatorAddr The Operator contract address.
     * @param _callbackGasLimit The amount of gas to attach to directrequest fulfillment transaction. It is the gasLimit
     * parameter of the directrequest ethtx task.
     * @param _consumerMaxPayment The maximum amount of LINK willing to pay for the request (initial payment +
     * fulfill payment). Set it to 0 if there is no hard cap.
     * @param _req The initialized Chainlink.Request.
     * @return requestId The request ID.
     */
    function _sendRequestTo(
        IDRCoordinator _drCoordinator,
        address _operatorAddr,
        uint32 _callbackGasLimit,
        uint96 _consumerMaxPayment,
        Chainlink.Request memory _req
    ) internal returns (bytes32) {
        bytes32 requestId = _drCoordinator.requestData(_operatorAddr, _callbackGasLimit, _consumerMaxPayment, _req);
        _addPendingRequest(address(_drCoordinator), requestId);
        emit ChainlinkRequested(requestId);
        return requestId;
    }

    /**
     * @notice Sets the stored DRCoordinator contract address.
     * @param _drCoordinatorAddr The DRCoordinator contract address.
     */
    function _setDRCoordinator(address _drCoordinatorAddr) internal {
        s_drCoordinator = IDRCoordinator(_drCoordinatorAddr);
    }

    /**
     * @notice Sets the stored LinkToken contract address.
     * @param _linkAddr The LINK token contract address.
     */
    function _setLink(address _linkAddr) internal {
        s_link = LinkTokenInterface(_linkAddr);
    }

    /* ========== INTERNAL PURE FUNCTIONS ========== */

    /**
     * @notice Creates a Chainlink request which contains this function arguments and that can hold additional
     * parameters.
     * @dev DRCoordinator supports requests where the requester contract is not the fulfillment contract;
     * address(this) != _callbackAddr, known as well as external requests.
     * @param _specId The directrequest Job Spec ID (externalJobID parameter) that the request will be created for.
     * @param _callbackAddr The contract address where to fulfill the request.
     * @param _callbackFunctionId The _callbackAddr function selector to call when fulfilling the request.
     * @return A Chainlink Request struct in memory.
     */
    function _buildRequest(
        bytes32 _specId,
        address _callbackAddr,
        bytes4 _callbackFunctionId
    ) internal pure returns (Chainlink.Request memory) {
        Chainlink.Request memory req;
        return req.initialize(_specId, _callbackAddr, _callbackFunctionId);
    }
}
