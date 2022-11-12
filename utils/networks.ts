import type { HDAccountsUserConfig, NetworkUserConfig } from "hardhat/types";
import path from "path";

import { ChainId, NetworkProtocol, Provider } from "./constants";
import { logger as parentLogger } from "./logger";
import type { HardhatNetworkForkingUserConfig, NetworkUrl } from "./types";

const logger = parentLogger.child({ name: path.relative(process.cwd(), __filename) });

// Alchemy network URLs
export const chainIdToAlchemyNetworkUrl: ReadonlyMap<ChainId, NetworkUrl> = new Map([]);

// Infura network URLs
export const chainIdToInfuraNetworkUrl: ReadonlyMap<ChainId, NetworkUrl> = new Map([
  [ChainId.ETH_MAINNET, { http: "https://mainnet.infura.io/v3", wss: "wss://mainnet.infura.io/ws/v3" }],
  [ChainId.ETH_ROPSTEN, { http: "https://ropsten.infura.io/v3", wss: "wss://ropsten.infura.io/ws/v3" }],
  [ChainId.ETH_KOVAN, { http: "https://kovan.infura.io/v3", wss: "wss://kovan.infura.io/ws/v3" }],
  [ChainId.ETH_RINKEBY, { http: "https://rinkeby.infura.io/v3", wss: "wss://rinkeby.infura.io/ws/v3" }],
  [ChainId.ETH_GOERLI, { http: "https://goerli.infura.io/v3", wss: "wss://goerli.infura.io/ws/v3" }],
  [ChainId.MATIC_MAINNET, { http: "https://polygon-mainnet.infura.io/v3" }],
  [ChainId.MATIC_MUMBAI, { http: "https://polygon-mumbai.infura.io/v3" }],
  [ChainId.ARB_GOERLI, { http: "https://arbitrum-goerli.infura.io/v3" }],
  [ChainId.ARB_MAINNET, { http: "https://arbitrum-mainnet.infura.io/v3" }],
  [ChainId.ARB_RINKEBY, { http: "https://arbitrum-rinkeby.infura.io/v3" }],
  [ChainId.OPT_GOERLI, { http: "https://optimism-goerli.infura.io/v3" }],
  [ChainId.OPT_MAINNET, { http: "https://optimism-mainnet.infura.io/v3" }],
  [ChainId.OPT_KOVAN, { http: "https://optimism-kovan.infura.io/v3" }],
]);

// Public network URLs
export const chainIdToPublicNetwork: ReadonlyMap<ChainId, NetworkUrl> = new Map([
  [
    ChainId.ARB_RINKEBY,
    {
      http: "https://apis.ankr.com/428839df438c4f92b14b5db5858043cb/38ed1e46fe2a7a2b7515c740051b7948/arbitrum/full/test",
      wss: "wss://rinkeby.arbitrum.io/ws",
    },
  ],
  [ChainId.AVAX_FUJI, { http: "https://api.avax-test.network/ext/bc/C/rpc" }],
  [ChainId.AVAX_MAINNET, { http: "https://api.avax.network/ext/bc/C/rpc" }],
  [ChainId.BSC_MAINNET, { http: "https://bsc-dataseed.binance.org/" }],
  [ChainId.BSC_TESTNET, { http: "https://data-seed-prebsc-1-s1.binance.org:8545" }],
  [ChainId.FTM_MAINNET, { http: "https://rpc.ftm.tools/" }],
  [ChainId.FTM_TESTNET, { http: "https://rpc.testnet.fantom.network/" }],
  [ChainId.HECO_MAINNET, { http: "https://http-mainnet.hecochain.com/" }],
  [ChainId.HECO_TESTNET, { http: "https://http-testnet.hecochain.com/" }],
  [
    ChainId.KLAYTN_BAOBAB,
    {
      http: "https://public-node-api.klaytnapi.com/v1/baobab",
      wss: "wss://public-node-api.klaytnapi.com/v1/baobab/ws",
    },
  ],
  [
    ChainId.MATIC_MUMBAI,
    {
      http: "https://matic-mumbai.chainstacklabs.com",
      wss: "wss://wandering-divine-grass.matic-testnet.quiknode.pro/622ecb70eaa10883069718d598137cd3f1e40874/",
    },
  ],
  [ChainId.METIS_MAINNET, { http: "https://andromeda.metis.io/?owner=1088" }],
  [ChainId.MOONBEAM_MAINNET, { http: "https://moonbeam.api.onfinality.io/public" }],
  [ChainId.MOONBEAM_MOONRIVER, { http: "https://moonriver.api.onfinality.io/public" }],
  [ChainId.MOONBEAM_ALPHA, { http: "https://moonbeam-alpha.api.onfinality.io/public" }],
  [ChainId.ONE_MAINNET, { http: "https://api.harmony.one/" }],
  [ChainId.ONE_TESTNET, { http: "https://api.s0.pops.one/" }],
  [ChainId.OPT_GOERLI, { http: "https://goerli.optimism.io", wss: "wss://ws-goerli.optimism.io" }],
  [ChainId.OPT_KOVAN, { wss: "wss://ws-kovan.optimism.io" }],
  [ChainId.RSK_MAINNET, { http: "https://public-node.rsk.co" }],
  [ChainId.SPOA_SOKOL, { http: "https://sokol.poa.network" }],
  [ChainId.XDAI_MAINNET, { http: "https://rpc.gnosischain.com/" }],
]);

