// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { IChainlinkExternalFulfillment } from "./interfaces/IChainlinkExternalFulfillment.sol";
import { ChainlinkFulfillment } from "./ChainlinkFulfillment.sol";

/**
 * @title The ChainlinkExternalFulfillmentCompatible contract.
 * @author LinkPool.
 * @notice Contract writers that build and/or send a Chainlink request from contract A and require to track & fulfill
 * it on contract B, should make contract B inherit from this contract, and make contract A call
 * B.setExternalPendingRequest().
 * @dev Uses @chainlink/contracts 0.4.2.
 * @dev Inheriting from this abstract contract requires to implement 'setExternalPendingRequest'. Make sure the access
 * controls (e.g. onlyOwner, onlyRole) are right.
 */
// solhint-disable-next-line no-empty-blocks
abstract contract ChainlinkExternalFulfillmentCompatible is ChainlinkFulfillment, IChainlinkExternalFulfillment {

}
