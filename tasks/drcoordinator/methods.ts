import AggregatorV3Interface from "@chainlink/contracts/abi/v0.8/AggregatorV3Interface.json";
import type { ContractTransaction } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, ethers } from "ethers";
import { readFileSync } from "fs";
import type { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";

import { BetterSet } from "../../libs/better-set";
import type { DRCoordinator } from "../../src/types";
import {
  convertJobIdToBytes32,
  getLinkBalanceOf,
  getNetworkLinkAddress,
  getNetworkLinkAddressDeployingOnHardhat,
  getNetworkLinkTknFeedAddress,
} from "../../utils/chainlink";
import { LINK_TOTAL_SUPPLY, MIN_CONSUMER_GAS_LIMIT, chainIdL2SequencerFeed } from "../../utils/chainlink-constants";
import { ChainId } from "../../utils/constants";
import { getNumberOfConfirmations, getOverrides, isAddressAContract } from "../../utils/deployment";
import { formatNumericEnumValuesPretty } from "../../utils/enums";
import { impersonateAccount, setAddressCode } from "../../utils/hre";
import { logger } from "../../utils/logger";
import { reSemVer, reUUID } from "../../utils/regex";
import type { Overrides } from "../../utils/types";
import { setChainVerifyApiKeyEnv } from "../../utils/verification";
import {
  ChainlinkNodeId,
  DUMMY_SET_CODE_BYTES,
  ExternalAdapterId,
  FeeType,
  MAX_PERMIRYAD_FEE,
  PERMIRYAD,
  PaymentType,
  TaskExecutionMode,
  TaskName,
} from "./constants";
import {
  Configuration,
  ConfigurationConverted,
  ConsumersConverted,
  DRCoordinatorLogConfig,
  DeployData,
  Description,
  ExternalAdapter,
  SpecAuthorizedConsumersConverted,
  SpecConverted,
  SpecItem,
  SpecItemConverted,
} from "./types";

export async function addFunds(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  consumer: string,
  amount: BigNumber,
  overrides?: Overrides,
): Promise<void> {
  const logObj = { consumer, amount: amount.toString() };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).addFunds(consumer, amount, overrides);
    logger.info(logObj, `addFunds() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `addFunds() failed due to:`);
    throw error;
  }
}

export async function addSpecAuthorizedConsumers(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  key: string,
  specAuthorizedConsumers: SpecAuthorizedConsumersConverted,
  overrides: Overrides,
  specToIndexMap?: Map<string, number>,
): Promise<void> {
  const indexToKey: Record<number, string> = {};
  if (specToIndexMap) {
    indexToKey[specToIndexMap.get(key) as number] = key;
  }
  const logObj = { "file indeces": indexToKey, key, specAuthorizedConsumers };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).addSpecAuthorizedConsumers(key, specAuthorizedConsumers, overrides);
    logger.info(logObj, `addSpecAuthorizedConsumers() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `addSpecAuthorizedConsumers() failed due to:`);
    throw error;
  }
}

export async function addSpecs(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  fileSpecMap: Map<string, SpecItemConverted>,
  keysToAddSet: Set<string>,
  isBatchMode: boolean,
  overrides: Overrides,
  batchSize?: number,
): Promise<void> {
  logger.info(`${keysToAddSet.size ? `adding specs into DRCoordinator  ...` : `no specs to add into DRCoordinator`}`);
  if (!keysToAddSet.size) return;

  const specToIndexMap = new Map(Array.from([...fileSpecMap.keys()].entries()).map(([idx, key]) => [key, idx]));
  if (isBatchMode) {
    const keys = [...keysToAddSet];
    const fileSpecs = keys.map(key => (fileSpecMap.get(key) as SpecItemConverted).specConverted);
    const chunkSize = batchSize || keys.length;
    for (let i = 0; i < keys.length; i += chunkSize) {
      await setSpecs(
        drCoordinator,
        signer,
        keys.slice(i, i + chunkSize),
        fileSpecs.slice(i, i + chunkSize),
        overrides,
        `Added in batch (${i}, ${i + chunkSize - 1})`,
        specToIndexMap,
      );
    }
  } else {
    for (const key of keysToAddSet) {
      const fileSpec = fileSpecMap.get(key) as SpecItemConverted;
      await setSpec(drCoordinator, signer, key, fileSpec.specConverted, overrides, "Added", specToIndexMap);
    }
  }
}

