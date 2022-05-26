import { expect } from "chai";
import { BigNumber } from "ethers";
import { artifacts, ethers, waffle } from "hardhat";

import type { Signers, Context } from "./DRCoordinator";
import { takeSnapshot, revertToSnapshot } from "../../helpers/snapshot";
import { increaseTo } from "../../helpers/time";
import type { DRCoordinator } from "../../../src/types";

export function testGetFeedData(signers: Signers, context: Context): void {
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts if the answer from the feed is not greater than zero", async function () {
    // Arrange
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("0"));

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.externalCaller).getFeedData()).to.be.revertedWith(
      "DRCoordinator__FeedAnswerIsNotGtZero",
    );
  });

  it("returns the answer from the feed", async function () {
    // Arrange
    const expectedFeedAnswer = BigNumber.from("3490053626306509");
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(expectedFeedAnswer);

    // Act & Assert
    expect(await context.drCoordinator.connect(signers.externalCaller).getFeedData()).to.equal(expectedFeedAnswer);
  });

  it("returns the 's_fallbackWeiPerUnitLink'", async function () {
    // Arrange
    const stalenessSeconds = await context.drCoordinator.connect(signers.externalCaller).getStalenessSeconds();
    const nowTs = Math.round(new Date().getTime() / 1000);
    const staleTs = nowTs + stalenessSeconds.toNumber() + 1;
    const feedAnswer = BigNumber.from("3490053626306509");
    await context.mockV3Aggregator.connect(signers.deployer).updateRoundData("1", feedAnswer, nowTs, nowTs);
    await increaseTo(staleTs); // NB: force block.timestamp - timestamp > stalenessSeconds

    // Act & Assert
    expect(stalenessSeconds).to.be.gt(BigNumber.from("0"));
    const expectedAnswer = await context.drCoordinator.connect(signers.externalCaller).getFallbackWeiPerUnitLink();
    const weiPerUnitLink = await context.drCoordinator.connect(signers.externalCaller).getFeedData();
    expect(weiPerUnitLink).to.equal(expectedAnswer).to.not.equal(feedAnswer);
  });

  it("returns the 's_fallbackWeiPerUnitLink' if L2 Sequencer is offline", async function () {
    // Arrange
    // Mock Flags and its response
    const sequencerFlag = "chainlink.flags.arbitrum-seq-offline";
    const flagsArtifact = await artifacts.readArtifact("Flags");
    const mockFlags = await waffle.deployMockContract(signers.deployer, flagsArtifact.abi);
    await mockFlags.mock.getFlag.returns(true);
    // Deploy DRCoordinator
    const description = "Testing DRCoordinator";
    const fallbackWeiPerUnitLink = BigNumber.from("8000000000000000");
    const stalenessSeconds = BigNumber.from("86400");
    const isSequencerDependant = true;
    const chainlinkFlags = mockFlags.address;
    const drCoordinatorFactory = await ethers.getContractFactory("DRCoordinator");
    const drCoordinator = (await drCoordinatorFactory
      .connect(signers.deployer)
      .deploy(
        context.linkToken.address,
        context.mockV3Aggregator.address,
        description,
        fallbackWeiPerUnitLink,
        stalenessSeconds,
        isSequencerDependant,
        sequencerFlag,
        chainlinkFlags,
      )) as DRCoordinator;
    await drCoordinator.deployTransaction.wait();
    // Update Aggregator answer
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("3490053626306509"));

    // Act & Assert
    expect(await drCoordinator.connect(signers.externalCaller).FLAG_SEQUENCER_OFFLINE()).to.equal(
      "0xa438451D6458044c3c8CD2f6f31c91ac882A6d91",
    );
    expect(await drCoordinator.connect(signers.externalCaller).getFeedData()).to.equal(fallbackWeiPerUnitLink);
  });
}
