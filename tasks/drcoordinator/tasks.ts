import { BigNumber, ethers } from "ethers";
import { task, types } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import hash from "object-hash";

import { DEFAULT_BATCH_SIZE, FeeType, TaskExecutionMode, TaskName } from "./constants";
import {
  addFunds,
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
  setSha1,
  setStalenessSeconds,
  setupDRCoordinatorAfterDeploy,
  setupDRCoordinatorBeforeTask,
  transferOwnership,
  unpause,
  updateSpecs,
  validateConfigurationExternalJobId,
  validateConfigurationOperator,
  verifyDRCoordinator,
  verifyDRCoordinatorConsumer,
  withdrawFunds,
} from "./methods";
import type { Spec } from "./types";
import { BetterSet } from "../../libs/better-set";
import {
  approve as approveLink,
  chainIdFlags,
  chainIdSequencerOfflineFlag,
  convertBytes32ToJobId,
  convertJobIdToBytes32,
  getNetworkLinkAddress,
  getNetworkLinkTknFeedAddress,
  MIN_CONSUMER_GAS_LIMIT,
  validateLinkAddressFunds,
} from "../../utils/chainlink";
import { DRCoordinator, LinkToken } from "../../src/types";
import { ChainId } from "../../utils/constants";
import { getNumberOfConfirmations } from "../../utils/deployment";
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

task("drcoordinator:calculate-max-amount", "Calculates the max LINK amount for the given params")
  .addParam("address", "The DRCoordinator contract address", undefined, typeAddress)
  .addOptionalParam("weiperunitgas", "The wei per unit of gas on the network", undefined, types.int)
  .addParam(
    "payment",
    "The initial LINK payment amount in Juels (from Spec.payment and 'minContractPaymentLinkJuels')",
    undefined,
    typeBignumber,
  )
  .addParam("gaslimit", "The transaction gasLimit in gwei", MIN_CONSUMER_GAS_LIMIT, types.int)
  .addParam("fulfillmentfee", "The fulfillment fee", undefined, typeBignumber)
  .addParam(
    "feetype",
    "The fee type",
    undefined,
    typeOptionsArray([FeeType.FLAT.toString(), FeeType.PERMIRYAD.toString()]),
  )
  // Get wei per unit of gas from provider
  .addFlag("provider", "Uses the providers `'gasPrice' for 'weiPerUnitGas'")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const [signer] = await hre.ethers.getSigners();
    logger.info(`connecting to DRCoordinator at: ${taskArguments.address}`);
    const drCoordinator = await getDRCoordinator(hre, taskArguments.address, TaskExecutionMode.PROD);

    let weiPerGasUnit: BigNumber;
    if (taskArguments.provider) {
      weiPerGasUnit = (await hre.ethers.provider.getFeeData()).gasPrice as BigNumber;
      if (weiPerGasUnit === null) {
        throw new Error(`'gasPrice' not found on network: ${hre.network.name}`);
      }
    } else {
      weiPerGasUnit = taskArguments.weiperunitgas as BigNumber;
    }
    const maxPaymentAmount = await drCoordinator
      .connect(signer)
      .calculateMaxPaymentAmount(
        weiPerGasUnit,
        taskArguments.payment as BigNumber,
        taskArguments.gaslimit,
        taskArguments.fulfillmentfee as BigNumber,
        taskArguments.feetype,
      );
    logger.info(`maxPaymentAmount (Juels): ${maxPaymentAmount}`);
    logger.info(`maxPaymentAmount (LINK): ${ethers.utils.formatEther(maxPaymentAmount)}`);
  });

