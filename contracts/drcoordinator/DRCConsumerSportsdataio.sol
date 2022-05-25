// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import { Chainlink } from "@chainlink/contracts/src/v0.8/Chainlink.sol";
import { FulfillMode } from "./DRCoordinator.sol";
import { FulfillChainlinkExternalRequestBase } from "./FulfillChainlinkExternalRequestBase.sol";
import { IDRCoordinator } from "./IDRCoordinator.sol";
import { console } from "hardhat/console.sol";

contract DRCConsumerSportsdataio is FulfillChainlinkExternalRequestBase {
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

    constructor(address _link) {
        _setChainlinkToken(_link);
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    function approve(address _drCoordinator, uint96 _amount) external {
        LINK.approve(_drCoordinator, _amount);
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
        address _drCoordinator,
        address _oracle,
        bytes32 _specId,
        uint48 _callbackGasLimit,
        uint8 _callbackMinConfirmations,
        uint256 _market,
        uint256 _leagueId,
        uint256 _date,
        FulfillMode _fulfillMode
    ) external {
        Chainlink.Request memory req;
        // NB: Chainlink.Request 'callbackAddr' and 'callbackFunctionId' will be overwritten by DRCoordiantor
        req.initialize(_specId, address(this), this.fulfillSchedule.selector);

        // NB: sportsdata-linkpool specific
        req.addUint("market", _market);
        req.addUint("leagueId", _leagueId);
        req.addUint("date", _date);

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

    /* ========== EXTERNAL VIEW FUNCTIONS ========== */

    function availableFunds() external view returns (uint256) {
        return LINK.balanceOf(address(this));
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
