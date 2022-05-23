import { task, types } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import hash from "object-hash";

import { TaskExecutionMode, TaskName } from "./constants";
import {
  addSpecs,
  deleteSpecs,
  deployDRCoordinator,
  getDRCoordinator,
  generateSpecKey,
  getSpecConvertedMap,
  getSpecMap,
  logDRCoordinatorDetail,
  parseAndCheckSpecsFile,
  parseSpecsFile,
  pause,
  setDescription,
  setFallbackWeiPerUnitLink,
  setGasAfterPaymentCalculation,
  setSha1,
  setStalenessSeconds,
  setupDRCoordinatorAfterDeploy,
  setupDRCoordinatorBeforeTask,
  transferOwnership,
  unpause,
  updateSpecs,
  validateConfigurationExternalJobId,
  validateConfigurationOracleAddr,
  verifyDRCoordinator,
  withdraw,
} from "./methods";
import type { Spec } from "./types";
import { BetterSet } from "../../libs/better-set";
import {
  chainIdFlags,
  chainIdSequencerOfflineFlag,
  convertJobIdToBytes32,
  getNetworkLinkAddress,
  getNetworkLinkTknFeedAddress,
} from "../../utils/chainlink";
import { ChainId } from "../../utils/constants";
import { getGasOverridesFromTaskArgs } from "../../utils/gas-estimation";
import { logger } from "../../utils/logger";
import type { Overrides } from "../../utils/types";
import {
  address as typeAddress,
  bignumber as typeBignumber,
  bytes as typeBytes,
  optionsArray as typeOptionsArray,
  uuid as typeUUID,
} from "../../utils/task-arguments-validations";

task("drcoordinator:deploy", "Deploy a DRCoordinator")
  .addParam("description", "The contract description", undefined, types.string)
  .addParam("fallbackweiperunitlink", "The fallback amount of TKN wei per LINK", undefined, typeBignumber)
  .addParam(
    "gasafterpaymentcalc",
    "The amount of wei used by the contract after sending the response to the consumer",
    undefined,
    typeBignumber,
  )
  .addParam(
    "stalenessseconds",
    "The number of seconds after which the feed answer is considered stale",
    undefined,
    typeBignumber,
  )
  // Configuration after deployment
  .addFlag("setup", "Configs the contract after deployment")
  .addOptionalParam("owner", "The address to transfer the ownership", undefined, typeAddress)
  // Verification
  .addFlag("verify", "Verify the contract on Etherscan after deployment")
  // Gas customisation
  .addFlag("gas", "Customise the tx gas")
  .addOptionalParam("type", "The tx type", undefined, types.int)
  .addOptionalParam("gasprice", "Type 0 tx gasPrice", undefined, types.float)
  .addOptionalParam("gasmaxfee", "Type 2 tx maxFeePerGas", undefined, types.float)
  .addOptionalParam("gasmaxpriority", "Type 2 tx maxPriorityFeePerGas", undefined, types.float)
  .setAction(async function (taskArguments: TaskArguments, hre) {
    // Instantiate the signer of the network
    const [signer] = await hre.ethers.getSigners();
    logger.info(`signer address: ${signer.address}`);

    // Get tx overrides with gas params
    let overrides: Overrides = {};
    if (taskArguments.gas) {
      overrides = await getGasOverridesFromTaskArgs(taskArguments, hre);
    }

    // Deploy
    const {
      drCoordinator,
      addressLink,
      addressLinkTknFeed,
      isSequencerDependant,
      sequencerOfflineFlag,
      addressChainlinkFlags,
    } = await deployDRCoordinator(
      hre,
      signer,
      taskArguments.description,
      taskArguments.fallbackweiperunitlink,
      taskArguments.gasafterpaymentcalc,
      taskArguments.stalenessseconds,
      overrides,
    );

    // Setup
    if (taskArguments.setup) {
      await setupDRCoordinatorAfterDeploy(taskArguments, drCoordinator, signer, overrides);
    }
    if (!taskArguments.verify) return;

    // Verify
    // NB: contract verification request may fail if the contract address does not have bytecode. Wait until it's mined
    await verifyDRCoordinator(
      hre,
      drCoordinator.address,
      addressLink,
      addressLinkTknFeed,
      taskArguments.description,
      taskArguments.fallbackweiperunitlink,
      taskArguments.gasafterpaymentcalc,
      taskArguments.stalenessseconds,
      isSequencerDependant,
      sequencerOfflineFlag,
      addressChainlinkFlags,
    );
  });

