import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, ethers } from "ethers";
import type { ContractTransaction } from "@ethersproject/contracts";
import { HardhatRuntimeEnvironment, Network } from "hardhat/types";

import { getChecksumAddress } from "./addresses";
import { ChainId, chainIdTkn } from "./constants";
import { throwNewError } from "./errors";
import { logger } from "./logger";
import type { Overrides } from "./types";
import type { LinkToken } from "../src/types";

export const LINK_TOTAL_SUPPLY = BigNumber.from("10").pow("27");
export const MIN_CONSUMER_GAS_LIMIT = 400_000; // From Operator.sol::MINIMUM_CONSUMER_GAS_LIMIT

export const chainIdFlags: ReadonlyMap<ChainId, string> = new Map([
  [ChainId.ARB_MAINNET, "0x3C14e07Edd0dC67442FA96f1Ec6999c57E810a83"],
  [ChainId.ARB_RINKEBY, "0x491B1dDA0A8fa069bbC1125133A975BF4e85a91b"],
]);

//NB: don't make it readonly to allow dryrun deploys on the Hardhat network
export const chainIdLink: Map<ChainId, string> = new Map([
  [ChainId.ETH_MAINNET, "0x514910771AF9Ca656af840dff83E8264EcF986CA"],
  [ChainId.ETH_RINKEBY, "0x01BE23585060835E02B77ef475b0Cc51aA1e0709"],
  [ChainId.ETH_GOERLI, "0x326c977e6efc84e512bb9c30f76e30c160ed06fb"],
  [ChainId.OPT_MAINNET, "0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6"],
  [ChainId.RSK_MAINNET, "0x14AdaE34beF7ca957Ce2dDe5ADD97ea050123827"],
  [ChainId.ETH_KOVAN, "0xa36085F69e2889c224210F603D836748e7dC0088"],
  [ChainId.BSC_MAINNET, "0x404460C6A5EdE2D891e8297795264fDe62ADBB75"],
  [ChainId.OPT_KOVAN, "0x4911b761993b9c8c0d14Ba2d86902AF6B0074F5B"],
  [ChainId.BSC_TESTNET, "0x84b9B910527Ad5C03A9Ca831909E21e236EA7b06"],
  [ChainId.XDAI_MAINNET, "0xE2e73A1c69ecF83F464EFCE6A5be353a37cA09b2"],
  [ChainId.HECO_MAINNET, "0x9e004545c59D359F6B7BFB06a26390b087717b42"],
  [ChainId.MATIC_MAINNET, "0xb0897686c545045aFc77CF20eC7A532E3120E0F1"],
  [ChainId.FTM_MAINNET, "0x6F43FF82CCA38001B6699a8AC47A2d0E66939407"],
  [ChainId.MOONBEAM_MOONRIVER, "0x8b12Ac23BFe11cAb03a634C1F117D64a7f2cFD3e"],
  [ChainId.FTM_TESTNET, "0xfaFedb041c0DD4fA2Dc0d87a6B0979Ee6FA7af5F"],
  [ChainId.ARB_MAINNET, "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4"],
  [ChainId.AVAX_FUJI, "0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846"],
  [ChainId.AVAX_MAINNET, "0x5947BB275c521040051D82396192181b413227A3"],
  [ChainId.MATIC_MUMBAI, "0x326C977E6efc84E512bB9C30f76E30c160eD06FB"],
  [ChainId.ARB_RINKEBY, "0x615fBe6372676474d9e6933d310469c9b68e9726"],
  [ChainId.ONE_MAINNET, "0x218532a12a389a4a92fC0C5Fb22901D1c19198aA"],
  [ChainId.ONE_TESTNET, "0x8b12Ac23BFe11cAb03a634C1F117D64a7f2cFD3e"],
]);

export const chainIdLinkTknFeed: ReadonlyMap<ChainId, string> = new Map([
  [ChainId.ETH_MAINNET, "0xDC530D9457755926550b59e8ECcdaE7624181557"],
  [ChainId.ETH_RINKEBY, "0xFABe80711F3ea886C3AC102c81ffC9825E16162E"],
  [ChainId.ETH_GOERLI, "0x464A1515ADc20de946f8d0DEB99cead8CEAE310d"],
  [ChainId.ETH_KOVAN, "0x3Af8C569ab77af5230596Acf0E8c2F9351d24C38"],
  [ChainId.BSC_MAINNET, "0xB38722F6A608646a538E882Ee9972D15c86Fc597"],
  [ChainId.OPT_KOVAN, "0xB677bfBc9B09a3469695f40477d05bc9BcB15F50"],
  [ChainId.BSC_TESTNET, "0x351Ff08FF5077d6E8704A4763836Fe187f074380"],
  [ChainId.MATIC_MAINNET, "0x5787BefDc0ECd210Dfa948264631CD53E68F7802"],
  [ChainId.FTM_MAINNET, "0x3FFe75E8EDA86F48e454e6bfb5F74d95C20744f4"],
  [ChainId.MOONBEAM_MOONRIVER, "0x8b12Ac23BFe11cAb03a634C1F117D64a7f2cFD3e"],
  [ChainId.FTM_TESTNET, "0xF549af21578Cfe2385FFD3488B3039fd9e52f006"],
  [ChainId.ARB_MAINNET, "0xb7c8Fb1dB45007F98A68Da0588e1AA524C317f27"],
  [ChainId.AVAX_FUJI, "0x79c91fd4F8b3DaBEe17d286EB11cEE4D83521775"],
  [ChainId.AVAX_MAINNET, "0x1b8a25F73c9420dD507406C3A3816A276b62f56a"],
  [ChainId.MATIC_MUMBAI, "0x12162c3E810393dEC01362aBf156D7ecf6159528"],
  [ChainId.ARB_RINKEBY, "0x1a658fa1a5747d73D0AD674AF12851F7d74c998e"],
]);

export const chainIdSequencerOfflineFlag: ReadonlyMap<ChainId, string> = new Map([
  [ChainId.ARB_MAINNET, "chainlink.flags.arbitrum-seq-offline"],
  [ChainId.ARB_RINKEBY, "chainlink.flags.arbitrum-seq-offline"],
]);

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

export async function getLinkBalanceOf(
  hre: HardhatRuntimeEnvironment,
  address: string,
  addressLINK: string,
): Promise<BigNumber> {
  const linkTokenArtifact = await hre.artifacts.readArtifact("LinkToken");
  const contractLINK = (await hre.ethers.getContractAt(linkTokenArtifact.abi, addressLINK)) as LinkToken;
  return contractLINK.balanceOf(address);
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
  address: string,
  addressLINK: string,
  fundsLINK: BigNumber,
): Promise<void> {
  const balance = await getLinkBalanceOf(hre, address, addressLINK);
  if (balance.lt(fundsLINK)) {
    const fmtBalance = hre.ethers.utils.formatUnits(balance);
    const fmtFunds = hre.ethers.utils.formatUnits(fundsLINK);
    throw new Error(
      `Insufficient LINK balance in ${address}: ${fmtBalance} LINK. Can't fund the contract with: ${fmtFunds} LINK`,
    );
  }
}
