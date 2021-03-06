// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { Chainlink, DRCoordinatorConsumer, IDRCoordinator, FulfillMode } from "./DRCoordinatorConsumer.sol";

contract DRCConsumerSportsdataio is DRCoordinatorConsumer {
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

    function fulfillSchedule(bytes32 _requestId, bytes32[] memory _result)
        external
        recordChainlinkFulfillment(_requestId)
    {
        requestIdGames[_requestId] = _result;
    }

    function getGameCreateMlb(bytes32 _requestId, uint256 _idx) external view returns (GameCreateMlb memory) {
        return getGameCreateMlbStruct(requestIdGames[_requestId][_idx]);
    }

    function getGameResolveMlb(bytes32 _requestId, uint256 _idx) external view returns (GameResolveMlb memory) {
        return getGameResolveMlbStruct(requestIdGames[_requestId][_idx]);
    }

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

    function requestSchedule(
        bytes32 _specId,
        uint48 _callbackGasLimit,
        uint8 _callbackMinConfirmations,
        uint256 _market,
        uint256 _leagueId,
        uint256 _date,
        FulfillMode _fulfillMode
    ) external {
        Chainlink.Request memory req = buildDRCoordinatorRequest(_specId, this.fulfillSchedule.selector);

        // NB: sportsdata EA specific
        req.addUint("market", _market);
        req.addUint("leagueId", _leagueId);
        req.addUint("date", _date);

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

    function withdraw(address payable _payee, uint256 _amount) external {
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
