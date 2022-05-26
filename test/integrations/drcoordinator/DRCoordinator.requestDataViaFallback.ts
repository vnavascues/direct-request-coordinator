import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import * as path from "path";

import type { Signers, Context } from "./DRCoordinator";
import { takeSnapshot, revertToSnapshot } from "../../helpers/snapshot";
import type { GenericFulfillmentTestHelper } from "../../../src/types";
import { FulfillMode } from "../../../tasks/drcoordinator/constants";
import { generateSpecKey, getSpecConvertedMap, parseSpecsFile } from "../../../tasks/drcoordinator/methods";
import type { SpecConverted } from "../../../tasks/drcoordinator/types";

export function testRequestDataViaFallback(signers: Signers, context: Context): void {
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
    const oracle = context.operator.address;
    const callbackAddr = context.drCoordinatorConsumerTH.address;
    const callbackFunctionId = "0x5e9b81e1";
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
        .requestDataViaFulfillData(oracle, callbackGasLimit, callbackMinConfirmations, chainlinkRequest),
    ).to.be.revertedWith("Pausable: paused");
  });

  it("reverts when oracle is not a contract", async function () {
    // Arrange
    const specId = "0x3233356262656361363566333434623762613862336166353031653433363232";
    const oracle = ethers.constants.AddressZero;
    const callbackAddr = context.drCoordinatorConsumerTH.address;
    const callbackFunctionId = "0x5e9b81e1";
    const chainlinkRequest = await context.drCoordinatorConsumerTH.initializeChainlinkRequest(
      specId,
      callbackAddr,
      callbackFunctionId,
    );
    const callbackGasLimit = 500_000;
    const callbackMinConfirmations = 3;

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .requestDataViaFulfillData(oracle, callbackGasLimit, callbackMinConfirmations, chainlinkRequest),
    ).to.be.revertedWith("DRCoordinator__OracleIsNotAContract");
  });

  it("reverts when specId is zero", async function () {
    // Arrange
    const specId = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const oracle = context.operator.address;
    const callbackAddr = context.drCoordinatorConsumerTH.address;
    const callbackFunctionId = "0x5e9b81e1";
    const chainlinkRequest = await context.drCoordinatorConsumerTH.initializeChainlinkRequest(
      specId,
      callbackAddr,
      callbackFunctionId,
    );
    const callbackGasLimit = 500_000;
    const callbackMinConfirmations = 3;

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .requestDataViaFulfillData(oracle, callbackGasLimit, callbackMinConfirmations, chainlinkRequest),
    ).to.be.revertedWith("DRCoordinator__SpecIdIsZero");
  });

  it("reverts when callbackAddr is not a contract", async function () {
    // Arrange
    const specId = "0x3233356262656361363566333434623762613862336166353031653433363232";
    const oracle = context.operator.address;
    const callbackAddr = ethers.constants.AddressZero;
    const callbackFunctionId = "0x5e9b81e1";
    const chainlinkRequest = await context.drCoordinatorConsumerTH.initializeChainlinkRequest(
      specId,
      callbackAddr,
      callbackFunctionId,
    );
    const callbackGasLimit = 500_000;
    const callbackMinConfirmations = 3;

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .requestDataViaFulfillData(oracle, callbackGasLimit, callbackMinConfirmations, chainlinkRequest),
    ).to.be.revertedWith("DRCoordinator__CallbackAddrIsNotAContract");
  });

  it("reverts when callbackAddr is DRCoordinator address", async function () {
    // Arrange
    const specId = "0x3233356262656361363566333434623762613862336166353031653433363232";
    const oracle = context.operator.address;
    const callbackAddr = context.drCoordinator.address;
    const callbackFunctionId = "0x5e9b81e1";
    const chainlinkRequest = await context.drCoordinatorConsumerTH.initializeChainlinkRequest(
      specId,
      callbackAddr,
      callbackFunctionId,
    );
    const callbackGasLimit = 500_000;
    const callbackMinConfirmations = 3;

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .requestDataViaFulfillData(oracle, callbackGasLimit, callbackMinConfirmations, chainlinkRequest),
    ).to.be.revertedWith("DRCoordinator__CallbackAddrIsDRCoordinator");
  });

  it("reverts when Spec is not inserted", async function () {
    // Arrange
    const specId = "0x3233356262656361363566333434623762613862336166353031653433363232";
    const oracle = context.operator.address;
    const callbackAddr = context.drCoordinatorConsumerTH.address;
    const callbackFunctionId = "0x5e9b81e1";
    const chainlinkRequest = await context.drCoordinatorConsumerTH.initializeChainlinkRequest(
      specId,
      callbackAddr,
      callbackFunctionId,
    );
    const callbackGasLimit = 500_000;
    const callbackMinConfirmations = 3;

    // Act & Assert
    const expectedKey = generateSpecKey(oracle, specId);
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .requestDataViaFulfillData(oracle, callbackGasLimit, callbackMinConfirmations, chainlinkRequest),
    ).to.be.revertedWith(`DRCoordinator__SpecIsNotInserted("${expectedKey}")`);
  });

  it("reverts when callbackMinConfirmations is greater than Spec.minConfirmations", async function () {
    // Arrange
    // 1. Insert the Spec
    const maxRequestConfirmations = await context.drCoordinator.MAX_REQUEST_CONFIRMATIONS();
    const specs = parseSpecsFile(path.join(filePath, "file2.json"));
    specs.forEach(spec => {
      spec.configuration.oracleAddr = context.operator.address; // NB: overwrite with the right contract address
      spec.configuration.minConfirmations = maxRequestConfirmations;
    });
    const fileSpecMap = await getSpecConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const spec = fileSpecMap.get(key) as SpecConverted;
    await context.drCoordinator.connect(signers.owner).setSpec(key, spec);
    // 2. Prepare DRCoordinator.requestDataViaFulfillData() args
    const oracle = context.operator.address;
    const callbackAddr = context.drCoordinatorConsumerTH.address;
    const callbackFunctionId = "0x5e9b81e1";
    const chainlinkRequest = await context.drCoordinatorConsumerTH.initializeChainlinkRequest(
      spec.specId,
      callbackAddr,
      callbackFunctionId,
    );
    const callbackMinConfirmations = spec.minConfirmations + 1;

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .requestDataViaFulfillData(oracle, spec.gasLimit, callbackMinConfirmations, chainlinkRequest),
    ).to.be.revertedWith(
      `DRCoordinator__MinConfirmationsIsGtSpecMinConfirmations(${callbackMinConfirmations}, ${spec.minConfirmations})`,
    );
  });

  it("reverts when callbackMinConfirmations is greater than Spec.gasLimit", async function () {
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
    // 2. Prepare DRCoordinator.requestDataViaFulfillData() args
    const oracle = context.operator.address;
    const callbackAddr = context.drCoordinatorConsumerTH.address;
    const callbackFunctionId = "0x5e9b81e1";
    const chainlinkRequest = await context.drCoordinatorConsumerTH.initializeChainlinkRequest(
      spec.specId,
      callbackAddr,
      callbackFunctionId,
    );
    const callbackGasLimit = spec.gasLimit + 1;

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .requestDataViaFulfillData(oracle, callbackGasLimit, spec.minConfirmations, chainlinkRequest),
    ).to.be.revertedWith(`DRCoordinator__GasLimitIsGtSpecGasLimit(${callbackGasLimit}, ${spec.gasLimit})`);
  });

  it("reverts when the caller's balance is zero", async function () {
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

    // Act & Assert
    await expect(
      context.drCoordinatorConsumerTH
        .connect(signers.externalCaller)
        .requestUint256(
          context.drCoordinator.address,
          context.operator.address,
          spec.specId,
          spec.gasLimit,
          spec.minConfirmations,
          FulfillMode.FALLBACK,
        ),
    ).to.be.revertedWith(`DRCoordinator__LinkBalanceIsZero`);
  });

  it("reverts when the caller's balance is not enough", async function () {
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
    // 2. Calculate maxPaymentAmount
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator.calculateMaxPaymentAmount(
      weiPerUnitGas,
      spec.payment,
      spec.gasLimit,
      spec.fulfillmentFee,
      spec.feeType,
    );
    // 3. Set consumer's LINK balance
    const consumerBalance = maxPaymentAmount.sub("1");
    await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, maxPaymentAmount);
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
          spec.specId,
          spec.gasLimit,
          spec.minConfirmations,
          FulfillMode.FALLBACK,
          {
            gasPrice: weiPerUnitGas,
          },
        ),
    ).to.be.revertedWith(`DRCoordinator__LinkBalanceIsInsufficient(${maxPaymentAmount}, ${consumerBalance})`);
  });

  it("sends an operator request", async function () {
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
    // 2. Calculate maxPaymentAmount
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator.calculateMaxPaymentAmount(
      weiPerUnitGas,
      spec.payment,
      spec.gasLimit,
      spec.fulfillmentFee,
      spec.feeType,
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

    // Act & Assert
    const expectedRequestId = "0x794239b5b2c74a8b53870f56a1a752b8fbe7e27f61d08f72a707159d2f44239a";
    await expect(
      context.drCoordinatorConsumerTH
        .connect(signers.externalCaller)
        .requestUint256(
          context.drCoordinator.address,
          context.operator.address,
          spec.specId,
          spec.gasLimit,
          spec.minConfirmations,
          FulfillMode.FALLBACK,
          {
            gasPrice: weiPerUnitGas,
          },
        ),
    )
      .to.emit(context.drCoordinator, "ChainlinkRequested")
      .withArgs(expectedRequestId);
    expect(await context.linkToken.balanceOf(context.operator.address)).to.equal(
      operatorLinkBalanceBefore.add(spec.payment),
    );
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(
      drCoordinatorLinkBalanceBefore.sub(spec.payment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore,
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.sub(spec.payment),
    );
  });

  it("sends an operator external request but fails notify the fulfillment contract", async function () {
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
    // 2. Calculate maxPaymentAmount
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator.calculateMaxPaymentAmount(
      weiPerUnitGas,
      spec.payment,
      spec.gasLimit,
      spec.fulfillmentFee,
      spec.feeType,
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
    const callbackFunctionId = "0x7c1f72a0"; // 'fulfillUint256(bytes32,uint256)' function signature

    // Act & Assert
    const expectedRequestId = "0x794239b5b2c74a8b53870f56a1a752b8fbe7e27f61d08f72a707159d2f44239a";
    await expect(
      context.drCoordinatorConsumerTH
        .connect(signers.externalCaller)
        .requestUint256Externally(
          context.drCoordinator.address,
          context.operator.address,
          spec.specId,
          spec.gasLimit,
          spec.minConfirmations,
          callbackAddr,
          callbackFunctionId,
          FulfillMode.FALLBACK,
          {
            gasPrice: weiPerUnitGas,
          },
        ),
    )
      .to.emit(context.drCoordinator, "ChainlinkRequested")
      .withArgs(expectedRequestId)
      .to.emit(context.drCoordinator, "DRCoordinator__SetChainlinkExternalRequestFailed")
      .withArgs(callbackAddr, expectedRequestId, key);
    expect(await context.linkToken.balanceOf(context.operator.address)).to.equal(
      operatorLinkBalanceBefore.add(spec.payment),
    );
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(
      drCoordinatorLinkBalanceBefore.sub(spec.payment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore,
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.sub(spec.payment),
    );
  });

  it("sends an operator external request and notifies the fulfillment contract", async function () {
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
    // 2. Calculate maxPaymentAmount
    const weiPerUnitGas = BigNumber.from("2500000000");
    const maxPaymentAmount = await context.drCoordinator.calculateMaxPaymentAmount(
      weiPerUnitGas,
      spec.payment,
      spec.gasLimit,
      spec.fulfillmentFee,
      spec.feeType,
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
    // 4. Deploy a compatible fulfillment contract
    const genericFulfillmentTHFactory = await ethers.getContractFactory("GenericFulfillmentTestHelper");
    const genericFulfillmentTH = (await genericFulfillmentTHFactory
      .connect(signers.deployer)
      .deploy(context.linkToken.address)) as GenericFulfillmentTestHelper;
    await genericFulfillmentTH.deployTransaction.wait();
    const callbackFunctionId = "0x7c1f72a0"; // 'fulfillUint256(bytes32,uint256)' function signature

    // Act & Assert
    const expectedRequestId = "0x794239b5b2c74a8b53870f56a1a752b8fbe7e27f61d08f72a707159d2f44239a";
    await expect(
      context.drCoordinatorConsumerTH
        .connect(signers.externalCaller)
        .requestUint256Externally(
          context.drCoordinator.address,
          context.operator.address,
          spec.specId,
          spec.gasLimit,
          spec.minConfirmations,
          genericFulfillmentTH.address,
          callbackFunctionId,
          FulfillMode.FALLBACK,
          {
            gasPrice: weiPerUnitGas,
          },
        ),
    )
      .to.emit(context.drCoordinator, "ChainlinkRequested")
      .withArgs(expectedRequestId)
      .to.not.emit(context.drCoordinator, "DRCoordinator__SetChainlinkExternalRequestFailed")
      .withArgs(genericFulfillmentTH.address, expectedRequestId, key);
    expect(await context.linkToken.balanceOf(context.operator.address)).to.equal(
      operatorLinkBalanceBefore.add(spec.payment),
    );
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(
      drCoordinatorLinkBalanceBefore.sub(spec.payment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore,
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.sub(spec.payment),
    );
  });
}
