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
  it("TODO - reverts when the caller did not set enough allowance", async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
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
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, spec.payment, spec.gasLimit, spec.fulfillmentFee, spec.feeType);
    console.log(`*** max payment amount LINK: ${ethers.utils.formatEther(maxPaymentAmount)}`);
    await context.linkToken
      .connect(signers.deployer)
      .transfer(context.drCoordinatorConsumer1TH.address, maxPaymentAmount);
    await context.drCoordinatorConsumer1TH
      .connect(signers.deployer)
      .approve(context.drCoordinator.address, maxPaymentAmount);
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
    const filterOracleRequest = context.operator.filters.OracleRequest();
    const [eventOracleRequest] = await context.operator.queryFilter(filterOracleRequest);
    const { requestId, cancelExpiration } = eventOracleRequest.args;

    // Assert
    const callbackFunctionSignature = "0x7c1f72a0";
    const result = BigNumber.from("777");
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [requestId, result]);
    const msgData = `${callbackFunctionSignature}${encodedData.slice(2)}`;
    const gasAfterPaymentCalculation = await context.drCoordinator.getGasAfterPaymentCalculation();
    await expect(
      context.operator
        .connect(signers.operatorSender)
        .fulfillOracleRequest2(
          requestId,
          spec.payment,
          context.drCoordinator.address,
          callbackFunctionSignature,
          cancelExpiration,
          encodedData,
          {
            gasLimit: BigNumber.from(spec.gasLimit).add(gasAfterPaymentCalculation),
            gasPrice: weiPerUnitGas,
          },
        ),
    )
      .to.emit(context.drCoordinatorConsumer1TH, "RequestFulfilledUint256")
      .withArgs(requestId, result)
      .to.emit(context.drCoordinator, "RequestFulfilled")
      .withArgs(requestId, true, context.drCoordinatorConsumer1TH.address, callbackFunctionSignature, msgData);
  });

  // TODO: test revert allowance
  it.only("TODO - reverts when the caller did not set enough allowance", async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
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
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, spec.payment, spec.gasLimit, spec.fulfillmentFee, spec.feeType);
    console.log(`*** max payment amount LINK: ${ethers.utils.formatEther(maxPaymentAmount)}`);
    await context.linkToken
      .connect(signers.deployer)
      .transfer(context.aDrCoordinatorConsumer.address, maxPaymentAmount);
    await context.aDrCoordinatorConsumer
      .connect(signers.deployer)
      .approve(context.drCoordinator.address, maxPaymentAmount);
    // 3. Make consumer call DRCoordinator.requestData()
    await context.aDrCoordinatorConsumer
      .connect(signers.deployer)
      .requestSchedule(
        context.drCoordinator.address,
        context.operator.address,
        spec.specId,
        spec.gasLimit,
        spec.minConfirmations,
        BigNumber.from("0"),
        BigNumber.from("1"),
        BigNumber.from("1653742133"),
      );
    const filterOracleRequest = context.operator.filters.OracleRequest();
    const [eventOracleRequest] = await context.operator.queryFilter(filterOracleRequest);
    const { requestId, cancelExpiration } = eventOracleRequest.args;

    // Assert
    // const callbackFunctionSignature = "0x7c1f72a0";
    // const result = BigNumber.from("777");
    // const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256"], [requestId, result]);
    // const msgData = `${callbackFunctionSignature}${encodedData.slice(2)}`;
    // const gasAfterPaymentCalculation = await context.drCoordinator.getGasAfterPaymentCalculation();
    // await expect(
    //   context.operator
    //     .connect(signers.operatorSender)
    //     .fulfillOracleRequest2(
    //       requestId,
    //       spec.payment,
    //       context.drCoordinator.address,
    //       callbackFunctionSignature,
    //       cancelExpiration,
    //       encodedData,
    //       {
    //         gasLimit: BigNumber.from(spec.gasLimit).add(gasAfterPaymentCalculation),
    //         gasPrice: weiPerUnitGas,
    //       },
    //     ),
    // )
    //   .to.emit(context.drCoordinatorConsumer1TH, "RequestFulfilledUint256")
    //   .withArgs(requestId, result)
    //   .to.emit(context.drCoordinator, "RequestFulfilled")
    //   .withArgs(requestId, true, context.drCoordinatorConsumer1TH.address, callbackFunctionSignature, msgData);
  });

  // TODO: test revert balance
  // TODO: test revert trasnferfrom
  // TODO: test fulfilled -> sucessful call
  // TODO: test fulfilled -> unsuccessful call
}
