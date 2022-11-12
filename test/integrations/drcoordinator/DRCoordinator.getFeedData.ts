import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import type { DRCoordinator, MockV3Aggregator } from "../../../src/types";
import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import { increaseTo } from "../../helpers/time";
import type { Context, Signers } from "./DRCoordinator";

export function testGetFeedData(signers: Signers, context: Context): void {
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("returns the 's_fallbackWeiPerUnitLink' if L2 Sequencer is offline", async function () {
    // Arrange
    // Mock L2 Sequencer Feed and its response
    const mockV3AggregatorFactory = await ethers.getContractFactory("MockV3Aggregator");
    const decimals = BigNumber.from("0");
    const initialAnswer = BigNumber.from("1");
    const mockL2SequencerFeed = (await mockV3AggregatorFactory
      .connect(signers.deployer)
      .deploy(decimals, initialAnswer)) as MockV3Aggregator;
    // Deploy DRCoordinator
    const addressLinkToken = context.linkToken.address;
    const isMultiPriceFeedDependant = false;
    const addressPriceFeed1 = context.mockV3Aggregator.address;
    const addressPriceFeed2 = ethers.constants.AddressZero;
    const description = "Testing DRCoordinator";
    const fallbackWeiPerUnitLink = BigNumber.from("8000000000000000");
    const stalenessSeconds = BigNumber.from("86400");
    const isSequencerDependant = true;
    const addressL2SequencerFeed = mockL2SequencerFeed.address;
    const l2SequencerGracePeriodSeconds = BigNumber.from("3600");
    const drCoordinatorFactory = await ethers.getContractFactory("DRCoordinator");
    const drCoordinator = (await drCoordinatorFactory
      .connect(signers.deployer)
      .deploy(
        addressLinkToken,
        isMultiPriceFeedDependant,
        addressPriceFeed1,
        addressPriceFeed2,
        description,
        fallbackWeiPerUnitLink,
        stalenessSeconds,
        isSequencerDependant,
        addressL2SequencerFeed,
        l2SequencerGracePeriodSeconds,
      )) as DRCoordinator;
    await drCoordinator.deployTransaction.wait();
    // Update Aggregator answer
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("3490053626306509"));

    // Act & Assert
    expect(await drCoordinator.connect(signers.externalCaller).getFeedData()).to.equal(fallbackWeiPerUnitLink);
  });

  it("returns the 's_fallbackWeiPerUnitLink' if L2 Sequencer answer timestamp is not greater than the grace period", async function () {
    // Arrange
    // Mock L2 Sequencer Feed and its response
    const mockV3AggregatorFactory = await ethers.getContractFactory("MockV3Aggregator");
    const decimals = BigNumber.from("0");
    const initialAnswer = BigNumber.from("0");
    const mockL2SequencerFeed = (await mockV3AggregatorFactory
      .connect(signers.deployer)
      .deploy(decimals, initialAnswer)) as MockV3Aggregator;
    // Deploy DRCoordinator
    const addressLinkToken = context.linkToken.address;
    const isMultiPriceFeedDependant = false;
    const addressPriceFeed1 = context.mockV3Aggregator.address;
    const addressPriceFeed2 = ethers.constants.AddressZero;
    const description = "Testing DRCoordinator";
    const fallbackWeiPerUnitLink = BigNumber.from("8000000000000000");
    const stalenessSeconds = BigNumber.from("86400");
    const isSequencerDependant = true;
    const addressL2SequencerFeed = mockL2SequencerFeed.address;
    const l2SequencerGracePeriodSeconds = BigNumber.from("3600");
    const drCoordinatorFactory = await ethers.getContractFactory("DRCoordinator");
    const drCoordinator = (await drCoordinatorFactory
      .connect(signers.deployer)
      .deploy(
        addressLinkToken,
        isMultiPriceFeedDependant,
        addressPriceFeed1,
        addressPriceFeed2,
        description,
        fallbackWeiPerUnitLink,
        stalenessSeconds,
        isSequencerDependant,
        addressL2SequencerFeed,
        l2SequencerGracePeriodSeconds,
      )) as DRCoordinator;
    await drCoordinator.deployTransaction.wait();
    // Update Aggregator answer
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("3490053626306509"));
    // Update L2Sequencer Feed data
    const nowTs = Math.round(new Date().getTime() / 1000);
    const staleTs = nowTs + l2SequencerGracePeriodSeconds.toNumber();
    await mockL2SequencerFeed.connect(signers.deployer).updateRoundData("1", "0", nowTs, nowTs);
    await increaseTo(staleTs); // NB: force block.timestamp - timestamp < stalenessSeconds

    // Act & Assert
    expect(await drCoordinator.connect(signers.externalCaller).getFeedData()).to.equal(fallbackWeiPerUnitLink);
  });

  it("reverts if the answer from the priceFeed1 is not greater than zero (single feed)", async function () {
    // Arrange
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("0"));

    // Act & Assert
    // TODO: Waffle revertedWith() on call() does not assert CustomErrors as expected (incl. params)
    // TODO: this test can be improved by asserting against the encoded data
    await expect(context.drCoordinator.connect(signers.externalCaller).getFeedData()).to.be.revertedWith(
      "DRCoordinator__FeedAnswerIsNotGtZero",
    );
  });

  it("returns the answer from the priceFeed1 (single feed)", async function () {
    // Arrange
    const expectedFeedAnswer = BigNumber.from("3490053626306509");
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(expectedFeedAnswer);

    // Act & Assert
    expect(await context.drCoordinator.connect(signers.externalCaller).getFeedData()).to.equal(expectedFeedAnswer);
  });

  it("returns the 's_fallbackWeiPerUnitLink' when the priceFeed1 answer is stale (single feed)", async function () {
    // Arrange
    const stalenessSeconds = await context.drCoordinator.connect(signers.externalCaller).getStalenessSeconds();
    const nowTs = Math.round(new Date().getTime() / 1000);
    const staleTs = nowTs + stalenessSeconds.toNumber() + 1;
    const feedAnswer = BigNumber.from("3490053626306509");
    await context.mockV3Aggregator.connect(signers.deployer).updateRoundData("1", feedAnswer, nowTs, nowTs);
    await increaseTo(staleTs); // NB: force block.timestamp - timestamp > stalenessSeconds
    const expectedAnswer = await context.drCoordinator.connect(signers.externalCaller).getFallbackWeiPerUnitLink();
    const weiPerUnitLink = await context.drCoordinator.connect(signers.externalCaller).getFeedData();

    // Act & Assert
    expect(stalenessSeconds).to.be.gt(BigNumber.from("0"));
    expect(weiPerUnitLink).to.equal(expectedAnswer).to.not.equal(feedAnswer);
  });

  it("reverts if the answer from the priceFeed2 is not greater than zero (multi feed)", async function () {
    // Arrange
    // 1. Deploy price feeds ETH/USD and LINK/USD
    const mockV3AggregatorFactory = await ethers.getContractFactory("MockV3Aggregator");
    const decimals = BigNumber.from("8");
    const initialAnswerEthUsd = BigNumber.from("157406571207");
    const mockV3AggregatorEthUsd = (await mockV3AggregatorFactory
      .connect(signers.deployer)
      .deploy(decimals, initialAnswerEthUsd)) as MockV3Aggregator;
    const initialAnswerLinkUsd = BigNumber.from("0"); // NB: not greater than zeros
    const mockV3AggregatorLinkUsd = (await mockV3AggregatorFactory
      .connect(signers.deployer)
      .deploy(decimals, initialAnswerLinkUsd)) as MockV3Aggregator;
    // 2. Deploy DRCoordinator (multi price feed dependant)
    const addressLinkToken = context.linkToken.address;
    const isMultiPriceFeedDependant = true; // NB: IS PRICE FEED DEPENDANT!
    const addressPriceFeed1 = mockV3AggregatorEthUsd.address;
    const addressPriceFeed2 = mockV3AggregatorLinkUsd.address;
    const descriptionDRC = "Testing DRCoordinator Multi Price Feed";
    const fallbackWeiPerUnitLink = BigNumber.from("8000000000000000");
    const stalenessSeconds = BigNumber.from("86400");
    const isSequencerDependant = false;
    const addressL2SequencerFeed = ethers.constants.AddressZero;
    const l2SequencerGracePeriodSeconds = BigNumber.from("0");
    const drCoordinatorFactory = await ethers.getContractFactory("DRCoordinator");
    const drCoordinator = (await drCoordinatorFactory
      .connect(signers.deployer)
      .deploy(
        addressLinkToken,
        isMultiPriceFeedDependant,
        addressPriceFeed1,
        addressPriceFeed2,
        descriptionDRC,
        fallbackWeiPerUnitLink,
        stalenessSeconds,
        isSequencerDependant,
        addressL2SequencerFeed,
        l2SequencerGracePeriodSeconds,
      )) as DRCoordinator;
    await drCoordinator.deployTransaction.wait();

    // Act & Assert
    // TODO: Waffle revertedWith() on call() does not assert CustomErrors as expected (incl. params)
    // TODO: this test can be improved by asserting against the encoded data
    await expect(drCoordinator.connect(signers.externalCaller).getFeedData()).to.be.revertedWith(
      `DRCoordinator__FeedAnswerIsNotGtZero`,
    );
  });

  it("returns the answer calculated using priceFeed1 and priceFeed2 (multi feed)", async function () {
    // Arrange
    // 1. Deploy price feeds ETH/USD and LINK/USD
    const mockV3AggregatorFactory = await ethers.getContractFactory("MockV3Aggregator");
    const decimals = BigNumber.from("8");
    const initialAnswerEthUsd = BigNumber.from("157406571207");
    const mockV3AggregatorEthUsd = (await mockV3AggregatorFactory
      .connect(signers.deployer)
      .deploy(decimals, initialAnswerEthUsd)) as MockV3Aggregator;
    const initialAnswerLinkUsd = BigNumber.from("744339991"); // NB: not greater than zeros
    const mockV3AggregatorLinkUsd = (await mockV3AggregatorFactory
      .connect(signers.deployer)
      .deploy(decimals, initialAnswerLinkUsd)) as MockV3Aggregator;
    // 2. Deploy DRCoordinator (multi price feed dependant)
    const addressLinkToken = context.linkToken.address;
    const isMultiPriceFeedDependant = true; // NB: IS PRICE FEED DEPENDANT!
    const addressPriceFeed1 = mockV3AggregatorEthUsd.address;
    const addressPriceFeed2 = mockV3AggregatorLinkUsd.address;
    const descriptionDRC = "Testing DRCoordinator Multi Price Feed";
    const fallbackWeiPerUnitLink = BigNumber.from("8000000000000000");
    const stalenessSeconds = BigNumber.from("86400");
    const isSequencerDependant = false;
    const addressL2SequencerFeed = ethers.constants.AddressZero;
    const l2SequencerGracePeriodSeconds = BigNumber.from("0");
    const drCoordinatorFactory = await ethers.getContractFactory("DRCoordinator");
    const drCoordinator = (await drCoordinatorFactory
      .connect(signers.deployer)
      .deploy(
        addressLinkToken,
        isMultiPriceFeedDependant,
        addressPriceFeed1,
        addressPriceFeed2,
        descriptionDRC,
        fallbackWeiPerUnitLink,
        stalenessSeconds,
        isSequencerDependant,
        addressL2SequencerFeed,
        l2SequencerGracePeriodSeconds,
      )) as DRCoordinator;
    await drCoordinator.deployTransaction.wait();
    const expectedWeiPerUnitLink = BigNumber.from("4728773298931363"); // NB: 0.004728773298931363 LINK/ETH

    // Act & Assert
    expect(await drCoordinator.connect(signers.externalCaller).getFeedData()).to.equal(expectedWeiPerUnitLink);
  });

  it("returns the 's_fallbackWeiPerUnitLink' when the priceFeed2 answer is stale (multi feed)", async function () {
    // Arrange
    // 1. Deploy price feeds ETH/USD and LINK/USD
    const mockV3AggregatorFactory = await ethers.getContractFactory("MockV3Aggregator");
    const decimals = BigNumber.from("8");
    const initialAnswerEthUsd = BigNumber.from("157406571207");
    const mockV3AggregatorEthUsd = (await mockV3AggregatorFactory
      .connect(signers.deployer)
      .deploy(decimals, initialAnswerEthUsd)) as MockV3Aggregator;
    const initialAnswerLinkUsd = BigNumber.from("744339991"); // NB: not greater than zeros
    const mockV3AggregatorLinkUsd = (await mockV3AggregatorFactory
      .connect(signers.deployer)
      .deploy(decimals, initialAnswerLinkUsd)) as MockV3Aggregator;
    // 2. Deploy DRCoordinator (multi price feed dependant)
    const addressLinkToken = context.linkToken.address;
    const isMultiPriceFeedDependant = true; // NB: IS PRICE FEED DEPENDANT!
    const addressPriceFeed1 = mockV3AggregatorEthUsd.address;
    const addressPriceFeed2 = mockV3AggregatorLinkUsd.address;
    const descriptionDRC = "Testing DRCoordinator Multi Price Feed";
    const fallbackWeiPerUnitLink = BigNumber.from("8000000000000000");
    const stalenessSeconds = BigNumber.from("86400");
    const isSequencerDependant = false;
    const addressL2SequencerFeed = ethers.constants.AddressZero;
    const l2SequencerGracePeriodSeconds = BigNumber.from("0");
    const drCoordinatorFactory = await ethers.getContractFactory("DRCoordinator");
    const drCoordinator = (await drCoordinatorFactory
      .connect(signers.deployer)
      .deploy(
        addressLinkToken,
        isMultiPriceFeedDependant,
        addressPriceFeed1,
        addressPriceFeed2,
        descriptionDRC,
        fallbackWeiPerUnitLink,
        stalenessSeconds,
        isSequencerDependant,
        addressL2SequencerFeed,
        l2SequencerGracePeriodSeconds,
      )) as DRCoordinator;
    await drCoordinator.deployTransaction.wait();
    // 3. Set timestamp-dependant properties
    const nowTs = Math.round(new Date().getTime() / 1000);
    const staleTs = nowTs + stalenessSeconds.toNumber() + 1;
    await mockV3AggregatorLinkUsd.connect(signers.deployer).updateRoundData("1", initialAnswerLinkUsd, nowTs, nowTs);
    await increaseTo(staleTs); // NB: force block.timestamp - timestamp > stalenessSeconds
    const expectedAnswer = await drCoordinator.connect(signers.externalCaller).getFallbackWeiPerUnitLink();
    const weiPerUnitLink = await drCoordinator.connect(signers.externalCaller).getFeedData();

    // Act & Assert
    expect(stalenessSeconds).to.be.gt(BigNumber.from("0"));
    expect(weiPerUnitLink).to.equal(expectedAnswer).to.not.equal(initialAnswerLinkUsd);
  });
}
