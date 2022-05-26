// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { LinkTokenInterface } from "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";
import { OperatorInterface } from "@chainlink/contracts/src/v0.8/interfaces/OperatorInterface.sol";

contract FulfillChainlinkExternalRequestBase {
    LinkTokenInterface internal LINK;
    mapping(bytes32 => address) private s_pendingRequests;

    error FulfillChainlinkExternalRequestCompatible__IsPendingRequest();
    error FulfillChainlinkExternalRequestCompatible__CallerIsNotRequestOracle();

    event ChainlinkFulfilled(bytes32 indexed id);

    /**
     * @dev Reverts if the request is already pending
     * @param _requestId The request ID for fulfillment
     */
    modifier notPendingRequest(bytes32 _requestId) {
        if (s_pendingRequests[_requestId] != address(0)) {
            revert FulfillChainlinkExternalRequestCompatible__IsPendingRequest();
        }
        _;
    }

    /**
     * @dev Reverts if the sender is not the oracle of the request.
     * Emits ChainlinkFulfilled event.
     * @param _requestId The request ID for fulfillment
     */
    modifier recordChainlinkFulfillment(bytes32 _requestId) {
        _recordChainlinkFulfillment(_requestId);
        _;
    }

    /**
     * @notice Allows for a request which was created on another contract to be fulfilled
     * on this contract
     * @param _oracleAddress The address of the oracle contract that will fulfill the request
     * @param _requestId The request ID used for the response
     */
    function _addChainlinkExternalRequest(address _oracleAddress, bytes32 _requestId)
        internal
        notPendingRequest(_requestId)
    {
        s_pendingRequests[_requestId] = _oracleAddress;
    }

    /**
     * @dev Reverts if the sender is not the oracle of the request.
     * Emits ChainlinkFulfilled event.
     * @param _requestId The request ID for fulfillment
     */
    function _recordChainlinkFulfillment(bytes32 _requestId) internal {
        if (msg.sender != s_pendingRequests[_requestId]) {
            revert FulfillChainlinkExternalRequestCompatible__CallerIsNotRequestOracle();
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
}
