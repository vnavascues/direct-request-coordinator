import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import type { Fixture } from "ethereum-waffle";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import { testCalculateMaxPaymentAmount } from "./DRCoordinator.calculateMaxPaymentAmount";
import { testCalculateSpotPaymentAmount } from "./DRCoordinator.calculateSpotPaymentAmount";
import { testFallback } from "./DRCoordinator.fallback";
import { testGetFeedData } from "./DRCoordinator.getFeedData";

import type {
  DRCoordinator,
  DRCoordinatorConsumer1TestHelper,
  LinkToken,
  MockV3Aggregator,
  Operator,
} from "../../../src/types";

export interface Context {
  drCoordinator: DRCoordinator;
  drCoordinatorConsumer1TH: DRCoordinatorConsumer1TestHelper;
  linkToken: LinkToken;
  mockV3Aggregator: MockV3Aggregator;
  operator: Operator;
  loadFixture: <T>(fixture: Fixture<T>) => Promise<T>;
  signers: Signers;
}

export interface Signers {
  defaultAdmin: SignerWithAddress;
  deployer: SignerWithAddress;
  externalCaller: SignerWithAddress;
  operatorSender: SignerWithAddress;
  owner: SignerWithAddress;
  requester: SignerWithAddress;
}

describe.only("DRCoordinator", () => {
  if (["1", "true"].includes(process.env.HARDHAT_FORKING_ENABLED as string)) {
    throw new Error(
      `Disable the forking mode. Set HARDHAT_FORKING_ENABLED env var to false before running the test suite`,
    );
  }
  const signers = {} as Signers;
  const context = {} as Context;

  before(async function () {
    // Signers
    const ethersSigners: SignerWithAddress[] = await ethers.getSigners();
    signers.deployer = ethersSigners[0];
    signers.externalCaller = ethersSigners[1];
    signers.defaultAdmin = ethersSigners[2];
    signers.requester = ethersSigners[3];
    signers.operatorSender = ethersSigners[4];
    signers.owner = ethersSigners[5];

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

    // Deploy DRCoordinator
    const descriptionDRC = "Testing DRCoordinator";
    const fallbackWeiPerUnitLink = BigNumber.from("8000000000000000");
    const gasAfterPaymentCalculation = BigNumber.from("33285");
    const stalenessSeconds = BigNumber.from("86400");
    const isSequencerDependant = false;
    const sequencerFlag = "";
    const chainlinkFlags = ethers.constants.AddressZero;
    const drCoordinatorFactory = await ethers.getContractFactory("DRCoordinator");
    const drCoordinator = (await drCoordinatorFactory
      .connect(signers.deployer)
      .deploy(
        context.linkToken.address,
        context.mockV3Aggregator.address,
        descriptionDRC,
        fallbackWeiPerUnitLink,
        gasAfterPaymentCalculation,
        stalenessSeconds,
        isSequencerDependant,
        sequencerFlag,
        chainlinkFlags,
      )) as DRCoordinator;
    await drCoordinator.deployTransaction.wait();
    context.drCoordinator = drCoordinator;
    // Transfer its ownership
    await context.drCoordinator.connect(signers.deployer).transferOwnership(signers.owner.address);
    await context.drCoordinator.connect(signers.owner).acceptOwnership();

    // Deploy DRCoordinatorConsumer1TestHelper
    const drCoordinatorConsumer1THFactory = await ethers.getContractFactory("DRCoordinatorConsumer1TestHelper");
    const drCoordinatorConsumer1TH = (await drCoordinatorConsumer1THFactory
      .connect(signers.deployer)
      .deploy()) as DRCoordinatorConsumer1TestHelper;
    await drCoordinatorConsumer1TH.deployTransaction.wait();
    context.drCoordinatorConsumer1TH = drCoordinatorConsumer1TH;
  });

  describe("testCalculateMaxPaymentAmount()", () => testCalculateMaxPaymentAmount(signers, context));
  describe("testCalculateSpotPaymentAmount()", () => testCalculateSpotPaymentAmount(signers, context));
  describe("testFallback()", () => testFallback(signers, context));
  describe("testGetFeedData()", () => testGetFeedData(signers, context));
});
