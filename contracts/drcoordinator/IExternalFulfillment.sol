// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

interface IExternalFulfillment {
    function cancelChainlinkExternalRequest(
        bytes32 _requestId,
        uint256 _payment,
        bytes4 _callbackFunc,
        uint256 _expiration
    ) external;

    function setChainlinkExternalRequest(address _from, bytes32 _requestId) external;
}
