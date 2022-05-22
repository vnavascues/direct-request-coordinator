import { expect } from "chai";
import { ethers } from "hardhat";

import type { Signers, Context } from "./DRCoordinator";
import { takeSnapshot, revertToSnapshot } from "../../helpers/snapshot";
import type { Overrides } from "../../../utils/types";

// TODO: test when _requireLinkTransferFrom() reverts (LINK.transferFrom fails)
export function testFallback(signers: Signers, context: Context): void {
  const overrides: Overrides = {};
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts when DRCoordinator is paused", async function () {
    // Arrange
    await context.drCoordinator.connect(signers.owner).pause();

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.externalCaller).fallback(overrides)).to.be.revertedWith(
      "Pausable: paused",
    );
  });

  it("reverts when the transaction sent contains ETH", async function () {
    // Arrange
    const callbackFunctionSignature = "0x7c1f72a0"; // NB: "fulfillUint256(bytes32,uint256)" function signature
    const txRequest = {
      to: context.drCoordinator.address,
      from: signers.externalCaller.address,
      data: callbackFunctionSignature,
      value: ethers.utils.parseEther("1.0"),
    };

    // Act & Assert
    await expect(signers.externalCaller.sendTransaction(txRequest)).to.be.revertedWith(
      `Transaction reverted: fallback function is not payable and was called with value 1000000000000000000`,
    );
  });

  it("reverts when 'msg.data' does not have the minimum length", async function () {
    // Arrange
    const callbackFunctionSignature = "0x7c1f72a0"; // NB: "fulfillUint256(bytes32,uint256)" function signature
    const txRequest = {
      to: context.drCoordinator.address,
      from: signers.externalCaller.address,
      data: callbackFunctionSignature,
    };

    // Act & Assert
    await expect(signers.externalCaller.sendTransaction(txRequest)).to.be.revertedWith(
      "DRCoordinator__FallbackMsgDataIsInvalid",
    );
  });

  it("reverts when the 'requestId' is not valid", async function () {
    // Arrange
    const callbackFunctionSignature = "0x7c1f72a0";
    const requestId = "0x794239b5b2c74a8b53870f56a1a752b8fbe7e27f61d08f72a707159d2f44239a";
    const txRequest = {
      to: context.drCoordinator.address,
      from: signers.externalCaller.address,
      data: `${callbackFunctionSignature}${requestId.slice(2)}`,
    };

    // Act & Assert
    await expect(signers.externalCaller.sendTransaction(txRequest)).to.be.revertedWith(
      "Source must be the oracle of the request",
    );
  });

  // TODO: test revert allowance
  //   it("reverts when the caller did not set enough allowance", async function () {
  //     // Arrange
  //     // TODO: insert key
  //     // TODO: fake consumer? get req object
  //     // TODO: fake Chainlink.Request object
  //     // TODO: set balance
  //     const specId = "0x3666636566346637363332353438363539646665363462336438643732343365";
  //     const oracle = context.operator.address;
  //     const callbackAddr = ""; // TODO;
  //     const req = ""; // TODO;
  //     await context.drCoordinator
  //       .connect(signers.externalCaller)
  //       .requestData(oracle, specId, callbackAddr, req);
  //     // TODO: decrease allowance!
  //     const callbackFunctionSignature = "0x7c1f72a0";
  //     const requestId = "0x794239b5b2c74a8b53870f56a1a752b8fbe7e27f61d08f72a707159d2f44239a";
  //     const txRequest = {
  //       to: context.drCoordinator.address,
  //       from: signers.externalCaller.address,
  //       data: `${callbackFunctionSignature}${requestId.slice(2)}`,
  //     };

  //     // Act & Assert
  //     await expect(signers.externalCaller.sendTransaction(txRequest)).to.be.revertedWith(
  //       "Source must be the oracle of the request",
  //     );
  //   });

  // TODO: test revert balance
  // TODO: test revert trasnferfrom
  // TODO: test fulfilled -> sucessful call
  // TODO: test fulfilled -> unsuccessful call
}
