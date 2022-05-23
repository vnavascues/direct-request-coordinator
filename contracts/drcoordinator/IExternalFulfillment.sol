// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

interface IExternalFulfillment {
    function setChainlinkExternalRequest(address _from, bytes32 _requestId) external;
}