export function getChainConfig(chainId: ChainId): NetworkUserConfig {
  // Accounts
  const mnemonic: string | undefined = process.env.MNEMONIC;
  const privateKey: string | undefined = process.env.PRIVATE_KEY;

  if (!mnemonic && !privateKey) {
    throw new Error("Please set your MNEMONIC and/or PRIVATE_KEY in a .env file");
  }

  const accounts = privateKey
    ? [privateKey]
    : ({
        count: 10,
        mnemonic,
        path: "m/44'/60'/0'/0",
      } as HDAccountsUserConfig);

  // Network URL
  const networkEnvVarPrefix = ChainId[chainId];
  const customNetworkUrl = process.env[`${networkEnvVarPrefix}_CUSTOM`];
  if (customNetworkUrl) {
    logger.child({ accounts, chainId, url: customNetworkUrl }).warn("hardhat custom network connection");
    return {
      accounts,
      chainId,
      url: customNetworkUrl,
    };
  }
  const networkProvider = process.env[`${networkEnvVarPrefix}_PROVIDER`];

  let chainIdToNetworkUrl;
  switch (networkProvider) {
    case Provider.ALCHEMY:
      chainIdToNetworkUrl = chainIdToAlchemyNetworkUrl.get(chainId);
      break;
    case Provider.INFURA:
      chainIdToNetworkUrl = chainIdToInfuraNetworkUrl.get(chainId);
      break;
    case Provider.PUBLIC:
      chainIdToNetworkUrl = chainIdToPublicNetwork.get(chainId);
      break;
    default:
      throw new Error(`Unsupported network provider: ${networkProvider}`);
  }
  if (!chainIdToNetworkUrl) {
    throw new Error(`Unsupported chain ${chainId} for provider ${networkProvider}`);
  }

  const networkProtocol = process.env[`${networkEnvVarPrefix}_PROTOCOL`];
  let networkUrl;
  switch (networkProtocol) {
    case NetworkProtocol.HTTP:
      networkUrl = chainIdToNetworkUrl.http;
      break;
    case NetworkProtocol.WSS:
      networkUrl = chainIdToNetworkUrl.wss;
      break;
    default:
      throw new Error(`Unsupported network protocol getting: ${networkProtocol}`);
  }
  if (!networkUrl) {
    throw new Error(`Missing ${networkProtocol} url on chain ${chainId} for provider ${networkProvider}`);
  }

  // Network URL custom logic per provider
  let url;
  switch (networkProvider) {
    case Provider.ALCHEMY:
    case Provider.PUBLIC:
      url = networkUrl;
      break;
    case Provider.INFURA: {
      const apiKey = process.env.INFURA_API_KEY as string;
      if (!apiKey) {
        throw new Error("Please set your INFURA_API_KEY in a .env file");
      }
      url = `${networkUrl}/${apiKey}`;
      break;
    }
    default:
      throw new Error(`Unsupported network provider: ${networkProvider}`);
  }
  logger.child({ accounts, chainId, url }).debug("hardhat network connection");
  return {
    accounts,
    chainId,
    url,
  };
}

