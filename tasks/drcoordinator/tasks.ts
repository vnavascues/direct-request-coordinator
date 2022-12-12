import { BigNumber, ethers } from "ethers";
import { task, types } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

import { BetterSet } from "../../libs/better-set";
import { DRCoordinator, LinkToken } from "../../src/types";
import {
  approve as approveLink,
  convertBytes32ToJobId,
  convertJobIdToBytes32,
  getNetworkLinkAddress,
  getNetworkLinkTknFeedAddress,
  validateLinkAddressFunds,
} from "../../utils/chainlink";
import { MIN_CONSUMER_GAS_LIMIT, chainIdL2SequencerFeed } from "../../utils/chainlink-constants";
import { getNumberOfConfirmations, getOverrides } from "../../utils/deployment";
import { logger } from "../../utils/logger";
import {
  address as typeAddress,
  bignumber as typeBignumber,
  bytes as typeBytes,
  optionsArray as typeOptionsArray,
  uuid as typeUUID,
} from "../../utils/task-arguments-validations";
import { DEFAULT_BATCH_SIZE, FeeType, TaskExecutionMode, TaskName } from "./constants";
import {
  addFunds,
  addSpecs,
  deleteSpecs,
  deployDRCoordinator,
  generateSpecKey,
  getDRCoordinator,
  getSpecAuthorizedConsumersMap,
  getSpecItemConvertedMap,
  getSpecMap,
  logDRCoordinatorDetail,
  pause,
  setDescription,
  setFallbackWeiPerUnitLink,
  setL2SequencerGracePeriodSeconds,
  setPermyriadFeeFactor,
  setStalenessSeconds,
  setupDRCoordinatorAfterDeploy,
  setupDRCoordinatorBeforeTask,
  transferOwnership,
  unpause,
  updateSpecs,
  updateSpecsAuthorizedConsumers,
  validateConfigurationExternalJobId,
  validateConfigurationOperator,
  verifyDRCoordinator,
  verifyDRCoordinatorConsumer,
  withdrawFunds,
} from "./methods";
import type { SpecItem } from "./types";