export async function addSpecsAuthorizedConsumers(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  keys: string[],
  specsAuthorizedConsumers: SpecAuthorizedConsumersConverted[],
  overrides: Overrides,
  specToIndexMap?: Map<string, number>,
): Promise<void> {
  const indexToKey: Record<number, string> = {};
  if (specToIndexMap) {
    keys.forEach(key => (indexToKey[specToIndexMap.get(key) as number] = key));
  }
  const logObj = { "file indeces": indexToKey, keys, specsAuthorizedConsumers };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).addSpecsAuthorizedConsumers(keys, specsAuthorizedConsumers, overrides);
    logger.info(logObj, `addSpecsAuthorizedConsumers() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `addSpecsAuthorizedConsumers() failed due to:`);
    throw error;
  }
}

export function checkSpecsIntegrity(specs: SpecItem[], chainId: ChainId): void {
  if (!Array.isArray(specs)) {
    throw new Error(`Invalid specs file data format. Expected an array of Spec items`);
  }
  // Validate specs
  const jsonValues = Object.values(specs);
  const keySet = new Set<string>();
  for (const [idx, { description, configuration, consumers }] of jsonValues.entries()) {
    try {
      validateDescription(description, chainId);
      validateConfiguration(configuration);
      validateConsumers(consumers);
    } catch (error) {
      throw new Error(`Invalid entry at index ${idx}: ${JSON.stringify(specs[idx])}. Reason: ${error}`);
    }
    const specId = convertJobIdToBytes32(configuration.externalJobId);
    const key = generateSpecKey(configuration.operator, specId);
    if (keySet.has(key)) {
      throw new Error(
        `Invalid entry at index ${idx}: ${JSON.stringify(specs[idx])}. ` +
          `Reason: there already is a Spec in the file with the same 'externalJobId' and 'oracle'`,
      );
    }
    keySet.add(key);
  }
}

export async function deleteSpecs(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  keysToRemoveSet: Set<string>,
  isBatchMode: boolean,
  overrides: Overrides,
  batchSize?: number,
): Promise<void> {
  logger.info(
    `${keysToRemoveSet.size ? `deleting specs from DRCoordinator ...` : `no specs to delete from DRCoordinator`}`,
  );
  if (!keysToRemoveSet.size) return;

  if (isBatchMode) {
    const keys = [...keysToRemoveSet];
    const chunkSize = batchSize || keys.length;
    for (let i = 0; i < keys.length; i += chunkSize) {
      await removeSpecs(
        drCoordinator,
        signer,
        keys.slice(i, i + chunkSize),
        overrides,
        `Removed in batch (${i}, ${i + chunkSize - 1})`,
      );
    }
  } else {
    for (const key of keysToRemoveSet) {
      await removeSpec(drCoordinator, signer, key, overrides);
    }
  }
}

export async function deleteSpecsAuthorizedConsumers(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  fileSpecMap: Map<string, SpecItemConverted>,
  specAuthorizedConsumerToRemoveMap: Map<string, SpecAuthorizedConsumersConverted>,
  keysToRemove: string[],
  isBatchMode: boolean,
  overrides: Overrides,
  batchSize?: number,
): Promise<void> {
  // Perform the additions
  logger.info(
    `${
      keysToRemove.length
        ? `deleting specs' authorized consumers into DRCoordinator  ...`
        : `no specs' authorized consumers to delete into DRCoordinator`
    }`,
  );
  if (!keysToRemove.length) return;

  const specToIndexMap = new Map(Array.from([...fileSpecMap.keys()].entries()).map(([idx, key]) => [key, idx]));
  if (isBatchMode) {
    const fileConsumers = keysToRemove.map(key => specAuthorizedConsumerToRemoveMap.get(key) as ConsumersConverted);
    const chunkSize = batchSize || keysToRemove.length;
    for (let i = 0; i < keysToRemove.length; i += chunkSize) {
      await removeSpecsAuthorizedConsumers(
        drCoordinator,
        signer,
        keysToRemove.slice(i, i + chunkSize),
        fileConsumers.slice(i, i + chunkSize),
        overrides,
        specToIndexMap,
      );
    }
  } else {
    for (const key of keysToRemove) {
      const fileAuthorizedConsumers = specAuthorizedConsumerToRemoveMap.get(key) as SpecAuthorizedConsumersConverted;
      await removeSpecAuthorizedConsumers(
        drCoordinator,
        signer,
        key,
        fileAuthorizedConsumers,
        overrides,
        specToIndexMap,
      );
    }
  }
}

export async function deployDRCoordinator(
  hre: HardhatRuntimeEnvironment,
  signer: ethers.Wallet | SignerWithAddress,
  description: string,
  fallbackWeiPerUnitLink: BigNumber,
  stalenessSeconds: BigNumber,
  isMultiPriceFeedDependant: boolean,
  priceFeed1?: string,
  priceFeed2?: string,
  l2SequencerGracePeriod?: BigNumber,
  overrides?: Overrides,
  numberOfConfirmations?: number,
): Promise<DeployData> {
  let addressLink: string;
  let addressPriceFeed1: string;
  let addressPriceFeed2: string;
  let isL2SequencerDependant: boolean;
  let addressL2SequencerFeed: string;
  let l2SequencerGracePeriodSeconds: BigNumber;
  const chainId = hre.network.config.chainId as number;
  if (isMultiPriceFeedDependant) {
    addressPriceFeed1 = priceFeed1 as string;
    addressPriceFeed2 = priceFeed2 as string;
  } else {
    addressPriceFeed1 =
      chainId === ChainId.HARDHAT
        ? "0x3Af8C569ab77af5230596Acf0E8c2F9351d24C38" // LINK / ETH on Ethereum
        : getNetworkLinkTknFeedAddress(hre.network);
    addressPriceFeed2 = ethers.constants.AddressZero;
  }
  if (chainId === ChainId.HARDHAT) {
    overrides = {};
    // NB: dry-run mode for the Hardhat network
    addressLink = await getNetworkLinkAddressDeployingOnHardhat(hre); // ethers.constants.AddressZero;
    await setAddressCode(hre, addressPriceFeed1, DUMMY_SET_CODE_BYTES); // NB: bypass constructor checks
    if (isMultiPriceFeedDependant) {
      await setAddressCode(hre, addressPriceFeed2, DUMMY_SET_CODE_BYTES); // NB: bypass constructor checks
    }
    isL2SequencerDependant = false;
    addressL2SequencerFeed = ethers.constants.AddressZero;
    l2SequencerGracePeriodSeconds = BigNumber.from("0");
  } else {
    addressLink = getNetworkLinkAddress(hre.network);
  }
  const isL2WithSequencerChain = chainIdL2SequencerFeed.has(chainId);
  if (isL2WithSequencerChain) {
    isL2SequencerDependant = true;
    addressL2SequencerFeed = chainIdL2SequencerFeed.get(chainId) as string;
    l2SequencerGracePeriodSeconds = l2SequencerGracePeriod as BigNumber;
  } else {
    isL2SequencerDependant = false;
    addressL2SequencerFeed = ethers.constants.AddressZero;
    l2SequencerGracePeriodSeconds = BigNumber.from("0");
  }
  // Deploy
  const logObj = {
    addressLink,
    isMultiPriceFeedDependant,
    addressPriceFeed1,
    addressPriceFeed2,
    description,
    fallbackWeiPerUnitLink,
    stalenessSeconds,
    isL2SequencerDependant,
    addressL2SequencerFeed,
    l2SequencerGracePeriodSeconds,
  };
  const drCoordinatorFactory = await hre.ethers.getContractFactory("DRCoordinator");
  const drCoordinator = (await drCoordinatorFactory
    .connect(signer)
    .deploy(
      addressLink,
      isMultiPriceFeedDependant,
      addressPriceFeed1,
      addressPriceFeed2,
      description,
      fallbackWeiPerUnitLink,
      stalenessSeconds,
      isL2SequencerDependant,
      addressL2SequencerFeed,
      l2SequencerGracePeriodSeconds,
      overrides,
    )) as DRCoordinator;
  logger.info(
    logObj,
    `DRCoordinator deployed to: ${drCoordinator.address} | Tx hash: ${drCoordinator.deployTransaction.hash}`,
  );
  await drCoordinator
    .connect(signer)
    .deployTransaction.wait(getNumberOfConfirmations(hre.network.config.chainId, numberOfConfirmations));

  return {
    drCoordinator,
    addressLink,
    isMultiPriceFeedDependant,
    addressPriceFeed1,
    addressPriceFeed2,
    description,
    fallbackWeiPerUnitLink,
    stalenessSeconds,
    isL2SequencerDependant,
    addressL2SequencerFeed,
    l2SequencerGracePeriodSeconds,
  };
}

export function generateSpecKey(operatorAddr: string, specId: string): string {
  return ethers.utils.keccak256(ethers.utils.solidityPack(["address", "bytes32"], [operatorAddr, specId]));
}

export async function getDRCoordinator(
  hre: HardhatRuntimeEnvironment,
  address: string,
  mode: TaskExecutionMode,
  signer?: ethers.Wallet | SignerWithAddress,
  overrides?: Overrides,
): Promise<DRCoordinator> {
  let drCoordinator: DRCoordinator;
  if (mode === TaskExecutionMode.DRYRUN) {
    if (!signer || !overrides) {
      throw new Error(
        `Missing 'signer' and/or 'overrides' on mode: ${mode}. Signer: ${JSON.stringify(
          signer,
        )} | Overrides: ${JSON.stringify(overrides)}`,
      );
    }
    const deployData = await deployDRCoordinator(
      hre,
      signer,
      "DRCoordinator for dry run mode on hardhat", // description
      BigNumber.from("8000000000000000"), // fallbackWeiPerUnitLink
      BigNumber.from("86400"), // stalenessSeconds
      false,
    );
    drCoordinator = deployData.drCoordinator;
  } else if ([TaskExecutionMode.FORKING, TaskExecutionMode.PROD].includes(mode)) {
    // Get DRCoordinator contract at address
    const drCoordinatorArtifact = await hre.artifacts.readArtifact("DRCoordinator");
    drCoordinator = (await hre.ethers.getContractAt(drCoordinatorArtifact.abi, address)) as DRCoordinator;

    // Check if the contract exists at address
    if (!isAddressAContract(drCoordinator)) {
      throw new Error(
        `Unable to find ${drCoordinatorArtifact.contractName} on network '${hre.network.name}' at address ${address}`,
      );
    }
  } else {
    throw new Error(`Unsupported 'mode': ${mode}`);
  }

  return drCoordinator;
}

export async function getSpecAuthorizedConsumersMap(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  keys: string[],
): Promise<Map<string, SpecAuthorizedConsumersConverted>> {
  const specAuthorizedConsumersConvertedMap: Map<string, SpecAuthorizedConsumersConverted> = new Map([]);
  for (const key of keys) {
    const authorizedConsumers = await drCoordinator.connect(signer).getSpecAuthorizedConsumers(key);
    specAuthorizedConsumersConvertedMap.set(key, authorizedConsumers);
  }
  return specAuthorizedConsumersConvertedMap;
}

export async function getSpecConfigurationConverted(configuration: Configuration): Promise<ConfigurationConverted> {
  const operator = configuration.operator;
  const specId = convertJobIdToBytes32(configuration.externalJobId);
  const key = generateSpecKey(operator, specId);
  return {
    fee: BigNumber.from(configuration.fee),
    feeType: configuration.feeType,
    gasLimit: configuration.gasLimit,
    key,
    operator,
    payment: BigNumber.from(configuration.payment),
    paymentType: configuration.paymentType,
    specId,
  };
}

export async function getSpecItemConvertedMap(specs: SpecItem[]): Promise<Map<string, SpecItemConverted>> {
  const specItemConvertedMap: Map<string, SpecItemConverted> = new Map();
  for (const [idx, { configuration, consumers }] of specs.entries()) {
    // Process the spec configuration
    let configurationConverted: ConfigurationConverted;
    try {
      configurationConverted = await getSpecConfigurationConverted(configuration);
    } catch (error) {
      logger.error(
        `unexpected error converting the 'configuration' of the spec at index ${idx}: ${JSON.stringify(
          configuration,
        )}. Reason:`,
      );
      throw error;
    }
    // Process the spec consumers
    specItemConvertedMap.set(configurationConverted.key, {
      specConverted: configurationConverted,
      specAuthorizedConsumers: consumers,
    });
  }
  return specItemConvertedMap;
}

export async function getSpecMap(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  keys: string[],
): Promise<Map<string, SpecConverted>> {
  const specConvertedMap: Map<string, SpecConverted> = new Map();
  for (const key of keys) {
    const { specId, operator, payment, paymentType, fee, feeType, gasLimit } = await drCoordinator
      .connect(signer)
      .getSpec(key);
    const spec = {
      fee,
      feeType,
      gasLimit,
      key,
      operator,
      payment,
      paymentType,
      specId,
    };
    specConvertedMap.set(key, spec);
  }
  return specConvertedMap;
}

export function hasSpecDifferences(fileSpec: SpecConverted, drcSpec: SpecConverted): boolean {
  return (
    !fileSpec.fee.eq(drcSpec.fee) ||
    fileSpec.feeType !== drcSpec.feeType ||
    fileSpec.gasLimit !== drcSpec.gasLimit ||
    fileSpec.payment !== drcSpec.payment ||
    fileSpec.paymentType !== drcSpec.paymentType
  );
}

export async function insertSpecsAuthorizedConsumers(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  fileSpecMap: Map<string, SpecItemConverted>,
  specAuthorizedConsumerToAddMap: Map<string, SpecAuthorizedConsumersConverted>,
  keysToAdd: string[],
  isBatchMode: boolean,
  overrides: Overrides,
  batchSize?: number,
): Promise<void> {
  // Perform the additions
  logger.info(
    `${
      keysToAdd.length
        ? `adding specs' authorized consumers into DRCoordinator  ...`
        : `no specs' authorized consumers to add into DRCoordinator`
    }`,
  );
  if (!keysToAdd.length) return;

  const specToIndexMap = new Map(Array.from([...fileSpecMap.keys()].entries()).map(([idx, key]) => [key, idx]));
  if (isBatchMode) {
    const fileConsumers = keysToAdd.map(key => specAuthorizedConsumerToAddMap.get(key) as ConsumersConverted);
    const chunkSize = batchSize || keysToAdd.length;
    for (let i = 0; i < keysToAdd.length; i += chunkSize) {
      await addSpecsAuthorizedConsumers(
        drCoordinator,
        signer,
        keysToAdd.slice(i, i + chunkSize),
        fileConsumers.slice(i, i + chunkSize),
        overrides,
        specToIndexMap,
      );
    }
  } else {
    for (const key of keysToAdd) {
      const fileAuthorizedConsumers = specAuthorizedConsumerToAddMap.get(key) as SpecAuthorizedConsumersConverted;
      await addSpecAuthorizedConsumers(drCoordinator, signer, key, fileAuthorizedConsumers, overrides, specToIndexMap);
    }
  }
}

export async function logDRCoordinatorDetail(
  hre: HardhatRuntimeEnvironment,
  drCoordinator: DRCoordinator,
  logConfig: DRCoordinatorLogConfig,
  signer: ethers.Wallet | SignerWithAddress,
): Promise<void> {
  const chainId = hre.network.config.chainId as number;
  const isHardhatNetwork = chainId === ChainId.HARDHAT;
  if (logConfig.detail) {
    const address = drCoordinator.connect(signer).address;
    const typeAndVersion = await drCoordinator.connect(signer).typeAndVersion();
    const description = await drCoordinator.connect(signer).getDescription();
    const owner = await drCoordinator.connect(signer).owner();
    const paused = await drCoordinator.connect(signer).paused();
    const addressLink = await drCoordinator.connect(signer).getLinkToken();
    const isMultiPriceFeedDependant = await drCoordinator.connect(signer).getIsMultiPriceFeedDependant();
    const addressPriceFeed1 = await drCoordinator.connect(signer).getPriceFeed1();
    const addressPriceFeed2 = await drCoordinator.connect(signer).getPriceFeed2();
    const isL2SequencerDependant = await drCoordinator.connect(signer).getIsL2SequencerDependant();
    const addressL2SequencerFeed = await drCoordinator.connect(signer).getL2SequencerFeed();
    const gasAfterPaymentCalculation = await drCoordinator.connect(signer).getGasAfterPaymentCalculation();
    const fallbackWeiPerUnitLink = await drCoordinator.connect(signer).getFallbackWeiPerUnitLink();
    const permiryadFeeFactor = await drCoordinator.connect(signer).getPermiryadFeeFactor();
    const stalenessSeconds = await drCoordinator.connect(signer).getStalenessSeconds();
    const l2SequencerGracePeriodSeconds = await drCoordinator.connect(signer).getL2SequencerGracePeriodSeconds();
    const linkBalance = await getLinkBalanceOf(hre, signer, drCoordinator.address, addressLink);
    const linkProfit = await drCoordinator.connect(signer).availableFunds(drCoordinator.address);

    // Get feeds descriptions
    let priceFeed1;
    let priceFeed2;
    let l2SequencerFeed;
    try {
      priceFeed1 = await hre.ethers.getContractAt(AggregatorV3Interface, addressPriceFeed1);
    } catch (error) {
      throw new Error(`Unexpected error reading Price Feed 1 at: ${addressPriceFeed1}. Reason: ${error}`);
    }
    if (isMultiPriceFeedDependant) {
      try {
        priceFeed2 = await hre.ethers.getContractAt(AggregatorV3Interface, addressPriceFeed2);
      } catch (error) {
        throw new Error(`Unexpected error reading Price Feed 2 at: ${addressPriceFeed2}. Reason: ${error}`);
      }
    }
    if (isL2SequencerDependant) {
      try {
        l2SequencerFeed = await hre.ethers.getContractAt(AggregatorV3Interface, addressL2SequencerFeed);
      } catch (error) {
        throw new Error(
          `Unexpected error reading L2 Sequencer Uptime Status Feed at: ${addressL2SequencerFeed}. Reason: ${error}`,
        );
      }
    }
    const descriptionPriceFeed1 = isHardhatNetwork ? "N/A (Hardhat)" : await priceFeed1.connect(signer).description();
    const descriptionPriceFeed2 = isHardhatNetwork
      ? "N/A (Hardhat)"
      : isMultiPriceFeedDependant
      ? await (priceFeed2 as ethers.Contract).connect(signer).description()
      : "N/A";
    const descriptionL2SequencerFeed2 = isHardhatNetwork
      ? "N/A (Hardhat)"
      : isL2SequencerDependant
      ? await (l2SequencerFeed as ethers.Contract).connect(signer).description()
      : "N/A";

    logger.info(
      {
        address: address,
        typeAndVersion: typeAndVersion,
        description: description,
        owner: owner,
        paused: paused,
        balance: `${ethers.utils.formatUnits(linkBalance)} LINK`,
        profit: `${ethers.utils.formatUnits(linkProfit)} LINK`,
        LINK: addressLink,
        IS_MULTI_PRICE_FEED_DEPENDANT: isMultiPriceFeedDependant,
        PRICE_FEED_1: `${addressPriceFeed1} (${descriptionPriceFeed1})`,
        PRICE_FEED_2: `${addressPriceFeed2} (${descriptionPriceFeed2})`,
        IS_L2_SEQUENCER_DEPENDANT: isL2SequencerDependant,
        L2_SEQUENCER_FEEED: `${addressL2SequencerFeed} (${descriptionL2SequencerFeed2})`,
        L2_SEQUENCER_GRACE_PERIOD_SECONDS: isL2SequencerDependant
          ? l2SequencerGracePeriodSeconds
          : `${l2SequencerGracePeriodSeconds} (N/A)`,
        GAS_AFTER_PAYMENT_CALCULATION: `${gasAfterPaymentCalculation}`,
        fallbackWeiPerUnitLink: `${fallbackWeiPerUnitLink}`,
        permiryadFeeFactor: `${permiryadFeeFactor}`,
        stalenessSeconds: `${stalenessSeconds}`,
      },
      "detail:",
    );
  }

  if (logConfig.keys) {
    const keys = await drCoordinator.connect(signer).getSpecMapKeys();
    logger.info(keys, "keys:");
  }

  if (logConfig.specs) {
    const keys = await drCoordinator.connect(signer).getSpecMapKeys();
    const specMap = await getSpecMap(drCoordinator, signer, keys);
    logger.info([...specMap.values()], `specs:`);
  }

  if (logConfig.authconsumers) {
    const keys = await drCoordinator.connect(signer).getSpecMapKeys();
    const specAuthorizedConsumersMap = await getSpecAuthorizedConsumersMap(drCoordinator, signer, keys);
    logger.info([...specAuthorizedConsumersMap.values()], `authconsumers:`);
  }
}

export async function transferOwnership(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  owner: string,
  overrides?: Overrides,
): Promise<void> {
  const logObj = { owner };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).transferOwnership(owner, overrides);
    logger.info(logObj, `transferOwnership() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `transferOwnership() failed due to:`);
    throw error;
  }
}

