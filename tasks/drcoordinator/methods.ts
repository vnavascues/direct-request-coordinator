import type { ContractTransaction } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, ethers } from "ethers";
import { readFileSync } from "fs";
import type { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";

import {
  ChainlinkNodeId,
  DUMMY_SET_CODE_BYTES,
  ExternalAdapterId,
  FeeType,
  MAX_PERMIRYAD_FULFILLMENT_FEE,
  MAX_REQUEST_CONFIRMATIONS,
  TaskExecutionMode,
  TaskName,
} from "./constants";
import {
  Configuration,
  ConfigurationConverted,
  DeployData,
  Description,
  DRCoordinatorLogConfig,
  ExternalAdapter,
  Spec,
  SpecConverted,
} from "./types";
import { BetterSet } from "../../libs/better-set";
import type { DRCoordinator } from "../../src/types";
import { ChainId } from "../../utils/constants";
import {
  chainIdFlags,
  chainIdSequencerOfflineFlag,
  convertJobIdToBytes32,
  getLinkBalanceOf,
  getNetworkLinkAddress,
  getNetworkLinkAddressDeployingOnHardhat,
  getNetworkLinkTknFeedAddress,
  LINK_TOTAL_SUPPLY,
  MIN_CONSUMER_GAS_LIMIT,
} from "../../utils/chainlink";
import { isAddressAContract, getNumberOfConfirmations } from "../../utils/deployment";
import { formatNumericEnumValuesPretty } from "../../utils/enums";
import { getGasOverridesFromTaskArgs } from "../../utils/gas-estimation";
import { setAddressCode } from "../../utils/hre";
import { logger } from "../../utils/logger";
import { reSemVer, reUUID } from "../../utils/regex";
import type { Overrides } from "../../utils/types";
import { setChainVerifyApiKeyEnv } from "../../utils/verification";

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

export async function addSpecs(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  fileSpecMap: Map<string, SpecConverted>,
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
    const fileSPecs = keys.map(key => fileSpecMap.get(key) as SpecConverted);
    const chunkSize = batchSize || keys.length;
    for (let i = 0; i < keys.length; i += chunkSize) {
      await setSpecs(
        drCoordinator,
        signer,
        keys.slice(i, i + chunkSize),
        fileSPecs.slice(i, i + chunkSize),
        overrides,
        `Added in batch (${i}, ${i + chunkSize - 1})`,
        specToIndexMap,
      );
    }
  } else {
    for (const key of keysToAddSet) {
      const fileSpec = fileSpecMap.get(key) as SpecConverted;
      await setSpec(drCoordinator, signer, key, fileSpec, overrides, "Added", specToIndexMap);
    }
  }
}

