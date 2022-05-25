// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { ConfirmedOwner } from "@chainlink/contracts/src/v0.8/ConfirmedOwner.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { FulfillChainlinkExternalRequestCompatible } from "./FulfillChainlinkExternalRequestCompatible.sol";

contract GenericFulfillment is ConfirmedOwner, AccessControl, FulfillChainlinkExternalRequestCompatible {
    bytes32 public constant DRCOORDINATOR_ROLE = keccak256("DRCOORDINATOR_ROLE");

    constructor(address[] memory _drCoordinators) ConfirmedOwner(msg.sender) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRoleTo(DRCOORDINATOR_ROLE, _drCoordinators);
    }

    /* ========== FULFILLMENT EXTERNAL FUNCTIONS ========== */

    // Function signature: 0x32146504
    function fulfillBool(bytes32 _requestId, bool _result) external recordChainlinkFulfillment(_requestId) {}

    // Function signature: 0xa0c29e01
    function fulfillBoolArray(bytes32 _requestId, bool[] calldata _result)
        external
        recordChainlinkFulfillment(_requestId)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    // Function signature: 0x0941dfb3
    function fulfillBytes32(bytes32 _requestId, bytes32 _result) external recordChainlinkFulfillment(_requestId) {}

    // Function signature: 0x622232e7
    function fulfillBytes32Array(bytes32 _requestId, bytes32[] calldata _result)
        external
        recordChainlinkFulfillment(_requestId)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    // Function signature: 0xc2fb8523
    function fulfillBytes(bytes32 _requestId, bytes calldata _result) external recordChainlinkFulfillment(_requestId) {}

    // Function signature: 0xe5a2a1f8
    function fulfillBytesArray(bytes32 _requestId, bytes[] memory _results)
        external
        recordChainlinkFulfillment(_requestId)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    // Function signature: 0x5eb6f000
    function fulfillInt256(bytes32 _requestId, int256 _result) external recordChainlinkFulfillment(_requestId) {}

    // Function signature: 0x5fea1383
    function fulfillInt256Array(bytes32 _requestId, int256[] calldata _result)
        external
        recordChainlinkFulfillment(_requestId)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    // Function signature: 0xa6bdca07
    function fulfillString(bytes32 _requestId, string calldata _result)
        external
        recordChainlinkFulfillment(_requestId)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    // Function signature: 0x86666ba9
    function fulfillStringArray(bytes32 _requestId, string[] memory _result)
        external
        recordChainlinkFulfillment(_requestId)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    // Function signature: 0x7c1f72a0
    function fulfillUint256(bytes32 _requestId, uint256 _result) external recordChainlinkFulfillment(_requestId) {}

    // Function signature: 0xbdbb1b85
    function fulfillUint256Array(bytes32 _requestId, uint256[] calldata _result)
        external
        recordChainlinkFulfillment(_requestId)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    function setChainlinkExternalRequest(address _drCoordinator, bytes32 _requestId)
        external
        onlyRole(DRCOORDINATOR_ROLE)
    {
        _addChainlinkExternalRequest(_drCoordinator, _requestId);
    }

    /* ========== PRIVATE FUNCTIONS ========== */

    function _grantRoleTo(bytes32 _role, address[] memory _accounts) private onlyOwner {
        uint256 accountsLength = _accounts.length;
        for (uint256 i = 0; i < accountsLength; ) {
            _grantRole(_role, _accounts[i]);
            unchecked {
                ++i;
            }
        }
    }
}