export async function setupDRCoordinatorAfterDeploy(
  taskArguments: TaskArguments,
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  overrides: Overrides,
) {
  // Transfer ownership
  if (taskArguments.owner) {
    await transferOwnership(drCoordinator, signer, taskArguments.owner as string, overrides);
  }
}

export async function pause(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  overrides: Overrides,
): Promise<void> {
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).pause(overrides);
    logger.info(`pause() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.error(error, `pause() failed due to:`);
    throw error;
  }
}

export function parseAndCheckSpecsFile(filePath: string, chainId: ChainId): SpecItem[] {
  // Read and parse the specs JSON file
  const specs = parseSpecsFile(filePath);
  // Validate specs file
  checkSpecsIntegrity(specs, chainId);

  return specs;
}

export function parseSpecsFile(filePath: string): SpecItem[] {
  let specs: SpecItem[];
  try {
    specs = JSON.parse(readFileSync(filePath, "utf-8")) as SpecItem[];
  } catch (error) {
    logger.error(error, `unexpected error reading file: ${filePath}. Make sure the JSON file exists`);
    throw error;
  }

  return specs;
}

export async function removeSpec(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  key: string,
  overrides: Overrides,
): Promise<void> {
  const logObj = { key };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).removeSpec(key, overrides);
    logger.info(logObj, `removeSpec() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `removeSpec() failed due to:`);
    throw error;
  }
}

