import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import * as path from "path";

import { PERMIRYAD, PaymentType } from "../../../tasks/drcoordinator/constants";
import { generateSpecKey, getSpecItemConvertedMap, parseSpecsFile } from "../../../tasks/drcoordinator/methods";
import type { SpecItemConverted } from "../../../tasks/drcoordinator/types";
import { convertFunctionNametoSignature } from "../../../utils/abi";
import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testRequestData(signers: Signers, context: Context): void {
  const FIVE_MINUTES_IN_SECONDS = 60 * 5;
  const filePath = path.resolve(__dirname, "specs");
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts when DRCoordinator is paused", async function () {
    // Arrange
    const specId = "0x3233356262656361363566333434623762613862336166353031653433363232";
    const operatorAddr = context.operator.address;
    const callbackAddr = context.drCoordinatorConsumerTH.address;
    const callbackFunctionId = convertFunctionNametoSignature("fulfillUint256(bytes32,uint256,bool)");
    const chainlinkRequest = await context.drCoordinatorConsumerTH.initializeChainlinkRequest(
      specId,
      callbackAddr,
      callbackFunctionId,
    );
    const callbackGasLimit = 500_000;
    const callbackMinConfirmations = 3;
    await context.drCoordinator.connect(signers.owner).pause();

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .requestData(operatorAddr, callbackGasLimit, callbackMinConfirmations, chainlinkRequest),
    ).to.be.revertedWith("Pausable: paused");
  });

  // TODO: improve test if possible
  // NB: the reentrancy test below is a poor test due to the difficulty of asserting the
  // nonReentrant revert, as DRCoordinator.fulfillData() makes a low level call to the callback
  // function. Adding Hardhat console.log() in DRCoordinator.requestData() will help seeing the
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
    const expectedCallbackFunctionId = convertFunctionNametoSignature("attackRequestDataCall(bytes32,bytes)");
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
      .withArgs("attackRequestDataCall", false);
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

  it("reverts when Spec is not inserted", async function () {
    // Arrange
    const specId = "0x3233356262656361363566333434623762613862336166353031653433363232";
    const operatorAddr = context.operator.address;
    const callbackAddr = context.drCoordinatorConsumerTH.address;
    const callbackFunctionId = convertFunctionNametoSignature("fulfillUint256(bytes32,uint256,bool)");
    const chainlinkRequest = await context.drCoordinatorConsumerTH.initializeChainlinkRequest(
      specId,
      callbackAddr,
      callbackFunctionId,
    );
    const callbackGasLimit = 500_000;
    const callbackMinConfirmations = 3;

    // Act & Assert
    const expectedKey = generateSpecKey(operatorAddr, specId);
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .requestData(operatorAddr, callbackGasLimit, callbackMinConfirmations, chainlinkRequest),
    ).to.be.revertedWith(`DRCoordinator__SpecIsNotInserted("${expectedKey}")`);
  });

  it("reverts when callbackAddr is not a contract", async function () {
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
    // 2. Prepare DRCoordinator.requestDataViaFulfillData() args
    const operatorAddr = context.operator.address;
    const callbackAddr = signers.externalCaller.address;
    const callbackFunctionId = convertFunctionNametoSignature("fulfillUint256(bytes32,uint256,bool)");
    const chainlinkRequest = await context.drCoordinatorConsumerTH.initializeChainlinkRequest(
      specConverted.specId,
      callbackAddr,
      callbackFunctionId,
    );

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .requestData(operatorAddr, specConverted.gasLimit, specConverted.minConfirmations, chainlinkRequest),
    ).to.be.revertedWith(`DRCoordinator__CallbackAddrIsNotContract("${signers.externalCaller.address}")`);
  });

  it("reverts when callbackAddr is DRCoordinator address", async function () {
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
    // 2. Prepare DRCoordinator.requestDataViaFulfillData() args
    const operatorAddr = context.operator.address;
    const callbackAddr = context.drCoordinator.address;
    const callbackFunctionId = convertFunctionNametoSignature("fulfillUint256(bytes32,uint256,bool)");
    const chainlinkRequest = await context.drCoordinatorConsumerTH.initializeChainlinkRequest(
      specConverted.specId,
      callbackAddr,
      callbackFunctionId,
    );

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .requestData(operatorAddr, specConverted.gasLimit, specConverted.minConfirmations, chainlinkRequest),
    ).to.be.revertedWith("DRCoordinator__CallbackAddrIsDRCoordinator");
  });

  it("reverts when consumer (requester) has not been authorized to request the Spec", async function () {
    // Arrange
    // 1. Insert the Spec
    const maxRequestConfirmations = await context.drCoordinator.MAX_REQUEST_CONFIRMATIONS();
    const specs = parseSpecsFile(path.join(filePath, "file3.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
      spec.configuration.minConfirmations = maxRequestConfirmations;
    });
    const fileSpecMap = await getSpecItemConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;
    await context.drCoordinator.connect(signers.owner).setSpec(key, specConverted);
    // 2. Add the authorized consumers
    const authorizedConsumers = (fileSpecMap.get(key) as SpecItemConverted).specAuthorizedConsumers;
    await context.drCoordinator.connect(signers.owner).addSpecAuthorizedConsumers(key, authorizedConsumers);
    // 3. Prepare DRCoordinator.requestDataViaFulfillData() args
    const operatorAddr = context.operator.address;
    const callbackAddr = context.drCoordinatorConsumerTH.address;
    const callbackFunctionId = convertFunctionNametoSignature("fulfillUint256(bytes32,uint256,bool)");
    const chainlinkRequest = await context.drCoordinatorConsumerTH.initializeChainlinkRequest(
      specConverted.specId,
      callbackAddr,
      callbackFunctionId,
    );
    const callbackMinConfirmations = specConverted.minConfirmations + 1;

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .requestData(operatorAddr, specConverted.gasLimit, callbackMinConfirmations, chainlinkRequest),
    ).to.be.revertedWith(
      `DRCoordinator__CallerIsNotAuthorizedConsumer("${key}", "${operatorAddr}", "${specConverted.specId}")`,
    );
  });

  it("reverts when callbackMinConfirmations is greater than Spec.minConfirmations", async function () {
    // Arrange
    // 1. Insert the Spec
    const maxRequestConfirmations = await context.drCoordinator.MAX_REQUEST_CONFIRMATIONS();
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
      spec.configuration.minConfirmations = maxRequestConfirmations;
    });
    const fileSpecMap = await getSpecItemConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;
    await context.drCoordinator.connect(signers.owner).setSpec(key, specConverted);
    // 2. Prepare DRCoordinator.requestDataViaFulfillData() args
    const operatorAddr = context.operator.address;
    const callbackAddr = context.drCoordinatorConsumerTH.address;
    const callbackFunctionId = convertFunctionNametoSignature("fulfillUint256(bytes32,uint256,bool)");
    const chainlinkRequest = await context.drCoordinatorConsumerTH.initializeChainlinkRequest(
      specConverted.specId,
      callbackAddr,
      callbackFunctionId,
    );
    const callbackMinConfirmations = specConverted.minConfirmations + 1;

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .requestData(operatorAddr, specConverted.gasLimit, callbackMinConfirmations, chainlinkRequest),
    ).to.be.revertedWith(
      `DRCoordinator__CallbackMinConfirmationsIsGtSpecMinConfirmations(${callbackMinConfirmations}, ${specConverted.minConfirmations})`,
    );
  });

  it("reverts when callbackMinConfirmations is greater than Spec.gasLimit", async function () {
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
    // 2. Prepare DRCoordinator.requestDataViaFulfillData() args
    const operatorAddr = context.operator.address;
    const callbackAddr = context.drCoordinatorConsumerTH.address;
    const callbackFunctionId = convertFunctionNametoSignature("fulfillUint256(bytes32,uint256,bool)");
    const chainlinkRequest = await context.drCoordinatorConsumerTH.initializeChainlinkRequest(
      specConverted.specId,
      callbackAddr,
      callbackFunctionId,
    );
    const callbackGasLimit = specConverted.gasLimit + 1;

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .requestData(operatorAddr, callbackGasLimit, specConverted.minConfirmations, chainlinkRequest),
    ).to.be.revertedWith(
      `DRCoordinator__CallbackGasLimitIsGtSpecGasLimit(${callbackGasLimit}, ${specConverted.gasLimit})`,
    );
  });

  it("reverts when the caller's balance is zero", async function () {
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
    // 2. Calculate maxPaymentAmount
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator.calculateMaxPaymentAmount(
      weiPerUnitGas,
      0,
      specConverted.gasLimit,
      specConverted.feeType,
      specConverted.fee,
    );

    // Act & Assert
    await expect(
      context.drCoordinatorConsumerTH
        .connect(signers.externalCaller)
        .requestUint256(
          context.drCoordinator.address,
          context.operator.address,
          specConverted.specId,
          specConverted.gasLimit,
          specConverted.minConfirmations,
          {
            gasPrice: weiPerUnitGas,
          },
        ),
    ).to.be.revertedWith(
      `DRCoordinator__LinkBalanceIsInsufficient("${context.drCoordinatorConsumerTH.address}", 0, ${maxPaymentAmount})`,
    );
  });

  it("reverts when the caller's balance is not enough", async function () {
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
    // 2. Calculate maxPaymentAmount
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator.calculateMaxPaymentAmount(
      weiPerUnitGas,
      0,
      specConverted.gasLimit,
      specConverted.feeType,
      specConverted.fee,
    );
    // 3. Set consumer's LINK balance
    const paymentInEscrow = maxPaymentAmount.mul(specConverted.payment).div(PERMIRYAD);
    const consumerBalance = paymentInEscrow.sub("1");
    await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, paymentInEscrow);
    await context.drCoordinator
      .connect(signers.deployer)
      .addFunds(context.drCoordinatorConsumerTH.address, consumerBalance);

    // Act & Assert
    await expect(
      context.drCoordinatorConsumerTH
        .connect(signers.externalCaller)
        .requestUint256(
          context.drCoordinator.address,
          context.operator.address,
          specConverted.specId,
          specConverted.gasLimit,
          specConverted.minConfirmations,
          {
            gasPrice: weiPerUnitGas,
          },
        ),
    ).to.be.revertedWith(
      `DRCoordinator__LinkBalanceIsInsufficient("${context.drCoordinatorConsumerTH.address}", ${consumerBalance}, ${maxPaymentAmount})`,
    );
  });

  // NB: test sending an operator request for each kind of paymentType at least once
  const testCases = [
    {
      name: "paymentType is PaymentType.FLAT, and payment is 0 LINK",
      testData: {
        paymentType: PaymentType.FLAT,
        payment: BigNumber.from("0").toString(), // 0 LINK flat
      },
    },
    {
      name: "paymentType is PaymentType.FLAT, and payment is 0.1 LINK",
      testData: {
        paymentType: PaymentType.FLAT,
        payment: BigNumber.from("1").pow("17").toString(), // 0.1 LINK flat
      },
    },
    {
      name: "paymentType is PaymentType.PERMIRYAD, and payment is 0% (from Max LINK payment)",
      testData: {
        paymentType: PaymentType.PERMIRYAD,
        payment: BigNumber.from("0").toString(), // 0% of Max LINK payment
      },
    },
    {
      name: "paymentType is PaymentType.PERMIRYAD, and payment is 10% (from Max LINK payment)",
      testData: {
        paymentType: PaymentType.PERMIRYAD,
        payment: BigNumber.from("1000").toString(), // 10% of Max LINK payment
      },
    },
  ];
  for (const { name, testData } of testCases) {
    it(`sends an operator request (${name})`, async function () {
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
      // 2. Calculate maxPaymentAmount
      const weiPerUnitGas = BigNumber.from("2500000000");
      const maxPaymentAmount = await context.drCoordinator.calculateMaxPaymentAmount(
        weiPerUnitGas,
        0,
        specConverted.gasLimit,
        specConverted.feeType,
        specConverted.fee,
      );
      // 3. Set consumer's LINK balance
      await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, maxPaymentAmount);
      await context.drCoordinator
        .connect(signers.deployer)
        .addFunds(context.drCoordinatorConsumerTH.address, maxPaymentAmount);
      const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
      const operatorLinkBalanceBefore = await context.linkToken.balanceOf(context.operator.address);
      const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
      const drCoordinatorConsumerTHBalanceBefore = await context.drCoordinator.availableFunds(
        context.drCoordinatorConsumerTH.address,
      );
      const expectedCallbackFunctionId = convertFunctionNametoSignature("fulfillUint256(bytes32,uint256,bool)");

      // Act & Assert
      const expectedRequestId = "0x1bfce59c2e0d7e0f015eb02ec4e04de4e67a1fe1508a4420cfd49c650758abe6";
      const nowTs = Math.round(new Date().getTime() / 1000);
      await expect(
        context.drCoordinatorConsumerTH
          .connect(signers.externalCaller)
          .requestUint256(
            context.drCoordinator.address,
            context.operator.address,
            specConverted.specId,
            specConverted.gasLimit,
            specConverted.minConfirmations,
            {
              gasPrice: weiPerUnitGas,
            },
          ),
      )
        .to.emit(context.drCoordinator, "ChainlinkRequested")
        .withArgs(expectedRequestId);
      // Check FulfillConfig
      // NB: Waffle can't check bignumbers on arrays via .to.have.ordered.members([])
      const fulfillConfig = await context.drCoordinator.getFulfillConfig(expectedRequestId);
      const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
      let paymentInEscrow: BigNumber;
      if (specConverted.paymentType === PaymentType.FLAT) {
        paymentInEscrow = specConverted.payment;
      } else if (specConverted.paymentType === PaymentType.PERMIRYAD) {
        paymentInEscrow = maxPaymentAmount.mul(specConverted.payment).div(PERMIRYAD);
      } else {
        throw new Error(`Unsupported 'paymentType': ${specConverted.paymentType}`);
      }
      expect(fulfillConfig.msgSender).to.equal(context.drCoordinatorConsumerTH.address);
      expect(fulfillConfig.payment).to.equal(paymentInEscrow);
      expect(fulfillConfig.callbackAddr).to.equal(context.drCoordinatorConsumerTH.address);
      expect(fulfillConfig.fee).to.equal(specConverted.fee);
      expect(fulfillConfig.minConfirmations).to.equal(specConverted.minConfirmations);
      expect(fulfillConfig.gasLimit).to.equal(specConverted.gasLimit + gasAfterPaymentCalculation);
      expect(fulfillConfig.feeType).to.equal(specConverted.feeType);
      expect(fulfillConfig.callbackFunctionId).to.equal(expectedCallbackFunctionId);
      expect(fulfillConfig.expiration).to.be.greaterThan(nowTs + FIVE_MINUTES_IN_SECONDS);
      // Check LINK balances
      const { payment } = fulfillConfig;
      expect(await context.linkToken.balanceOf(context.operator.address)).to.equal(
        operatorLinkBalanceBefore.add(payment),
      );
      expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(
        drCoordinatorLinkBalanceBefore.sub(payment),
      );
      expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
        drCoordinatorBalanceBefore,
      );
      expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
        drCoordinatorConsumerTHBalanceBefore.sub(payment),
      );
    });
  }

  it("sends an operator request by an authorized consumer", async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file3.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
    });
    const fileSpecMap = await getSpecItemConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;
    await context.drCoordinator.connect(signers.owner).setSpec(key, specConverted);
    // 2. Authorize the consumer
    const autorizedConsumers = (fileSpecMap.get(key) as SpecItemConverted).specAuthorizedConsumers.concat([
      context.drCoordinatorConsumerTH.address,
    ]);
    await context.drCoordinator.connect(signers.owner).addSpecAuthorizedConsumers(key, autorizedConsumers);
    // 3. Calculate maxPaymentAmount
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator.calculateMaxPaymentAmount(
      weiPerUnitGas,
      0,
      specConverted.gasLimit,
      specConverted.feeType,
      specConverted.fee,
    );
    // 4. Set consumer's LINK balance
    await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, maxPaymentAmount);
    await context.drCoordinator
      .connect(signers.deployer)
      .addFunds(context.drCoordinatorConsumerTH.address, maxPaymentAmount);
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const operatorLinkBalanceBefore = await context.linkToken.balanceOf(context.operator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumerTHBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumerTH.address,
    );
    const expectedRequestId = "0x1bfce59c2e0d7e0f015eb02ec4e04de4e67a1fe1508a4420cfd49c650758abe6";
    const nowTs = Math.round(new Date().getTime() / 1000);
    const expectedCallbackFunctionId = convertFunctionNametoSignature("fulfillUint256(bytes32,uint256,bool)");

    // Act & Assert
    await expect(
      context.drCoordinatorConsumerTH
        .connect(signers.externalCaller)
        .requestUint256(
          context.drCoordinator.address,
          context.operator.address,
          specConverted.specId,
          specConverted.gasLimit,
          specConverted.minConfirmations,
          {
            gasPrice: weiPerUnitGas,
          },
        ),
    )
      .to.emit(context.drCoordinator, "ChainlinkRequested")
      .withArgs(expectedRequestId);
    // Check FulfillConfig
    // NB: Waffle can't check bignumbers on arrays via .to.have.ordered.members([])
    const fulfillConfig = await context.drCoordinator.getFulfillConfig(expectedRequestId);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    const paymentInEscrow = maxPaymentAmount.mul(specConverted.payment).div(PERMIRYAD);
    expect(fulfillConfig.msgSender).to.equal(context.drCoordinatorConsumerTH.address);
    expect(fulfillConfig.payment).to.equal(paymentInEscrow);
    expect(fulfillConfig.callbackAddr).to.equal(context.drCoordinatorConsumerTH.address);
    expect(fulfillConfig.fee).to.equal(specConverted.fee);
    expect(fulfillConfig.minConfirmations).to.equal(specConverted.minConfirmations);
    expect(fulfillConfig.gasLimit).to.equal(specConverted.gasLimit + gasAfterPaymentCalculation);
    expect(fulfillConfig.feeType).to.equal(specConverted.feeType);
    expect(fulfillConfig.callbackFunctionId).to.equal(expectedCallbackFunctionId);
    expect(fulfillConfig.expiration).to.be.greaterThan(nowTs + FIVE_MINUTES_IN_SECONDS);
    // Check LINK balances
    const { payment } = fulfillConfig;
    expect(await context.linkToken.balanceOf(context.operator.address)).to.equal(
      operatorLinkBalanceBefore.add(payment),
    );
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(
      drCoordinatorLinkBalanceBefore.sub(payment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore,
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.sub(payment),
    );
  });

  it("sends an operator external request but fails notify the fulfillment contract", async function () {
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
    // 2. Calculate maxPaymentAmount
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator.calculateMaxPaymentAmount(
      weiPerUnitGas,
      0,
      specConverted.gasLimit,
      specConverted.feeType,
      specConverted.fee,
    );
    // 3. Set consumer's LINK balance
    await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, maxPaymentAmount);
    await context.drCoordinator
      .connect(signers.deployer)
      .addFunds(context.drCoordinatorConsumerTH.address, maxPaymentAmount);
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const operatorLinkBalanceBefore = await context.linkToken.balanceOf(context.operator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumerTHBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumerTH.address,
    );
    // 4. Set code on the fulfillment contract address
    const callbackAddr = context.linkToken.address; // NB: hardhat evm 'hardhat_setCode' does not work
    const callbackFunctionId = convertFunctionNametoSignature("fulfillUint256(bytes32,uint256)");
    const nowTs = Math.round(new Date().getTime() / 1000);

    // Act & Assert
    const expectedRequestId = "0x1bfce59c2e0d7e0f015eb02ec4e04de4e67a1fe1508a4420cfd49c650758abe6";
    await expect(
      context.drCoordinatorConsumerTH
        .connect(signers.externalCaller)
        .requestUint256Externally(
          context.drCoordinator.address,
          context.operator.address,
          specConverted.specId,
          specConverted.gasLimit,
          specConverted.minConfirmations,
          callbackAddr,
          callbackFunctionId,
          {
            gasPrice: weiPerUnitGas,
          },
        ),
    )
      // NB: only the latest event assertion will be checked due to this Waffle bug:
      // https://github.com/TrueFiEng/Waffle/issues/749
      // Nonetheless the ChainlinkRequested emitted event is asserted in the tests above
      // TODO: remove this comment once Waffle bug is fixed
      .to.emit(context.drCoordinator, "ChainlinkRequested")
      .withArgs(expectedRequestId)
      .to.emit(context.drCoordinator, "SetExternalPendingRequestFailed")
      .withArgs(callbackAddr, expectedRequestId, key);
    // Check FulfillConfig
    // NB: Waffle can't check bignumbers on arrays via .to.have.ordered.members([])
    const fulfillConfig = await context.drCoordinator.getFulfillConfig(expectedRequestId);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    const paymentInEscrow = maxPaymentAmount.mul(specConverted.payment).div(PERMIRYAD);
    expect(fulfillConfig.msgSender).to.equal(context.drCoordinatorConsumerTH.address);
    expect(fulfillConfig.payment).to.equal(paymentInEscrow);
    expect(fulfillConfig.callbackAddr).to.equal(callbackAddr);
    expect(fulfillConfig.fee).to.equal(specConverted.fee);
    expect(fulfillConfig.minConfirmations).to.equal(specConverted.minConfirmations);
    expect(fulfillConfig.gasLimit).to.equal(specConverted.gasLimit + gasAfterPaymentCalculation);
    expect(fulfillConfig.feeType).to.equal(specConverted.feeType);
    expect(fulfillConfig.callbackFunctionId).to.equal(callbackFunctionId);
    expect(fulfillConfig.expiration).to.be.greaterThan(nowTs + FIVE_MINUTES_IN_SECONDS);
    // Check LINK balances
    const { payment } = fulfillConfig;
    expect(await context.linkToken.balanceOf(context.operator.address)).to.equal(
      operatorLinkBalanceBefore.add(payment),
    );
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(
      drCoordinatorLinkBalanceBefore.sub(payment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore,
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.sub(payment),
    );
  });

  it("sends an operator external request and notifies the fulfillment contract", async function () {
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
    // 2. Calculate maxPaymentAmount
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator.calculateMaxPaymentAmount(
      weiPerUnitGas,
      0,
      specConverted.gasLimit,
      specConverted.feeType,
      specConverted.fee,
    );
    // 3. Set consumer's LINK balance
    await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, maxPaymentAmount);
    await context.drCoordinator
      .connect(signers.deployer)
      .addFunds(context.drCoordinatorConsumerTH.address, maxPaymentAmount);
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const operatorLinkBalanceBefore = await context.linkToken.balanceOf(context.operator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumerTHBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumerTH.address,
    );
    const callbackFunctionId = convertFunctionNametoSignature("fulfillUint256(bytes32,uint256)");
    const expectedRequestId = "0x1bfce59c2e0d7e0f015eb02ec4e04de4e67a1fe1508a4420cfd49c650758abe6";
    const nowTs = Math.round(new Date().getTime() / 1000);

    // Act & Assert
    await expect(
      context.drCoordinatorConsumerTH
        .connect(signers.externalCaller)
        .requestUint256Externally(
          context.drCoordinator.address,
          context.operator.address,
          specConverted.specId,
          specConverted.gasLimit,
          specConverted.minConfirmations,
          context.drcGenericFulfillmentTH.address,
          callbackFunctionId,
          {
            gasPrice: weiPerUnitGas,
          },
        ),
    )
      // NB: only the latest event assertion will be checked due to this Waffle bug:
      // https://github.com/TrueFiEng/Waffle/issues/749
      // Nonetheless the ChainlinkRequested emitted event is asserted in the tests above
      // TODO: remove this comment once Waffle bug is fixed
      .to.emit(context.drCoordinator, "ChainlinkRequested")
      .withArgs(expectedRequestId)
      .to.not.emit(context.drCoordinator, "SetExternalPendingRequestFailed")
      .withArgs(context.drcGenericFulfillmentTH.address, expectedRequestId, key);
    // Check FulfillConfig
    // NB: Waffle can't check bignumbers on arrays via .to.have.ordered.members([])
    const fulfillConfig = await context.drCoordinator.getFulfillConfig(expectedRequestId);
    const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();
    const paymentInEscrow = maxPaymentAmount.mul(specConverted.payment).div(PERMIRYAD);
    expect(fulfillConfig.msgSender).to.equal(context.drCoordinatorConsumerTH.address);
    expect(fulfillConfig.payment).to.equal(paymentInEscrow);
    expect(fulfillConfig.callbackAddr).to.equal(context.drcGenericFulfillmentTH.address);
    expect(fulfillConfig.fee).to.equal(specConverted.fee);
    expect(fulfillConfig.minConfirmations).to.equal(specConverted.minConfirmations);
    expect(fulfillConfig.gasLimit).to.equal(specConverted.gasLimit + gasAfterPaymentCalculation);
    expect(fulfillConfig.feeType).to.equal(specConverted.feeType);
    expect(fulfillConfig.callbackFunctionId).to.equal(callbackFunctionId);
    expect(fulfillConfig.expiration).to.be.greaterThan(nowTs + FIVE_MINUTES_IN_SECONDS);
    // Check LINK balances
    const { payment } = fulfillConfig;
    expect(await context.linkToken.balanceOf(context.operator.address)).to.equal(
      operatorLinkBalanceBefore.add(payment),
    );
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(
      drCoordinatorLinkBalanceBefore.sub(payment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore,
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.sub(payment),
    );
  });
}
