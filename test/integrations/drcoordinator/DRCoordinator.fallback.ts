import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import * as path from "path";

import type { Signers, Context } from "./DRCoordinator";
import { takeSnapshot, revertToSnapshot } from "../../helpers/snapshot";
import type { GenericFulfillmentTestHelper } from "../../../src/types";
import { FulfillMode } from "../../../tasks/drcoordinator/constants";
import { getSpecConvertedMap, parseSpecsFile } from "../../../tasks/drcoordinator/methods";
import type { Overrides } from "../../../utils/types";
import type { SpecConverted } from "../../../tasks/drcoordinator/types";

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
    const callbackFunctionId = "0x5e9b81e1"; // NB: "fulfillUint256(bytes32,uint256,bool)" function signature
    const txRequest = {
      to: context.drCoordinator.address,
      from: signers.externalCaller.address,
      data: callbackFunctionId,
      value: ethers.utils.parseEther("1.0"),
    };

    // Act & Assert
    await expect(signers.externalCaller.sendTransaction(txRequest)).to.be.revertedWith(
      `Transaction reverted: fallback function is not payable and was called with value 1000000000000000000`,
    );
  });

  it("reverts when 'msg.data' does not have the minimum length", async function () {
    // Arrange
    const callbackFunctionId = "0x5e9b81e1"; // NB: "fulfillUint256(bytes32,uint256,bool)" function signature
    const txRequest = {
      to: context.drCoordinator.address,
      from: signers.externalCaller.address,
      data: callbackFunctionId,
    };

    // Act & Assert
    await expect(signers.externalCaller.sendTransaction(txRequest)).to.be.revertedWith(
      "DRCoordinator__FallbackMsgDataIsInvalid",
    );
  });

  it("reverts when the 'requestId' is not valid", async function () {
    // Arrange
    const callbackFunctionId = "0x5e9b81e1"; // NB: "fulfillUint256(bytes32,uint256,bool)" function signature
    const requestId = "0x794239b5b2c74a8b53870f56a1a752b8fbe7e27f61d08f72a707159d2f44239a";
    const txRequest = {
      to: context.drCoordinator.address,
      from: signers.externalCaller.address,
      data: `${callbackFunctionId}${requestId.slice(2)}`,
    };

    // Act & Assert
    await expect(signers.externalCaller.sendTransaction(txRequest)).to.be.revertedWith(
      "Source must be the oracle of the request",
    );
  });

  it("reverts when the caller does not have enough balance", async function () {
    // NB: from an Operator.sol point of view 'fulfillOracleRequest2()' can't revert
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
    // 3. Set consumer's LINK balance
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, spec.payment, spec.gasLimit, spec.fulfillmentFee, spec.feeType);
    await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, maxPaymentAmount);
    await context.drCoordinator
      .connect(signers.deployer)
      .addFunds(context.drCoordinatorConsumer1TH.address, maxPaymentAmount);
    // 4. Make consumer call DRCoordinator.requestData()
    await context.drCoordinatorConsumer1TH
      .connect(signers.deployer)
      .requestUint256(
        context.drCoordinator.address,
        context.operator.address,
        spec.specId,
        spec.gasLimit,
        spec.minConfirmations,
        FulfillMode.FALLBACK,
      );
    // 5. Query the OracleRequest event from Operator.sol
    const filterOracleRequest = context.operator.filters.OracleRequest();
    const [eventOracleRequest] = await context.operator.queryFilter(filterOracleRequest);
    const { requestId, cancelExpiration } = eventOracleRequest.args;
    // 6. Withdraw consumer funds
    const availableFunds = await context.drCoordinator
      .connect(signers.externalCaller)
      .availableFunds(context.drCoordinatorConsumer1TH.address);
    await context.drCoordinatorConsumer1TH
      .connect(signers.deployer)
      .withdrawFunds(context.drCoordinator.address, context.drCoordinatorConsumer1TH.address, availableFunds);
    // 7. Prepare fulfillOracleRequest2 args
    const callbackFunctionId = "0x5e9b81e1";
    const result = BigNumber.from("777");
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256", "bool"], [requestId, result, false]);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumer1THBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumer1TH.address,
    );

    // Act & Assert
    await expect(
      context.operator
        .connect(signers.operatorSender)
        .fulfillOracleRequest2(
          requestId,
          spec.payment,
          context.drCoordinator.address,
          callbackFunctionId,
          cancelExpiration,
          encodedData,
          {
            gasLimit: BigNumber.from(spec.gasLimit).add(gasAfterPaymentCalculation),
            gasPrice: weiPerUnitGas,
          },
        ),
    )
      .to.not.emit(context.drCoordinatorConsumer1TH, "RequestFulfilledUint256")
      .to.not.emit(context.drCoordinator, "DRCoordinator__RequestFulfilled");
    expect(
      await context.drCoordinator.connect(signers.externalCaller).availableFunds(context.drCoordinator.address),
    ).to.equal("0");
    expect(
      await context.drCoordinator.connect(signers.externalCaller).availableFunds(context.drCoordinator.address),
    ).to.equal("0");
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(drCoordinatorLinkBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore,
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumer1TH.address)).to.equal(
      drCoordinatorConsumer1THBalanceBefore,
    );
  });

  it("fails to fulfill the request", async function () {
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
    // 3. Set consumer's LINK balance
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, spec.payment, spec.gasLimit, spec.fulfillmentFee, spec.feeType);
    await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, maxPaymentAmount);
    await context.drCoordinator
      .connect(signers.deployer)
      .addFunds(context.drCoordinatorConsumer1TH.address, maxPaymentAmount);
    // 4. Make consumer call DRCoordinator.requestData()
    await context.drCoordinatorConsumer1TH
      .connect(signers.deployer)
      .requestUint256(
        context.drCoordinator.address,
        context.operator.address,
        spec.specId,
        spec.gasLimit,
        spec.minConfirmations,
        FulfillMode.FALLBACK,
      );
    // 5. Prepare fulfillOracleRequest2 arguments
    const filterOracleRequest = context.operator.filters.OracleRequest();
    const [eventOracleRequest] = await context.operator.queryFilter(filterOracleRequest);
    const { requestId, cancelExpiration } = eventOracleRequest.args;
    const callbackFunctionId = "0x5e9b81e1";
    const result = BigNumber.from("777");
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256", "bool"], [requestId, result, true]);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    const expectedPayment = BigNumber.from("62482599721760627");
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumer1THBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumer1TH.address,
    );

    // Act & Assert
    await expect(
      context.operator
        .connect(signers.operatorSender)
        .fulfillOracleRequest2(
          requestId,
          spec.payment,
          context.drCoordinator.address,
          callbackFunctionId,
          cancelExpiration,
          encodedData,
          {
            gasLimit: BigNumber.from(spec.gasLimit).add(gasAfterPaymentCalculation),
            gasPrice: weiPerUnitGas,
          },
        ),
    )
      .to.emit(context.drCoordinator, "DRCoordinator__RequestFulfilled")
      .withArgs(requestId, false, context.drCoordinatorConsumer1TH.address, callbackFunctionId, expectedPayment)
      .to.not.emit(context.drCoordinatorConsumer1TH, "RequestFulfilledUint256");
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(drCoordinatorLinkBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.add(expectedPayment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumer1TH.address)).to.equal(
      drCoordinatorConsumer1THBalanceBefore.sub(expectedPayment),
    );
  });

  it("fulfills the request", async function () {
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
    // 3. Set consumer's LINK balance
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, spec.payment, spec.gasLimit, spec.fulfillmentFee, spec.feeType);
    await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, maxPaymentAmount);
    await context.drCoordinator
      .connect(signers.deployer)
      .addFunds(context.drCoordinatorConsumer1TH.address, maxPaymentAmount);
    // 4. Make consumer call DRCoordinator.requestData()
    await context.drCoordinatorConsumer1TH
      .connect(signers.deployer)
      .requestUint256(
        context.drCoordinator.address,
        context.operator.address,
        spec.specId,
        spec.gasLimit,
        spec.minConfirmations,
        FulfillMode.FALLBACK,
      );
    // 5. Prepare fulfillOracleRequest2 arguments
    const filterOracleRequest = context.operator.filters.OracleRequest();
    const [eventOracleRequest] = await context.operator.queryFilter(filterOracleRequest);
    const { requestId, cancelExpiration } = eventOracleRequest.args;
    const callbackFunctionId = "0x5e9b81e1";
    const result = BigNumber.from("777");
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256", "bool"], [requestId, result, false]);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    const expectedPayment = BigNumber.from("63539309845697304");
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumer1THBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumer1TH.address,
    );

    // Act & Assert
    await expect(
      context.operator
        .connect(signers.operatorSender)
        .fulfillOracleRequest2(
          requestId,
          spec.payment,
          context.drCoordinator.address,
          callbackFunctionId,
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
      .to.emit(context.drCoordinator, "DRCoordinator__RequestFulfilled")
      .withArgs(requestId, true, context.drCoordinatorConsumer1TH.address, callbackFunctionId, expectedPayment);
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(drCoordinatorLinkBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.add(expectedPayment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumer1TH.address)).to.equal(
      drCoordinatorConsumer1THBalanceBefore.sub(expectedPayment),
    );
  });

  it("fulfills the request (case response is 0x)", async function () {
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
    // 3. Set consumer's LINK balance
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, spec.payment, spec.gasLimit, spec.fulfillmentFee, spec.feeType);
    await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, maxPaymentAmount);
    await context.drCoordinator
      .connect(signers.deployer)
      .addFunds(context.drCoordinatorConsumer1TH.address, maxPaymentAmount);
    // 4. Make consumer call DRCoordinator.requestData()
    await context.drCoordinatorConsumer1TH
      .connect(signers.deployer)
      .requestNothing(
        context.drCoordinator.address,
        context.operator.address,
        spec.specId,
        spec.gasLimit,
        spec.minConfirmations,
        FulfillMode.FALLBACK,
      );
    // 5. Prepare fulfillOracleRequest2 arguments
    const filterOracleRequest = context.operator.filters.OracleRequest();
    const [eventOracleRequest] = await context.operator.queryFilter(filterOracleRequest);
    const { requestId, cancelExpiration } = eventOracleRequest.args;
    const callbackFunctionId = "0xf43c62ab";
    const result = "0x";
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, result]);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    const expectedPayment = BigNumber.from("63883595386453197");
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumer1THBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumer1TH.address,
    );

    // Act & Assert
    await expect(
      context.operator
        .connect(signers.operatorSender)
        .fulfillOracleRequest2(
          requestId,
          spec.payment,
          context.drCoordinator.address,
          callbackFunctionId,
          cancelExpiration,
          encodedData,
          {
            gasLimit: BigNumber.from(spec.gasLimit).add(gasAfterPaymentCalculation),
            gasPrice: weiPerUnitGas,
          },
        ),
    )
      .to.emit(context.drCoordinatorConsumer1TH, "RequestFulfilledNothing")
      .withArgs(requestId, result)
      .to.emit(context.drCoordinator, "DRCoordinator__RequestFulfilled")
      .withArgs(requestId, true, context.drCoordinatorConsumer1TH.address, callbackFunctionId, expectedPayment);
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(drCoordinatorLinkBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.add(expectedPayment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumer1TH.address)).to.equal(
      drCoordinatorConsumer1THBalanceBefore.sub(expectedPayment),
    );
  });

  it("fulfills the request (case external request)", async function () {
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
    // 3. Set consumer's LINK balance
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, spec.payment, spec.gasLimit, spec.fulfillmentFee, spec.feeType);
    await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, maxPaymentAmount);
    await context.drCoordinator
      .connect(signers.deployer)
      .addFunds(context.drCoordinatorConsumer1TH.address, maxPaymentAmount);
    // 4. Deploy a compatible fulfillment contract
    const genericFulfillmentTHFactory = await ethers.getContractFactory("GenericFulfillmentTestHelper");
    const genericFulfillmentTH = (await genericFulfillmentTHFactory
      .connect(signers.deployer)
      .deploy(context.linkToken.address)) as GenericFulfillmentTestHelper;
    await genericFulfillmentTH.deployTransaction.wait();
    const externalCallbackFunctionId = "0x7c1f72a0"; // 'fulfillUint256(bytes32,uint256)' function signature
    // 5. Make consumer call DRCoordinator.requestData()
    await context.drCoordinatorConsumer1TH
      .connect(signers.deployer)
      .requestUint256Externally(
        context.drCoordinator.address,
        context.operator.address,
        spec.specId,
        spec.gasLimit,
        spec.minConfirmations,
        genericFulfillmentTH.address,
        externalCallbackFunctionId,
        FulfillMode.FALLBACK,
      );
    // 5. Prepare fulfillOracleRequest2 arguments
    const filterOracleRequest = context.operator.filters.OracleRequest();
    const [eventOracleRequest] = await context.operator.queryFilter(filterOracleRequest);
    const { requestId, cancelExpiration } = eventOracleRequest.args;
    const result = BigNumber.from("777");
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "uint256", "bool"], [requestId, result, false]);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    const expectedPayment = BigNumber.from("63466954223968006");
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumer1THBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumer1TH.address,
    );

    // Act & Assert
    await expect(
      context.operator
        .connect(signers.operatorSender)
        .fulfillOracleRequest2(
          requestId,
          spec.payment,
          context.drCoordinator.address,
          externalCallbackFunctionId,
          cancelExpiration,
          encodedData,
          {
            gasLimit: BigNumber.from(spec.gasLimit).add(gasAfterPaymentCalculation),
            gasPrice: weiPerUnitGas,
          },
        ),
    )
      .to.emit(genericFulfillmentTH, "RequestFulfilledUint256")
      .withArgs(requestId, result)
      .to.emit(context.drCoordinator, "DRCoordinator__RequestFulfilled")
      .withArgs(requestId, true, genericFulfillmentTH.address, externalCallbackFunctionId, expectedPayment);
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(drCoordinatorLinkBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.add(expectedPayment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumer1TH.address)).to.equal(
      drCoordinatorConsumer1THBalanceBefore.sub(expectedPayment),
    );
  });
}