export async function removeSpecAuthorizedConsumers(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  key: string,
  specAuthorizedConsumers: SpecAuthorizedConsumersConverted,
  overrides: Overrides,
  specToIndexMap?: Map<string, number>,
): Promise<void> {
  const indexToKey: Record<number, string> = {};
  if (specToIndexMap) {
    indexToKey[specToIndexMap.get(key) as number] = key;
  }
  const logObj = { "file indeces": indexToKey, key, specAuthorizedConsumers };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).removeSpecAuthorizedConsumers(key, specAuthorizedConsumers, overrides);
    logger.info(logObj, `removeSpecAuthorizedConsumers() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `removeSpecAuthorizedConsumers() failed due to:`);
    throw error;
  }
}

export async function removeSpecs(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  keys: string[],
  overrides: Overrides,
  action = "Removed",
): Promise<void> {
  const logObj = { keys };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).removeSpecs(keys, overrides);
    logger.info(logObj, `removeSpecs() ${action} specs | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `removeSpecs() failed due to:`);
    throw error;
  }
}

export async function removeSpecsAuthorizedConsumers(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  keys: string[],
  specsAuthorizedConsumers: SpecAuthorizedConsumersConverted[],
  overrides: Overrides,
  specToIndexMap?: Map<string, number>,
): Promise<void> {
  const indexToKey: Record<number, string> = {};
  if (specToIndexMap) {
    keys.forEach(key => (indexToKey[specToIndexMap.get(key) as number] = key));
  }
  const logObj = { "file indeces": indexToKey, keys, specsAuthorizedConsumers };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).removeSpecsAuthorizedConsumers(keys, specsAuthorizedConsumers, overrides);
    logger.info(logObj, `removeSpecsAuthorizedConsumers() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `removeSpecsAuthorizedConsumers() failed due to:`);
    throw error;
  }
}

export async function setCodeOnSpecContractAddresses(hre: HardhatRuntimeEnvironment, specs: SpecItem[]): Promise<void> {
  const configurations = specs.map((spec: SpecItem) => spec.configuration);

  let contractAddresses: string[] = [];
  configurations.forEach((configuration: Configuration) => {
    contractAddresses = contractAddresses.concat([configuration.operator]);
  });
  for (const address of contractAddresses) {
    await setAddressCode(hre, address, DUMMY_SET_CODE_BYTES);
  }
}

export async function setDescription(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  description: string,
  overrides: Overrides,
): Promise<void> {
  const logObj = { description };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).setDescription(description, overrides);
    logger.info(logObj, `setDescription() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `setDescription() failed due to:`);
    throw error;
  }
}