task("drcoordinator:detail", "Log the DRCoordinator storage")
  .addParam("address", "The DRCoordinator contract address", undefined, typeAddress)
  // TODO: remove dryrun?
  // .addParam("mode", "The execution mode", TaskExecutionMode.DRYRUN, typeOptionsArray(Object.values(TaskExecutionMode)))
  .addFlag("keys", "Log the Spec keys")
  .addFlag("specs", "Log each Spec")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const [signer] = await hre.ethers.getSigners();
    logger.info(`connecting to DRCoordinator at: ${taskArguments.address}`);
    const drCoordinator = await getDRCoordinator(hre, taskArguments.address, TaskExecutionMode.PROD);
    // const drCoordinator = await getDRCoordinator(hre, taskArguments.address, taskArguments.mode, signer, {});

    await logDRCoordinatorDetail(
      drCoordinator,
      {
        detail: true,
        keys: taskArguments.keys,
        specs: taskArguments.specs,
      },
      signer,
    );
  });

task("drcoordinator:generate-key", "Generate the Spec key")
  .addParam("oracleaddr", "The oracle contract address", undefined, typeAddress)
  .addOptionalParam(
    "externaljobid",
    "The Job Specification ID that the request will be created for (as UUIDv4)",
    undefined,
    typeUUID,
  )
  .addOptionalParam("specid", "The job spec ID (as bytes32)", undefined, typeBytes(32))

  .setAction(async function (taskArguments: TaskArguments) {
    if (!taskArguments.externaljobid && !taskArguments.specid) {
      throw new Error(`Either 'externaljobid' or 'specid' task argument is required`);
    }

    validateConfigurationOracleAddr(taskArguments.oracleaddr);

    let specId: string;
    if (taskArguments.externaljobid) {
      // NB: just in case taskArgument validation is removed by mistake
      validateConfigurationExternalJobId(taskArguments.externaljobid);
      specId = convertJobIdToBytes32(taskArguments.externaljobid);
    } else {
      specId = taskArguments.specid;
    }
    const key = generateSpecKey(taskArguments.oracleaddr, specId);
    logger.info(`key: ${key}`);
  });

task("drcoordinator:generate-sha1", "Generate the specs file 'sha1'")
  .addParam("filename", "The specs filename (without .json extension) in the specs folder", undefined, types.string)
  // Check specs file
  .addFlag("check", "Checks the integrity of the specs file")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const filePath = `./specs/${taskArguments.filename}.json`;
    let specs: Spec[];
    if (taskArguments.check) {
      specs = parseAndCheckSpecsFile(filePath, hre.network.config.chainId as ChainId);
    } else {
      specs = parseSpecsFile(filePath);
    }
    const sha1 = hash(specs, { unorderedObjects: false });
    logger.info(`sha1: 0x${sha1}`);
  });

