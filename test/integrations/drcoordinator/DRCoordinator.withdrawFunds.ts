import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import * as path from "path";

import { getSpecItemConvertedMap, parseSpecsFile } from "../../../tasks/drcoordinator/methods";
import type { SpecItemConverted } from "../../../tasks/drcoordinator/types";
import { convertFunctionNametoSignature } from "../../../utils/abi";
import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testWithdrawFunds(signers: Signers, context: Context): void {
  const CONSUMER_MAX_PAYMENT = BigNumber.from("0");
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
  // function. Adding Hardhat console.log() in DRCoordinator.withdrawFunds() will help seeing the
  // revert reason
  it("reverts in case reentrancy (check nonReentrant modifier)", async function () {
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
    const expectedCallbackFunctionId = convertFunctionNametoSignature("attackWithdrawFundsCall(bytes32,bytes)");
    // 5. Make consumer call DRCoordinator.requestData()
    await context.drCoordinatorAttackerTH
      .connect(signers.deployer)
      .requestAttack(
        context.operator.address,
        specConverted.specId,
        specConverted.gasLimit,
        CONSUMER_MAX_PAYMENT,
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
    const gasAfterPaymentCalculation = await context.drCoordinator.getGasAfterPaymentCalculation();
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
      .withArgs("attackWithdrawFundsCall", false);
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

  it("reverts when the caller's balance is not enough (caller is DRCoordinator's owner)", async function () {
    // Arrange
    const amount = BigNumber.from("1");

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.owner).withdrawFunds(signers.externalCaller.address, amount),
    ).to.be.revertedWith(`DRCoordinator__LinkBalanceIsInsufficient("${context.drCoordinator.address}", 0, ${amount})`);
  });

  it("reverts when the caller's balance is not enough (caller is not DRCoordinator's owner)", async function () {
    // Arrange
    const amount = BigNumber.from("1");

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.externalCaller).withdrawFunds(signers.externalCaller.address, amount),
    ).to.be.revertedWith(`DRCoordinator__LinkBalanceIsInsufficient("${signers.externalCaller.address}", 0, ${amount})`);
  });

  it("withdraws the LINK from the DRCoordinator's balance (caller is DRCoordinator's owner)", async function () {
    // Arrange
    // 1. Fund DRCoordinator's balances
    const amount = BigNumber.from("1");
    await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, amount);
    await context.drCoordinator.connect(signers.deployer).addFunds(context.drCoordinator.address, amount);
    // 2. Get deployer, DRCoordinatorConsumerTestHelper, and DRCoordinator balances before
    const deployerLinkBalanceBefore = await context.linkToken.balanceOf(signers.deployer.address);
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const externalCallerLinkBalanceBefore = await context.linkToken.balanceOf(signers.externalCaller.address);
    const deployerBalanceBefore = await context.drCoordinator.availableFunds(signers.deployer.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const externalCallerBalanceBefore = await context.drCoordinator.availableFunds(signers.externalCaller.address);

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).withdrawFunds(signers.externalCaller.address, amount))
      .to.emit(context.drCoordinator, "FundsWithdrawn")
      .withArgs(context.drCoordinator.address, signers.externalCaller.address, amount);
    // Check LINK balances in the LinkToken contract
    expect(await context.linkToken.balanceOf(signers.deployer.address)).to.equal(deployerLinkBalanceBefore);
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(
      drCoordinatorLinkBalanceBefore.sub(amount),
    );
    expect(await context.linkToken.balanceOf(signers.externalCaller.address)).to.equal(
      externalCallerLinkBalanceBefore.add(amount),
    );
    // Check LINK balances in the DRCoordinator contract
    expect(await context.drCoordinator.availableFunds(signers.deployer.address)).to.equal(deployerBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore.sub(amount),
    );
    expect(await context.drCoordinator.availableFunds(signers.externalCaller.address)).to.equal(
      externalCallerBalanceBefore,
    );
  });

  it("withdraws the LINK from the DRCoordinator's balance (caller is not DRCoordinator's owner)", async function () {
    // Arrange
    // 1. Fund DRCoordinator's balances
    const amount = BigNumber.from("1");
    await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, amount);
    await context.drCoordinator.connect(signers.deployer).addFunds(context.drCoordinatorConsumerTH.address, amount);
    // 2. Get deployer, DRCoordinatorConsumerTestHelper, and DRCoordinator balances before
    const deployerLinkBalanceBefore = await context.linkToken.balanceOf(signers.deployer.address);
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const drCoordinatorConsumerTHLinkBalanceBefore = await context.linkToken.balanceOf(
      context.drCoordinatorConsumerTH.address,
    );
    const deployerBalanceBefore = await context.drCoordinator.availableFunds(signers.deployer.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumerTHBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumerTH.address,
    );

    // Act & Assert
    await expect(
      context.drCoordinatorConsumerTH.withdrawFunds(
        context.drCoordinator.address,
        context.drCoordinatorConsumerTH.address,
        amount,
      ),
    )
      .to.emit(context.drCoordinator, "FundsWithdrawn")
      .withArgs(context.drCoordinatorConsumerTH.address, context.drCoordinatorConsumerTH.address, amount);
    // Check LINK balances in the LinkToken contract
    expect(await context.linkToken.balanceOf(signers.deployer.address)).to.equal(deployerLinkBalanceBefore);
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(
      drCoordinatorLinkBalanceBefore.sub(amount),
    );
    expect(await context.linkToken.balanceOf(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHLinkBalanceBefore.add(amount),
    );
    // Check LINK balances in the DRCoordinator contract
    expect(await context.drCoordinator.availableFunds(signers.deployer.address)).to.equal(deployerBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore,
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.sub(amount),
    );
  });
}
