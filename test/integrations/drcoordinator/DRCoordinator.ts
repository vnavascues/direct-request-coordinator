import type { Fixture } from "ethereum-waffle";
import { BigNumber } from "ethers";
import type { Wallet } from "ethers";
import { ethers } from "hardhat";

import type {
  DRCGenericFulfillmentTestHelper,
  DRCoordinator,
  DRCoordinatorAttackerTestHelper,
  DRCoordinatorConsumerTestHelper,
  LinkToken,
  MockV3Aggregator,
  Operator,
} from "../../../src/types";
import { getHDWalletSignersConsecutive } from "../../../utils/signers";
import { testAcceptOwnership } from "./DRCoordinator.acceptOwnership";
import { testAddFunds } from "./DRCoordinator.addFunds";
import { testAddSpecAuthorizedConsumers } from "./DRCoordinator.addSpecAuthorizedConsumers";
import { testAddSpecsAuthorizedConsumers } from "./DRCoordinator.addSpecsAuthorizedConsumers";
import { testCalculateMaxPaymentAmount } from "./DRCoordinator.calculateMaxPaymentAmount";
import { testCalculateSpotPaymentAmount } from "./DRCoordinator.calculateSpotPaymentAmount";
import { testCancelRequest } from "./DRCoordinator.cancelRequest";
import { testFulfillData } from "./DRCoordinator.fulfillData";
import { testGetFeedData } from "./DRCoordinator.getFeedData";
import { testPause } from "./DRCoordinator.pause";
import { testRemoveSpec } from "./DRCoordinator.removeSpec";
import { testRemoveSpecAuthorizedConsumers } from "./DRCoordinator.removeSpecAuthorizedConsumers";
import { testRemoveSpecs } from "./DRCoordinator.removeSpecs";
import { testRemoveSpecsAuthorizedConsumers } from "./DRCoordinator.removeSpecsAuthorizedConsumers";
import { testRequestData } from "./DRCoordinator.requestData";
import { testSetDescription } from "./DRCoordinator.setDescription";
import { testSetFallbackWeiPerUnitLink } from "./DRCoordinator.setFallbackWeiPerUnitLink";
import { testSetL2SequencerGracePeriodSeconds } from "./DRCoordinator.setL2SequencerGracePeriodSeconds";
import { testSetPermiryadFeeFactor } from "./DRCoordinator.setPermiryadFeeFactor";
import { testSetSpec } from "./DRCoordinator.setSpec";
import { testSetSpecs } from "./DRCoordinator.setSpecs";
import { testSetStalenessSeconds } from "./DRCoordinator.setStalenessSeconds";
import { testTransferOwnership } from "./DRCoordinator.transferOwnership";
import { testUnpause } from "./DRCoordinator.unpause";
import { testWithdrawFunds } from "./DRCoordinator.withdrawFunds";

export interface Context {
  drCoordinator: DRCoordinator;
  drcGenericFulfillmentTH: DRCGenericFulfillmentTestHelper;
  drCoordinatorAttackerTH: DRCoordinatorAttackerTestHelper;
  drCoordinatorConsumerTH: DRCoordinatorConsumerTestHelper;
  linkToken: LinkToken;
  mockV3Aggregator: MockV3Aggregator;
  operator: Operator;
  loadFixture: <T>(fixture: Fixture<T>) => Promise<T>;
}

export interface Signers {
  defaultAdmin: Wallet;
  deployer: Wallet;
  externalCaller: Wallet;
  operatorSender: Wallet;
  owner: Wallet;
  requester: Wallet;
}