task("drcoordinator:import-file", "CUD specs in the DRCoordinator storage")
  .addParam("address", "The DRCoordinator contract address", undefined, typeAddress)
  .addParam("filename", "The entries filename (without .json extension) in the entries folder", undefined, types.string)
  .addParam("mode", "The execution mode", TaskExecutionMode.DRYRUN, typeOptionsArray(Object.values(TaskExecutionMode)))
  // Batch import
  .addFlag("nobatch", "Disables the batch import")
  .addOptionalParam("batchsize", "Number of entries per CUD transaction", 50, types.int)
  // Gas customisation
  .addFlag("gas", "Customise the tx gas")
  .addOptionalParam("type", "The tx type", undefined, types.int)
  .addOptionalParam("gasprice", "Type 0 tx gasPrice", undefined, types.float)
  .addOptionalParam("gasmaxfee", "Type 2 tx maxFeePerGas", undefined, types.float)
  .addOptionalParam("gasmaxpriority", "Type 2 tx maxPriorityFeePerGas", undefined, types.float)
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { drCoordinator, signer, overrides, specs } = await setupDRCoordinatorBeforeTask(
      taskArguments,
      hre,
      TaskName.IMPORT_FILE,
    );

    // Fetch DRCoordinator sha-1, calculate the specs file sha-1, and compare both
    const fileSha1 = hash(specs as Spec[], { unorderedObjects: false });
    const sha1 = await drCoordinator.connect(signer).getSha1();
    if (fileSha1 === sha1.slice(2)) {
      logger.info(`nothing to import. DRCoordinator sha-1 and specs file sha-1 match: ${sha1}`);
      logger.info("*** Import file task finished successfully ***");
      return;
    }

    logger.info(`converting file specs ...`);
    const fileSpecMap = await getSpecConvertedMap(specs as Spec[]);

    // Fetch each DRCoordinator Spec and map them by key
    logger.info(`fetching DRCoordinator specs ...`);
    const drcKeys = await drCoordinator.connect(signer).getSpecMapKeys();
    const drcSpecMap = await getSpecMap(drCoordinator, signer, drcKeys);

    // Get Spec sets
    logger.info(`calculating DRCoordinator specs to be removed, updated and added ...`);
    const fileKeys = [...fileSpecMap.keys()];
    const drcKeysSet = new BetterSet(drcKeys);
    const fileKeysSet = new BetterSet(fileKeys);
    const keysToRemoveSet = fileKeysSet.difference(drcKeysSet);
    const keysToAddSet = drcKeysSet.difference(fileKeysSet);
    const keysToCheckSet = fileKeysSet.intersection(drcKeysSet);

    // Remove, update and add entries
    const isBatchMode = !taskArguments.nobatch;

    await deleteSpecs(drCoordinator, signer, keysToRemoveSet, isBatchMode, overrides, taskArguments.batchsize);
    await updateSpecs(
      drCoordinator,
      signer,
      drcSpecMap,
      fileSpecMap,
      keysToCheckSet,
      isBatchMode,
      overrides,
      taskArguments.batchsize,
    );
    await addSpecs(drCoordinator, signer, fileSpecMap, keysToAddSet, isBatchMode, overrides, taskArguments.batchsize);

    // Set sha1
    logger.info(`setting DRCoordinator sha-1 ...`);
    await setSha1(drCoordinator, signer, fileSha1, overrides);

    logger.info("*** Import file task finished successfully ***");
  });

task("drcoordinator:set-stuff", "Set all kind of variables in the contract")
  .addParam("address", "The DRCoordinator contract address", undefined, typeAddress)
  .addParam(
    "mode",
    "The execution mode",
    TaskExecutionMode.FORKING,
    typeOptionsArray([TaskExecutionMode.FORKING, TaskExecutionMode.PROD]),
  )
  .addOptionalParam("description", "The new 'description' value", undefined, types.string)
  .addOptionalParam("fallbackweiperunitlink", "The new 'fallbackWeiPerUnitLink'", undefined, typeBignumber)
  .addOptionalParam("gasafterpaymentcalc", "The new 'gasAfterPaymentCalculation'", undefined, types.int)
  .addOptionalParam("owner", "The new 'owner' (address to transfer the ownership)", undefined, typeAddress)
  .addOptionalParam("pause", "Pause or unpause the contract", undefined, types.boolean)
  .addOptionalParam("sha1", "The new 'sha1'", undefined, typeBytes(20))
  .addOptionalParam("stalenessseconds", "The new 'stalenessSeconds'", undefined, typeBignumber)
  // Gas customisation
  .addFlag("gas", "Customise the tx gas")
  .addOptionalParam("type", "The tx type", undefined, types.int)
  .addOptionalParam("gasprice", "Type 0 tx gasPrice", undefined, types.float)
  .addOptionalParam("gasmaxfee", "Type 2 tx maxFeePerGas", undefined, types.float)
  .addOptionalParam("gasmaxpriority", "Type 2 tx maxPriorityFeePerGas", undefined, types.float)
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { drCoordinator, signer, overrides } = await setupDRCoordinatorBeforeTask(
      taskArguments,
      hre,
      TaskName.SET_STUFF,
    );

    // Set description
    if (taskArguments.description) {
      await setDescription(drCoordinator, signer, taskArguments.description, overrides);
    }

    // Set fallbackWeiPerUnitLink
    if (taskArguments.fallbackweiperunitlink) {
      await setFallbackWeiPerUnitLink(drCoordinator, signer, taskArguments.fallbackweiperunitlink, overrides);
    }

    // Set gasAfterPaymentCalculation
    if (taskArguments.gasafterpaymentcalc) {
      await setGasAfterPaymentCalculation(drCoordinator, signer, taskArguments.gasafterpaymentcalc, overrides);
    }

    // Transfer ownerwhip
    if (taskArguments.owner) {
      await transferOwnership(drCoordinator, signer, taskArguments.owner, overrides);
    }

    // Pause
    if (taskArguments.pause === true) {
      await pause(drCoordinator, signer, overrides);
    }

    // Set sha1
    if (taskArguments.sha1) {
      await setSha1(drCoordinator, signer, taskArguments.sha1.slice(2), overrides);
    }

    // Set stalenessSeconds
    if (taskArguments.stalenessseconds) {
      await setStalenessSeconds(drCoordinator, signer, taskArguments.stalenessseconds, overrides);
    }

    // Unpause
    if (taskArguments.pause === false) {
      await unpause(drCoordinator, signer, overrides);
    }

    logger.info("*** Set stuff task finished successfully ***");
  });

