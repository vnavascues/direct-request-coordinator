// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { Chainlink, DRCoordinatorConsumer, IDRCoordinator, FulfillMode } from "./DRCoordinatorConsumer.sol";

contract DRCConsumerCryptoCompare is DRCoordinatorConsumer {
    using Chainlink for Chainlink.Request;

    struct PriceData {
        uint256 btc;
        uint256 eth;
        uint256 link;
    }
    mapping(bytes32 => PriceData) public requestIdToPriceData;

    error FulfillModeUnsupported(FulfillMode fulfillmode);
    error LinkTransferFailed(address to, uint256 amount);

    event FundsWithdrawn(address payee, uint256 amount);

    constructor(
        address _link,
        address _drCoordinator,
        address _operator
    ) {
        _setChainlinkToken(_link);
        _setDRCoordinator(_drCoordinator);
        _setOperator(_operator);
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    function cancelRequest(
        bytes32 _requestId,
        uint256 _expiration,
        FulfillMode _fulfillMode
    ) external {
        s_drCoordinator.cancelRequest(_requestId, _expiration, _fulfillMode);
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
        bytes32 _specId,
        uint48 _callbackGasLimit,
        uint8 _callbackMinConfirmations,
        FulfillMode _fulfillMode,
        string calldata _quote
    ) external {
        Chainlink.Request memory req = buildDRCoordinatorRequest(_specId, this.fulfillPrices.selector);

        req.add("quote", _quote);

        bytes32 requestId;
        if (_fulfillMode == FulfillMode.FALLBACK) {
            requestId = s_drCoordinator.requestDataViaFallback(
                address(s_operator),
                _callbackGasLimit,
                _callbackMinConfirmations,
                req
            );
        } else if (_fulfillMode == FulfillMode.FULFILL_DATA) {
            requestId = s_drCoordinator.requestDataViaFulfillData(
                address(s_operator),
                _callbackGasLimit,
                _callbackMinConfirmations,
                req
            );
        } else {
            revert FulfillModeUnsupported(_fulfillMode);
        }
        _addChainlinkExternalRequest(address(s_drCoordinator), requestId);
    }

    function setDRCoordinator(address _drCoordinator) external {
        _setDRCoordinator(_drCoordinator);
    }

    function setOperator(address _operator) external {
        _setOperator(_operator);
    }

    function withdraw(address _payee, uint256 _amount) external {
        emit FundsWithdrawn(_payee, _amount);
        _requireLinkTransfer(LINK.transfer(_payee, _amount), _payee, _amount);
    }

    function withdrawFunds(address _payee, uint96 _amount) external {
        s_drCoordinator.withdrawFunds(_payee, _amount);
    }

    /* ========== PRIVATE FUNCTIONS ========== */

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