export async function setFallbackWeiPerUnitLink(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  fallbackWeiPerUnitLink: BigNumber,
  overrides: Overrides,
): Promise<void> {
  const logObj = { fallbackWeiPerUnitLink };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).setFallbackWeiPerUnitLink(fallbackWeiPerUnitLink, overrides);
    logger.info(logObj, `setFallbackWeiPerUnitLink() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `setFallbackWeiPerUnitLink() failed due to:`);
    throw error;
  }
}

export async function setL2SequencerGracePeriodSeconds(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  l2SequencerGracePeriodSeconds: BigNumber,
  overrides: Overrides,
): Promise<void> {
  const logObj = { l2SequencerGracePeriodSeconds };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).setL2SequencerGracePeriodSeconds(l2SequencerGracePeriodSeconds, overrides);
    logger.info(logObj, `setL2SequencerGracePeriodSeconds() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `setL2SequencerGracePeriodSeconds() failed due to:`);
    throw error;
  }
}

export async function setPermiryadFeeFactor(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  permiryadFeeFactor: BigNumber,
  overrides: Overrides,
): Promise<void> {
  const logObj = { permiryadFeeFactor };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).setPermiryadFeeFactor(permiryadFeeFactor, overrides);
    logger.info(logObj, `setPermiryadFeeFactor() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `setPermiryadFeeFactor() failed due to:`);
    throw error;
  }
}

export async function setSpec(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  key: string,
  spec: SpecConverted,
  overrides: Overrides,
  action = "Set",
  specToIndexMap?: Map<string, number>,
): Promise<void> {
  const indexToKey: Record<number, string> = {};
  if (specToIndexMap) {
    indexToKey[specToIndexMap.get(key) as number] = key;
  }
  const logObj = { action, "file indeces": indexToKey, key, spec };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).setSpec(key, spec, overrides);
    logger.info(logObj, `setSpec() ${action} | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `setSpec() failed due to:`);
    throw error;
  }
}