// NB: this method has limitations. It does not take into account the gas incurrend by
// Operator::fulfillRequest2 nor DRCoordinator::fallback or DRCoordinator::fulfillData
// All of them are affected, among other things, by the data size and fulfillment function.
// Therefore it is needed to fine tune 'startgas'
task("drcoordinator:calculate-spot-amount", "Calculates the spot LINK amount for the given params")
  .addParam("address", "The DRCoordinator contract address", undefined, typeAddress)
  .addParam("gaslimit", "The tx gasLimit in gwei", MIN_CONSUMER_GAS_LIMIT, types.int)
  .addParam("startgas", "The gasleft at the beginning", MIN_CONSUMER_GAS_LIMIT, types.int)
  .addOptionalParam("weiperunitgas", "The wei per unit of gas on the network", undefined, types.int)
  .addParam(
    "payment",
    "The initial LINK payment amount in juels (from Spec.payment and 'minContractPaymentLinkJuels')",
    undefined,
    typeBignumber,
  )
  .addParam("fulfillmentfee", "The fulfillment fee", undefined, typeBignumber)
  .addParam(
    "feetype",
    "The fee type",
    undefined,
    typeOptionsArray([FeeType.FLAT.toString(), FeeType.PERMIRYAD.toString()]),
  )
  // Get wei per unit of gas from provider
  .addFlag("provider", "Uses the providers data for 'weiPerUnitGas'")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const [signer] = await hre.ethers.getSigners();
    logger.info(`connecting to DRCoordinator at: ${taskArguments.address}`);
    const drCoordinator = await getDRCoordinator(hre, taskArguments.address, TaskExecutionMode.PROD);

    let weiPerGasUnit: BigNumber;
    if (taskArguments.provider) {
      weiPerGasUnit = (await hre.ethers.provider.getFeeData()).gasPrice as BigNumber;
      if (weiPerGasUnit === null) {
        throw new Error(`'gasPrice' not found on network: ${hre.network.name}`);
      }
    } else {
      weiPerGasUnit = taskArguments.weiperunitgas as BigNumber;
    }
    const maxPaymentAmount = await drCoordinator
      .connect(signer)
      .calculateSpotPaymentAmount(
        taskArguments.startgas,
        weiPerGasUnit,
        taskArguments.payment as BigNumber,
        taskArguments.fulfillmentfee as BigNumber,
        taskArguments.feetype,
        {
          gasLimit: taskArguments.gaslimit,
        },
      );
    logger.info(`spotPaymentAmount (Juels): ${maxPaymentAmount}`);
    logger.info(`spotPaymentAmount (LINK): ${ethers.utils.formatEther(maxPaymentAmount)}`);
  });

task("drcoordinator:jobid-to-bytes32", "Converts a UUID v4 to bytes32")
  .addParam("jobid", "The external job ID", undefined, types.string)
  .setAction(async function (taskArguments: TaskArguments) {
    const hexStr = convertJobIdToBytes32(taskArguments.jobid as string);
    logger.info(`bytes32: ${hexStr}`);
  });

task("drcoordinator:bytes32-to-jobid", "Converts bytes32 into a UUID v4")
  .addParam("specid", "The job spec ID as bytes32", undefined, typeBytes(32))
  .setAction(async function (taskArguments: TaskArguments) {
    const hexStr = convertBytes32ToJobId(taskArguments.specid as string);
    logger.info(`UUIDv4: ${hexStr}`);
  });

task("drcoordinator:deploy", "Deploy a DRCoordinator")
  .addParam("description", "The contract description", "", types.string)
  .addParam("fallbackweiperunitlink", "The fallback amount of network TKN wei per LINK", undefined, typeBignumber)
  .addParam(
    "stalenessseconds",
    "The number of seconds after which the feed answer is considered stale",
    undefined,
    typeBignumber,
  )
  // Configuration after deployment
  .addFlag("setup", "Configs the contract after deployment")
  .addOptionalParam("owner", "requires flag setup. The address to transfer the ownership", undefined, typeAddress)
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
      taskArguments.stalenessseconds,
      isSequencerDependant,
      sequencerOfflineFlag,
      addressChainlinkFlags,
    );
  });

