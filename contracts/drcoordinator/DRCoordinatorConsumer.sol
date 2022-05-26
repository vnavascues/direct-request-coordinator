// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { LinkTokenInterface } from "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";
import { Chainlink } from "@chainlink/contracts/src/v0.8/Chainlink.sol";
import { FulfillMode, IDRCoordinator } from "./IDRCoordinator.sol";

contract DRCoordinatorConsumer {
    using Chainlink for Chainlink.Request;

    LinkTokenInterface internal LINK;
    IDRCoordinator internal s_drCoordinator;

    mapping(bytes32 => address) private s_pendingRequests;

    error DRCoordinatorConsumer__IsPendingRequest();
    error DRCoordinatorConsumer__CallerIsNotRequestDRCoordinator();
    error DRCoordinatorConsumer__CallbackAddrIsDRCoordinatorConsumer();

    event ChainlinkCancelled(bytes32 indexed id);
    event ChainlinkFulfilled(bytes32 indexed id);

    /**
     * @dev Reverts if the request is already pending
     * @param _requestId The request ID for fulfillment
     */
    modifier notPendingRequest(bytes32 _requestId) {
        if (s_pendingRequests[_requestId] != address(0)) {
            revert DRCoordinatorConsumer__IsPendingRequest();
        }
        _;
    }

    /**
     * @dev Reverts if the sender is not the DRCoordinator.
     * Emits ChainlinkFulfilled event.
     * @param _requestId The request ID for fulfillment
     */
    modifier recordChainlinkFulfillment(bytes32 _requestId) {
        _recordChainlinkFulfillment(_requestId);
        _;
    }

    /**
     * @notice Creates a request that can hold additional parameters
     * @param _specId The Job Specification ID that the request will be created for
     * @param _callbackFunctionId A function selector from this contract to use for the callback
     * @return A Chainlink Request struct in memory
     */
    function buildDRCoordinatorRequest(bytes32 _specId, bytes4 _callbackFunctionId)
        internal
        view
        returns (Chainlink.Request memory)
    {
        Chainlink.Request memory req;
        return req.initialize(_specId, address(this), _callbackFunctionId);
    }

    /**
     * @notice Creates an external request (fulfillment contract != this contract) that can hold additional parameters
     * @param _specId The Job Specification ID that the request will be created for
     * @param _callbackAddr The address of the fulfillment contract
     * @param _callbackFunctionId A function selector from the fulfillment contract to use for the callback
     * @return A Chainlink Request struct in memory
     */
    function buildDRCoordinatorExternalRequest(
        bytes32 _specId,
        address _callbackAddr,
        bytes4 _callbackFunctionId
    ) internal view returns (Chainlink.Request memory) {
        if (_callbackAddr == address(this)) {
            // NB: use 'buildDRCoordinatorRequest()'
            revert DRCoordinatorConsumer__CallbackAddrIsDRCoordinatorConsumer();
        }
        Chainlink.Request memory req;
        return req.initialize(_specId, _callbackAddr, _callbackFunctionId);
    }

    /**
     * @notice Allows for a request which was created on another contract to be fulfilled
     * on this contract
     * @param _drCoordinator The address of the DRCoordinator contract that will fulfill the request
     * @param _requestId The request ID used for the response
     */
    function _addChainlinkExternalRequest(address _drCoordinator, bytes32 _requestId)
        internal
        notPendingRequest(_requestId)
    {
        s_pendingRequests[_requestId] = _drCoordinator;
    }

    /**
     * @notice Allows a request to be cancelled if it has not been fulfilled
     * @dev Requires keeping track of the expiration value emitted from the oracle contract.
     * Deletes the request from the `pendingRequests` mapping.
     * Emits ChainlinkCancelled event.
     * @param _requestId The request ID
     * @param _fulfillMode The request fulfillment mode. Once the fulfillment method is chosen remove this param
     */
    function _cancelChainlinkRequest(
        bytes32 _requestId,
        uint256 _expiration,
        FulfillMode _fulfillMode
    ) internal {
        IDRCoordinator drCoordinator = IDRCoordinator(s_pendingRequests[_requestId]);
        delete s_pendingRequests[_requestId];
        emit ChainlinkCancelled(_requestId);
        drCoordinator.cancelRequest(_requestId, _expiration, _fulfillMode);
    }

    /**
     * @dev Reverts if the sender is not the DRCoordinator of the request.
     * Emits ChainlinkFulfilled event.
     * @param _requestId The request ID for fulfillment
     */
    function _recordChainlinkFulfillment(bytes32 _requestId) internal {
        if (msg.sender != s_pendingRequests[_requestId]) {
            revert DRCoordinatorConsumer__CallerIsNotRequestDRCoordinator();
        }
        delete s_pendingRequests[_requestId];
        emit ChainlinkFulfilled(_requestId);
    }

    /**
     * @notice Sets the LINK token address
     * @param _link The address of the LINK token contract
     */
    function _setChainlinkToken(address _link) internal {
        LINK = LinkTokenInterface(_link);
    }

    /**
     * @notice Sets the DRCoordinator address
     * @param _drCoordinator The address of the DRCoordinator contract
     */
    function _setDRCoordinator(address _drCoordinator) internal {
        s_drCoordinator = IDRCoordinator(_drCoordinator);
    }
}