task("drcoordinator:calculate-max-amount", "Calculates the max LINK amount for the given params")
  .addParam("address", "The DRCoordinator contract address", undefined, typeAddress)
  .addOptionalParam("weiperunitgas", "The wei per unit of gas on the network", undefined, types.int)
  .addParam("payment", "The initial LINK payment amount in Juels (in escrow in the Operator)", undefined, typeBignumber)
  .addParam("gaslimit", "The transaction gasLimit in gwei", MIN_CONSUMER_GAS_LIMIT, types.int)
  .addParam(
    "feetype",
    "The fee type",
    undefined,
    typeOptionsArray([FeeType.FLAT.toString(), FeeType.PERMYRIAD.toString()]),
  )
  .addParam("fee", "The fulfillment fee", undefined, typeBignumber)
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
        taskArguments.feetype,
        taskArguments.fee as BigNumber,
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
  .addParam("payment", "The initial LINK payment amount in juels (in escrow in the Operator)", undefined, typeBignumber)
  .addParam(
    "feetype",
    "The fee type",
    undefined,
    typeOptionsArray([FeeType.FLAT.toString(), FeeType.PERMYRIAD.toString()]),
  )
  .addParam("fee", "The fulfillment fee", undefined, typeBignumber)
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
        taskArguments.feetype,
        taskArguments.fee as BigNumber,
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
  // Multi Price Feed mode(2-hop mode)
  .addFlag("ismultipricefeed", "Enables the 2 Price Feed mode, i.e. GASTKN / TKN & LINK / TKN")
  .addOptionalParam(
    "pricefeed1",
    "Requires flag ismultipricefeed. The address of the GASTKN / TKN Price Feed",
    undefined,
    typeAddress,
  )
  .addOptionalParam(
    "pricefeed2",
    "Requires flag ismultipricefeed. The address of the LINK / TKN Price Feed",
    undefined,
    typeAddress,
  )
  // L2 Sequencer configs
  .addOptionalParam(
    "l2sequencergraceperiod",
    "The number of seconds before trusting the L2 Sequencer Uptime Status Feed answer",
    undefined,
    typeBignumber,
  )
  // Configuration after deployment
  .addFlag("setup", "Configs the contract after deployment")
  .addOptionalParam("owner", "Requires flag setup. The address to transfer the ownership", undefined, typeAddress)
  // Verification
  .addFlag("verify", "Verify the contract on Etherscan after deployment")
  // Tx customisation (ethers.js Overrides)
  .addFlag("overrides", "Customise the tx overrides")
  .addOptionalParam("gaslimit", "The tx gasLimit", undefined, types.int)
  .addOptionalParam("txtype", "The tx gas type (0 or 2)", undefined, types.int)
  .addOptionalParam("gasprice", "Type 0 tx gasPrice", undefined, types.float)
  .addOptionalParam("gasmaxfee", "Type 2 tx maxFeePerGas", undefined, types.float)
  .addOptionalParam("gasmaxpriority", "Type 2 tx maxPriorityFeePerGas", undefined, types.float)
  .setAction(async function (taskArguments: TaskArguments, hre) {
    // Custom checks
    if (taskArguments.ismultipricefeed) {
      if (!taskArguments.pricefeed1 || !taskArguments.pricefeed2) {
        throw new Error(`Flag 'ismultipricefeed' requires task arguments 'pricefeed1' and 'pricefeed2'`);
      }
    }
    const isL2WithSequencerChain = chainIdL2SequencerFeed.has(hre.network.config.chainId as number);
    if (isL2WithSequencerChain && !taskArguments.l2sequencergraceperiod) {
      throw new Error(`Deploying to an L2 with Sequencer requires task argument 'l2sequencergraceperiod'`);
    }

    // Instantiate the signer of the network
    const [signer] = await hre.ethers.getSigners();
    logger.info(`signer address: ${signer.address}`);

    // Get the contract method overrides
    const overrides = await getOverrides(taskArguments, hre);

    // Deploy
    const {
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
    } = await deployDRCoordinator(
      hre,
      signer,
      taskArguments.description,
      taskArguments.fallbackweiperunitlink,
      taskArguments.stalenessseconds,
      taskArguments.ismultipricefeed,
      taskArguments.pricefeed1,
      taskArguments.pricefeed2,
      taskArguments.l2sequencergraceperiod,
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
      isMultiPriceFeedDependant,
      addressPriceFeed1,
      addressPriceFeed2,
      description,
      fallbackWeiPerUnitLink,
      stalenessSeconds,
      isL2SequencerDependant,
      addressL2SequencerFeed,
      l2SequencerGracePeriodSeconds,
    );
  });

task("drcoordinator:deploy-consumer")
  .addParam("name", "The consumer contract name", undefined, types.string)
  .addParam("drcoordinator", "The DRCoordinator contract address", undefined, typeAddress)
  // Configuration after deployment
  .addFlag("fund", "Top-up the consumer balance with LINK from the signer's wallet right after deployment")
  .addOptionalParam("amount", "The amount of LINK (wei) to fund the balance after deployment", undefined, typeBignumber)
  // Verification
  .addFlag("verify", "Verify the contract on Etherscan after deployment")
  // Tx customisation (ethers.js Overrides)
  .addFlag("overrides", "Customise the tx overrides")
  .addOptionalParam("gaslimit", "The tx gasLimit", undefined, types.int)
  .addOptionalParam("txtype", "The tx gas type (0 or 2)", undefined, types.int)
  .addOptionalParam("gasprice", "Type 0 tx gasPrice", undefined, types.float)
  .addOptionalParam("gasmaxfee", "Type 2 tx maxFeePerGas", undefined, types.float)
  .addOptionalParam("gasmaxpriority", "Type 2 tx maxPriorityFeePerGas", undefined, types.float)
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const [signer] = await hre.ethers.getSigners();
    logger.info(`signer address: ${signer.address}`);

    // Get the contract method overrides
    const overrides = await getOverrides(taskArguments, hre);

    // Get LINK address (by network)
    const addressLink = getNetworkLinkAddress(hre.network);
    const addressDRCoordinator = taskArguments.drcoordinator as string;

    // Custom validations
    if (taskArguments.fund) {
      if (!taskArguments.amount) {
        throw new Error(`Flag 'fund' requires task argument 'amount' (and optionally 'approve')`);
      }
      await validateLinkAddressFunds(hre, signer, signer.address, addressLink, taskArguments.amount as BigNumber);
    }

    // Deploy
    const consumerFactory = await hre.ethers.getContractFactory(taskArguments.name);
    const consumer = await consumerFactory.deploy(addressLink, addressDRCoordinator, overrides);
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
    await verifyDRCoordinatorConsumer(hre, consumer.address, addressLink, addressDRCoordinator);
  });

