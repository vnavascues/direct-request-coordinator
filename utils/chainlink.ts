import type { ContractTransaction } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import cbor from "cbor";
import { BigNumber, ethers } from "ethers";
import { HardhatRuntimeEnvironment, Network } from "hardhat/types";
import path from "path";

import type { ToolsChainlinkTestHelper } from "../src/types";
import type { LinkToken } from "../src/types";
import { getChecksumAddress } from "./addresses";
import { RequestParamType, chainIdFastGasFeed, chainIdLink, chainIdLinkTknFeed } from "./chainlink-constants";
import type { ChainlinkRequestParam as RequestParam } from "./chainlink-types";
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

// NB: Calculates the buffer using the Chainlink.sol library
export async function convertRequestParamsToCborBuffer(
  toolsChainlinkTestHelper: ToolsChainlinkTestHelper,
  requestParamsRaw: RequestParam[],
  isSorted = true,
): Promise<string> {
  if (!Array.isArray(requestParamsRaw)) {
    throw new Error(`Invalid request params format: ${requestParamsRaw}. Expected Array of objects`);
  }
  try {
    await toolsChainlinkTestHelper.resetChainlinkRequest();
  } catch (error) {
    logger.error(error, "resetChainlinkRequest() failed due to:");
    throw error;
  }

  // NB: by default it sorts params alphabetically by name via 'localCompare()'
  const requestParams = isSorted ? requestParamsRaw.sort((a, b) => a.name.localeCompare(b.name)) : requestParamsRaw;

  for (const { type, name, value, valueTypes } of requestParams) {
    switch (type) {
      case RequestParamType.ADDRESS:
        if (!ethers.utils.isAddress(value as string) || value !== ethers.utils.getAddress(value as string)) {
          throw new Error(
            `Request param '${name}' of type '${type}' is not a valid Ethereum address (checksum): ${JSON.stringify(
              value,
            )}`,
          );
        }
        await toolsChainlinkTestHelper.addBytes(
          name,
          ethers.utils.defaultAbiCoder.encode(["address"], [value as string]),
        );
        break;
      case RequestParamType.ADDRESS_ARRAY: {
        if (!Array.isArray(value)) {
          throw new Error(`Request param '${name}' of type '${type}' is not an Array: ${JSON.stringify(value)}`);
        }
        value.forEach(address => {
          // NB: addresses sent from contracts will be in lowercase, but bytes will be the same.
          if (!ethers.utils.isAddress(address as string) || address !== ethers.utils.getAddress(address as string)) {
            throw new Error(
              `Request param '${name}' of type '${type}' is not a valid Ethereum address (checksum): ${JSON.stringify(
                address,
              )}`,
            );
          }
        });
        await toolsChainlinkTestHelper.addBytes(
          name,
          ethers.utils.defaultAbiCoder.encode(["address[]"], [value as string[]]),
        );
        break;
      }
      case RequestParamType.BUFFER:
        if (!ethers.utils.isHexString(value)) {
          throw new Error(
            `Request param '${name}' of type '${type}' is not a valid hex string: ${JSON.stringify(value)}`,
          );
        }
        await toolsChainlinkTestHelper.setBuffer(value as string);
        break;
      case RequestParamType.BYTES:
        if (!Array.isArray(value)) {
          throw new Error(
            `Request param '${name}' of type '${type}' does not have and Array for 'value': ${JSON.stringify(value)}`,
          );
        }
        if (!Array.isArray(valueTypes)) {
          throw new Error(
            `Request param '${name}' of type '${type}' does not have an Array for 'valueTypes': ${JSON.stringify(
              valueTypes,
            )}`,
          );
        }
        await toolsChainlinkTestHelper.addBytes(name, ethers.utils.defaultAbiCoder.encode(valueTypes, value));
        break;
      case RequestParamType.BYTES_ENCODE:
        if (!ethers.utils.isHexString(value)) {
          throw new Error(
            `Request param '${name}' of type '${type}' is not a valid hex string: ${JSON.stringify(value)}`,
          );
        }
        await toolsChainlinkTestHelper.addBytes(name, value as string);
        break;
      case RequestParamType.INT:
        await toolsChainlinkTestHelper.addInt(name, BigNumber.from(`${value}`));
        break;
      case RequestParamType.STRING:
        await toolsChainlinkTestHelper.add(name, value as string);
        break;
      case RequestParamType.STRING_ARRAY:
        await toolsChainlinkTestHelper.addStringArray(name, value as string[]);
        break;
      case RequestParamType.UINT:
        await toolsChainlinkTestHelper.addUint(name, BigNumber.from(`${value}`));
        break;
      // NB: EXPERIMENTAL, implemented by me
      case RequestParamType.INT_ARRAY:
        await toolsChainlinkTestHelper.addIntArray(
          name,
          (value as number[]).map((n: number) => BigNumber.from(`${n}`)) as BigNumber[],
        );
        break;
      // NB: EXPERIMENTAL, implemented by me
      case RequestParamType.UINT_ARRAY:
        await toolsChainlinkTestHelper.addUintArray(
          name,
          (value as number[]).map((n: number) => BigNumber.from(`${n}`)) as BigNumber[],
        );
        break;
      default:
        throw new Error(`Unsupported request parameter 'type': ${type}.`);
    }
  }
  const reqBuffer = await toolsChainlinkTestHelper.req();
  return reqBuffer.buf.buf;
}

