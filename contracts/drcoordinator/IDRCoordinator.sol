// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { Chainlink } from "@chainlink/contracts/src/v0.8/Chainlink.sol";

interface IDRCoordinator {
    function requestDataViaFallback(
        address _oracle,
        uint48 _callbackGasLimit,
        uint8 _callbackMinConfirmations,
        Chainlink.Request memory _req
    ) external returns (bytes32);

    function requestDataViaFulfillData(
        address _oracle,
        uint48 _callbackGasLimit,
        uint8 _callbackMinConfirmations,
        Chainlink.Request memory _req
    ) external returns (bytes32);

    function withdrawFunds(address _payee, uint96 _amount) external;
}
