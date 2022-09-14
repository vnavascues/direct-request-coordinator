import { BigNumberish, isBigNumberish } from "@ethersproject/bignumber/lib/bignumber";
import { Contract } from "ethers";
import { HardhatRuntimeEnvironment, Network, TaskArguments } from "hardhat/types";
import path from "path";

import type { LinkToken } from "../src/types";
import { getChecksumAddress } from "./addresses";
import { chainIdLink } from "./chainlink-constants";
import type { StandardConsumerConstructorArguments } from "./chainlink-types";
import { ChainId } from "./constants";
import { throwNewError } from "./errors";
import { getGasOverridesFromTaskArgs } from "./gas-estimation";
import { logger as parentLogger } from "./logger";
import type { Overrides } from "./types";

const logger = parentLogger.child({ name: path.relative(process.cwd(), __filename) });

export async function deployLinkTokenOnHardhat(hre: HardhatRuntimeEnvironment): Promise<LinkToken> {
  // Deploy LinkToken
  const linkTokenFactory = await hre.ethers.getContractFactory("LinkToken");
  const linkToken = (await linkTokenFactory.deploy()) as LinkToken;
  await linkToken.deployTransaction.wait();
  return linkToken;
}

export function getNetworkLinkAddress(network: Network): string {
  const chainId = network.config.chainId;
  let addressLink = chainIdLink.get(chainId as number);
  addressLink =
    addressLink ??
    throwNewError(`Unsupported chain: ${network.name}. Unable to get LINK address for chainId: ${chainId}.`);
  addressLink = getChecksumAddress(addressLink);
  logger.info(`LINK address: ${addressLink}`);

  return addressLink;
}

export async function getNetworkLinkAddressDeployingOnHardhat(hre: HardhatRuntimeEnvironment): Promise<string> {
  const chainId = hre.network.config.chainId;
  if (chainId === ChainId.HARDHAT) {
    const linkToken = await deployLinkTokenOnHardhat(hre);
    logger.info(`LinkToken deployed to: ${linkToken.address} | Hardhat network`);
    chainIdLink.set(ChainId.HARDHAT, linkToken.address);
  }
  return getNetworkLinkAddress(hre.network);
}

export function getNumberOfConfirmations(chainId?: ChainId, number = 10): number {
  return chainId === ChainId.HARDHAT ? 0 : number;
}

export function getOperatorAccountAddress(taskArguments: TaskArguments): string {
  if (taskArguments.operatoraccount) return taskArguments.operatoraccount;
  let addressOperatorAccount = process.env.OPERATOR_ACCOUNT_ADDRESS;
  addressOperatorAccount ?? throwNewError(`Missing OPERATOR_ACCOUNT_ADDRESS key in .env file`);
  if (!String(addressOperatorAccount).trim())
    throwNewError(`Invalid OPERATOR_ACCOUNT_ADDRESS. Missing value in .env file`);
  addressOperatorAccount = getChecksumAddress(addressOperatorAccount as string);
  logger.info(addressOperatorAccount, `oracle account address`);

  return addressOperatorAccount as string;
}

export function getOperatorContractAddress(taskArguments: TaskArguments): string {
  if (taskArguments.operator) return taskArguments.operator;
  let addressOperator = process.env.OPERATOR_CONTRACT_ADDRESS;
  addressOperator ?? throwNewError(`Missing OPERATOR_CONTRACT_ADDRESS key in .env file`);
  if (!String(addressOperator).trim()) throwNewError(`Invalid OPERATOR_CONTRACT_ADDRESS. Missing value in .env file`);
  addressOperator = getChecksumAddress(addressOperator as string);
  logger.info(addressOperator, `operator address`);

  return addressOperator as string;
}

export async function getStandardConsumerConstructorArguments(
  taskArguments: TaskArguments,
  hre: HardhatRuntimeEnvironment,
  deployOnHardhat = true,
): Promise<StandardConsumerConstructorArguments> {
  const addressOperator = getOperatorContractAddress(taskArguments);
  const addressLink = deployOnHardhat
    ? await getNetworkLinkAddressDeployingOnHardhat(hre)
    : getNetworkLinkAddress(hre.network);

  return {
    addressOperator,
    addressLink,
  };
}

/**
 * From OpenZeppelin Address library:
 *
 * It is unsafe to assume that an address for which this function returns
 * false is an externally-owned account (EOA) and not a contract.
 *
 * Among others, `isContract` will return false for the following
 * types of addresses:
 *
 *  - an externally-owned account
 *  - a contract in construction
 *  - an address where a contract will be created
 *  - an address where a contract lived, but was destroyed
 *
 */
export async function isAddressAContract(contract: Contract): Promise<boolean> {
  const contractCode = await contract.provider.getCode(contract.address);
  return contractCode !== "0x";
}

// NB: only applies to Chainlink contracts that use transferOwnerwhip
export function validateProposedOwnerTaskArgument(owner: string, proposedOwner: string): void {
  if (proposedOwner && owner.toLocaleLowerCase() === proposedOwner.toLocaleLowerCase()) {
    throw new Error(
      `Remove task argument 'owner': ${owner}. It is the same address than the signer (the owner by default)`,
    );
  }
}

export function getGasLimitOverridesFromTaskArgs(taskArguments: TaskArguments): Overrides {
  const gasLimit = (taskArguments.gaslimit as BigNumberish) ?? throwNewError(`Task argument 'gaslimit' is required`);
  if (!isBigNumberish(taskArguments.gaslimit)) {
    throw new Error(
      `Invalid task argument 'gaslimit': ${taskArguments.gaslimit}. Expected format is an integer or string (BigNumberish)`,
    );
  }
  return { gasLimit };
}

export async function getOverrides(taskArguments: TaskArguments, hre: HardhatRuntimeEnvironment) {
  let overrides: Overrides = {};
  if (taskArguments.overrides) {
    let overridesGasPrice = {};
    let overridesGasLimit = {};
    if (!isNaN(taskArguments.txtype)) {
      overridesGasPrice = await getGasOverridesFromTaskArgs(taskArguments, hre);
    }
    if (taskArguments.gaslimit) {
      overridesGasLimit = getGasLimitOverridesFromTaskArgs(taskArguments);
    }
    overrides = { ...overrides, ...overridesGasPrice, ...overridesGasLimit };
  }
  logger.info(overrides, `tx overrides`);
  return overrides;
}
