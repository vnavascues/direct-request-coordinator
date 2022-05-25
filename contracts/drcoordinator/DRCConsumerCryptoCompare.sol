// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { Chainlink } from "@chainlink/contracts/src/v0.8/Chainlink.sol";
import { FulfillMode } from "./DRCoordinator.sol";
import { FulfillChainlinkExternalRequestBase } from "./FulfillChainlinkExternalRequestBase.sol";
import { IDRCoordinator } from "./IDRCoordinator.sol";
import { console } from "hardhat/console.sol";

contract DRCConsumerCryptoCompare is FulfillChainlinkExternalRequestBase {
    using Chainlink for Chainlink.Request;

    struct PriceData {
        uint256 btc;
        uint256 eth;
        uint256 link;
    }
    mapping(bytes32 => PriceData) public requestIdToPriceData;

    error LinkTransferFailed(address to, uint256 amount);

    event FundsWithdrawn(address payee, uint256 amount);

    constructor(address _link) {
        _setChainlinkToken(_link);
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    function approve(address _drCoordinator, uint96 _amount) external {
        LINK.approve(_drCoordinator, _amount);
    }

    function fulfillPrices(
        bytes32 _requestId,
        uint256 _btc,
        uint256 _eth,
        uint256 _link
    ) external recordChainlinkFulfillment(_requestId) {
        PriceData memory priceData;
        priceData.btc = _btc;
        priceData.eth = _eth;
        priceData.link = _link;
        requestIdToPriceData[_requestId] = priceData;
    }

    function getPriceData(bytes32 _requestId) external view returns (PriceData memory) {
        return requestIdToPriceData[_requestId];
    }

    function requestPrices(
        address _drCoordinator,
        address _oracle,
        bytes32 _specId,
        uint48 _callbackGasLimit,
        uint8 _callbackMinConfirmations,
        FulfillMode _fulfillMode
    ) external {
        Chainlink.Request memory req;
        // NB: Chainlink.Request 'callbackAddr' and 'callbackFunctionId' will be overwritten by DRCoordiantor
        req.initialize(_specId, address(this), this.fulfillPrices.selector);

        bytes32 requestId;
        if (_fulfillMode == FulfillMode.FALLBACK) {
            requestId = IDRCoordinator(_drCoordinator).requestDataViaFallback(
                _oracle,
                _callbackGasLimit,
                _callbackMinConfirmations,
                req
            );
        } else if (_fulfillMode == FulfillMode.FULFILL_DATA) {
            requestId = IDRCoordinator(_drCoordinator).requestDataViaFulfillData(
                _oracle,
                _callbackGasLimit,
                _callbackMinConfirmations,
                req
            );
        } else {
            revert FulfillModeUnsupported(_fulfillMode);
        }
        _addChainlinkExternalRequest(_drCoordinator, requestId);
    }

    function withdraw(address payable _payee, uint256 _amount) external {
        emit FundsWithdrawn(_payee, _amount);
        _requireLinkTransfer(LINK.transfer(_payee, _amount), _payee, _amount);
    }

    function _requireLinkTransfer(
        bool _success,
        address _to,
        uint256 _amount
    ) private pure {
        if (!_success) {
            revert LinkTransferFailed(_to, _amount);
        }
    }
}
