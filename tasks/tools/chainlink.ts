import { task, types } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import path from "path";

import {
  approve,
  convertBytes32ToJobId,
  convertJobIdToBytes32,
  getLinkTokenContract,
  getNetworkLinkAddress,
  transfer,
} from "../../utils/chainlink";
import { getOverrides } from "../../utils/deployment";
import { logger as parentLogger } from "../../utils/logger";
import {
  address as typeAddress,
  bignumber as typeBignumber,
  bytes as typeBytes,
} from "../../utils/task-arguments-validations";

const logger = parentLogger.child({ name: path.relative(process.cwd(), __filename) });

task("tools:chainlink:jobid-to-bytes32", "Converts a UUID v4 to bytes32")
  .addParam("jobid", "The external job ID", undefined, types.string)
  .setAction(async function (taskArguments: TaskArguments) {
    const hexStr = convertJobIdToBytes32(taskArguments.jobid as string);
    logger.info(`bytes32: ${hexStr}`);
  });

task("tools:chainlink:bytes32-to-jobid", "Converts bytes32 into a UUID v4")
  .addParam("jobid", "The job spec ID as bytes32", undefined, typeBytes(32))
  .setAction(async function (taskArguments: TaskArguments) {
    const hexStr = convertBytes32ToJobId(taskArguments.jobid as string);
    logger.info(`uuid: ${hexStr}`);
  });

task("tools:chainlink:approve", "Approves a LINK amount")
  .addParam("spender", "The spender address", undefined, typeAddress)
  .addParam("amount", "The amount to be approved", undefined, typeBignumber)
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
    const linkToken = await getLinkTokenContract(hre, addressLink);
    await approve(linkToken, signer, taskArguments.spender, taskArguments.amount, overrides);
  });

task("tools:chainlink:transfer", "Transfers a LINK amount")
  .addParam("to", "The receiver address", undefined, typeAddress)
  .addParam("amount", "The amount to be sent", undefined, typeBignumber)
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
    const linkToken = await getLinkTokenContract(hre, addressLink);
    await transfer(linkToken, signer, taskArguments.to, taskArguments.amount, overrides);
  });
