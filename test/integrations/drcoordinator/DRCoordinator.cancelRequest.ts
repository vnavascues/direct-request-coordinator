import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import * as path from "path";

import { PERMIRYAD } from "../../../tasks/drcoordinator/constants";
import { getSpecItemConvertedMap, parseSpecsFile } from "../../../tasks/drcoordinator/methods";
import type { SpecItemConverted } from "../../../tasks/drcoordinator/types";
import { convertFunctionNametoSignature } from "../../../utils/abi";
import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import { increaseTo } from "../../helpers/time";
import type { Context, Signers } from "./DRCoordinator";

export function testCancelRequest(signers: Signers, context: Context): void {
  const filePath = path.resolve(__dirname, "specs");
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  // TODO: improve test if possible
  // NB: the reentrancy test below is a poor test due to the difficulty of asserting the
  // nonReentrant revert, as DRCoordinator.fulfillData() makes a low level call to the callback
  // function. Adding Hardhat console.log() in DRCoordinator.cancelRequest() will help seeing the
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
    const expectedCallbackFunctionId = convertFunctionNametoSignature("attackCancelRequestCall(bytes32,bytes)");
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
      .withArgs("attackCancelRequestCall", false);
    const filterChainlinkFulfilled = context.drCoordinator.filters.ChainlinkFulfilled();
    const [eventChainlinkFulfilled] = await context.drCoordinator.queryFilter(filterChainlinkFulfilled);
    const {
      requestId: cfRequestId,
      success: cfSuccess,
      callbackAddr: cfCallbackAddr,
      callbackFunctionId: cfCallbackFunctionId,
      initialPayment: cfInitialPayment,
      spotPayment: cfSpotPayment,
    } = eventChainlinkFulfilled.args;
    expect(cfRequestId).to.equal(requestId);
    expect(cfSuccess).to.be.true;
    expect(cfCallbackAddr).to.equal(context.drCoordinatorAttackerTH.address);
    expect(cfCallbackFunctionId).to.equal(expectedCallbackFunctionId);
    expect(cfInitialPayment).to.equal(payment);
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(drCoordinatorLinkBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.add(cfSpotPayment),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorAttackerTH.address)).to.equal(
      drCoordinatorAttackerTHBalanceBefore.sub(cfSpotPayment),
    );
  });

  it("reverts when the request is not pending (does not exist in s_requestIdToFulfillConfig)", async function () {
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
    // 4. Make a request via requestUint56
    await context.drCoordinatorConsumerTH
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
      );
    // 5. Query the operatorRequest event from Operator.sol
    const filterOperatorRequest = context.operator.filters.OracleRequest();
    const [eventOperatorRequest] = await context.operator.queryFilter(filterOperatorRequest);
    const { cancelExpiration } = eventOperatorRequest.args;
    const fiveMinutesTs = 60 * 5;
    await increaseTo(cancelExpiration.add(BigNumber.from(fiveMinutesTs)));

    // Act & Assert
    const fakeRequestId = "0x8cea783ddfffed7f4d2dea253ada929b97bc33cc32915207fd8ef2fd9407bfd8";
    await expect(context.drCoordinator.connect(signers.externalCaller).cancelRequest(fakeRequestId)).to.revertedWith(
      "DRCoordinator__RequestIsNotPending",
    );
  });

  it("reverts when the caller is not the request operator (or 'requestId' does not belong to a pending request)", async function () {
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
    // 4. Make a request via requestUint56
    await context.drCoordinatorConsumerTH
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
      );
    // 5. Query the operatorRequest event from Operator.sol
    const filterOperatorRequest = context.operator.filters.OracleRequest();
    const [eventOperatorRequest] = await context.operator.queryFilter(filterOperatorRequest);
    const { requestId, cancelExpiration } = eventOperatorRequest.args;
    const fiveMinutesTs = 60 * 5;
    await increaseTo(cancelExpiration.add(BigNumber.from(fiveMinutesTs)));

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.externalCaller).cancelRequest(requestId)).to.revertedWith(
      `DRCoordinator__CallerIsNotRequester("${context.drCoordinatorConsumerTH.address}")`,
    );
  });

  it("cancels the request and refunds the caller", async function () {
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
    // 4. Make a request via requestUint56
    await context.drCoordinatorConsumerTH
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
      );
    // 5. Query the operatorRequest event from Operator.sol
    const filterOperatorRequest = context.operator.filters.OracleRequest();
    const [eventOperatorRequest] = await context.operator.queryFilter(filterOperatorRequest);
    const { requestId, cancelExpiration } = eventOperatorRequest.args;
    const fiveMinutesTs = 60 * 5;
    await increaseTo(cancelExpiration.add(BigNumber.from(fiveMinutesTs)));
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const operatorLinkBalanceBefore = await context.linkToken.balanceOf(context.operator.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumerTHBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumerTH.address,
    );

    // Act & Assert
    await expect(
      context.drCoordinatorConsumerTH
        .connect(signers.externalCaller)
        .cancelRequest(context.drCoordinator.address, requestId),
    )
      .to.emit(context.drCoordinator, "ChainlinkCancelled")
      .withArgs(requestId);
    const paymentInEscrow = maxPaymentAmount.mul(specConverted.payment).div(PERMIRYAD);
    expect(await context.linkToken.balanceOf(context.operator.address)).to.equal(
      operatorLinkBalanceBefore.sub(paymentInEscrow),
    );
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(
      drCoordinatorLinkBalanceBefore.add(paymentInEscrow),
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore,
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.add(paymentInEscrow),
    );
  });
}