// NB: Calculates the buffer using the CBOR library
export async function convertRequestParamsToCborBufferExperimental(
  requestParamsRaw: RequestParam[],
  isSorted = true,
): Promise<string> {
  if (!Array.isArray(requestParamsRaw)) {
    throw new Error(`Invalid request params format: ${requestParamsRaw}. Expected Array of objects`);
  }
  // NB: by default it sorts params alphabetically by name via 'localCompare()'
  const requestParams = isSorted ? requestParamsRaw.sort((a, b) => a.name.localeCompare(b.name)) : requestParamsRaw;

  let buffer = "0x";
  for (const { type, name, value } of requestParams) {
    const encodedName = cbor.encode(name);
    let encodedValue;
    let buff;
    switch (type) {
      case RequestParamType.STRING:
      case RequestParamType.STRING_ARRAY:
        encodedValue = cbor.encode(value);
        break;
      case RequestParamType.ADDRESS:
        // NB: addresses sent from contracts will be in lowercase, but bytes will be the same.
        if (!ethers.utils.isAddress(value as string) || value !== ethers.utils.getAddress(value as string)) {
          throw new Error(
            `Request param '${name}' of type '${type}' is not a valid Ethereum address (checksum): ${JSON.stringify(
              value,
            )}`,
          );
        }
        // NB: and address encode packed is an address in lower case
        buff = Buffer.from(`${ethers.utils.solidityPack(["address"], [value as string]).slice(2)}`, "hex");
        encodedValue = cbor.encode(buff.toString("base64"));
        break;
      case RequestParamType.BYTES:
        if (!ethers.utils.isHexString(value)) {
          throw new Error(
            `Request param '${name}' of type '${type}' is not a valid hex string: ${JSON.stringify(value)}`,
          );
        }
        buff = Buffer.from(`${(value as string).slice(2)}`, "hex");
        encodedValue = cbor.encode(buff.toString("base64"));
        break;
      case RequestParamType.INT:
      case RequestParamType.UINT:
        encodedValue = cbor.encode(BigInt(value as string));
        break;
      case RequestParamType.INT_ARRAY:
      case RequestParamType.UINT_ARRAY:
        encodedValue = cbor.encode((value as Array<number>).map((n: number) => BigInt(n)));
        break;
      default:
        throw new Error(`Unsupported request parameter 'type': ${type}.`);
    }
    buffer += `${encodedName.toString("hex")}${encodedValue.toString("hex")}`;
    // NB: Chainlink.sol appends "ff" on Arrays
    if ([RequestParamType.STRING_ARRAY, RequestParamType.UINT_ARRAY, RequestParamType.INT_ARRAY].includes(type)) {
      buffer += "ff";
    }
  }

  return buffer;
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
