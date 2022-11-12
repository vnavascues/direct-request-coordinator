import type { ContractTransaction } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, ethers } from "ethers";
import { HardhatRuntimeEnvironment, Network } from "hardhat/types";
import path from "path";

import type { LinkToken } from "../src/types";
import { getChecksumAddress } from "./addresses";
import { chainIdFastGasFeed, chainIdLink, chainIdLinkTknFeed } from "./chainlink-constants";
import { ChainId, chainIdTkn } from "./constants";
import { throwNewError } from "./errors";
import { logger as parentLogger } from "./logger";
import type { Overrides } from "./types";

const logger = parentLogger.child({ name: path.relative(process.cwd(), __filename) });

export async function approve(
  linkToken: LinkToken,
  signer: ethers.Wallet | SignerWithAddress,
  spender: string,
  value: BigNumber,
  overrides?: Overrides,
): Promise<void> {
  const logObjTransfer = {
    spender,
    value: value.toString(),
  };
  let tx: ContractTransaction;
  try {
    tx = await linkToken.connect(signer).approve(spender, value, overrides);
    logger.info(logObjTransfer, `approve() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObjTransfer).error(error, `approve() failed due to: ${error}`);
    throw error;
  }
}

export function convertBytes32ToJobId(hexStr: string): string {
  const start = hexStr.startsWith("0x") ? 2 : 0;
  const buffer = Buffer.from(hexStr.slice(start), "hex");
  const jobId = buffer.toString();
  const uuid = `${jobId.slice(0, 8)}-${jobId.slice(8, 12)}-${jobId.slice(12, 16)}-${jobId.slice(16, 20)}-${jobId.slice(
    20,
  )}`;
  return uuid;
}

export function convertJobIdToBytes32(jobId: string): string {
  const buffer = Buffer.from(jobId.split("-").join(""));
  if (buffer.length !== 32) {
    throw new Error(`Invalid job ID: ${jobId}. Not 32 bytes long`);
  }
  return `0x${buffer.toString("hex")}`;
}

export async function deployLinkTokenOnHardhat(hre: HardhatRuntimeEnvironment): Promise<LinkToken> {
  // Deploy LinkToken
  const linkTokenFactory = await hre.ethers.getContractFactory("LinkToken");
  const linkToken = (await linkTokenFactory.deploy()) as LinkToken;
  await linkToken.deployTransaction.wait();
  return linkToken;
}

export async function getLinkTokenContract(hre: HardhatRuntimeEnvironment, addressLINK: string): Promise<LinkToken> {
  const linkTokenArtifact = await hre.artifacts.readArtifact("LinkToken");
  return hre.ethers.getContractAt(linkTokenArtifact.abi, addressLINK) as Promise<LinkToken>;
}

export async function getLinkBalanceOf(
  hre: HardhatRuntimeEnvironment,
  signer: ethers.Wallet | SignerWithAddress,
  address: string,
  addressLINK: string,
): Promise<BigNumber> {
  const contractLINK = await getLinkTokenContract(hre, addressLINK);
  return contractLINK.connect(signer).balanceOf(address);
}

// TODO: add missing supported networks
// TODO: explore pulling the feed by description (aka name)
export function getNetworkFastGasFeedAddress(network: Network): string {
  const chainId = network.config.chainId;
  let fastGasFeed = chainIdFastGasFeed.get(chainId as number);
  fastGasFeed ??
    throwNewError(
      `Unsupported chain: ${network.name}. Unable to get Fast Gas / Wei feed address for chainId: ${chainId}.`,
    );
  fastGasFeed = getChecksumAddress(fastGasFeed as string);
  logger.info(`Fast Gas / Wei feed address: ${fastGasFeed}`);

  return fastGasFeed;
}

export function getNetworkLinkAddress(network: Network): string {
  const chainId = network.config.chainId;
  let link = chainIdLink.get(chainId as number);
  link =
    link ??
    throwNewError(`Unsupported chain: ${network.name}. Unable to get LinkToken address for chainId: ${chainId}.`);
  link = getChecksumAddress(link);
  logger.info(`LINK address: ${link}`);

  return link;
}

export function getNetworkLinkAddressByChainId(chainId: ChainId, networkName: string): string {
  let link = chainIdLink.get(chainId as number);
  link =
    link ??
    throwNewError(`Unsupported chain: ${networkName}. Unable to get LinkToken address for chainId: ${chainId}.`);
  link = getChecksumAddress(link);
  logger.info(`LINK address: ${link}`);

  return link;
}

// TODO: Support DRCoordinator 2-hop price feed functionality
export function getNetworkLinkTknFeedAddress(network: Network): string {
  const chainId = network.config.chainId;
  let linkTknFeed = chainIdLinkTknFeed.get(chainId as number);
  const tkn = chainIdTkn.get(chainId as number);
  linkTknFeed =
    linkTknFeed ??
    throwNewError(
      `Unsupported chain: ${network.name}. Unable to get LINK / ${tkn} feed address for chainId: ${chainId}.`,
    );
  linkTknFeed = getChecksumAddress(linkTknFeed);
  logger.info(`LINK / ${tkn} feed address: ${linkTknFeed}`);

  return linkTknFeed;
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

export async function transfer(
  linkToken: LinkToken,
  signer: ethers.Wallet | SignerWithAddress,
  to: string,
  value: BigNumber,
  overrides?: Overrides,
): Promise<void> {
  const logObjTransfer = {
    to,
    value: value.toString(),
  };
  let tx: ContractTransaction;
  try {
    tx = await linkToken.connect(signer).transfer(to, value, overrides);
    logger.info(logObjTransfer, `transfer() LINK | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObjTransfer).error(error, `transfer() LINK failed due to: ${error}`);
    throw error;
  }
}

export async function validateLinkAddressFunds(
  hre: HardhatRuntimeEnvironment,
  signer: ethers.Wallet | SignerWithAddress,
  address: string,
  addressLINK: string,
  fundsLINK: BigNumber,
): Promise<void> {
  const balance = await getLinkBalanceOf(hre, signer, address, addressLINK);
  if (balance.lt(fundsLINK)) {
    const fmtBalance = hre.ethers.utils.formatUnits(balance);
    const fmtFunds = hre.ethers.utils.formatUnits(fundsLINK);
    throw new Error(
      `Insufficient LINK balance in ${address}: ${fmtBalance} LINK. Can't fund the contract with: ${fmtFunds} LINK`,
    );
  }
}
