import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import * as hardhat from "hardhat";
import * as path from "path";

import { PERMIRYAD, PaymentType } from "../../../tasks/drcoordinator/constants";
import { getSpecItemConvertedMap, parseSpecsFile } from "../../../tasks/drcoordinator/methods";
import type { SpecItemConverted } from "../../../tasks/drcoordinator/types";
import { convertFunctionNametoSignature } from "../../../utils/abi";
import { impersonateAccount, setAddressBalance, stopImpersonatingAccount } from "../../../utils/hre";
import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testFulfillData(signers: Signers, context: Context): void {
  const filePath = path.resolve(__dirname, "specs");
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    await stopImpersonatingAccount(hardhat, context.operator.address);
  });

  // TODO: improve test if possible
  // NB: the reentrancy test below is a poor test due to the difficulty of asserting the
  // nonReentrant revert, as DRCoordinator.fulfillData() makes a low level call to the callback
  // function. Adding Hardhat console.log() in DRCoordinator.fulfillData() will help seeing the
  // revert reason
  it("reverts in case reentrancy (check nonReentrant)", async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
    });
    const fileSpecMap = await getSpecItemConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;
    await context.drCoordinator.connect(signers.owner).setSpec(key, specConverted);
    // 2. Set LINK_TKN_FEED last answer
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("3490053626306509"));
    // 3. Set DRCoordinator's LINK balance (honeypot)
    const drCoordinatorLinkPot = BigNumber.from("777");
    await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, drCoordinatorLinkPot);
    await context.drCoordinator.connect(signers.deployer).addFunds(context.drCoordinator.address, drCoordinatorLinkPot);
    // 4. Set consumer's LINK balance
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, 0, specConverted.gasLimit, specConverted.feeType, specConverted.fee);
    await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, maxPaymentAmount);
    await context.drCoordinator
      .connect(signers.deployer)
      .addFunds(context.drCoordinatorAttackerTH.address, maxPaymentAmount);
    const expectedCallbackFunctionId = convertFunctionNametoSignature("attackFulfillDataCall(bytes32,bytes)");
    // 5. Make consumer call DRCoordinator.requestData()
    await context.drCoordinatorAttackerTH
      .connect(signers.deployer)
      .requestAttack(
        context.operator.address,
        specConverted.specId,
        specConverted.gasLimit,
        specConverted.minConfirmations,
        expectedCallbackFunctionId,
        {
          gasPrice: weiPerUnitGas,
        },
      );
    // 6. Prepare fulfillOracleRequest2 arguments
    const filterOperatorRequest = context.operator.filters.OracleRequest();
    const [eventOperatorRequest] = await context.operator.queryFilter(filterOperatorRequest);
    const { requestId, cancelExpiration, payment } = eventOperatorRequest.args;
    const callbackFunctionId = convertFunctionNametoSignature("fulfillData(bytes32,bytes)");
    const result = "0x"; // NB: emtpy string -> 0x
    const encodedResult = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, result]);
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, encodedResult]);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorAttackerTHBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorAttackerTH.address,
    );

    // Act & Assert
    await expect(
      context.operator
        .connect(signers.operatorSender)
        .fulfillOracleRequest2(
          requestId,
          payment,
          context.drCoordinator.address,
          callbackFunctionId,
          cancelExpiration,
          encodedData,
          {
            gasLimit: BigNumber.from(specConverted.gasLimit).add(gasAfterPaymentCalculation),
            gasPrice: weiPerUnitGas,
          },
        ),
    )
      .to.emit(context.drCoordinatorAttackerTH, "Attacked")
      .withArgs("attackFulfillDataCall", false);
    const filterChainlinkFulfilled = context.drCoordinator.filters.ChainlinkFulfilled();
    const [eventChainlinkFulfilled] = await context.drCoordinator.queryFilter(filterChainlinkFulfilled);
    const {
      requestId: cfRequestId,
      success: cfSuccess,
      callbackAddr: cfCallbackAddr,
      callbackFunctionId: cfCallbackFunctionId,
      payment: cfPayment,
    } = eventChainlinkFulfilled.args;
    expect(cfRequestId).to.equal(requestId);
    expect(cfSuccess).to.be.true;
    expect(cfCallbackAddr).to.equal(context.drCoordinatorAttackerTH.address);
    expect(cfCallbackFunctionId).to.equal(expectedCallbackFunctionId);
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(drCoordinatorLinkBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.add(cfPayment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorAttackerTH.address)).to.equal(
      drCoordinatorAttackerTHBalanceBefore.sub(cfPayment),
    );
  });

  it("reverts when DRCoordinator is paused", async function () {
    // Arrange
    const requestId = "0x794239b5b2c74a8b53870f56a1a752b8fbe7e27f61d08f72a707159d2f44239a";
    await context.drCoordinator.connect(signers.owner).pause();

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.externalCaller).fulfillData(requestId, "0x")).to.be.revertedWith(
      "Pausable: paused",
    );
  });

  it("reverts when the request is not pending", async function () {
    // Arrange
    const requestId = "0x794239b5b2c74a8b53870f56a1a752b8fbe7e27f61d08f72a707159d2f44239a";

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.externalCaller).fulfillData(requestId, "0x")).to.be.revertedWith(
      "DRCoordinator__RequestIsNotPending",
    );
  });

  it("reverts when the caller is not the request operator", async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
    });
    const fileSpecMap = await getSpecItemConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;
    await context.drCoordinator.connect(signers.owner).setSpec(key, specConverted);
    // 2. Set LINK_TKN_FEED last answer
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("3490053626306509"));
    // 3. Set consumer's LINK balance
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, 0, specConverted.gasLimit, specConverted.feeType, specConverted.fee);
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
        specConverted.specId,
        specConverted.gasLimit,
        specConverted.minConfirmations,
        {
          gasPrice: weiPerUnitGas,
        },
      );
    // 5. Get the requestId
    const filterOperatorRequest = context.operator.filters.OracleRequest();
    const [eventOperatorRequest] = await context.operator.queryFilter(filterOperatorRequest);
    const { requestId } = eventOperatorRequest.args;

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.externalCaller).fulfillData(requestId, "0x")).to.be.revertedWith(
      "DRCoordinator__CallerIsNotRequestOperator",
    );
  });

  it("reverts when the payment is greater than total LINK supply", async function () {
    // NB: from an Operator.sol point of view 'fulfillOracleRequest2()' can't revert, therefore
    // this test will directly call DRCoordinator.fulfillData() impersonating Operator.sol
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
    });
    const fileSpecMap = await getSpecItemConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;
    await context.drCoordinator.connect(signers.owner).setSpec(key, specConverted);
    // 2. Set LINK_TKN_FEED last answer
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("3490053626306509"));
    // 3. Set consumer's LINK balance
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, 0, specConverted.gasLimit, specConverted.feeType, specConverted.fee);
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
        specConverted.specId,
        specConverted.gasLimit,
        specConverted.minConfirmations,
        {
          gasPrice: weiPerUnitGas,
        },
      );
    // 5. Bottom ETH price to force revert due to payment > TOTAL_LINK_SUPPLY
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("1"));
    // 7. Impersonate Operator.sol to call DRCoordinator.fulfillData().
    // It requires to fund Operator.sol with ETH, requestId and data (bytes)
    const filterOperatorRequest = context.operator.filters.OracleRequest();
    const [eventOperatorRequest] = await context.operator.queryFilter(filterOperatorRequest);
    const { requestId } = eventOperatorRequest.args;
    const result = BigNumber.from("777");
    const encodedResult = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "bool"],
      [requestId, result, false],
    );
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, encodedResult]);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    await impersonateAccount(hardhat, context.operator.address);
    await setAddressBalance(hardhat, context.operator.address, BigNumber.from("10000000000000000000"));
    const operatorSigner = await ethers.getSigner(context.operator.address);

    // Act & Assert
    await expect(
      context.drCoordinator.connect(operatorSigner).fulfillData(requestId, encodedData, {
        gasLimit: BigNumber.from(specConverted.gasLimit).add(gasAfterPaymentCalculation),
      }),
      // NB: skipped payment arg check due to variability
    ).to.be.revertedWith(`DRCoordinator__LinkPaymentIsGtLinkTotalSupply`);
  });

  it("reverts when the consumer does not have enough balance (paymentInEscrow <= payment, consumer pays)", async function () {
    // NB: from an Operator.sol point of view 'fulfillOracleRequest2()' can't revert, therefore
    // this test will directly call DRCoordinator.fulfillData() impersonating Operator.sol
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
    });
    const fileSpecMap = await getSpecItemConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;
    await context.drCoordinator.connect(signers.owner).setSpec(key, specConverted);
    // 2. Set LINK_TKN_FEED last answer
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("3490053626306509"));
    // 3. Set consumer's LINK balance
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, 0, specConverted.gasLimit, specConverted.feeType, specConverted.fee);
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
        specConverted.specId,
        specConverted.gasLimit,
        specConverted.minConfirmations,
        {
          gasPrice: weiPerUnitGas,
        },
      );
    // 5. Withdraw consumer funds
    const availableFunds = await context.drCoordinator
      .connect(signers.externalCaller)
      .availableFunds(context.drCoordinatorConsumerTH.address);
    await context.drCoordinatorConsumerTH
      .connect(signers.deployer)
      .withdrawFunds(context.drCoordinator.address, context.drCoordinatorConsumerTH.address, availableFunds);
    // 6. Impersonate Operator.sol to call DRCoordinator.fulfillData().
    // It requires to fund Operator.sol with ETH, requestId and data (bytes)
    const filterOperatorRequest = context.operator.filters.OracleRequest();
    const [eventOperatorRequest] = await context.operator.queryFilter(filterOperatorRequest);
    const { requestId } = eventOperatorRequest.args;
    const result = BigNumber.from("777");
    const encodedResult = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "bool"],
      [requestId, result, false],
    );
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, encodedResult]);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    await impersonateAccount(hardhat, context.operator.address);
    await setAddressBalance(hardhat, context.operator.address, BigNumber.from("10000000000000000000"));
    const operatorSigner = await ethers.getSigner(context.operator.address);

    // Act & Assert
    await expect(
      context.drCoordinator.connect(operatorSigner).fulfillData(requestId, encodedData, {
        gasLimit: BigNumber.from(specConverted.gasLimit).add(gasAfterPaymentCalculation),
        gasPrice: weiPerUnitGas,
      }),
      // NB: skipped payment arg check due to variability
    ).to.be.revertedWith(`DRCoordinator__LinkBalanceIsInsufficient("${context.drCoordinatorConsumerTH.address}", 0`);
  });

  it("reverts when the consumer does not have enough balance (paymentInEscrow > payment, operator refunds)", async function () {
    // NB: from an Operator.sol point of view 'fulfillOracleRequest2()' can't revert, therefore
    // this test will directly call DRCoordinator.fulfillData() impersonating Operator.sol
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
      spec.configuration.payment = "10000"; // NB: put 100% in escrow, forcing refund logic
      spec.configuration.paymentType = PaymentType.PERMIRYAD;
    });
    const fileSpecMap = await getSpecItemConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;
    await context.drCoordinator.connect(signers.owner).setSpec(key, specConverted);
    // 2. Set LINK_TKN_FEED last answer
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("3490053626306509"));
    // 3. Set consumer's LINK balance
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, 0, specConverted.gasLimit, specConverted.feeType, specConverted.fee);
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
        specConverted.specId,
        specConverted.gasLimit,
        specConverted.minConfirmations,
        {
          gasPrice: weiPerUnitGas,
        },
      );
    // 5. Impersonate Operator.sol to call DRCoordinator.fulfillData().
    // It requires to fund Operator.sol with ETH, requestId and data (bytes)
    const filterOperatorRequest = context.operator.filters.OracleRequest();
    const [eventOperatorRequest] = await context.operator.queryFilter(filterOperatorRequest);
    const { requestId } = eventOperatorRequest.args;
    const result = BigNumber.from("777");
    const encodedResult = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "bool"],
      [requestId, result, false],
    );
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, encodedResult]);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    await impersonateAccount(hardhat, context.operator.address);
    await setAddressBalance(hardhat, context.operator.address, BigNumber.from("10000000000000000000"));
    const operatorSigner = await ethers.getSigner(context.operator.address);

    // Act & Assert
    await expect(
      context.drCoordinator.connect(operatorSigner).fulfillData(requestId, encodedData, {
        gasLimit: BigNumber.from(specConverted.gasLimit).add(gasAfterPaymentCalculation),
        gasPrice: weiPerUnitGas,
      }),
      // NB: skipped payment arg check due to variability
    ).to.be.revertedWith(`DRCoordinator__LinkBalanceIsInsufficient("${context.drCoordinator.address}", 0`);
  });

  it("fails to fulfill the request", async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
    });
    const fileSpecMap = await getSpecItemConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;
    await context.drCoordinator.connect(signers.owner).setSpec(key, specConverted);
    // 2. Set LINK_TKN_FEED last answer
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("3490053626306509"));
    // 3. Set consumer's LINK balance
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, 0, specConverted.gasLimit, specConverted.feeType, specConverted.fee);
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
        specConverted.specId,
        specConverted.gasLimit,
        specConverted.minConfirmations,
        {
          gasPrice: weiPerUnitGas,
        },
      );
    // 5. Prepare fulfillOracleRequest2 arguments
    const filterOperatorRequest = context.operator.filters.OracleRequest();
    const [eventOperatorRequest] = await context.operator.queryFilter(filterOperatorRequest);
    const { requestId, cancelExpiration, payment } = eventOperatorRequest.args;
    const callbackFunctionId = convertFunctionNametoSignature("fulfillData(bytes32,bytes)");
    const result = BigNumber.from("777");
    const encodedResult = ethers.utils.defaultAbiCoder.encode(
      ["bytes32", "uint256", "bool"],
      [requestId, result, true],
    );
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, encodedResult]);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumerTHBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumerTH.address,
    );
    const expectedCallbackFunctionId = convertFunctionNametoSignature("fulfillUint256(bytes32,uint256,bool)");

    // Act & Assert
    await expect(
      context.operator
        .connect(signers.operatorSender)
        .fulfillOracleRequest2(
          requestId,
          payment,
          context.drCoordinator.address,
          callbackFunctionId,
          cancelExpiration,
          encodedData,
          {
            gasLimit: BigNumber.from(specConverted.gasLimit).add(gasAfterPaymentCalculation),
            gasPrice: weiPerUnitGas,
          },
        ),
    )
      // NB: only the latest event assertion will be checked due to this Waffle bug:
      // https://github.com/TrueFiEng/Waffle/issues/749
      // TODO: remove this comment once Waffle bug is fixed
      // NB: skip 'payment' arg check due to its variability.
      .to.emit(context.drCoordinator, "ChainlinkFulfilled");
    const filterChainlinkFulfilled = context.drCoordinator.filters.ChainlinkFulfilled();
    const [eventChainlinkFulfilled] = await context.drCoordinator.queryFilter(filterChainlinkFulfilled);
    const {
      requestId: cfRequestId,
      success: cfSuccess,
      callbackAddr: cfCallbackAddr,
      callbackFunctionId: cfCallbackFunctionId,
      payment: cfPayment,
    } = eventChainlinkFulfilled.args;
    expect(cfRequestId).to.equal(requestId);
    expect(cfSuccess).to.be.false;
    expect(cfCallbackAddr).to.equal(context.drCoordinatorConsumerTH.address);
    expect(cfCallbackFunctionId).to.equal(expectedCallbackFunctionId);
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(drCoordinatorLinkBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.add(cfPayment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.sub(cfPayment),
    );
  });

  // NB: test each fulfillment payer case: consumer or DRCoordinator
  const testCases = [
    {
      name: "paymentType is PaymentType.FLAT, and payment is 0 LINK (consumer pays)",
      testData: {
        paymentType: PaymentType.FLAT,
        payment: BigNumber.from("0").toString(), // 0 LINK flat
        isRefundCase: false,
      },
    },
    {
      name: "paymentType is PaymentType.FLAT, and payment is 0.05 LINK (consumer pays)",
      testData: {
        paymentType: PaymentType.FLAT,
        payment: BigNumber.from("5").pow("16").toString(), // 0.05 LINK flat
        isRefundCase: false,
      },
    },
    {
      name: "paymentType is PaymentType.FLAT, and payment is 20 LINK (DRCoordinator refunds)",
      testData: {
        paymentType: PaymentType.FLAT,
        payment: BigNumber.from("2").mul(BigNumber.from("10").pow("18")).toString(), // 20 LINK
        isRefundCase: true,
      },
    },
    {
      name: "paymentType is PaymentType.PERMIRYAD, and payment is 0% (consumer pays)",
      testData: {
        paymentType: PaymentType.PERMIRYAD,
        payment: BigNumber.from("0").toString(), // 0% of Max LINK payment
        isRefundCase: false,
      },
    },
    {
      name: "paymentType is PaymentType.PERMIRYAD, and payment is 10% (consumer pays)",
      testData: {
        paymentType: PaymentType.PERMIRYAD,
        payment: BigNumber.from("1000").toString(), // 10% of Max LINK payment
        isRefundCase: false,
      },
    },
    {
      name: "paymentType is PaymentType.PERMIRYAD, and payment is 100% (DRCoordinator refunds)",
      testData: {
        paymentType: PaymentType.PERMIRYAD,
        payment: BigNumber.from("10000").toString(), // 100% of Max LINK payment
        isRefundCase: true,
      },
    },
  ];
  for (const { name, testData } of testCases) {
    it(`fulfills the request (${name})`, async function () {
      // Arrange
      // 1. Insert the Spec
      const specs = parseSpecsFile(path.join(filePath, "file2.json"));
      specs.forEach(spec => {
        spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
        spec.configuration.paymentType = testData.paymentType;
        spec.configuration.payment = testData.payment;
      });
      const fileSpecMap = await getSpecItemConvertedMap(specs);
      const [key] = [...fileSpecMap.keys()];
      const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;
      await context.drCoordinator.connect(signers.owner).setSpec(key, specConverted);
      // 2. Set LINK_TKN_FEED last answer
      await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("3490053626306509"));
      // 3. Set consumer's LINK balance
      const weiPerUnitGas = BigNumber.from("2500000000");
      const maxPaymentAmount = await context.drCoordinator
        .connect(signers.externalCaller)
        .calculateMaxPaymentAmount(weiPerUnitGas, 0, specConverted.gasLimit, specConverted.feeType, specConverted.fee);
      // NB: calculate the max(maxPaymentAmount, spec.payment) if spec.paymentType is PaymentType.FLAT
      let maxRequiredAmount: BigNumber;
      if (specConverted.paymentType === PaymentType.FLAT) {
        maxRequiredAmount = maxPaymentAmount.gte(specConverted.payment) ? maxPaymentAmount : specConverted.payment;
      } else if (specConverted.paymentType === PaymentType.PERMIRYAD) {
        maxRequiredAmount = maxPaymentAmount;
      } else {
        throw new Error(`Unsupported 'paymentType': ${specConverted.paymentType}`);
      }
      await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, maxRequiredAmount);
      await context.drCoordinator
        .connect(signers.deployer)
        .addFunds(context.drCoordinatorConsumerTH.address, maxRequiredAmount);
      // 4. Set DRCoordinator's LINK balance (refund cases)
      if (testData.isRefundCase) {
        let drCoordinatorRefundAmount: BigNumber;
        if (specConverted.paymentType === PaymentType.FLAT) {
          drCoordinatorRefundAmount = specConverted.payment;
        } else if (specConverted.paymentType === PaymentType.PERMIRYAD) {
          drCoordinatorRefundAmount = maxPaymentAmount.add(maxPaymentAmount.mul(specConverted.payment.div(PERMIRYAD)));
        } else {
          throw new Error(`Unsupported 'paymentType': ${specConverted.paymentType}`);
        }
        await context.linkToken
          .connect(signers.deployer)
          .approve(context.drCoordinator.address, drCoordinatorRefundAmount);
        await context.drCoordinator
          .connect(signers.deployer)
          .addFunds(context.drCoordinator.address, drCoordinatorRefundAmount);
      }
      // 5. Make consumer call DRCoordinator.requestData()
      await context.drCoordinatorConsumerTH
        .connect(signers.deployer)
        .requestUint256(
          context.drCoordinator.address,
          context.operator.address,
          specConverted.specId,
          specConverted.gasLimit,
          specConverted.minConfirmations,
          {
            gasPrice: weiPerUnitGas,
          },
        );
      // 6. Prepare fulfillOracleRequest2 arguments
      const filterOperatorRequest = context.operator.filters.OracleRequest();
      const [eventOperatorRequest] = await context.operator.queryFilter(filterOperatorRequest);
      const { requestId, cancelExpiration, payment } = eventOperatorRequest.args;
      const callbackFunctionId = convertFunctionNametoSignature("fulfillData(bytes32,bytes)");
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
      const expectedCallbackFunctionId = convertFunctionNametoSignature("fulfillUint256(bytes32,uint256,bool)");

      // Act & Assert
      await expect(
        context.operator
          .connect(signers.operatorSender)
          .fulfillOracleRequest2(
            requestId,
            payment,
            context.drCoordinator.address,
            callbackFunctionId,
            cancelExpiration,
            encodedData,
            {
              gasLimit: BigNumber.from(specConverted.gasLimit).add(gasAfterPaymentCalculation),
              gasPrice: weiPerUnitGas,
            },
          ),
      )
        // NB: only the latest event assertion will be checked due to this Waffle bug:
        // https://github.com/TrueFiEng/Waffle/issues/749
        // TODO: remove this comment once Waffle bug is fixed
        .to.emit(context.drCoordinatorConsumerTH, "RequestFulfilledUint256")
        .withArgs(requestId, result)
        // NB: skip 'payment' arg check due to its variability.
        .to.emit(context.drCoordinator, "ChainlinkFulfilled");
      const filterChainlinkFulfilled = context.drCoordinator.filters.ChainlinkFulfilled();
      const [eventChainlinkFulfilled] = await context.drCoordinator.queryFilter(filterChainlinkFulfilled);
      const {
        requestId: cfRequestId,
        success: cfSuccess,
        callbackAddr: cfCallbackAddr,
        callbackFunctionId: cfCallbackFunctionId,
        payment: cfPayment,
      } = eventChainlinkFulfilled.args;
      expect(cfRequestId).to.equal(requestId);
      expect(cfSuccess).to.be.true;
      expect(cfCallbackAddr).to.equal(context.drCoordinatorConsumerTH.address);
      expect(cfCallbackFunctionId).to.equal(expectedCallbackFunctionId);
      expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(drCoordinatorLinkBalanceBefore);
      expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
        drCoordinatorBalanceBefore.add(cfPayment),
      );
      expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
        drCoordinatorConsumerTHBalanceBefore.sub(cfPayment),
      );
      if (testData.isRefundCase) {
        expect(cfPayment.lt(BigNumber.from("0"))).to.be.true;
      } else {
        expect(cfPayment.gt(BigNumber.from("0"))).to.be.true;
      }
    });
  }

  it("fulfills the request (case response is '0x')", async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
    });
    const fileSpecMap = await getSpecItemConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;
    await context.drCoordinator.connect(signers.owner).setSpec(key, specConverted);
    // 2. Set LINK_TKN_FEED last answer
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("3490053626306509"));
    // 3. Set consumer's LINK balance
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, 0, specConverted.gasLimit, specConverted.feeType, specConverted.fee);
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
        specConverted.specId,
        specConverted.gasLimit,
        specConverted.minConfirmations,
        {
          gasPrice: weiPerUnitGas,
        },
      );
    // 5. Prepare fulfillOracleRequest2 arguments
    const filterOperatorRequest = context.operator.filters.OracleRequest();
    const [eventOperatorRequest] = await context.operator.queryFilter(filterOperatorRequest);
    const { requestId, cancelExpiration, payment } = eventOperatorRequest.args;
    const callbackFunctionId = convertFunctionNametoSignature("fulfillData(bytes32,bytes)");
    const result = "0x"; // NB: emtpy string -> 0x
    const encodedResult = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, result]);
    const encodedData = ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [requestId, encodedResult]);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumerTHBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumerTH.address,
    );
    const expectedCallbackFunctionId = convertFunctionNametoSignature("fulfillNothing(bytes32,bytes)");

    // Act & Assert
    await expect(
      context.operator
        .connect(signers.operatorSender)
        .fulfillOracleRequest2(
          requestId,
          payment,
          context.drCoordinator.address,
          callbackFunctionId,
          cancelExpiration,
          encodedData,
          {
            gasLimit: BigNumber.from(specConverted.gasLimit).add(gasAfterPaymentCalculation),
            gasPrice: weiPerUnitGas,
          },
        ),
    )
      // NB: only the latest event assertion will be checked due to this Waffle bug:
      // https://github.com/TrueFiEng/Waffle/issues/749
      // TODO: remove this comment once Waffle bug is fixed
      .to.emit(context.drCoordinatorConsumerTH, "RequestFulfilledNothing")
      .withArgs(requestId, result)
      // NB: skip 'payment' arg check due to its variability.
      .to.emit(context.drCoordinator, "ChainlinkFulfilled");
    const filterChainlinkFulfilled = context.drCoordinator.filters.ChainlinkFulfilled();
    const [eventChainlinkFulfilled] = await context.drCoordinator.queryFilter(filterChainlinkFulfilled);
    const {
      requestId: cfRequestId,
      success: cfSuccess,
      callbackAddr: cfCallbackAddr,
      callbackFunctionId: cfCallbackFunctionId,
      payment: cfPayment,
    } = eventChainlinkFulfilled.args;
    expect(cfRequestId).to.equal(requestId);
    expect(cfSuccess).to.be.true;
    expect(cfCallbackAddr).to.equal(context.drCoordinatorConsumerTH.address);
    expect(cfCallbackFunctionId).to.equal(expectedCallbackFunctionId);
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(drCoordinatorLinkBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.add(cfPayment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.sub(cfPayment),
    );
  });

  it("fulfills the request (case external request)", async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
    });
    const fileSpecMap = await getSpecItemConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;
    await context.drCoordinator.connect(signers.owner).setSpec(key, specConverted);
    // 2. Set LINK_TKN_FEED last answer
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("3490053626306509"));
    // 3. Set consumer's LINK balance
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator
      .connect(signers.externalCaller)
      .calculateMaxPaymentAmount(weiPerUnitGas, 0, specConverted.gasLimit, specConverted.feeType, specConverted.fee);
    await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, maxPaymentAmount);
    await context.drCoordinator
      .connect(signers.deployer)
      .addFunds(context.drCoordinatorConsumerTH.address, maxPaymentAmount);
    // 4. Make consumer call DRCoordinator.requestData()
    const externalCallbackFunctionId = convertFunctionNametoSignature("fulfillUint256(bytes32,uint256)");
    await context.drCoordinatorConsumerTH
      .connect(signers.deployer)
      .requestUint256Externally(
        context.drCoordinator.address,
        context.operator.address,
        specConverted.specId,
        specConverted.gasLimit,
        specConverted.minConfirmations,
        context.drcGenericFulfillmentTH.address,
        externalCallbackFunctionId,
        {
          gasPrice: weiPerUnitGas,
        },
      );
    // 5. Prepare fulfillOracleRequest2 arguments
    const filterOperatorRequest = context.operator.filters.OracleRequest();
    const [eventOperatorRequest] = await context.operator.queryFilter(filterOperatorRequest);
    const { requestId, cancelExpiration, payment } = eventOperatorRequest.args;
    const callbackFunctionId = convertFunctionNametoSignature("fulfillData(bytes32,bytes)");
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
          payment,
          context.drCoordinator.address,
          callbackFunctionId,
          cancelExpiration,
          encodedData,
          {
            gasLimit: BigNumber.from(specConverted.gasLimit).add(gasAfterPaymentCalculation),
            gasPrice: weiPerUnitGas,
          },
        ),
    )
      // NB: only the latest event assertion will be checked due to this Waffle bug:
      // https://github.com/TrueFiEng/Waffle/issues/749
      // TODO: remove this comment once Waffle bug is fixed
      .to.emit(context.drcGenericFulfillmentTH, "RequestFulfilledUint256")
      .withArgs(requestId, result)
      // NB: skip 'payment' arg check due to its variability.
      .to.emit(context.drCoordinator, "ChainlinkFulfilled");
    const filterChainlinkFulfilled = context.drCoordinator.filters.ChainlinkFulfilled();
    const [eventChainlinkFulfilled] = await context.drCoordinator.queryFilter(filterChainlinkFulfilled);
    const {
      requestId: cfRequestId,
      success: cfSuccess,
      callbackAddr: cfCallbackAddr,
      callbackFunctionId: cfCallbackFunctionId,
      payment: cfPayment,
    } = eventChainlinkFulfilled.args;
    expect(cfRequestId).to.equal(requestId);
    expect(cfSuccess).to.be.true;
    expect(cfCallbackAddr).to.equal(context.drcGenericFulfillmentTH.address);
    expect(cfCallbackFunctionId).to.equal(externalCallbackFunctionId);
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(drCoordinatorLinkBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.add(cfPayment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.sub(cfPayment),
    );
  });
}
