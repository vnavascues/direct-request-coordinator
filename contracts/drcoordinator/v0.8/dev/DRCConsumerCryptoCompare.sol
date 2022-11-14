// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { Chainlink, DRCoordinatorClient, IDRCoordinator } from "../DRCoordinatorClient.sol";

contract DRCConsumerCryptoCompare is DRCoordinatorClient {
    using Chainlink for Chainlink.Request;

    struct PriceData {
        uint256 btc;
        uint256 eth;
        uint256 link;
    }
    mapping(bytes32 => PriceData) public requestIdToPriceData;

    error LinkTransferFailed(address to, uint256 amount);

    event FundsWithdrawn(address payee, uint256 amount);

    constructor(address _linkAddr, address _drCoordinatorAddr) {
        _setLink(_linkAddr);
        _setDRCoordinator(_drCoordinatorAddr);
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    function cancelRequest(bytes32 _requestId) external {
        s_drCoordinator.cancelRequest(_requestId);
    }

    function fulfillPrices(
        bytes32 _requestId,
        uint256 _btc,
        uint256 _eth,
        uint256 _link
    ) external recordFulfillment(_requestId) {
        PriceData memory priceData;
        priceData.btc = _btc;
        priceData.eth = _eth;
        priceData.link = _link;
        requestIdToPriceData[_requestId] = priceData;
    }

    function requestPrices(
        address _operatorAddr,
        bytes32 _specId,
        uint32 _callbackGasLimit,
        uint96 _consumerMaxPayment
    ) external {
        Chainlink.Request memory req = _buildRequest(_specId, address(this), this.fulfillPrices.selector);
        _sendRequest(_operatorAddr, _callbackGasLimit, _consumerMaxPayment, req);
    }

    function setDRCoordinator(address _drCoordinator) external {
        _setDRCoordinator(_drCoordinator);
    }

    function withdraw(address _payee, uint256 _amount) external {
        emit FundsWithdrawn(_payee, _amount);
        _requireLinkTransfer(LINK.transfer(_payee, _amount), _payee, _amount);
    }

    function withdrawFunds(address _payee, uint96 _amount) external {
        s_drCoordinator.withdrawFunds(_payee, _amount);
    }

    /* ========== EXTERNAL VIEW FUNCTIONS ========== */

    function getPriceData(bytes32 _requestId) external view returns (PriceData memory) {
        return requestIdToPriceData[_requestId];
    }

    /* ========== PRIVATE PURE FUNCTIONS ========== */

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
