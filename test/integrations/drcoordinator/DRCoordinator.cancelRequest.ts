import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import * as path from "path";

import type { Signers, Context } from "./DRCoordinator";
import { takeSnapshot, revertToSnapshot } from "../../helpers/snapshot";
import { increaseTo } from "../../helpers/time";
import { FulfillMode } from "../../../tasks/drcoordinator/constants";
import { getSpecConvertedMap, parseSpecsFile } from "../../../tasks/drcoordinator/methods";
import type { SpecConverted } from "../../../tasks/drcoordinator/types";

export function testCancelRequest(signers: Signers, context: Context): void {
  const filePath = path.resolve(__dirname, "specs");
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts when the request is not pending (does not exist in s_requestIdToFulfillConfig)", async function () {
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
    // 4. Make a request via requestUint56
    await context.drCoordinatorConsumerTH
      .connect(signers.externalCaller)
      .requestUint256(
        context.drCoordinator.address,
        context.operator.address,
        spec.specId,
        spec.gasLimit,
        spec.minConfirmations,
        FulfillMode.FULFILL_DATA,
        {
          gasPrice: weiPerUnitGas,
        },
      );
    // 5. Query the OracleRequest event from Operator.sol
    const filterOracleRequest = context.operator.filters.OracleRequest();
    const [eventOracleRequest] = await context.operator.queryFilter(filterOracleRequest);
    const { cancelExpiration } = eventOracleRequest.args;
    const fiveMinutesTs = 60 * 5;
    await increaseTo(cancelExpiration.add(BigNumber.from(fiveMinutesTs)));

    // Act & Assert
    const fakeRequestId = "0x8cea783ddfffed7f4d2dea253ada929b97bc33cc32915207fd8ef2fd9407bfd8";
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .cancelRequest(fakeRequestId, cancelExpiration, FulfillMode.FULFILL_DATA),
    ).to.revertedWith("DRCoordinator__RequestIsNotPending");
  });

  it("reverts when the caller is not the requester", async function () {
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
    // 4. Make a request via requestUint56
    await context.drCoordinatorConsumerTH
      .connect(signers.externalCaller)
      .requestUint256(
        context.drCoordinator.address,
        context.operator.address,
        spec.specId,
        spec.gasLimit,
        spec.minConfirmations,
        FulfillMode.FULFILL_DATA,
        {
          gasPrice: weiPerUnitGas,
        },
      );
    // 5. Query the OracleRequest event from Operator.sol
    const filterOracleRequest = context.operator.filters.OracleRequest();
    const [eventOracleRequest] = await context.operator.queryFilter(filterOracleRequest);
    const { requestId, cancelExpiration } = eventOracleRequest.args;
    const fiveMinutesTs = 60 * 5;
    await increaseTo(cancelExpiration.add(BigNumber.from(fiveMinutesTs)));

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .cancelRequest(requestId, cancelExpiration, FulfillMode.FULFILL_DATA),
    ).to.revertedWith("DRCoordinator__CallerIsNotRequester");
  });

  it("cancels the request and refunds the caller (case fulfillment via fallback())", async function () {
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
    // 4. Make a request via requestUint56
    await context.drCoordinatorConsumerTH
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
      );
    // 5. Query the OracleRequest event from Operator.sol
    const filterOracleRequest = context.operator.filters.OracleRequest();
    const [eventOracleRequest] = await context.operator.queryFilter(filterOracleRequest);
    const { requestId, cancelExpiration } = eventOracleRequest.args;
    const fiveMinutesTs = 60 * 5;
    await increaseTo(cancelExpiration.add(BigNumber.from(fiveMinutesTs)));
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const operatorLinkBalanceBefore = await context.linkToken.balanceOf(context.operator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumerTHBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumerTH.address,
    );

    // Act & Assert
    await context.drCoordinatorConsumerTH
      .connect(signers.externalCaller)
      .cancelRequest(context.drCoordinator.address, requestId, cancelExpiration, FulfillMode.FALLBACK);
    expect(await context.linkToken.balanceOf(context.operator.address)).to.equal(
      operatorLinkBalanceBefore.sub(spec.payment),
    );
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(
      drCoordinatorLinkBalanceBefore.add(spec.payment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore,
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.add(spec.payment),
    );
  });
  it("cancels the request and refunds the caller (case fulfillment via fulfillData())", async function () {
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
    // 4. Make a request via requestUint56
    await context.drCoordinatorConsumerTH
      .connect(signers.externalCaller)
      .requestUint256(
        context.drCoordinator.address,
        context.operator.address,
        spec.specId,
        spec.gasLimit,
        spec.minConfirmations,
        FulfillMode.FULFILL_DATA,
        {
          gasPrice: weiPerUnitGas,
        },
      );
    // 5. Query the OracleRequest event from Operator.sol
    const filterOracleRequest = context.operator.filters.OracleRequest();
    const [eventOracleRequest] = await context.operator.queryFilter(filterOracleRequest);
    const { requestId, cancelExpiration } = eventOracleRequest.args;
    const fiveMinutesTs = 60 * 5;
    await increaseTo(cancelExpiration.add(BigNumber.from(fiveMinutesTs)));
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const operatorLinkBalanceBefore = await context.linkToken.balanceOf(context.operator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumerTHBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumerTH.address,
    );

    // Act & Assert
    await context.drCoordinatorConsumerTH
      .connect(signers.externalCaller)
      .cancelRequest(context.drCoordinator.address, requestId, cancelExpiration, FulfillMode.FULFILL_DATA);
    expect(await context.linkToken.balanceOf(context.operator.address)).to.equal(
      operatorLinkBalanceBefore.sub(spec.payment),
    );
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(
      drCoordinatorLinkBalanceBefore.add(spec.payment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore,
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.add(spec.payment),
    );
  });
}
