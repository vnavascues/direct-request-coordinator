// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { Chainlink, DRCoordinatorClient, IDRCoordinator } from "../DRCoordinatorClient.sol";

contract DRCoordinatorAttackerTestHelper is DRCoordinatorClient {
    using Chainlink for Chainlink.Request;

    error FulfillUint256Failed();
    error LinkTransferFailed(address to, uint256 amount);

    event Attacked(string attackName, bool success);
    event FundsWithdrawn(address payee, uint256 amount);

    constructor(address _linkAddr, address _drCoordinatorAddr) {
        _setLink(_linkAddr);
        _setDRCoordinator(_drCoordinatorAddr);
    }

    /* ========== EXTERNAL FUNCTIONS ========== */

    function cancelRequest(bytes32 _requestId) external {
        s_drCoordinator.cancelRequest(_requestId);
    }

    /**
     * @notice A reentrancy attack that attempts to call DRCoordinator.addFunds() on fulfillment
     * @dev It should be reverted with the right reentrancy lock protection.
     */
    function attackAddFundsCall(
        bytes32 _requestId,
        bytes calldata /* _result */
    ) external recordFulfillment(_requestId) {
        uint96 drCoordinatorLinkBalance = s_drCoordinator.availableFunds(address(s_drCoordinator));
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = address(s_drCoordinator).call(
            abi.encodeWithSelector(s_drCoordinator.addFunds.selector, address(this), drCoordinatorLinkBalance)
        );
        emit Attacked("attackAddFundsCall", success);
    }

    /**
     * @notice A reentrancy attack that attempts to call DRCoordinator.cancelRequest() on fulfillment
     * @dev It should be reverted with the right reentrancy lock protection.
     */
    function attackCancelRequestCall(
        bytes32 _requestId,
        bytes calldata /* _result */
    ) external recordFulfillment(_requestId) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = address(s_drCoordinator).call(
            abi.encodeWithSelector(s_drCoordinator.cancelRequest.selector, _requestId)
        );
        emit Attacked("attackCancelRequestCall", success);
    }

    /**
     * @notice A reentrancy attack that attempts to call DRCoordinator.fulfillData() on fulfillment
     * @dev It should be reverted with the right reentrancy lock protection.
     */
    function attackFulfillDataCall(
        bytes32 _requestId,
        bytes calldata /* _result */
    ) external recordFulfillment(_requestId) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = address(s_drCoordinator).call(
            abi.encodeWithSignature("fulfillData(bytes32,bytes)", _requestId, "")
        );
        emit Attacked("attackFulfillDataCall", success);
    }

    /**
     * @notice A reentrancy attack that attempts to call DRCoordinator.requestData() on fulfillment
     * @dev It should be reverted with the right reentrancy lock protection.
     */
    function attackRequestDataCall(
        bytes32 _requestId,
        bytes calldata /* _result */
    ) external recordFulfillment(_requestId) {
        // NB: dummy values
        bytes32 specId = 0x3233356262656361363566333434623762613862336166353031653433363232;
        address operatorAddr = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;
        uint32 callbackGasLimit = 2_000_000; // NB: enough for two rounds?
        uint8 callbackMinConfirmations = 2;
        Chainlink.Request memory req;
        req.initialize(specId, address(this), this.attackRequestDataCall.selector);

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = address(s_drCoordinator).call(
            abi.encodeWithSelector(
                s_drCoordinator.requestData.selector,
                operatorAddr,
                callbackGasLimit,
                callbackMinConfirmations,
                req
            )
        );
        emit Attacked("attackRequestDataCall", success);
    }

    /**
     * @notice A reentrancy attack that attempts to call DRCoordinator.withdrawFunds() on fulfillment.
     * @dev It should be reverted with the right reentrancy lock protection.
     */
    // solhint-disable-next-line
    function attackWithdrawFundsCall(
        bytes32 _requestId,
        bytes calldata /* _result */
    ) external recordFulfillment(_requestId) {
        uint96 drCoordinatorLinkBalance = s_drCoordinator.availableFunds(address(s_drCoordinator));
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = address(s_drCoordinator).call(
            abi.encodeWithSelector(s_drCoordinator.withdrawFunds.selector, address(this), drCoordinatorLinkBalance)
        );
        emit Attacked("attackWithdrawFundsCall", success);
    }

    function requestAttack(
        address _operatorAddr,
        bytes32 _specId,
        uint32 _callbackGasLimit,
        uint8 _callbackMinConfirmations,
        bytes4 _functionSelector
    ) external {
        Chainlink.Request memory req;
        // NB: Chainlink.Request 'callbackAddr' and 'callbackFunctionId' will be overwritten by DRCoordinator
        req.initialize(_specId, address(this), _functionSelector);
        _sendRequestTo(s_drCoordinator, _operatorAddr, _callbackGasLimit, _callbackMinConfirmations, req);
    }

    function withdraw(address payable _payee, uint256 _amount) external {
        emit FundsWithdrawn(_payee, _amount);
        _requireLinkTransfer(LINK.transfer(_payee, _amount), _payee, _amount);
    }

    function withdrawFunds(address _payee, uint96 _amount) external {
        s_drCoordinator.withdrawFunds(_payee, _amount);
    }

    /* ========== EXTERNAL PURE FUNCTIONS ========== */

    function initializeChainlinkRequest(
        bytes32 _specId,
        address _callbackAddr,
        bytes4 _callbackFuncId
    ) external pure returns (Chainlink.Request memory) {
        Chainlink.Request memory req;
        return req.initialize(_specId, _callbackAddr, _callbackFuncId);
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