export async function setSpecs(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  keys: string[],
  specs: SpecConverted[],
  overrides: Overrides,
  action = "Set",
  specToIndexMap?: Map<string, number>,
): Promise<void> {
  const indexToKey: Record<number, string> = {};
  if (specToIndexMap) {
    keys.forEach(key => (indexToKey[specToIndexMap.get(key) as number] = key));
  }
  const logObj = { action, "file indeces": indexToKey, keys, specs };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).setSpecs(keys, specs, overrides);
    logger.info(logObj, `setSpecs() ${action} | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `setSpecs() failed due to:`);
    throw error;
  }
}

export async function setStalenessSeconds(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  stalenessSeconds: BigNumber,
  overrides: Overrides,
): Promise<void> {
  const logObj = { stalenessSeconds };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).setStalenessSeconds(stalenessSeconds, overrides);
    logger.info(logObj, `setStalenessSeconds() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `setStalenessSeconds() failed due to:`);
    throw error;
  }
}

export async function setupDRCoordinatorBeforeTask(
  taskArguments: TaskArguments,
  hre: HardhatRuntimeEnvironment,
  taskName: TaskName,
) {
  logger.warn(
    `*** Running ${(taskName as string).toUpperCase()} on ${(taskArguments.mode as string).toUpperCase()} mode ***`,
  );
  // Dryrun mode checks
  if (taskArguments.mode === TaskExecutionMode.DRYRUN && hre.network.config.chainId !== ChainId.HARDHAT) {
    throw new Error(`Task 'mode' '${taskArguments.mode}' (default) requires the Hardhat Network`);
  }
  // Forking mode checks
  if (taskArguments.mode === TaskExecutionMode.FORKING && !hre.config.networks.hardhat.forking?.enabled) {
    throw new Error(
      `Task 'mode' '${taskArguments.mode}' requires the Hardhat Network forking-config setup and enabled. ` +
        `Please, set HARDHAT_FORKING_ENABLED and your HARDHAT_FORKING_URL in the .env file`,
    );
  }
  if (taskArguments.mode === TaskExecutionMode.FORKING && hre.network.config.chainId !== ChainId.HARDHAT) {
    throw new Error(
      `Task 'mode' '${taskArguments.mode}' must not pass a network, otherwise it will transact on it. ` +
        `Please remove the '--network <network_name>' task argument`,
    );
  }
  if (taskArguments.mode === TaskExecutionMode.FORKING && !taskArguments.apeaddress) {
    throw new Error(`Task 'mode' '${taskArguments.mode}' requires the 'apeaddress' task argument`);
  }

  // Get the contract method overrides
  const overrides = await getOverrides(taskArguments, hre);

  // Instantiate the signer of the network
  let [signer] = await hre.ethers.getSigners();
  logger.info(`signer address: ${signer.address}`);

  // Open and chec the specs file
  let specs: undefined | SpecItem[];
  if (taskName === TaskName.IMPORT_FILE) {
    // Read and parse the specs JSON file
    logger.info(`parsing and checking specs file: ${taskArguments.filename}.json ...`);
    const filePath = `./jobs/drcoordinator-specs/${taskArguments.filename}.json`;
    specs = parseAndCheckSpecsFile(filePath, hre.network.config.chainId as ChainId);
  }

  // Execution mode setups
  if ([TaskExecutionMode.FORKING].includes(taskArguments.mode)) {
    logger.info(`impersonating signer address: ${taskArguments.apeaddress} ...`);
    await impersonateAccount(hre, taskArguments.apeaddress);
    signer = await hre.ethers.getSigner(taskArguments.apeaddress);
  }

  if (taskArguments.mode === TaskExecutionMode.DRYRUN) {
    if (taskName === TaskName.IMPORT_FILE) {
      logger.info("setting code in specs contract addresses ...");
      await setCodeOnSpecContractAddresses(hre, specs as SpecItem[]);
    }
  }

  // Instantiante DRCoordinator either on the network (nodryrun) or on the hardhat network
  logger.info(`connecting to DRCoordinator at: ${taskArguments.address} ...`);
  const drCoordinator = await getDRCoordinator(hre, taskArguments.address, taskArguments.mode, signer, overrides);
  await logDRCoordinatorDetail(hre, drCoordinator, { detail: true }, signer);
  // Check signer's role
  return {
    drCoordinator,
    signer,
    overrides,
    specs,
  };
}

