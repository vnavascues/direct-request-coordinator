import { ethers } from "ethers";
import { task, types } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

import { setupDRCoordinator, verifyDRCoordinator } from "./methods";
import type { DRCoordinator } from "../../src/types";
import {
  chainIdFlags,
  chainIdSequencerOfflineFlag,
  getNetworkLinkAddress,
  getNetworkLinkTknFeedAddress,
} from "../../utils/chainlink";
import { getNumberOfConfirmations } from "../../utils/deployment";
import { ChainId } from "../../utils/constants";
import { getGasOverridesFromTaskArgs } from "../../utils/gas-estimation";
import { logger } from "../../utils/logger";
import type { Overrides } from "../../utils/types";
import { address as typeAddress, bignumber as typeBignumber } from "../../utils/task-arguments-validations";

task("drcoordinator:deploy")
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

    // Get LINK and LINK_TKN_FEED related arguments by network
    const chainId = hre.network.config.chainId as number;
    chainIdSequencerOfflineFlag.get(chainId);
    let addressLink: string;
    let addressLinkTknFeed: string;
    let isSequencerDependant: boolean;
    let sequencerOfflineFlag: string;
    let addressChainlinkFlags: string;
    if (chainId === ChainId.HARDHAT) {
      addressLink = ethers.constants.AddressZero;
      addressLinkTknFeed = ethers.constants.AddressZero;
      sequencerOfflineFlag = "";
      isSequencerDependant = false;
      addressChainlinkFlags = ethers.constants.AddressZero;
    } else {
      addressLink = getNetworkLinkAddress(hre.network);
      addressLinkTknFeed = getNetworkLinkTknFeedAddress(hre.network);
      sequencerOfflineFlag = chainIdSequencerOfflineFlag.get(chainId) || "";
      isSequencerDependant = !!sequencerOfflineFlag;
      addressChainlinkFlags = chainIdFlags.get(chainId) || "";
    }

    // Deploy
    const drCoordinatorFactory = await hre.ethers.getContractFactory("DRCoordinator");
    const drCoordinator = (await drCoordinatorFactory
      .connect(signer)
      .deploy(
        addressLink,
        addressLinkTknFeed,
        taskArguments.description,
        taskArguments.fallbackweiperunitlink,
        taskArguments.gasafterpaymentcalc,
        taskArguments.stalenessseconds,
        isSequencerDependant,
        sequencerOfflineFlag,
        addressChainlinkFlags,
        overrides,
      )) as DRCoordinator;
    logger.info(
      `DRCoordinator deployed to: ${drCoordinator.address} | Tx hash: ${drCoordinator.deployTransaction.hash}`,
    );
    await drCoordinator.connect(signer).deployTransaction.wait(getNumberOfConfirmations(hre.network.config.chainId, 5));

    // Setup
    if (taskArguments.setup) {
      await setupDRCoordinator(taskArguments, drCoordinator, signer, overrides);
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

/* ============ VERIFY ============ */

task("drcoordinator:verify")
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