describe("DRCoordinator", () => {
  if (["1", "true"].includes(process.env.HARDHAT_FORKING_ENABLED as string)) {
    throw new Error(
      `Disable the forking mode. Set HARDHAT_FORKING_ENABLED env var to false before running the test suite`,
    );
  }
  let oldEnv: NodeJS.ProcessEnv;
  const signers = {} as Signers;
  const context = {} as Context;

  before(async function () {
    // Back-up env variables just in case
    oldEnv = process.env;

    // Signers
    const mnemonic = "test test test test test test test test test test test junk";
    const hdwalletSigners = getHDWalletSignersConsecutive(mnemonic, 6);
    signers.deployer = hdwalletSigners[0].connect(ethers.provider);
    signers.externalCaller = hdwalletSigners[1].connect(ethers.provider);
    signers.defaultAdmin = hdwalletSigners[2].connect(ethers.provider);
    signers.requester = hdwalletSigners[3].connect(ethers.provider);
    signers.operatorSender = hdwalletSigners[4].connect(ethers.provider);
    signers.owner = hdwalletSigners[5].connect(ethers.provider);

    // Deploy LinkToken
    const linkTokenFactory = await ethers.getContractFactory("LinkToken");
    const linkToken = (await linkTokenFactory.connect(signers.deployer).deploy()) as LinkToken;
    await linkToken.deployTransaction.wait();
    context.linkToken = linkToken;

    // Deploy & setup Operator
    const operatorFactory = await ethers.getContractFactory("Operator");
    const operator = (await operatorFactory
      .connect(signers.deployer)
      .deploy(linkToken.address, signers.deployer.address)) as Operator;
    await operator.deployTransaction.wait();
    context.operator = operator;
    await context.operator.connect(signers.deployer).setAuthorizedSenders([signers.operatorSender.address]);

    // Deploy MockV3Aggregator
    const mockV3AggregatorFactory = await ethers.getContractFactory("MockV3Aggregator");
    const decimals = BigNumber.from("18");
    const initialAnswer = BigNumber.from("3671038000000000");
    const mockV3Aggregator = (await mockV3AggregatorFactory
      .connect(signers.deployer)
      .deploy(decimals, initialAnswer)) as MockV3Aggregator;
    context.mockV3Aggregator = mockV3Aggregator;

    // Deploy DRCoordinator (not multi price feed dependant)
    const addressLinkToken = context.linkToken.address;
    const isMultiPriceFeedDependant = false;
    const addressPriceFeed1 = context.mockV3Aggregator.address;
    const addressPriceFeed2 = ethers.constants.AddressZero;
    const descriptionDRC = "Testing DRCoordinator";
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
    context.drCoordinator = drCoordinator;
    // Transfer its ownership
    await context.drCoordinator.connect(signers.deployer).transferOwnership(signers.owner.address);
    await context.drCoordinator.connect(signers.owner).acceptOwnership();

    // Deploy DRCoordinatorAttackerTestHelper
    const drCoordinatorAttackerTHFactory = await ethers.getContractFactory("DRCoordinatorAttackerTestHelper");
    const drCoordinatorAttackerTH = (await drCoordinatorAttackerTHFactory
      .connect(signers.deployer)
      .deploy(context.linkToken.address, context.drCoordinator.address)) as DRCoordinatorAttackerTestHelper;
    await drCoordinatorAttackerTH.deployTransaction.wait();
    context.drCoordinatorAttackerTH = drCoordinatorAttackerTH;

    // Deploy DRCoordinatorConsumerTestHelper
    const drCoordinatorConsumerTHFactory = await ethers.getContractFactory("DRCoordinatorConsumerTestHelper");
    const drCoordinatorConsumerTH = (await drCoordinatorConsumerTHFactory
      .connect(signers.deployer)
      .deploy(linkToken.address)) as DRCoordinatorConsumerTestHelper;
    await drCoordinatorConsumerTH.deployTransaction.wait();
    context.drCoordinatorConsumerTH = drCoordinatorConsumerTH;

    // Deploy DRCGenericFulfillmentTestHelper
    const drcGenericFulfillmentTHFactory = await ethers.getContractFactory("DRCGenericFulfillmentTestHelper");
    const drcGenericFulfillmentTH = (await drcGenericFulfillmentTHFactory
      .connect(signers.deployer)
      .deploy()) as DRCGenericFulfillmentTestHelper;
    context.drcGenericFulfillmentTH = drcGenericFulfillmentTH;
  });

  after(async function () {
    process.env = oldEnv;
  });

  describe("testAcceptOwnership()", () => testAcceptOwnership(signers, context));
  describe("testAddFunds()", () => testAddFunds(signers, context));
  describe("testAddSpecAuthorizedConsumers()", () => testAddSpecAuthorizedConsumers(signers, context));
  describe("testAddSpecsAuthorizedConsumers()", () => testAddSpecsAuthorizedConsumers(signers, context));
  describe("testCalculateMaxPaymentAmount()", () => testCalculateMaxPaymentAmount(signers, context));
  describe("testCalculateSpotPaymentAmount()", () => testCalculateSpotPaymentAmount(signers, context));
  describe("testCancelRequest()", () => testCancelRequest(signers, context));
  describe("testFulfillData()", () => testFulfillData(signers, context));
  describe("testGetFeedData()", () => testGetFeedData(signers, context));
  describe("testPause()", () => testPause(signers, context));
  describe("testRemoveSpec()", () => testRemoveSpec(signers, context));
  describe("testRemoveSpecAuthorizedConsumers()", () => testRemoveSpecAuthorizedConsumers(signers, context));
  describe("testRemoveSpecsAuthorizedConsumers()", () => testRemoveSpecsAuthorizedConsumers(signers, context));
  describe("testRemoveSpecs()", () => testRemoveSpecs(signers, context));
  describe("testRequestData()", () => testRequestData(signers, context));
  describe("testSetDescription()", () => testSetDescription(signers, context));
  describe("testSetFallbackWeiPerUnitLink()", () => testSetFallbackWeiPerUnitLink(signers, context));
  describe("testSetL2SequencerGracePeriodSeconds()", () => testSetL2SequencerGracePeriodSeconds(signers, context));
  describe("testSetPermiryadFeeFactor()", () => testSetPermiryadFeeFactor(signers, context));
  describe("testSetSpec()", () => testSetSpec(signers, context));
  describe("testSetSpecs()", () => testSetSpecs(signers, context));
  describe("testSetStalenessSeconds()", () => testSetStalenessSeconds(signers, context));
  describe("testTransferOwnership()", () => testTransferOwnership(signers, context));
  describe("testUnpause()", () => testUnpause(signers, context));
  describe("testWithdrawFunds()", () => testWithdrawFunds(signers, context));
});