export async function unpause(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  overrides: Overrides,
): Promise<void> {
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).unpause(overrides);
    logger.info(`unpause() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.error(error, `unpause() failed due to:`);
    throw error;
  }
}

export async function updateSpecs(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  drcSpecMap: Map<string, SpecConverted>,
  fileSpecMap: Map<string, SpecItemConverted>,
  keysToCheckSet: Set<string>,
  isBatchMode: boolean,
  overrides: Overrides,
  batchSize?: number,
): Promise<void> {
  const keysToUpdateSet = new BetterSet<string>();
  // Classify specs to be updated by topic
  for (const key of keysToCheckSet) {
    const drcSpec = drcSpecMap.get(key) as SpecConverted;
    const fileSpec = fileSpecMap.get(key) as SpecItemConverted;
    if (hasSpecDifferences(fileSpec.specConverted, drcSpec)) {
      keysToUpdateSet.add(key);
    }
  }

  // Perform the updates
  logger.info(
    `${keysToUpdateSet.size ? `updating specs in DRCoordinator ...` : `no specs to update in DRCoordinator`}`,
  );
  if (!keysToUpdateSet.size) return;

  const specToIndexMap = new Map(Array.from([...fileSpecMap.keys()].entries()).map(([idx, key]) => [key, idx]));
  if (isBatchMode) {
    const keys = [...keysToUpdateSet];
    const fileSpecs = keys.map(key => (fileSpecMap.get(key) as SpecItemConverted).specConverted);
    const chunkSize = batchSize || keys.length;
    for (let i = 0; i < keys.length; i += chunkSize) {
      await setSpecs(
        drCoordinator,
        signer,
        keys.slice(i, i + chunkSize),
        fileSpecs.slice(i, i + chunkSize),
        overrides,
        `Updated in batch (${i}, ${i + chunkSize - 1})`,
        specToIndexMap,
      );
    }
  } else {
    for (const key of keysToUpdateSet) {
      const fileSpec = fileSpecMap.get(key) as SpecItemConverted;
      await setSpec(drCoordinator, signer, key, fileSpec.specConverted, overrides, "Updated", specToIndexMap);
    }
  }
}

export async function updateSpecsAuthorizedConsumers(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  drcSpecAuthorizedConsumersMap: Map<string, SpecAuthorizedConsumersConverted>,
  fileSpecMap: Map<string, SpecItemConverted>,
  keysToAddSetRaw: Set<string>,
  keysToCheckSet: Set<string>,
  isBatchMode: boolean,
  overrides: Overrides,
  batchSize?: number,
): Promise<void> {
  const specAuthorizedConsumerToAddMap = new Map<string, SpecAuthorizedConsumersConverted>();
  // Consumers to be added by Spec key (discard any with empty consumers array)
  for (const key of keysToAddSetRaw) {
    const authorizedConsumers = (fileSpecMap.get(key) as SpecItemConverted).specAuthorizedConsumers;
    if (authorizedConsumers.length) {
      // keysToAddSet.add(key);
      specAuthorizedConsumerToAddMap.set(key, authorizedConsumers);
    }
  }
  // Extend consumers to be added by Spec key, and get the ones to be removed by Spec key
  const specAuthorizedConsumerToRemoveMap = new Map<string, SpecAuthorizedConsumersConverted>();
  for (const key of keysToCheckSet) {
    const fileConsumers = (fileSpecMap.get(key) as SpecItemConverted).specAuthorizedConsumers;
    const drcAuthorizedConsumers = drcSpecAuthorizedConsumersMap.get(key) as SpecAuthorizedConsumersConverted;
    const fileConsumersSet = new BetterSet(fileConsumers);
    const drcAuthorizedConsumersSet = new BetterSet(drcAuthorizedConsumers);
    const consumersToAddSet = fileConsumersSet.difference(drcAuthorizedConsumersSet);
    if (consumersToAddSet.size) {
      specAuthorizedConsumerToAddMap.set(key, [...consumersToAddSet]);
    }
    const consumersToRemoveSet = drcAuthorizedConsumersSet.difference(fileConsumersSet);
    if (consumersToRemoveSet.size) {
      specAuthorizedConsumerToRemoveMap.set(key, [...consumersToRemoveSet]);
    }
  }
  const keysToAdd = [...specAuthorizedConsumerToAddMap.keys()];
  const keysToRemove = [...specAuthorizedConsumerToRemoveMap.keys()];
  await insertSpecsAuthorizedConsumers(
    drCoordinator,
    signer,
    fileSpecMap,
    specAuthorizedConsumerToAddMap,
    keysToAdd,
    isBatchMode,
    overrides,
    batchSize,
  );
  await deleteSpecsAuthorizedConsumers(
    drCoordinator,
    signer,
    fileSpecMap,
    specAuthorizedConsumerToRemoveMap,
    keysToRemove,
    isBatchMode,
    overrides,
    batchSize,
  );
}

export function validateConfiguration(configuration: Configuration): void {
  validateConfigurationExternalJobId(configuration.externalJobId);
  validateConfigurationFeeType(configuration.feeType as FeeType);
  validateConfigurationFee(configuration.feeType, configuration.fee);
  validateConfigurationGasLimit(configuration.gasLimit);
  validateConfigurationOperator(configuration.operator);
  validateConfigurationPayment(configuration.paymentType, configuration.payment);
}

export function validateConfigurationExternalJobId(externalJobId: string): void {
  if (!reUUID.test(externalJobId)) {
    throw new Error(`Invalid 'externalJobId': ${externalJobId}. Expected format is UUID v4`);
  }
}

export function validateConfigurationFeeType(feeType: FeeType): void {
  if (!Object.values(FeeType).includes(feeType)) {
    throw new Error(
      `Invalid 'feeType': ${feeType}. Supported values are: ${formatNumericEnumValuesPretty(
        FeeType as unknown as Record<string, number>,
      )}`,
    );
  }
}

export function validateConfigurationFee(feeType: FeeType, fee: string): void {
  if (typeof fee !== "string" || !BigNumber.isBigNumber(BigNumber.from(fee)) || BigNumber.from(fee).lt("0")) {
    throw new Error(`Invalid 'fee': ${fee}. Expected an integer (as string) 0 <= fee`);
  }
  // NB: cross-validation against feeType
  if (feeType === FeeType.FLAT) {
    if (BigNumber.from(fee).gt(LINK_TOTAL_SUPPLY)) {
      throw new Error(
        `Invalid 'fee' for FLAT feeType: ${fee}. ` +
          `Expected an integer (as string) 0 <= fee <= ${LINK_TOTAL_SUPPLY.toNumber()} (LINK total supply). `,
      );
    }
  } else if (feeType === FeeType.PERMIRYAD) {
    // NB: MAX_PERMIRYAD_FEE can be tweaked
    if (BigNumber.from(fee).gt(MAX_PERMIRYAD_FEE)) {
      throw new Error(
        `Invalid 'fee' for PERMIRYAD feeType: ${fee}. ` +
          `Expected an integer (as string) 0 <= fee <= ${MAX_PERMIRYAD_FEE.toNumber()}. ` +
          `Consider bumping MAX_PERMIRYAD_FEE in case of wanting a higher permyriad`,
      );
    }
  } else {
    throw new Error(`Unsupported 'feeType': ${feeType}`);
  }
}

export function validateConfigurationGasLimit(gasLimit: number): void {
  if (typeof gasLimit !== "number" || !Number.isInteger(gasLimit) || gasLimit < MIN_CONSUMER_GAS_LIMIT) {
    throw new Error(`Invalid 'gasLimit': ${gasLimit}. Expected an integer gasLimit >= ${MIN_CONSUMER_GAS_LIMIT}`);
  }
}

export function validateConfigurationOperator(operator: string): void {
  if (
    !ethers.utils.isAddress(operator) ||
    operator !== ethers.utils.getAddress(operator) ||
    operator === ethers.constants.AddressZero
  ) {
    throw new Error(
      `Invalid 'operator': ${operator}. Expected format is a checksum Ethereum address (can't be the Zero address)`,
    );
  }
}

