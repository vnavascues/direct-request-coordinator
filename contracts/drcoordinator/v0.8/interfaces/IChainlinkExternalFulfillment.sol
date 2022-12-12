// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @notice Contract writers can inherit this contract in order to fulfill requests built in a different contract
 * (aka Chainlink external request).
 * @dev See docs: https://docs.chain.link/docs/any-api/api-reference/#addchainlinkexternalrequest
 */
interface IChainlinkExternalFulfillment {
    /**
     * @notice Track unfulfilled requests that the contract hasn't created itself.
     * @param _msgSender The Operator address expected to make the fulfillment tx.
     * @param _requestId The request ID.
     */
    function setExternalPendingRequest(address _msgSender, bytes32 _requestId) external;
}