export function checkSpecsIntegrity(specs: Spec[], chainId: ChainId): void {
  if (!Array.isArray(specs)) {
    throw new Error(`Invalid specs file data format. Expected an array of Spec items`);
  }
  // Validate specs
  const jsonValues = Object.values(specs);
  for (const [idx, { description, configuration }] of jsonValues.entries()) {
    try {
      validateDescription(description, chainId);
      validateConfiguration(configuration);
    } catch (error) {
      throw new Error(`Invalid entry at index ${idx}: ${JSON.stringify(specs[idx])}. Reason: ${error}`);
    }
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

export async function deployDRCoordinator(
  hre: HardhatRuntimeEnvironment,
  signer: ethers.Wallet | SignerWithAddress,
  description: string,
  fallbackWeiPerUnitLink: BigNumber,
  stalenessSeconds: BigNumber,
  overrides: Overrides,
  numberOfConfirmations?: number,
): Promise<DeployData> {
  // Get LINK and LINK_TKN_FEED related arguments by network
  const chainId = hre.network.config.chainId as number;
  chainIdSequencerOfflineFlag.get(chainId);
  let addressLink: string;
  let addressLinkTknFeed: string;
  let isSequencerDependant: boolean;
  let sequencerOfflineFlag: string;
  let addressChainlinkFlags: string;
  if (chainId === ChainId.HARDHAT) {
    // TODO: deploy?
    addressLink = await getNetworkLinkAddressDeployingOnHardhat(hre); // ethers.constants.AddressZero;
    addressLinkTknFeed = ethers.constants.AddressZero;
    sequencerOfflineFlag = "";
    isSequencerDependant = false;
    addressChainlinkFlags = ethers.constants.AddressZero;
  } else {
    addressLink = getNetworkLinkAddress(hre.network);
    addressLinkTknFeed = getNetworkLinkTknFeedAddress(hre.network);
    sequencerOfflineFlag = chainIdSequencerOfflineFlag.get(chainId) || "";
    isSequencerDependant = !!sequencerOfflineFlag;
    addressChainlinkFlags = chainIdFlags.get(chainId) || ethers.constants.AddressZero;
  }

  // Deploy
  const drCoordinatorFactory = await hre.ethers.getContractFactory("DRCoordinator");
  const drCoordinator = (await drCoordinatorFactory
    .connect(signer)
    .deploy(
      addressLink,
      addressLinkTknFeed,
      description,
      fallbackWeiPerUnitLink,
      stalenessSeconds,
      isSequencerDependant,
      sequencerOfflineFlag,
      addressChainlinkFlags,
      overrides,
    )) as DRCoordinator;
  logger.info(`DRCoordinator deployed to: ${drCoordinator.address} | Tx hash: ${drCoordinator.deployTransaction.hash}`);
  await drCoordinator
    .connect(signer)
    .deployTransaction.wait(getNumberOfConfirmations(hre.network.config.chainId, numberOfConfirmations));

  return {
    drCoordinator,
    addressLink,
    addressLinkTknFeed,
    isSequencerDependant,
    sequencerOfflineFlag,
    addressChainlinkFlags,
  };
}

export function generateSpecKey(operator: string, specId: string): string {
  return ethers.utils.keccak256(ethers.utils.solidityPack(["address", "bytes32"], [operator, specId]));
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
      overrides,
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

export async function getSpecConfigurationConverted(configuration: Configuration): Promise<ConfigurationConverted> {
  const operator = configuration.operator;
  const specId = convertJobIdToBytes32(configuration.externalJobId);
  const key = generateSpecKey(operator, specId);

  return {
    feeType: configuration.feeType,
    fulfillmentFee: BigNumber.from(configuration.fulfillmentFee),
    gasLimit: configuration.gasLimit,
    key,
    minConfirmations: configuration.minConfirmations,
    operator,
    payment: BigNumber.from(configuration.payment),
    specId,
  };
}

export async function getSpecConvertedMap(specs: Spec[]): Promise<Map<string, SpecConverted>> {
  const specConvertedMap: Map<string, SpecConverted> = new Map();
  for (const [idx, { configuration }] of specs.entries()) {
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
    const specConverted: SpecConverted = {
      ...configurationConverted,
    };
    specConvertedMap.set(specConverted.key, specConverted);
  }
  return specConvertedMap;
}

export async function getSpecMap(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  keys: string[],
): Promise<Map<string, SpecConverted>> {
  const specMap: Map<string, SpecConverted> = new Map();
  for (const key of keys) {
    const [specId, operator, payment, minConfirmations, gasLimit, fulfillmentFee, feeType] = await drCoordinator
      .connect(signer)
      .getSpec(key);
    const spec = {
      feeType,
      fulfillmentFee,
      gasLimit,
      key,
      minConfirmations,
      operator,
      payment,
      specId,
    };
    specMap.set(key, spec);
  }
  return specMap;
}

export function hasSpecDifferences(fileSpec: SpecConverted, drcSpec: SpecConverted): boolean {
  return (
    fileSpec.feeType !== drcSpec.feeType ||
    !fileSpec.fulfillmentFee.eq(drcSpec.fulfillmentFee) ||
    fileSpec.gasLimit !== drcSpec.gasLimit ||
    fileSpec.minConfirmations !== drcSpec.minConfirmations ||
    !fileSpec.payment.eq(drcSpec.payment)
  );
}

export async function logDRCoordinatorDetail(
  hre: HardhatRuntimeEnvironment,
  drCoordinator: DRCoordinator,
  logConfig: DRCoordinatorLogConfig,
  signer: ethers.Wallet | SignerWithAddress,
): Promise<void> {
  if (logConfig.detail) {
    const address = drCoordinator.connect(signer).address;
    const typeAndVersion = await drCoordinator.connect(signer).typeAndVersion();
    const description = await drCoordinator.connect(signer).getDescription();
    const owner = await drCoordinator.connect(signer).owner();
    const paused = await drCoordinator.connect(signer).paused();
    const maxRequestConfirmations = await drCoordinator.connect(signer).MAX_REQUEST_CONFIRMATIONS();
    const isSequencerPendant = await drCoordinator.connect(signer).IS_SEQUENCER_DEPENDANT();
    let flagsSequencerOffline = "N/A";
    let chainlinkFlags = "N/A";
    if (isSequencerPendant) {
      flagsSequencerOffline = await drCoordinator.connect(signer).FLAG_SEQUENCER_OFFLINE();
      chainlinkFlags = await drCoordinator.connect(signer).CHAINLINK_FLAGS();
    }
    const addressLink = await drCoordinator.connect(signer).LINK();
    const addressLinkTknFeed = await drCoordinator.connect(signer).LINK_TKN_FEED();
    const gasAfterPaymentCalculation = await drCoordinator.connect(signer).GAS_AFTER_PAYMENT_CALCULATION();
    const fallbackWeiPerUnitLink = await drCoordinator.connect(signer).getFallbackWeiPerUnitLink();
    const stalenessSeconds = await drCoordinator.connect(signer).getStalenessSeconds();
    const sha1 = await drCoordinator.connect(signer).getSha1();
    const linkBalance = await getLinkBalanceOf(hre, drCoordinator.address, addressLink);
    const linkProfit = await drCoordinator.connect(signer).availableFunds(drCoordinator.address);
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
        LINK_TKN_FEED: addressLinkTknFeed,
        MAX_REQUEST_CONFIRMATIONS: `${maxRequestConfirmations}`,
        IS_SEQUENCER_DEPENDANT: isSequencerPendant,
        FLAG_SEQUENCER_OFFLINE: flagsSequencerOffline,
        CHAINLINK_FLAGS: chainlinkFlags,
        GAS_AFTER_PAYMENT_CALCULATION: `${gasAfterPaymentCalculation}`,
        fallbackWeiPerUnitLink: `${fallbackWeiPerUnitLink}`,
        stalenessSeconds: `${stalenessSeconds}`,
        sha1: sha1,
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

export function parseAndCheckSpecsFile(filePath: string, chainId: ChainId): Spec[] {
  // Read and parse the specs JSON file
  const specs = parseSpecsFile(filePath);
  // Validate specs file
  checkSpecsIntegrity(specs, chainId);

  return specs;
}

export function parseSpecsFile(filePath: string): Spec[] {
  let specs: Spec[];
  try {
    specs = JSON.parse(readFileSync(filePath, "utf-8")) as Spec[];
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

export async function setCodeOnSpecContractAddresses(hre: HardhatRuntimeEnvironment, specs: Spec[]): Promise<void> {
  const configurations = specs.map((spec: Spec) => spec.configuration);

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

export async function setSha1(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  sha1: string,
  overrides: Overrides,
): Promise<void> {
  const logObj = { sha1 };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).setSha1(`0x${sha1}`, overrides);
    logger.info(logObj, `setSha1() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `setSha1() failed due to:`);
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

  // Forking mode checks
  if (taskArguments.mode === TaskExecutionMode.FORKING && !hre.config.networks.hardhat.forking?.enabled) {
    throw new Error(
      `Task 'mode' '${taskArguments.mode}' requires the Hardhat Network forking-config setup and enabled. ` +
        `Please, set HARDHAT_FORKING_ENABLED and your HARDHAT_FORKING_URL in the .env file`,
    );
  }

  // Get tx overrides with gas params
  let overrides: Overrides = {};
  if (taskArguments.gas) {
    overrides = await getGasOverridesFromTaskArgs(taskArguments, hre);
  }

  // Instantiate the signer of the network
  const [signer] = await hre.ethers.getSigners();
  logger.info(`signer address: ${signer.address}`);

  // Open and chec the specs file
  let specs: undefined | Spec[];
  if (taskName === TaskName.IMPORT_FILE) {
    // Read and parse the specs JSON file
    logger.info(`parsing and checking specs file: ${taskArguments.filename}.json ...`);
    const filePath = `./specs/${taskArguments.filename}.json`;
    specs = parseAndCheckSpecsFile(filePath, hre.network.config.chainId as ChainId);
  }

  if (taskArguments.mode === TaskExecutionMode.DRYRUN) {
    if (taskName === TaskName.IMPORT_FILE) {
      logger.info("setting code in specs contract addresses ...");
      await setCodeOnSpecContractAddresses(hre, specs as Spec[]);
    }
  }

  // Instantiante DRCoordinator either on the network (nodryrun) or on the hardhat network
  logger.info(`connecting to DRCoordinator at: ${taskArguments.address} ...`);
  const drCoordinator = await getDRCoordinator(hre, taskArguments.address, taskArguments.mode, signer, overrides);
  await logDRCoordinatorDetail(hre, drCoordinator, { detail: true }, signer);

  // Check signer's role
  // TODO: request owner
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
  fileSpecMap: Map<string, SpecConverted>,
  keysToCheckSet: Set<string>,
  isBatchMode: boolean,
  overrides: Overrides,
  batchSize?: number,
): Promise<void> {
  const keysToUpdateSet = new BetterSet<string>();
  // Classify specs to be updated by topic
  for (const key of keysToCheckSet) {
    const drcSpec = drcSpecMap.get(key) as SpecConverted;
    const fileSpec = fileSpecMap.get(key) as SpecConverted;
    if (hasSpecDifferences(fileSpec, drcSpec)) {
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
    const fileSpecs = keys.map(key => fileSpecMap.get(key) as SpecConverted);
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
      const fileSpec = fileSpecMap.get(key) as SpecConverted;
      await setSpec(drCoordinator, signer, key, fileSpec, overrides, "Updated", specToIndexMap);
    }
  }
}

export function validateConfiguration(configuration: Configuration): void {
  validateConfigurationExternalJobId(configuration.externalJobId);
  validateConfigurationFeeType(configuration.feeType as FeeType);
  validateConfigurationFulfillmentFee(configuration.fulfillmentFee, configuration.feeType);
  validateConfigurationGasLimit(configuration.gasLimit);
  validateConfigurationMinConfirmations(configuration.minConfirmations);
  validateConfigurationOperator(configuration.operator);
  validateConfigurationPayment(configuration.payment);
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

export function validateConfigurationFulfillmentFee(fulfillmentFee: string, feeType: FeeType): void {
  if (
    typeof fulfillmentFee !== "string" ||
    !BigNumber.isBigNumber(BigNumber.from(fulfillmentFee)) ||
    BigNumber.from(fulfillmentFee).lte("0") ||
    BigNumber.from(fulfillmentFee).gt(LINK_TOTAL_SUPPLY)
  ) {
    throw new Error(
      `Invalid 'fulfillmentFee': ${fulfillmentFee}. Expected an integer (as string) 0 < fulfillmentFee <= 1e27 (LINK total supply)`,
    );
  }

  // NB: cross-validation for permyriad fee type. It can be personalised
  if (feeType === FeeType.PERMIRYAD) {
    if (BigNumber.from(fulfillmentFee).gt(MAX_PERMIRYAD_FULFILLMENT_FEE)) {
      throw new Error(
        `Invalid 'fulfillmentFee' for PERMIRYAD fee type: ${fulfillmentFee}. ` +
          `Expected an integer (as string) 0 < fulfillmentFee <= ${MAX_PERMIRYAD_FULFILLMENT_FEE.toNumber()}. ` +
          `Consider bumping MAX_PERMIRYAD_FULFILLMENT_FEE in case of wanting a higher permyriad`,
      );
    }
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

export function validateConfigurationMinConfirmations(minConfirmations: number): void {
  if (
    typeof minConfirmations !== "number" ||
    !Number.isInteger(minConfirmations) ||
    minConfirmations < 0 ||
    BigNumber.from(minConfirmations).gt(MAX_REQUEST_CONFIRMATIONS)
  ) {
    throw new Error(
      `Invalid 'minConfirmations': ${minConfirmations}. Expected an integer 0 < minConfirmations <= ${MAX_REQUEST_CONFIRMATIONS.toNumber()}`,
    );
  }
}

export function validateConfigurationPayment(payment: string): void {
  if (
    typeof payment !== "string" ||
    !BigNumber.isBigNumber(BigNumber.from(payment)) ||
    BigNumber.from(payment).lte("0") ||
    BigNumber.from(payment).gt(LINK_TOTAL_SUPPLY)
  ) {
    throw new Error(
      `Invalid 'payment': ${payment}. Expected an integer (as string) 0 < payment <= 1e27 (LINK total supply)`,
    );
  }
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

export async function verifyConsumer(
  hre: HardhatRuntimeEnvironment,
  address: string,
  addressLink: string,
  contract?: string,
): Promise<void> {
  setChainVerifyApiKeyEnv(hre.network.config.chainId as number, hre.config);
  await hre.run("verify:verify", {
    address,
    constructorArguments: [addressLink],
    contract,
  });
}

export async function verifyDRCoordinator(
  hre: HardhatRuntimeEnvironment,
  drCoordinator: string,
  addressLink: string,
  addressLinkTknFeed: string,
  description: string,
  fallbackWeiPerUnitLink: BigNumber,
  stalenessSeconds: BigNumber,
  isSequencerDependant: boolean,
  sequencerOfflineFlag: string,
  addressChainlinkFlags: string,
): Promise<void> {
  setChainVerifyApiKeyEnv(hre.network.config.chainId as number, hre.config);
  await hre.run("verify:verify", {
    address: drCoordinator,
    constructorArguments: [
      addressLink,
      addressLinkTknFeed,
      description,
      fallbackWeiPerUnitLink,
      stalenessSeconds,
      isSequencerDependant,
      sequencerOfflineFlag,
      addressChainlinkFlags,
    ],
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
