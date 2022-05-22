// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { FulfillChainlinkExternalRequestBase } from "./FulfillChainlinkExternalRequestBase.sol";
import { IExternalFulfillment } from "./IExternalFulfillment.sol";

// solhint-disable-next-line no-empty-blocks
abstract contract FulfillChainlinkExternalRequestCompatible is
    FulfillChainlinkExternalRequestBase,
    IExternalFulfillment
{

}