task("drcoordinator:verify", "Verify a DRCoordinator on an Etherscan-like block explorer")
  .addParam("address", "The deployed contract address", undefined, typeAddress)
  .addParam("description", "The contract description", undefined, types.string)
  .addParam("fallbackweiperunitlink", "The fallback amount of TKN wei per LINK", undefined, typeBignumber)
  .addParam(
    "gasafterpaymentcalc",
    "The amount of wei used by the contract after sending the response to the consumer",
    undefined,
    typeBignumber,
  )
  .addParam(
    "stalenessseconds",
    "The number of seconds after which the feed answer is considered stale",
    undefined,
    typeBignumber,
  )
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const chainId = hre.network.config.chainId as number;
    const addressLink = getNetworkLinkAddress(hre.network);
    const addressLinkTknFeed = getNetworkLinkTknFeedAddress(hre.network);
    const sequencerOfflineFlag = chainIdSequencerOfflineFlag.get(chainId) || "";
    const isSequencerDependant = !!sequencerOfflineFlag;
    const addressChainlinkFlags = chainIdFlags.get(chainId) || "";
    await verifyDRCoordinator(
      hre,
      taskArguments.address,
      addressLink,
      addressLinkTknFeed,
      taskArguments.description,
      taskArguments.fallbackweiperunitlink,
      taskArguments.gasafterpaymentcalc,
      taskArguments.stalenessseconds,
      isSequencerDependant,
      sequencerOfflineFlag,
      addressChainlinkFlags,
    );
  });

task("drcoordinator:withdraw", "Withdraw LINK in the contract")
  .addParam("address", "The DRCoordinator contract address", undefined, typeAddress)
  .addParam(
    "mode",
    "The execution mode",
    TaskExecutionMode.FORKING,
    typeOptionsArray([TaskExecutionMode.FORKING, TaskExecutionMode.PROD]),
  )
  // More granular withdraw
  .addFlag("granular", "Allows setting a payee and an amount")
  .addOptionalParam("payee", "The address that receives the LINK", undefined, typeAddress)
  .addOptionalParam("amount", "The LINK amount", undefined, typeBignumber)
  // Gas customisation
  .addFlag("gas", "Customise the tx gas")
  .addOptionalParam("type", "The tx type", undefined, types.int)
  .addOptionalParam("gasprice", "Type 0 tx gasPrice", undefined, types.float)
  .addOptionalParam("gasmaxfee", "Type 2 tx maxFeePerGas", undefined, types.float)
  .addOptionalParam("gasmaxpriority", "Type 2 tx maxPriorityFeePerGas", undefined, types.float)
  .setAction(async function (taskArguments: TaskArguments, hre) {
    // Check task arguments combination
    if (taskArguments.granular && (!taskArguments.payee || !taskArguments.amount)) {
      throw new Error(`A granular withdraw requires 'payee' and 'amount' task arguments`);
    }

    const { drCoordinator, signer, overrides } = await setupDRCoordinatorBeforeTask(
      taskArguments,
      hre,
      TaskName.WITHDRAW,
    );

    if (taskArguments.granular) {
      await withdraw(drCoordinator, signer, taskArguments.payee, taskArguments.amount, overrides);
    } else {
      const availableFunds = await drCoordinator.connect(signer).availableFunds();
      await withdraw(drCoordinator, signer, taskArguments.payee, availableFunds, overrides);
    }

    logger.info("*** Withdraw task finished successfully ***");
  });
