// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { Chainlink } from "@chainlink/contracts/src/v0.8/Chainlink.sol";

interface IDRCoordinator {
    function requestData(
        address _oracle,
        bytes32 _specId,
        address _callbackAddr,
        uint48 _callbackGasLimit,
        uint8 _callbackMinConfirmations,
        Chainlink.Request memory _req
    ) external returns (bytes32);
}
