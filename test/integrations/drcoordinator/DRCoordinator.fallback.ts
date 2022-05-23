import { expect } from "chai";
import hardhat from "hardhat";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import * as path from "path";

import type { Signers, Context } from "./DRCoordinator";
import { takeSnapshot, revertToSnapshot } from "../../helpers/snapshot";
import {
  getSpecConvertedMap,
  parseSpecsFile,
  setCodeOnSpecContractAddresses,
} from "../../../tasks/drcoordinator/methods";
import type { Overrides } from "../../../utils/types";
import { SpecConverted } from "../../../tasks/drcoordinator/types";

// TODO: test when _requireLinkTransferFrom() reverts (LINK.transferFrom fails)
export function testFallback(signers: Signers, context: Context): void {
  const filePath = path.resolve(__dirname, "specs");
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
  it.only("TODO - reverts when the caller did not set enough allowance", async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file1.json"));
    specs.forEach(spec => {
      spec.configuration.oracleAddr = context.operator.address; // NB: overwrite with the right contract address
    });
    const fileSpecMap = await getSpecConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const spec = fileSpecMap.get(key) as SpecConverted;
    await context.drCoordinator.connect(signers.owner).setSpec(key, spec);
    // 2. Set LINK_TKN_FEED last answer
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("3490053626306509"));
    // 3. Take care on consumer LINK balance
    const weiPerUnitGas = BigNumber.from("30000000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, spec.payment, spec.gasLimit, spec.fulfillmentFee, spec.feeType);
    console.log(`*** max payment amount LINK: ${ethers.utils.formatEther(maxPaymentAmount)}`);
    await context.linkToken
      .connect(signers.deployer)
      .transfer(context.drCoordinatorConsumer1TH.address, maxPaymentAmount);
    console.log("*** 1");
    await context.drCoordinatorConsumer1TH
      .connect(signers.deployer)
      .approve(context.drCoordinator.address, maxPaymentAmount);
    console.log("*** 2");
    // 3. Make consumer call DRCoordinator.requestData()
    await context.drCoordinatorConsumer1TH
      .connect(signers.deployer)
      .requestUint256(
        context.drCoordinator.address,
        context.operator.address,
        spec.specId,
        spec.gasLimit,
        spec.minConfirmations,
      );

    // const specId = "0x3666636566346637363332353438363539646665363462336438643732343365";
    // const oracle = context.operator.address;
    // const callbackAddr = ""; // TODO;
    // const req = ""; // TODO;
    // await context.drCoordinator.connect(signers.externalCaller).requestData(oracle, specId, callbackAddr, req);
    // // TODO: decrease allowance!
    // const callbackFunctionSignature = "0x7c1f72a0";
    // const requestId = "0x794239b5b2c74a8b53870f56a1a752b8fbe7e27f61d08f72a707159d2f44239a";
    // const txRequest = {
    //   to: context.drCoordinator.address,
    //   from: signers.externalCaller.address,
    //   data: `${callbackFunctionSignature}${requestId.slice(2)}`,
    // };

    // // Act & Assert
    // await expect(signers.externalCaller.sendTransaction(txRequest)).to.be.revertedWith(
    //   "Source must be the oracle of the request",
    // );
  });

  // TODO: test revert balance
  // TODO: test revert trasnferfrom
  // TODO: test fulfilled -> sucessful call
  // TODO: test fulfilled -> unsuccessful call
}
