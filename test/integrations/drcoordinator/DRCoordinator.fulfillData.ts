import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import * as path from "path";

import type { Signers, Context } from "./DRCoordinator";
import { takeSnapshot, revertToSnapshot } from "../../helpers/snapshot";
import { FulfillMode } from "../../../tasks/drcoordinator/constants";
import { getSpecConvertedMap, parseSpecsFile } from "../../../tasks/drcoordinator/methods";
import type { Overrides } from "../../../utils/types";
import { SpecConverted } from "../../../tasks/drcoordinator/types";

// TODO: test when _requireLinkTransferFrom() reverts (LINK.transferFrom fails)
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

  it("reverts when the caller does not have enough allowance", async function () {
    // TODO: from an Operator.sol point of view it can't revert. At the moment we do test `fulfillOracleRequest2` returns false
    // DRCoordinator__RequestFulfilled is not emitted. We should test
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
        FulfillMode.FULFILL_DATA,
      );
    // 4. Query the OracleRequest event from Operator.sol
    const filterOracleRequest = context.operator.filters.OracleRequest();
    const [eventOracleRequest] = await context.operator.queryFilter(filterOracleRequest);
    const { requestId, cancelExpiration } = eventOracleRequest.args;
    // 5. Undo LINK approval
    await context.drCoordinatorConsumer1TH
      .connect(signers.deployer)
      .approve(context.drCoordinator.address, BigNumber.from("0"));
    // 6. Prepare fulfillOracleRequest2 args
    const callbackFunctionSignature = "0x23905e15"; // 'fulfillData(bytes32,bytes)'
    const result = BigNumber.from("777");
    const encodedResult = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "bool"],
      [requestId, result, false],
    );
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, encodedResult]);
    const gasAfterPaymentCalculation = await context.drCoordinator.getGasAfterPaymentCalculation();

    // Act & Assert
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
    ).to.not.emit(context.drCoordinator, "DRCoordinator__RequestFulfilled");
    // TODO: alternatively test with these methods once hardhat supports them https://github.com/TrueFiEng/Waffle/issues/585
    // expect("allowance").to.be.calledOnContract(context.linkToken);
    // expect("balanceOf").to.not.be.calledOnContract(context.linkToken);
    // expect("transferFrom").to.not.be.calledOnContract(context.linkToken);
  });

  it("reverts when the caller does not have enough balance", async function () {
    // TODO: from an Operator.sol point of view it can't revert. At the moment we do test `fulfillOracleRequest2` returns false
    // DRCoordinator__RequestFulfilled is not emitted. We should test
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
        FulfillMode.FULFILL_DATA,
      );
    // 4. Query the OracleRequest event from Operator.sol
    const filterOracleRequest = context.operator.filters.OracleRequest();
    const [eventOracleRequest] = await context.operator.queryFilter(filterOracleRequest);
    const { requestId, cancelExpiration } = eventOracleRequest.args;
    // 5. Decrement LINK balance
    const availableFunds = await context.linkToken.balanceOf(context.drCoordinatorConsumer1TH.address);
    await context.drCoordinatorConsumer1TH.connect(signers.deployer).withdraw(signers.deployer.address, availableFunds);
    // 6. Prepare fulfillOracleRequest2 args
    const callbackFunctionSignature = "0x23905e15"; // 'fulfillData(bytes32,bytes)'
    const result = BigNumber.from("777");
    const encodedResult = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "bool"],
      [requestId, result, false],
    );
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, encodedResult]);
    const gasAfterPaymentCalculation = await context.drCoordinator.getGasAfterPaymentCalculation();

    // Act & Assert
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
    ).to.not.emit(context.drCoordinator, "DRCoordinator__RequestFulfilled");
    // TODO: alternatively test with these methods once hardhat supports them https://github.com/TrueFiEng/Waffle/issues/585
    // expect("balanceOf").to.not.be.calledOnContract(context.linkToken);
    // expect("transferFrom").to.not.be.calledOnContract(context.linkToken);
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
    // 3. Take care on consumer LINK balance
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, spec.payment, spec.gasLimit, spec.fulfillmentFee, spec.feeType);
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
        FulfillMode.FULFILL_DATA,
      );
    // 4. Prepare fulfillOracleRequest2 arguments
    const filterOracleRequest = context.operator.filters.OracleRequest();
    const [eventOracleRequest] = await context.operator.queryFilter(filterOracleRequest);
    const { requestId, cancelExpiration } = eventOracleRequest.args;
    const callbackFunctionSignature = "0x23905e15"; // 'fulfillData(bytes32,bytes)'
    const result = BigNumber.from("777");
    const encodedResult = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "bool"],
      [requestId, result, true],
    );
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, encodedResult]);
    const gasAfterPaymentCalculation = await context.drCoordinator.getGasAfterPaymentCalculation();
    const expectedPayment = BigNumber.from("69901833857541766");
    const drCoordinatorBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorConsumer1THBalanceBefore = await context.linkToken.balanceOf(
      context.drCoordinatorConsumer1TH.address,
    );

    // Act & Assert
    const expectedCallbackFunctionSignature = "0x5e9b81e1";
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
      .to.emit(context.drCoordinator, "DRCoordinator__RequestFulfilled")
      .withArgs(
        requestId,
        false,
        context.drCoordinatorConsumer1TH.address,
        expectedCallbackFunctionSignature,
        expectedPayment,
      );
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.add(expectedPayment),
    );
    expect(await context.linkToken.balanceOf(context.drCoordinatorConsumer1TH.address)).to.equal(
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
    // 3. Take care on consumer LINK balance
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, spec.payment, spec.gasLimit, spec.fulfillmentFee, spec.feeType);
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
        FulfillMode.FULFILL_DATA,
      );
    // 4. Prepare fulfillOracleRequest2 arguments
    const filterOracleRequest = context.operator.filters.OracleRequest();
    const [eventOracleRequest] = await context.operator.queryFilter(filterOracleRequest);
    const { requestId, cancelExpiration } = eventOracleRequest.args;
    const callbackFunctionSignature = "0x23905e15"; // 'fulfillData(bytes32,bytes)'
    const result = BigNumber.from("777");
    const encodedResult = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "bool"],
      [requestId, result, false],
    );
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, encodedResult]);
    const gasAfterPaymentCalculation = await context.drCoordinator.getGasAfterPaymentCalculation();
    const expectedPayment = BigNumber.from("70957748864756142");
    const drCoordinatorBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorConsumer1THBalanceBefore = await context.linkToken.balanceOf(
      context.drCoordinatorConsumer1TH.address,
    );

    // Act & Assert
    const expectedCallbackFunctionSignature = "0x5e9b81e1";
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
      .to.emit(context.drCoordinator, "DRCoordinator__RequestFulfilled")
      .withArgs(
        requestId,
        true,
        context.drCoordinatorConsumer1TH.address,
        expectedCallbackFunctionSignature,
        expectedPayment,
      );
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.add(expectedPayment),
    );
    expect(await context.linkToken.balanceOf(context.drCoordinatorConsumer1TH.address)).to.equal(
      drCoordinatorConsumer1THBalanceBefore.sub(expectedPayment),
    );
  });

  it("fulfills the request (case response is '0x')", async function () {
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
    await context.linkToken
      .connect(signers.deployer)
      .transfer(context.drCoordinatorConsumer1TH.address, maxPaymentAmount);
    await context.drCoordinatorConsumer1TH
      .connect(signers.deployer)
      .approve(context.drCoordinator.address, maxPaymentAmount);
    // 3. Make consumer call DRCoordinator.requestData()
    await context.drCoordinatorConsumer1TH
      .connect(signers.deployer)
      .requestNothing(
        context.drCoordinator.address,
        context.operator.address,
        spec.specId,
        spec.gasLimit,
        spec.minConfirmations,
        FulfillMode.FULFILL_DATA,
      );
    // 4. Prepare fulfillOracleRequest2 arguments
    const filterOracleRequest = context.operator.filters.OracleRequest();
    const [eventOracleRequest] = await context.operator.queryFilter(filterOracleRequest);
    const { requestId, cancelExpiration } = eventOracleRequest.args;
    const callbackFunctionSignature = "0x23905e15"; // 'fulfillData(bytes32,bytes)'
    const result = "0x"; // NB: emtpy string -> 0x
    const encodedResult = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, result]);
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, encodedResult]);
    const gasAfterPaymentCalculation = await context.drCoordinator.getGasAfterPaymentCalculation();
    const expectedPayment = BigNumber.from("71337019541293234");
    const drCoordinatorBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorConsumer1THBalanceBefore = await context.linkToken.balanceOf(
      context.drCoordinatorConsumer1TH.address,
    );

    // Act & Assert
    const expectedCallbackFunctionSignature = "0xf43c62ab";
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
      .to.emit(context.drCoordinatorConsumer1TH, "RequestFulfilledNothing")
      .withArgs(requestId, result)
      .to.emit(context.drCoordinator, "DRCoordinator__RequestFulfilled")
      .withArgs(
        requestId,
        true,
        context.drCoordinatorConsumer1TH.address,
        expectedCallbackFunctionSignature,
        expectedPayment,
      );
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.add(expectedPayment),
    );
    expect(await context.linkToken.balanceOf(context.drCoordinatorConsumer1TH.address)).to.equal(
      drCoordinatorConsumer1THBalanceBefore.sub(expectedPayment),
    );
  });
}
