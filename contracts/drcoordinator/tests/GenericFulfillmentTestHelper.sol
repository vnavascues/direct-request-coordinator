// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { FulfillChainlinkExternalRequestCompatible } from "../FulfillChainlinkExternalRequestCompatible.sol";

contract GenericFulfillmentTestHelper is FulfillChainlinkExternalRequestCompatible {
    // Generic fulfillment callback
    event RequestFulfilledBool(bytes32 indexed requestId, bool result);
    event RequestFulfilledBoolArray(bytes32 indexed requestId, bool[] result);
    event RequestFulfilledBytes32(bytes32 indexed requestId, bytes32 result);
    event RequestFulfilledBytes32Array(bytes32 indexed requestId, bytes32[] result);
    event RequestFulfilledBytes(bytes32 indexed requestId, bytes result);
    event RequestFulfilledBytesArray(bytes32 indexed requestId, bytes[] result);
    event RequestFulfilledInt256(bytes32 indexed requestId, int256 result);
    event RequestFulfilledInt256Array(bytes32 indexed requestId, int256[] result);
    event RequestFulfilledString(bytes32 indexed requestId, string result);
    event RequestFulfilledStringArray(bytes32 indexed requestId, string[] result);
    event RequestFulfilledUint256(bytes32 indexed requestId, uint256 result);
    event RequestFulfilledUint256Array(bytes32 indexed requestId, uint256[] result);

    constructor(address _link) {
        _setChainlinkToken(_link);
    }

    /* ========== UNFULFILLED REQUESTS FUNCTIONS ========== */

    function setChainlinkExternalRequest(address _oracle, bytes32 _requestId) external {
        _addChainlinkExternalRequest(_oracle, _requestId);
    }

    function cancelChainlinkExternalRequest(
        bytes32 _requestId,
        uint256 _payment,
        bytes4 _callbackFunc,
        uint256 _expiration
    ) external {
        _cancelChainlinkRequest(_requestId, _payment, _callbackFunc, _expiration);
    }

    /* ========== GENERIC FULFILLMENT CALLBACK FUNCTIONS ========== */

    // Function signature: 0x32146504
    function fulfillBool(bytes32 _requestId, bool _result) external recordChainlinkFulfillment(_requestId) {
        emit RequestFulfilledBool(_requestId, _result);
    }

    // Function signature: 0xa0c29e01
    function fulfillBoolArray(bytes32 _requestId, bool[] calldata _result)
        external
        recordChainlinkFulfillment(_requestId)
    {
        emit RequestFulfilledBoolArray(_requestId, _result);
    }

    // Function signature: 0x0941dfb3
    function fulfillBytes32(bytes32 _requestId, bytes32 _result) external recordChainlinkFulfillment(_requestId) {
        emit RequestFulfilledBytes32(_requestId, _result);
    }

    // Function signature: 0x622232e7
    function fulfillBytes32Array(bytes32 _requestId, bytes32[] calldata _result)
        external
        recordChainlinkFulfillment(_requestId)
    {
        emit RequestFulfilledBytes32Array(_requestId, _result);
    }

    // Function signature: 0xc2fb8523
    function fulfillBytes(bytes32 _requestId, bytes calldata _result) external recordChainlinkFulfillment(_requestId) {
        emit RequestFulfilledBytes(_requestId, _result);
    }

    // Function signature: 0xe5a2a1f8
    function fulfillBytesArray(bytes32 _requestId, bytes[] memory _results)
        external
        recordChainlinkFulfillment(_requestId)
    {
        emit RequestFulfilledBytesArray(_requestId, _results);
    }

    // Function signature: 0x5eb6f000
    function fulfillInt256(bytes32 _requestId, int256 _result) external recordChainlinkFulfillment(_requestId) {
        emit RequestFulfilledInt256(_requestId, _result);
    }

    // Function signature: 0x5fea1383
    function fulfillInt256Array(bytes32 _requestId, int256[] calldata _result)
        external
        recordChainlinkFulfillment(_requestId)
    {
        emit RequestFulfilledInt256Array(_requestId, _result);
    }

    // Function signature: 0xa6bdca07
    function fulfillString(bytes32 _requestId, string calldata _result)
        external
        recordChainlinkFulfillment(_requestId)
    {
        emit RequestFulfilledString(_requestId, _result);
    }

    // Function signature: 0x86666ba9
    function fulfillStringArray(bytes32 _requestId, string[] memory _result)
        external
        recordChainlinkFulfillment(_requestId)
    {
        emit RequestFulfilledStringArray(_requestId, _result);
    }

    // Function signature: 0x7c1f72a0
    function fulfillUint256(bytes32 _requestId, uint256 _result) external recordChainlinkFulfillment(_requestId) {
        emit RequestFulfilledUint256(_requestId, _result);
    }

    // Function signature: 0xbdbb1b85
    function fulfillUint256Array(bytes32 _requestId, uint256[] calldata _result)
        external
        recordChainlinkFulfillment(_requestId)
    {
        emit RequestFulfilledUint256Array(_requestId, _result);
    }
}
