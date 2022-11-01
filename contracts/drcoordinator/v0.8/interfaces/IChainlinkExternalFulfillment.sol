// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface IChainlinkExternalFulfillment {
    function setExternalPendingRequest(address _msgSender, bytes32 _requestId) external;
}
