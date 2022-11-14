// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { Chainlink, DRCoordinatorClient, IDRCoordinator } from "../DRCoordinatorClient.sol";

contract DRCConsumerSportsdataio is DRCoordinatorClient {
    using Chainlink for Chainlink.Request;

    struct GameCreateMlb {
        uint32 gameId;
        uint40 startTime;
        bytes10 homeTeam;
        bytes10 awayTeam;
    }
    struct GameResolveMlb {
        uint32 gameId;
        uint8 homeScore;
        uint8 awayScore;
        bytes20 status;
    }
    mapping(bytes32 => bytes32[]) public requestIdGames;

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

    function fulfillSchedule(bytes32 _requestId, bytes32[] memory _result) external recordFulfillment(_requestId) {
        requestIdGames[_requestId] = _result;
    }

    function requestSchedule(
        address _operatorAddr,
        bytes32 _specId,
        uint32 _callbackGasLimit,
        uint96 _consumerMaxPayment,
        uint256 _market,
        uint256 _leagueId,
        uint256 _date
    ) external {
        Chainlink.Request memory req = _buildRequest(_specId, address(this), this.fulfillSchedule.selector);
        // NB: sportsdata EA specific
        req.addUint("market", _market);
        req.addUint("leagueId", _leagueId);
        req.addUint("date", _date);
        _sendRequest(_operatorAddr, _callbackGasLimit, _consumerMaxPayment, req);
    }

    function setDRCoordinator(address _drCoordinator) external {
        _setDRCoordinator(_drCoordinator);
    }

    function withdraw(address payable _payee, uint256 _amount) external {
        emit FundsWithdrawn(_payee, _amount);
        _requireLinkTransfer(LINK.transfer(_payee, _amount), _payee, _amount);
    }

    function withdrawFunds(address _payee, uint96 _amount) external {
        s_drCoordinator.withdrawFunds(_payee, _amount);
    }

    /* ========== EXTERNAL VIEW FUNCTIONS ========== */

    function getGameCreateMlb(bytes32 _requestId, uint256 _idx) external view returns (GameCreateMlb memory) {
        return getGameCreateMlbStruct(requestIdGames[_requestId][_idx]);
    }

    function getGameResolveMlb(bytes32 _requestId, uint256 _idx) external view returns (GameResolveMlb memory) {
        return getGameResolveMlbStruct(requestIdGames[_requestId][_idx]);
    }

    /* ========== PRIVATE PURE FUNCTIONS ========== */

    function getGameCreateMlbStruct(bytes32 _data) private pure returns (GameCreateMlb memory) {
        GameCreateMlb memory gameCreateMlb = GameCreateMlb(
            uint32(bytes4(_data)),
            uint40(bytes5(_data << 32)),
            bytes10(_data << 72),
            bytes10(_data << 152)
        );
        return gameCreateMlb;
    }

    function getGameResolveMlbStruct(bytes32 _data) private pure returns (GameResolveMlb memory) {
        GameResolveMlb memory gameResolveMlb = GameResolveMlb(
            uint32(bytes4(_data)),
            uint8(bytes1(_data << 32)),
            uint8(bytes1(_data << 40)),
            bytes20(_data << 48)
        );
        return gameResolveMlb;
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
