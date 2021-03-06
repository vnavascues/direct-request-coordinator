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

export function testFulfillData(signers: Signers, context: Context): void {
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

  it("reverts when the 'requestId' is not valid", async function () {
    // Arrange
    const requestId = "0x794239b5b2c74a8b53870f56a1a752b8fbe7e27f61d08f72a707159d2f44239a";

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.externalCaller).fulfillData(requestId, "0x")).to.be.revertedWith(
      "Source must be the oracle of the request",
    );
  });

  it("reverts when the caller does not have enough balance", async function () {
    // NB: from an Operator.sol point of view 'fulfillOracleRequest2()' can't revert
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
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
      .addFunds(context.drCoordinatorConsumerTH.address, maxPaymentAmount);
    // 4. Make consumer call DRCoordinator.requestData()
    await context.drCoordinatorConsumerTH
      .connect(signers.deployer)
      .requestUint256(
        context.drCoordinator.address,
        context.operator.address,
        spec.specId,
        spec.gasLimit,
        spec.minConfirmations,
        FulfillMode.FULFILL_DATA,
      );
    // 5. Query the operatorRequest event from Operator.sol
    const filteroperatorRequest = context.operator.filters.OracleRequest();
    const [eventoperatorRequest] = await context.operator.queryFilter(filteroperatorRequest);
    const { requestId, cancelExpiration } = eventoperatorRequest.args;
    // 6. Withdraw consumer funds
    const availableFunds = await context.drCoordinator
      .connect(signers.externalCaller)
      .availableFunds(context.drCoordinatorConsumerTH.address);
    await context.drCoordinatorConsumerTH
      .connect(signers.deployer)
      .withdrawFunds(context.drCoordinator.address, context.drCoordinatorConsumerTH.address, availableFunds);
    // 7. Prepare fulfillOracleRequest2 args
    const callbackFunctionId = "0x23905e15"; // 'fulfillData(bytes32,bytes)'
    const result = BigNumber.from("777");
    const encodedResult = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "bool"],
      [requestId, result, false],
    );
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, encodedResult]);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumerTHBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumerTH.address,
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
      .to.not.emit(context.drCoordinatorConsumerTH, "RequestFulfilledUint256")
      .to.not.emit(context.drCoordinator, "DRCoordinator__RequestFulfilled");
    expect(
      await context.drCoordinator.connect(signers.externalCaller).availableFunds(context.drCoordinator.address),
    ).to.equal("0");
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(drCoordinatorLinkBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore,
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore,
    );
  });

  it("fails to fulfill the request", async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
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
      .addFunds(context.drCoordinatorConsumerTH.address, maxPaymentAmount);
    // 4. Make consumer call DRCoordinator.requestData()
    await context.drCoordinatorConsumerTH
      .connect(signers.deployer)
      .requestUint256(
        context.drCoordinator.address,
        context.operator.address,
        spec.specId,
        spec.gasLimit,
        spec.minConfirmations,
        FulfillMode.FULFILL_DATA,
      );
    // 5. Prepare fulfillOracleRequest2 arguments
    const filteroperatorRequest = context.operator.filters.OracleRequest();
    const [eventoperatorRequest] = await context.operator.queryFilter(filteroperatorRequest);
    const { requestId, cancelExpiration } = eventoperatorRequest.args;
    const callbackFunctionId = "0x23905e15"; // 'fulfillData(bytes32,bytes)'
    const result = BigNumber.from("777");
    const encodedResult = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "bool"],
      [requestId, result, true],
    );
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, encodedResult]);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    const expectedPayment = BigNumber.from("63370745100569708");
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumerTHBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumerTH.address,
    );

    // Act & Assert
    const expectedCallbackFunctionId = "0x5e9b81e1";
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
      .withArgs(requestId, false, context.drCoordinatorConsumerTH.address, expectedCallbackFunctionId, expectedPayment)
      .to.not.emit(context.drCoordinatorConsumerTH, "RequestFulfilledUint256");
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(drCoordinatorLinkBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.add(expectedPayment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.sub(expectedPayment),
    );
  });

  it("fulfills the request", async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
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
      .addFunds(context.drCoordinatorConsumerTH.address, maxPaymentAmount);
    // 4. Make consumer call DRCoordinator.requestData()
    await context.drCoordinatorConsumerTH
      .connect(signers.deployer)
      .requestUint256(
        context.drCoordinator.address,
        context.operator.address,
        spec.specId,
        spec.gasLimit,
        spec.minConfirmations,
        FulfillMode.FULFILL_DATA,
      );
    // 5. Prepare fulfillOracleRequest2 arguments
    const filteroperatorRequest = context.operator.filters.OracleRequest();
    const [eventoperatorRequest] = await context.operator.queryFilter(filteroperatorRequest);
    const { requestId, cancelExpiration } = eventoperatorRequest.args;
    const callbackFunctionId = "0x23905e15"; // 'fulfillData(bytes32,bytes)'
    const result = BigNumber.from("777");
    const encodedResult = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "bool"],
      [requestId, result, false],
    );
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, encodedResult]);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    const expectedPayment = BigNumber.from("64426660107784085");
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumerTHBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumerTH.address,
    );

    // Act & Assert
    const expectedCallbackFunctionId = "0x5e9b81e1";
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
      .to.emit(context.drCoordinatorConsumerTH, "RequestFulfilledUint256")
      .withArgs(requestId, result)
      .to.emit(context.drCoordinator, "DRCoordinator__RequestFulfilled")
      .withArgs(requestId, true, context.drCoordinatorConsumerTH.address, expectedCallbackFunctionId, expectedPayment);
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(drCoordinatorLinkBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.add(expectedPayment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.sub(expectedPayment),
    );
  });

  it("fulfills the request (case response is '0x')", async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
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
      .addFunds(context.drCoordinatorConsumerTH.address, maxPaymentAmount);
    // 4. Make consumer call DRCoordinator.requestData()
    await context.drCoordinatorConsumerTH
      .connect(signers.deployer)
      .requestNothing(
        context.drCoordinator.address,
        context.operator.address,
        spec.specId,
        spec.gasLimit,
        spec.minConfirmations,
        FulfillMode.FULFILL_DATA,
      );
    // 5. Prepare fulfillOracleRequest2 arguments
    const filteroperatorRequest = context.operator.filters.OracleRequest();
    const [eventoperatorRequest] = await context.operator.queryFilter(filteroperatorRequest);
    const { requestId, cancelExpiration } = eventoperatorRequest.args;
    const callbackFunctionId = "0x23905e15"; // 'fulfillData(bytes32,bytes)'
    const result = "0x"; // NB: emtpy string -> 0x
    const encodedResult = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, result]);
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, encodedResult]);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    const expectedPayment = BigNumber.from("64788438216430577");
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumerTHBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumerTH.address,
    );

    // Act & Assert
    const expectedCallbackFunctionId = "0xf43c62ab";
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
      .to.emit(context.drCoordinatorConsumerTH, "RequestFulfilledNothing")
      .withArgs(requestId, result)
      .to.emit(context.drCoordinator, "DRCoordinator__RequestFulfilled")
      .withArgs(requestId, true, context.drCoordinatorConsumerTH.address, expectedCallbackFunctionId, expectedPayment);
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(drCoordinatorLinkBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.add(expectedPayment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.sub(expectedPayment),
    );
  });

  it("fulfills the request (case external request)", async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
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
      .addFunds(context.drCoordinatorConsumerTH.address, maxPaymentAmount);
    // 4. Deploy a compatible fulfillment contract
    const genericFulfillmentTHFactory = await ethers.getContractFactory("GenericFulfillmentTestHelper");
    const genericFulfillmentTH = (await genericFulfillmentTHFactory
      .connect(signers.deployer)
      .deploy(context.linkToken.address)) as GenericFulfillmentTestHelper;
    await genericFulfillmentTH.deployTransaction.wait();
    const externalCallbackFunctionId = "0x7c1f72a0"; // 'fulfillUint256(bytes32,uint256)' function signature
    // 5. Make consumer call DRCoordinator.requestData()
    await context.drCoordinatorConsumerTH
      .connect(signers.deployer)
      .requestUint256Externally(
        context.drCoordinator.address,
        context.operator.address,
        spec.specId,
        spec.gasLimit,
        spec.minConfirmations,
        genericFulfillmentTH.address,
        externalCallbackFunctionId,
        FulfillMode.FULFILL_DATA,
      );
    // 5. Prepare fulfillOracleRequest2 arguments
    const filteroperatorRequest = context.operator.filters.OracleRequest();
    const [eventoperatorRequest] = await context.operator.queryFilter(filteroperatorRequest);
    const { requestId, cancelExpiration } = eventoperatorRequest.args;
    const callbackFunctionId = "0x23905e15"; // 'fulfillData(bytes32,bytes)'
    const result = BigNumber.from("777");
    const encodedResult = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "bool"],
      [requestId, result, false],
    );
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, encodedResult]);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    const expectedPayment = BigNumber.from("64354304486054787");
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumerTHBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumerTH.address,
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
      .to.emit(genericFulfillmentTH, "RequestFulfilledUint256")
      .withArgs(requestId, result)
      .to.emit(context.drCoordinator, "DRCoordinator__RequestFulfilled")
      .withArgs(requestId, true, genericFulfillmentTH.address, externalCallbackFunctionId, expectedPayment);
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(drCoordinatorLinkBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.add(expectedPayment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.sub(expectedPayment),
    );
  });
}