task("drcoordinator:deploy-consumer")
  .addParam("name", "The consumer contract name", undefined, types.string)
  .addParam("drcoordinator", "The DRCoordinator contract address", undefined, typeAddress)
  .addParam("operator", "The Operator contract address", undefined, typeAddress)
  // Configuration after deployment
  .addFlag("fund", "Top-up the consumer balance with LINK from the signer's wallet right after deployment")
  .addOptionalParam("amount", "The amount of LINK (wei) to fund the balance after deployment", undefined, typeBignumber)
  // Verification
  .addFlag("verify", "Verify the contract on Etherscan after deployment")
  // Gas customisation
  .addFlag("gas", "Customise the tx gas")
  .addOptionalParam("type", "The tx type", undefined, types.int)
  .addOptionalParam("gasprice", "Type 0 tx gasPrice", undefined, types.float)
  .addOptionalParam("gasmaxfee", "Type 2 tx maxFeePerGas", undefined, types.float)
  .addOptionalParam("gasmaxpriority", "Type 2 tx maxPriorityFeePerGas", undefined, types.float)
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const [signer] = await hre.ethers.getSigners();
    logger.info(`signer address: ${signer.address}`);

    // Get tx overrides with gas params
    let overrides: Overrides = {};
    if (taskArguments.gas) {
      overrides = await getGasOverridesFromTaskArgs(taskArguments, hre);
    }

    // Get LINK address (by network)
    const addressLink = getNetworkLinkAddress(hre.network);
    const addressDRCoordinator = taskArguments.drcoordinator as string;
    const addressOperator = taskArguments.operator as string;

    // Custom validations
    if (taskArguments.fund) {
      if (!taskArguments.amount) {
        throw new Error(`Flag 'fund' requires task argument 'amount' (and optionally 'approve')`);
      }
      await validateLinkAddressFunds(hre, signer.address, addressLink, taskArguments.amount as BigNumber);
    }

    // Deploy
    const consumerFactory = await hre.ethers.getContractFactory(taskArguments.name);
    const consumer = await consumerFactory.deploy(addressLink, addressDRCoordinator, addressOperator, overrides);
    logger.info(`${taskArguments.name} deployed to: ${consumer.address} | Tx hash: ${consumer.deployTransaction.hash}`);
    await consumer.deployTransaction.wait(getNumberOfConfirmations(hre.network.config.chainId));

    // Fund DRCoordinatorConsumer balance with LINK
    if (taskArguments.fund) {
      // Approve LINK
      const linkTokenArtifact = await hre.artifacts.readArtifact("LinkToken");
      const linkToken = (await hre.ethers.getContractAt(linkTokenArtifact.abi, addressLink)) as LinkToken;
      const amount = taskArguments.amount as BigNumber;
      await approveLink(linkToken, signer, addressDRCoordinator, amount, overrides);
      // Add funds
      const drCoordinatorArtifact = await hre.artifacts.readArtifact("DRCoordinator");
      const drCoordinator = (await hre.ethers.getContractAt(
        drCoordinatorArtifact.abi,
        addressDRCoordinator,
      )) as DRCoordinator;
      await addFunds(drCoordinator, signer, consumer.address, amount, overrides);
    }
    if (!taskArguments.verify) return;

    // Verify
    // NB: contract verification request may fail if the contract address does not have bytecode. Wait until it's mined
    await verifyDRCoordinatorConsumer(hre, consumer.address, addressLink, addressDRCoordinator, addressOperator);
  });

task("drcoordinator:detail", "Log the DRCoordinator storage")
  .addParam("address", "The DRCoordinator contract address", undefined, typeAddress)
  .addFlag("keys", "Log the Spec keys")
  .addFlag("specs", "Log each Spec")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const [signer] = await hre.ethers.getSigners();
    logger.info(`connecting to DRCoordinator at: ${taskArguments.address}`);
    const drCoordinator = await getDRCoordinator(hre, taskArguments.address, TaskExecutionMode.PROD);

    await logDRCoordinatorDetail(
      hre,
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
  .addParam("operator", "The Operator contract address", undefined, typeAddress)
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

    validateConfigurationOperator(taskArguments.operator);

    let specId: string;
    if (taskArguments.externaljobid) {
      // NB: just in case taskArgument validation is removed by mistake
      validateConfigurationExternalJobId(taskArguments.externaljobid);
      specId = convertJobIdToBytes32(taskArguments.externaljobid);
    } else {
      specId = taskArguments.specid;
    }
    const key = generateSpecKey(taskArguments.operator, specId);
    logger.info(`key: ${key}`);
  });

task("drcoordinator:generate-sha1", "Generate the specs file 'sha1'")
  .addParam("filename", "The specs filename (without .json extension) in the specs folder", undefined, types.string)
  // Check specs file
  .addFlag("check", "Check the integrity of the specs file")
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
  .addParam("filename", "The specs filename (without .json extension) in the specs folder", undefined, types.string)
  .addParam("mode", "The execution mode", TaskExecutionMode.DRYRUN, typeOptionsArray(Object.values(TaskExecutionMode)))
  // Batch import
  .addFlag("nobatch", "Disables the batch import")
  .addOptionalParam("batchsize", "Number of specs per CUD transaction", DEFAULT_BATCH_SIZE, types.int)
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

    // Remove, update and add specs
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

task("drcoordinator:set-config", "Set all kind of variables in the contract")
  .addParam("address", "The DRCoordinator contract address", undefined, typeAddress)
  .addParam(
    "mode",
    "The execution mode",
    TaskExecutionMode.FORKING,
    typeOptionsArray([TaskExecutionMode.FORKING, TaskExecutionMode.PROD]),
  )
  .addOptionalParam("description", "The new 'description'", undefined, types.string)
  .addOptionalParam("fallbackweiperunitlink", "The new 'fallbackWeiPerUnitLink'", undefined, typeBignumber)
  .addOptionalParam("owner", "The new 'owner'", undefined, typeAddress)
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
  .addFlag("granular", "Allow setting a payee and an amount")
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
      await withdrawFunds(drCoordinator, signer, taskArguments.payee, taskArguments.amount, overrides);
    } else {
      const availableFunds = await drCoordinator.connect(signer).availableFunds(drCoordinator.address);
      await withdrawFunds(drCoordinator, signer, taskArguments.payee, availableFunds, overrides);
    }

    logger.info("*** Withdraw task finished successfully ***");
  });