task("drcoordinator:detail", "Log the DRCoordinator storage")
  .addParam("address", "The DRCoordinator contract address", undefined, typeAddress)
  .addFlag("keys", "Log the Spec keys")
  .addFlag("specs", "Log each Spec")
  .addFlag("authconsumers", "Log each Spec authorized consumers")
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
        authconsumers: taskArguments.authconsumers,
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

task("drcoordinator:import-file", "CUD specs in the DRCoordinator storage")
  .addParam("address", "The DRCoordinator contract address", undefined, typeAddress)
  .addParam("filename", "The specs filename (without .json extension) in the specs folder", undefined, types.string)
  .addParam("mode", "The execution mode", TaskExecutionMode.DRYRUN, typeOptionsArray(Object.values(TaskExecutionMode)))
  .addOptionalParam("apeaddress", "The address to impersonate on the forking mode", undefined, typeAddress)
  // Batch import
  .addFlag("nobatch", "Disables the batch import")
  .addOptionalParam("batchsize", "Number of specs per CUD transaction", DEFAULT_BATCH_SIZE, types.int)
  // Tx customisation (ethers.js Overrides)
  .addFlag("overrides", "Customise the tx overrides")
  .addOptionalParam("gaslimit", "The tx gasLimit", undefined, types.int)
  .addOptionalParam("txtype", "The tx gas type (0 or 2)", undefined, types.int)
  .addOptionalParam("gasprice", "Type 0 tx gasPrice", undefined, types.float)
  .addOptionalParam("gasmaxfee", "Type 2 tx maxFeePerGas", undefined, types.float)
  .addOptionalParam("gasmaxpriority", "Type 2 tx maxPriorityFeePerGas", undefined, types.float)
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { drCoordinator, signer, overrides, specs } = await setupDRCoordinatorBeforeTask(
      taskArguments,
      hre,
      TaskName.IMPORT_FILE,
    );
    logger.info(`converting file specs ...`);
    const fileSpecMap = await getSpecItemConvertedMap(specs as SpecItem[]);

    // Fetch each DRCoordinator Spec and map them by key
    logger.info(`fetching DRCoordinator specs ...`);
    const drcKeys = await drCoordinator.connect(signer).getSpecMapKeys();
    const drcSpecMap = await getSpecMap(drCoordinator, signer, drcKeys);

    // Get Spec sets
    logger.info(`calculating DRCoordinator specs to be removed, updated and added ...`);
    const fileKeys = [...fileSpecMap.keys()];
    const drcKeysSet = new BetterSet(drcKeys);
    const fileKeysSet = new BetterSet(fileKeys);
    const keysToRemoveSet = drcKeysSet.difference(fileKeysSet);
    const keysToAddSet = fileKeysSet.difference(drcKeysSet);
    const keysToCheckSet = fileKeysSet.intersection(drcKeysSet);
    // NB: due to transactions priority/size and on-chain checks (adding SpecAuthorizedConsumers
    // requires Spec to be inserted), it could be interesting timing (spacing as max as possible)
    // the create-like transactions:
    //  * Spec: CUD - Create -> Update -> Delete
    //  * SpecAuthorizedConsumers: DC -> Delete -> Create
    // At the same time the strategy above will be more expensive, due to looping through larger
    // Spec and SpecAuthorizedConsumers arrays.
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

    // Fetch each DRCoordinator AuthorizedConsumers (per Spec) and map them by key
    // NB: it must be executed after CUD Spec
    logger.info(`fetching DRCoordinator specs' authorized consumers`);
    const drcSpecAuthorizedConsumersMap = await getSpecAuthorizedConsumersMap(drCoordinator, signer, fileKeys);

    // Remove and add authorized consumers (per Spec)
    await updateSpecsAuthorizedConsumers(
      drCoordinator,
      signer,
      drcSpecAuthorizedConsumersMap,
      fileSpecMap,
      keysToAddSet,
      keysToCheckSet,
      isBatchMode,
      overrides,
      taskArguments.batchsize,
    );
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
  .addOptionalParam("l2sequencergraceperiod", "The new 'l2SequencerGracePeriodSeconds'", undefined, typeBignumber)
  .addOptionalParam("owner", "The new 'owner'", undefined, typeAddress)
  .addOptionalParam("pause", "Pause or unpause the contract", undefined, types.boolean)
  .addOptionalParam("stalenessseconds", "The new 'stalenessSeconds'", undefined, typeBignumber)
  .addOptionalParam("permyriadfeefactor", "The new 'permyriadFeeFactor'", undefined, types.int)
  // Tx customisation (ethers.js Overrides)
  .addFlag("overrides", "Customise the tx overrides")
  .addOptionalParam("gaslimit", "The tx gasLimit", undefined, types.int)
  .addOptionalParam("txtype", "The tx gas type (0 or 2)", undefined, types.int)
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

    // Set l2SequencerGracePeriodSeconds
    if (taskArguments.l2sequencergraceperiod) {
      await setL2SequencerGracePeriodSeconds(drCoordinator, signer, taskArguments.l2sequencergraceperiod, overrides);
    }

    // Transfer ownerwhip
    if (taskArguments.owner) {
      await transferOwnership(drCoordinator, signer, taskArguments.owner, overrides);
    }

    // Pause
    if (taskArguments.pause === true) {
      await pause(drCoordinator, signer, overrides);
    }

    // Set permyriadFeeFactor
    if (taskArguments.permyriadfeefactor) {
      await setPermyriadFeeFactor(drCoordinator, signer, taskArguments.permyriadfeefactor, overrides);
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
  .addFlag("ismultipricefeed", "Enables the 2 Price Feed mode, i.e. GASTKN / TKN & LINK / TKN")
  .addOptionalParam("pricefeed1", "The address of the GASTKN / TKN Price Feed", undefined, typeAddress)
  .addOptionalParam("pricefeed2", "The address of the LINK / TKN Price Feed", undefined, typeAddress)
  .addOptionalParam("l2sequencerfeed", "The address of the L2 Sequencer Uptime Status Feed", undefined, typeAddress)
  .addOptionalParam(
    "l2sequencergraceperiod",
    "The number of seconds before trusting the L2 Sequencer Uptime Status Feed answer",
    undefined,
    typeBignumber,
  )
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const chainId = hre.network.config.chainId as number;
    const isL2WithSequencerChain = chainIdL2SequencerFeed.has(chainId);

    // Custom checks
    if (isL2WithSequencerChain) {
      if (!taskArguments.l2sequencerfeed) {
        throw new Error(`Verifying on a L2 with Sequencer requires task argument 'l2sequencerfeed'`);
      }
      if (!taskArguments.l2sequencergraceperiod) {
        throw new Error(`Verifying on a L2 with Sequencer requires task argument 'l2sequencergraceperiod'`);
      }
    }
    const addressLink = getNetworkLinkAddress(hre.network);

    const isMultiPriceFeedDependant = taskArguments.ismultipricefeed;
    const addressPriceFeed1 = isMultiPriceFeedDependant
      ? taskArguments.pricefeed1
      : getNetworkLinkTknFeedAddress(hre.network);
    const addressPriceFeed2 = isMultiPriceFeedDependant ? taskArguments.pricefeed2 : ethers.constants.AddressZero;

    const isL2SequencerDependant = isL2WithSequencerChain;
    const addressL2SequencerFeed = isL2WithSequencerChain
      ? taskArguments.l2sequencerfeed
      : ethers.constants.AddressZero;
    const l2SequencerGracePeriodSeconds = isL2WithSequencerChain
      ? taskArguments.l2sequencergraceperiod
      : BigNumber.from("0");
    await verifyDRCoordinator(
      hre,
      taskArguments.address,
      addressLink,
      isMultiPriceFeedDependant,
      addressPriceFeed1,
      addressPriceFeed2,
      taskArguments.description,
      taskArguments.fallbackweiperunitlink,
      taskArguments.stalenessseconds,
      isL2SequencerDependant,
      addressL2SequencerFeed,
      l2SequencerGracePeriodSeconds,
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
  // Tx customisation (ethers.js Overrides)
  .addFlag("overrides", "Customise the tx overrides")
  .addOptionalParam("gaslimit", "The tx gasLimit", undefined, types.int)
  .addOptionalParam("txtype", "The tx gas type (0 or 2)", undefined, types.int)
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
