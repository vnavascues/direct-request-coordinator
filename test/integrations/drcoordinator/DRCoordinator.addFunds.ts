import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import * as path from "path";

import { getSpecItemConvertedMap, parseSpecsFile } from "../../../tasks/drcoordinator/methods";
import type { SpecItemConverted } from "../../../tasks/drcoordinator/types";
import { convertFunctionNametoSignature } from "../../../utils/abi";
import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testAddFunds(signers: Signers, context: Context): void {
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
  // function. Adding Hardhat console.log() in DRCoordinator.addFunds() will help seeing the
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
    const expectedCallbackFunctionId = convertFunctionNametoSignature("attackAddFundsCall(bytes32,bytes)");
    // 5. Make consumer call DRCoordinator.requestData()
    await context.drCoordinatorAttackerTH
      .connect(signers.deployer)
      .requestAttack(
        context.operator.address,
        specConverted.specId,
        specConverted.gasLimit,
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
      .withArgs("attackAddFundsCall", false);
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

  it("reverts when the caller's allowance is not enough", async function () {
    // Arrange
    const amount = BigNumber.from("2");
    const allowance = amount.sub("1");
    await context.linkToken.connect(signers.externalCaller).approve(context.drCoordinator.address, allowance);

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.externalCaller).addFunds(context.drCoordinatorConsumerTH.address, amount),
    ).to.be.revertedWith(
      `DRCoordinator__LinkAllowanceIsInsufficient("${signers.externalCaller.address}", ${allowance}, ${amount})`,
    );
  });

  it("reverts when the caller's balance is not enough", async function () {
    // Arrange
    const amount = BigNumber.from("1");
    await context.linkToken.connect(signers.externalCaller).approve(context.drCoordinator.address, amount);

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.externalCaller).addFunds(context.drCoordinatorConsumerTH.address, amount),
    ).to.be.revertedWith(`DRCoordinator__LinkBalanceIsInsufficient("${signers.externalCaller.address}", 0, ${amount})`);
  });

  it("funds the consumer's LINK balance", async function () {
    // Arrange
    const amount = BigNumber.from("1");
    await context.linkToken.connect(signers.deployer).approve(context.drCoordinator.address, amount);
    const deployerLinkBalanceBefore = await context.linkToken.balanceOf(signers.deployer.address);
    const drCoordinatorConsumerTHLinkBalanceBefore = await context.linkToken.balanceOf(
      context.drCoordinatorConsumerTH.address,
    );
    const drCoordinatorLinkBalanceBefore = await context.linkToken.balanceOf(context.drCoordinator.address);
    const deployerBalanceBefore = await context.drCoordinator.availableFunds(signers.deployer.address);
    const drCoordinatorBalanceBefore = await context.drCoordinator.availableFunds(context.drCoordinator.address);
    const drCoordinatorConsumerTHBalanceBefore = await context.drCoordinator.availableFunds(
      context.drCoordinatorConsumerTH.address,
    );

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.deployer).addFunds(context.drCoordinatorConsumerTH.address, amount),
    )
      .to.emit(context.drCoordinator, "FundsAdded")
      .withArgs(signers.deployer.address, context.drCoordinatorConsumerTH.address, amount);
    // Check LINK balances in the LinkToken contract
    expect(await context.linkToken.balanceOf(signers.deployer.address)).to.equal(deployerLinkBalanceBefore.sub(amount));
    expect(await context.linkToken.balanceOf(context.drCoordinator.address)).to.equal(
      drCoordinatorLinkBalanceBefore.add(amount),
    );
    expect(await context.linkToken.balanceOf(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHLinkBalanceBefore,
    );
    // Check LINK balances in the DRCoordinator contract
    expect(await context.drCoordinator.availableFunds(signers.deployer.address)).to.equal(deployerBalanceBefore);
    expect(await context.drCoordinator.availableFunds(context.drCoordinator.address)).to.equal(
      drCoordinatorBalanceBefore,
    );
    expect(await context.drCoordinator.availableFunds(context.drCoordinatorConsumerTH.address)).to.equal(
      drCoordinatorConsumerTHBalanceBefore.add(amount),
    );
  });
}
