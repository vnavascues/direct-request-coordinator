// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

/**
 * @title The ChainlinkFulfillment contract.
 * @author LinkPool.
 * @notice Contract writers can inherit this contract to fulfill Chainlink requests.
 * @dev Uses @chainlink/contracts 0.4.2.
 */
contract ChainlinkFulfillment {
    mapping(bytes32 => address) internal s_pendingRequests;

    error ChainlinkFulfillment__CallerIsNotRequester(address msgSender);
    error ChainlinkFulfillment__RequestIsPending(bytes32 requestId);

    event ChainlinkFulfilled(bytes32 indexed id);

    /* ========== MODIFIERS ========== */

    /**
     * @dev Reverts if the request is already pending (value is a contract address).
     * @param _requestId The request ID for fulfillment.
     */
    modifier notPendingRequest(bytes32 _requestId) {
        _requireRequestIsNotPending(_requestId);
        _;
    }

    /**
     * @dev Reverts if the sender is not the DRCoordinator.
     * @dev Emits the ChainlinkFulfilled event.
     * @param _requestId The request ID for fulfillment.
     */
    modifier recordFulfillment(bytes32 _requestId) {
        _recordFulfillment(_requestId);
        _;
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    /**
     * @notice Allows for a Chainlink request to be fulfilled on this contract.
     * @dev Maps the request ID with the contract address in charge of fulfilling the request.
     * @param _msgSender The address of the contract that will fulfill the request.
     * @param _requestId The request ID used for the response.
     */
    function _addPendingRequest(address _msgSender, bytes32 _requestId) internal notPendingRequest(_requestId) {
        s_pendingRequests[_requestId] = _msgSender;
    }

    /**
     * @notice Validates the request fulfillment data (requestId and sender), protecting Chainlink client callbacks from
     * being called by malicious callers.
     * @dev Reverts if the caller is not the original request sender.
     * @dev Emits the ChainlinkFulfilled event.
     * @param _requestId The request ID for fulfillment.
     */
    function _recordFulfillment(bytes32 _requestId) internal {
        address msgSender = s_pendingRequests[_requestId];
        if (msg.sender != msgSender) {
            revert ChainlinkFulfillment__CallerIsNotRequester(msgSender);
        }
        delete s_pendingRequests[_requestId];
        emit ChainlinkFulfilled(_requestId);
    }

    /* ========== INTERNAL VIEW FUNCTIONS ========== */

    /**
     * @notice Validates the request is not pending (it hasn't been fulfilled yet, or it just does not exist).
     * @dev Reverts if the request is pending (value is a non-zero contract address).
     * @param _requestId The request ID for fulfillment.
     */
    function _requireRequestIsNotPending(bytes32 _requestId) internal view {
        if (s_pendingRequests[_requestId] != address(0)) {
            revert ChainlinkFulfillment__RequestIsPending(_requestId);
        }
    }
}
