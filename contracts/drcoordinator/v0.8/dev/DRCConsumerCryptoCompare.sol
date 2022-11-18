// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { Chainlink, DRCoordinatorClient, IDRCoordinator } from "../DRCoordinatorClient.sol";

contract DRCConsumerCryptoCompare is DRCoordinatorClient {
    using Chainlink for Chainlink.Request;

    struct PriceData3 {
        uint256 btc;
        uint256 eth;
        uint256 link;
    }

    struct PriceData6 {
        uint256 btc;
        uint256 eth;
        uint256 link;
        uint256 matic;
        uint256 aave;
        uint256 snx;
    }

    mapping(bytes32 => uint256) public requestIdToPriceData1;
    mapping(bytes32 => PriceData3) public requestIdToPriceData3;
    mapping(bytes32 => PriceData6) public requestIdToPriceData6;

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

    // Function signature: d276286e
    function fulfillPriceData1(bytes32 _requestId, uint256 _link) external recordFulfillment(_requestId) {
        requestIdToPriceData1[_requestId] = _link;
    }

    // Function signature: 3551fb7a
    function fulfillPriceData3(
        bytes32 _requestId,
        uint256 _btc,
        uint256 _eth,
        uint256 _link
    ) external recordFulfillment(_requestId) {
        PriceData3 memory priceData3 = PriceData3(_btc, _eth, _link);
        requestIdToPriceData3[_requestId] = priceData3;
    }

    // Function signature: ea4ed058
    function fulfillPriceData6(
        bytes32 _requestId,
        uint256 _btc,
        uint256 _eth,
        uint256 _link,
        uint256 _matic,
        uint256 _aave,
        uint256 _snx
    ) external recordFulfillment(_requestId) {
        PriceData6 memory priceData6 = PriceData6(_btc, _eth, _link, _matic, _aave, _snx);
        requestIdToPriceData6[_requestId] = priceData6;
    }

    function requestPrices(
        address _operatorAddr,
        bytes32 _specId,
        uint32 _callbackGasLimit,
        uint96 _consumerMaxPayment,
        bytes4 _callbackFunctionId
    ) external {
        Chainlink.Request memory req = _buildRequest(_specId, address(this), _callbackFunctionId);
        _sendRequest(_operatorAddr, _callbackGasLimit, _consumerMaxPayment, req);
    }

    function setDRCoordinator(address _drCoordinator) external {
        _setDRCoordinator(_drCoordinator);
    }

    function withdraw(address _payee, uint256 _amount) external {
        emit FundsWithdrawn(_payee, _amount);
        _requireLinkTransfer(s_link.transfer(_payee, _amount), _payee, _amount);
    }

    function withdrawFunds(address _payee, uint96 _amount) external {
        s_drCoordinator.withdrawFunds(_payee, _amount);
    }

    /* ========== EXTERNAL VIEW FUNCTIONS ========== */

    function getPriceData1(bytes32 _requestId) external view returns (uint256) {
        return requestIdToPriceData1[_requestId];
    }

    function getPriceData3(bytes32 _requestId) external view returns (PriceData3 memory) {
        return requestIdToPriceData3[_requestId];
    }

    function getPriceData6(bytes32 _requestId) external view returns (PriceData6 memory) {
        return requestIdToPriceData6[_requestId];
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