export function validateConfigurationPayment(paymentType: PaymentType, payment: string): void {
  if (
    typeof payment !== "string" ||
    !BigNumber.isBigNumber(BigNumber.from(payment)) ||
    BigNumber.from(payment).lt("0")
  ) {
    throw new Error(`Invalid 'payment': ${payment}. Expected an integer (as string) 0 <= payment`);
  }
  // NB: cross-validation against feeType
  if (paymentType === PaymentType.FLAT) {
    if (BigNumber.from(payment).gt(LINK_TOTAL_SUPPLY)) {
      throw new Error(
        `Invalid 'payment' for FLAT PaymentType: ${payment}. ` +
          `Expected an integer (as string) 0 < payment <= ${LINK_TOTAL_SUPPLY.toNumber()} (LINK total supply). `,
      );
    }
  } else if (paymentType === PaymentType.PERMIRYAD) {
    if (BigNumber.from(payment).gt(PERMIRYAD)) {
      throw new Error(
        `Invalid 'payment' for PERMIRYAD PaymentType: ${payment}. Expected an integer (as string) 0 < payment <= ${PERMIRYAD}`,
      );
    }
  } else {
    throw new Error(`Unsupported 'paymentType': ${PaymentType}`);
  }
}

export function validateConsumers(consumers: string[]): void {
  if (!Array.isArray(consumers)) {
    throw new Error(
      `Invalid 'consumers': ${JSON.stringify(
        consumers,
      )}. Expected format is an array of checksum Ethereum addresses (can't be the Zero address)`,
    );
  }
  const consumerSet = new Set<string>();
  consumers.forEach(consumer => {
    if (
      !ethers.utils.isAddress(consumer) ||
      consumer !== ethers.utils.getAddress(consumer) ||
      consumer === ethers.constants.AddressZero
    ) {
      throw new Error(
        `Invalid 'consumers' item: ${consumer}. Expected format is a checksum Ethereum address (can't be the Zero address)`,
      );
    }
    if (consumerSet.has(consumer)) {
      throw new Error(`Duplicated 'consumer' item: ${consumer}`);
    }
    consumerSet.add(consumer);
  });
}

function validateDescription(description: Description, chainId: ChainId): void {
  // adapter
  validateExternalAdapter(description.adapter);

  // chainId
  // NB: skip validation when deploying on the Hardhat network (dryrun)
  if (chainId !== ChainId.HARDHAT && description.chainId !== chainId) {
    throw new Error(`Chain ID conflict. Spec 'chainId': ${description.chainId}. But running chore on: ${chainId}`);
  }
  // jobId
  if (!Number.isInteger(description.jobId) || description.jobId < 0) {
    throw new Error(`Invalid 'jobId': ${description.jobId}. Expected an integer greter or equal than zero`);
  }
  // jobName
  if (typeof description.jobName !== "string" || !description.jobName.trim()) {
    throw new Error(`Invalid 'jobName': ${JSON.stringify(description.jobName)}. Required a non-empty string`);
  }
  // nodeId
  if (!Object.values(ChainlinkNodeId).includes(description.nodeId)) {
    throw new Error(
      `Invalid 'nodeId': ${description.nodeId}. Check valid values and consider updating ChainlinkNodeId`,
    );
  }
  // notes
  if (description.notes !== null && (typeof description.notes !== "string" || !description.notes.trim())) {
    throw new Error(`Invalid 'notes': ${JSON.stringify(description.notes)}. Required null or a non-empty string`);
  }
}

function validateExternalAdapter(adapter: null | ExternalAdapter): void {
  if (adapter === null) return;

  // id
  if (!Object.values(ExternalAdapterId).includes(adapter.id)) {
    throw new Error(`Invalid adapter 'id': ${adapter.id}. Check valid values and consider updating ExternalAdapterId`);
  }

  // version
  if (!reSemVer.test(adapter.version)) {
    throw new Error(`Invalid adapter 'version': ${adapter.version}. Expected format is 'Major.Minor.Patch'`);
  }
}

export async function verifyDRCoordinator(
  hre: HardhatRuntimeEnvironment,
  drCoordinator: string,
  addressLink: string,
  isMultiPriceFeedDependant: boolean,
  addressPriceFeed1: string,
  addressPriceFeed2: string,
  description: string,
  fallbackWeiPerUnitLink: BigNumber,
  stalenessSeconds: BigNumber,
  isL2SequencerDependant: boolean,
  addressL2SequencerFeed: string,
  l2SequencerGracePeriodSeconds: BigNumber,
): Promise<void> {
  setChainVerifyApiKeyEnv(hre.network.config.chainId as number, hre.config);
  await hre.run("verify:verify", {
    address: drCoordinator,
    constructorArguments: [
      addressLink,
      isMultiPriceFeedDependant,
      addressPriceFeed1,
      addressPriceFeed2,
      description,
      fallbackWeiPerUnitLink,
      stalenessSeconds,
      isL2SequencerDependant,
      addressL2SequencerFeed,
      l2SequencerGracePeriodSeconds,
    ],
  });
}

export async function verifyDRCoordinatorConsumer(
  hre: HardhatRuntimeEnvironment,
  address: string,
  addressLink: string,
  addressDRCoordinator: string,
  contract?: string,
): Promise<void> {
  setChainVerifyApiKeyEnv(hre.network.config.chainId as number, hre.config);
  await hre.run("verify:verify", {
    address,
    constructorArguments: [addressLink, addressDRCoordinator],
    contract,
  });
}

export async function withdrawFunds(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  payee: string,
  amount: BigNumber,
  overrides?: Overrides,
): Promise<void> {
  const logObj = { payee, amount: amount.toString() };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).withdrawFunds(payee, amount, overrides);
    logger.info(logObj, `withdrawFunds() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `withdrawFunds() failed due to:`);
    throw error;
  }
}