export function getHardhatNetworkForkingUserConfig(): HardhatNetworkForkingUserConfig {
  if (process.env.HARDHAT_FORKING_ENABLED === "true") {
    const url = process.env.HARDHAT_FORKING_URL as string;
    if (!url.trim()) {
      throw new Error("Please set your HARDHAT_FORKING_URL in a .env file");
    }
    const forking: HardhatNetworkForkingUserConfig = {
      enabled: true,
      url,
    };
    const blockNumber = process.env.HARDHAT_FORKING_BLOCK_NUMBER;
    if (blockNumber) {
      const blockNumberAsInt = parseInt(blockNumber);
      if (isNaN(blockNumberAsInt) || blockNumberAsInt < 0) {
        throw new Error(
          `Invalid HARDHAT_FORKING_BLOCK_NUMBER: ${blockNumber}. Required a number greater or equal than zero`,
        );
      }
      forking.blockNumber = blockNumberAsInt;
    }
    return forking;
  }
  return {
    enabled: false,
    url: "forking_url_should_not_be_needed",
  };
}

export const networkUserConfigs: ReadonlyMap<string, NetworkUserConfig> = new Map([
  ["arb-goerli", getChainConfig(ChainId.ARB_GOERLI)],
  ["arb-mainnet", getChainConfig(ChainId.ARB_MAINNET)],
  ["arb-rinkeby", getChainConfig(ChainId.ARB_RINKEBY)],
  ["avax-fuji", getChainConfig(ChainId.AVAX_FUJI)],
  ["avax-mainnet", getChainConfig(ChainId.AVAX_MAINNET)],
  ["bsc-mainnet", getChainConfig(ChainId.BSC_MAINNET)],
  ["bsc-testnet", getChainConfig(ChainId.BSC_TESTNET)],
  ["eth-goerli", getChainConfig(ChainId.ETH_GOERLI)],
  ["eth-kovan", getChainConfig(ChainId.ETH_KOVAN)],
  ["eth-mainnet", getChainConfig(ChainId.ETH_MAINNET)],
  ["eth-rinkeby", getChainConfig(ChainId.ETH_RINKEBY)],
  ["eth-ropsten", getChainConfig(ChainId.ETH_ROPSTEN)],
  ["ftm-mainnet", getChainConfig(ChainId.FTM_MAINNET)],
  ["ftm-testnet", getChainConfig(ChainId.FTM_TESTNET)],
  ["heco-mainnet", getChainConfig(ChainId.HECO_MAINNET)],
  ["heco-testnet", getChainConfig(ChainId.HECO_TESTNET)],
  ["klaytn-baobab", getChainConfig(ChainId.KLAYTN_BAOBAB)],
  ["matic-mainnet", getChainConfig(ChainId.MATIC_MAINNET)],
  ["matic-mumbai", getChainConfig(ChainId.MATIC_MUMBAI)],
  ["metis-mainnet", getChainConfig(ChainId.METIS_MAINNET)],
  ["moonbeam-mainnet", getChainConfig(ChainId.MOONBEAM_MAINNET)],
  ["moonbeam-moonriver", getChainConfig(ChainId.MOONBEAM_MOONRIVER)],
  ["one-mainnet", getChainConfig(ChainId.ONE_MAINNET)],
  ["one-testnet", getChainConfig(ChainId.ONE_TESTNET)],
  ["opt-goerli", getChainConfig(ChainId.OPT_GOERLI)],
  ["opt-kovan", getChainConfig(ChainId.OPT_KOVAN)],
  ["opt-mainnet", getChainConfig(ChainId.OPT_MAINNET)],
  ["rsk-mainnet", getChainConfig(ChainId.RSK_MAINNET)],
  ["spoa-sokol", getChainConfig(ChainId.SPOA_SOKOL)],
  ["xdai-mainnet", getChainConfig(ChainId.XDAI_MAINNET)],
]);
