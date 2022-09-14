import { HardhatConfig, HardhatRuntimeEnvironment } from "hardhat/types";

import { ChainId } from "./constants";
import { throwNewError } from "./errors";

function getChainVerifyApiKeyEnv(chainId: ChainId): string {
  let apiKey;
  switch (chainId) {
    case ChainId.ARB_MAINNET:
    case ChainId.ARB_RINKEBY:
      apiKey = process.env.ARBISCAN_API_KEY;
      break;
    case ChainId.AVAX_MAINNET:
    case ChainId.AVAX_FUJI:
      apiKey = process.env.SNOWTRACE_API_KEY;
      break;
    case ChainId.BSC_MAINNET:
    case ChainId.BSC_TESTNET:
      apiKey = process.env.BSCSCAN_API_KEY;
      break;
    case ChainId.ETH_GOERLI:
    case ChainId.ETH_KOVAN:
    case ChainId.ETH_MAINNET:
    case ChainId.ETH_RINKEBY:
    case ChainId.ETH_ROPSTEN:
      apiKey = process.env.ETHERSCAN_API_KEY;
      break;
    case ChainId.FTM_MAINNET:
    case ChainId.FTM_TESTNET:
      apiKey = process.env.FTMSCAN_API_KEY;
      break;
    case ChainId.MATIC_MAINNET:
    case ChainId.MATIC_MUMBAI:
      apiKey = process.env.POLYGONSCAN_API_KEY;
      break;
    case ChainId.OPT_GOERLI:
    case ChainId.OPT_KOVAN:
    case ChainId.OPT_MAINNET:
      apiKey = process.env.OPTIMISTIC_ETHERSCAN_API_KEY;
      break;
    case ChainId.XDAI_MAINNET:
      apiKey = "api-key";
      break;
    default:
      throw new Error(`Unsupported chainId: ${chainId}. Either add support or discard verifying contracts on it`);
  }
  apiKey ?? throwNewError(`Invalid verify API key for chainId: ${chainId}. Missing key in .env file`);
  if (!String(apiKey).trim())
    throwNewError(`Invalid verify API key for chainId: ${chainId}. Missing value in .env file`);

  return apiKey as string;
}

export function setChainVerifyApiKeyEnv(chainId: ChainId, hreConfig: HardhatConfig): void {
  const apiKey = getChainVerifyApiKeyEnv(chainId);
  // NB: overwrite the Etherscan plugin API key
  hreConfig.etherscan.apiKey = apiKey;
}

// Verify a contract by address
export async function verifyByAddress(
  hre: HardhatRuntimeEnvironment,
  addressContract: string,
  contract?: string,
): Promise<void> {
  setChainVerifyApiKeyEnv(hre.network.config.chainId as number, hre.config);
  await hre.run("verify:verify", {
    address: addressContract,
    contract,
  });
}

// Verify a consumer contract whose constructor requires [LINK address,oracle contract address]
export async function verifyStandardConsumer(
  hre: HardhatRuntimeEnvironment,
  addressContract: string,
  addressLink: string,
  addressOperator: string,
  contract?: string,
): Promise<void> {
  setChainVerifyApiKeyEnv(hre.network.config.chainId as number, hre.config);
  await hre.run("verify:verify", {
    address: addressContract,
    constructorArguments: [addressLink, addressOperator],
    contract,
  });
}
