import { JsonRpcProvider } from "@ethersproject/providers";
import { ethers } from "ethers";
import type { HDAccountsUserConfig, HttpNetworkUserConfig, NetworkUserConfig } from "hardhat/types";

import { ChainId, Provider } from "./constants";
import { logger } from "./logger";

export const infuraNetworkHTTPEndpoint: ReadonlyMap<ChainId, string> = new Map([
  [ChainId.ETH_MAINNET, "https://mainnet.infura.io/v3"],
  [ChainId.ETH_ROPSTEN, "https://ropsten.infura.io/v3"],
  [ChainId.ETH_KOVAN, "https://kovan.infura.io/v3"],
  [ChainId.ETH_RINKEBY, "https://rinkeby.infura.io/v3"],
  [ChainId.ETH_GOERLI, "https://goerli.infura.io/v3"],
  [ChainId.MATIC_MAINNET, "https://polygon-mainnet.infura.io/v3"],
  [ChainId.MATIC_MUMBAI, "https://polygon-mumbai.infura.io/v3"],
  [ChainId.ARB_MAINNET, "https://arbitrum-mainnet.infura.io/v3"],
  [ChainId.ARB_RINKEBY, "https://arbitrum-rinkeby.infura.io/v3"],
  [ChainId.OPT_MAINNET, "https://optimism-mainnet.infura.io/v3"],
  [ChainId.OPT_KOVAN, "https://optimism-kovan.infura.io/v3"],
]);

export const networkWSSEndpoint: ReadonlyMap<ChainId, string> = new Map([
  [ChainId.ETH_MAINNET, "wss://mainnet.infura.io/ws/v3"],
  [ChainId.ETH_ROPSTEN, "wss://ropsten.infura.io/ws/v3"],
  [ChainId.ETH_KOVAN, "wss://kovan.infura.io/ws/v3"],
  [ChainId.ETH_RINKEBY, "wss://rinkeby.infura.io/ws/v3"],
  [ChainId.ETH_GOERLI, "wss://goerli.infura.io/ws/v3"],
]);

export const otherNetworkHTTPEndpoint: ReadonlyMap<ChainId, string> = new Map([
  [ChainId.AVAX_FUJI, "https://api.avax-test.network/ext/bc/C/rpc"],
  [ChainId.AVAX_MAINNET, "https://api.avax.network/ext/bc/C/rpc"],
  [ChainId.BSC_MAINNET, "https://bsc-dataseed.binance.org/"],
  [ChainId.BSC_TESTNET, "https://data-seed-prebsc-1-s1.binance.org:8545"],
  [ChainId.FTM_MAINNET, "https://rpc.ftm.tools/"],
  [ChainId.FTM_TESTNET, "https://rpc.testnet.fantom.network/"],
  [ChainId.HECO_MAINNET, "https://http-mainnet.hecochain.com/"],
  [ChainId.HECO_TESTNET, "https://http-testnet.hecochain.com/"],
  [ChainId.MOONBEAM_MAINNET, "https://moonbeam.api.onfinality.io/public"],
  [ChainId.MOONBEAM_MOONRIVER, "https://moonriver.api.onfinality.io/public"],
  [ChainId.MOONBEAM_ALPHA, "https://moonbeam-alpha.api.onfinality.io/public"],
  [ChainId.ONE_MAINNET, "https://api.harmony.one/"],
  [ChainId.ONE_TESTNET, "https://api.s0.pops.one/"],
  [ChainId.SPOA_SOKOL, "https://sokol.poa.network"],
  [ChainId.XDAI_MAINNET, "https://rpc.gnosischain.com/"],
]);

export function getChainConfig(
  chainId: ChainId,
  networkEndpoint: ReadonlyMap<ChainId, string>,
  provider: Provider,
): NetworkUserConfig {
  const mnemonic: string | undefined = process.env.MNEMONIC;
  const privateKey: string | undefined = process.env.PRIVATE_KEY;
  if (!mnemonic && !privateKey) {
    throw new Error("Please set your MNEMONIC and/or PRIVATE_KEY in a .env file");
  }

  const baseURL = networkEndpoint.get(chainId);
  if (!baseURL) {
    throw new Error(
      `Unsupported newtork with chainId: ${chainId}. Please update the ${provider} map or change provider`,
    );
  }

  let url: string;
  switch (provider) {
    case Provider.ALCHEMY: {
      const apiKey = process.env.ALCHEMY_API_KEY as string;
      if (!apiKey) {
        throw new Error("Please set your ALCHEMY_API_KEY in a .env file");
      }
      url = `${baseURL}/${apiKey}`;
      break;
    }
    case Provider.INFURA: {
      const apiKey = process.env.INFURA_API_KEY as string;
      if (!apiKey) {
        throw new Error("Please set your INFURA_API_KEY in a .env file");
      }
      url = `${baseURL}/${apiKey}`;
      break;
    }
    case Provider.PUBLIC_RPC:
      url = baseURL;
      break;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  const accounts = privateKey
    ? [privateKey]
    : ({
        count: 10,
        mnemonic,
        path: "m/44'/60'/0'/0",
      } as HDAccountsUserConfig);
  return {
    accounts,
    chainId,
    url,
  };
}

export function getNetworkSigner(network: string, privateKey: string): ethers.Wallet {
  const { url, chainId } = networkUserConfigs.get(network) as HttpNetworkUserConfig;
  const networkProvider = new JsonRpcProvider(url as string, {
    name: network,
    chainId: chainId as number,
  });
  let signer: ethers.Wallet;
  try {
    signer = new ethers.Wallet(privateKey, networkProvider);
  } catch (error) {
    logger.error(
      error,
      `unexpected error getting the network signer. Network: ${network} (Chain ID ${chainId}). Private key: ${privateKey}`,
    );
    throw error;
  }
  return signer;
}

export const networkUserConfigs: ReadonlyMap<string, NetworkUserConfig> = new Map([
  // Please, keep them in alphanumeric order
  ["arb-mainnet", getChainConfig(ChainId.ARB_MAINNET, infuraNetworkHTTPEndpoint, Provider.INFURA)],
  ["arb-rinkeby", getChainConfig(ChainId.ARB_RINKEBY, infuraNetworkHTTPEndpoint, Provider.INFURA)],
  ["avax-mainnet", getChainConfig(ChainId.AVAX_MAINNET, otherNetworkHTTPEndpoint, Provider.PUBLIC_RPC)],
  ["avax-fuji", getChainConfig(ChainId.AVAX_FUJI, otherNetworkHTTPEndpoint, Provider.PUBLIC_RPC)],
  ["bsc-mainnet", getChainConfig(ChainId.BSC_MAINNET, otherNetworkHTTPEndpoint, Provider.PUBLIC_RPC)],
  ["bsc-testnet", getChainConfig(ChainId.BSC_TESTNET, otherNetworkHTTPEndpoint, Provider.PUBLIC_RPC)],
  ["eth-goerli", getChainConfig(ChainId.ETH_GOERLI, infuraNetworkHTTPEndpoint, Provider.INFURA)],
  ["eth-kovan", getChainConfig(ChainId.ETH_KOVAN, infuraNetworkHTTPEndpoint, Provider.INFURA)],
  ["eth-mainnet", getChainConfig(ChainId.ETH_MAINNET, infuraNetworkHTTPEndpoint, Provider.INFURA)],
  ["eth-rinkeby", getChainConfig(ChainId.ETH_RINKEBY, infuraNetworkHTTPEndpoint, Provider.INFURA)],
  ["eth-ropsten", getChainConfig(ChainId.ETH_ROPSTEN, infuraNetworkHTTPEndpoint, Provider.INFURA)],
  ["ftm-mainnet", getChainConfig(ChainId.FTM_MAINNET, otherNetworkHTTPEndpoint, Provider.PUBLIC_RPC)],
  ["ftm-testnet", getChainConfig(ChainId.FTM_TESTNET, otherNetworkHTTPEndpoint, Provider.PUBLIC_RPC)],
  ["heco-mainnet", getChainConfig(ChainId.HECO_MAINNET, otherNetworkHTTPEndpoint, Provider.PUBLIC_RPC)],
  ["heco-testnet", getChainConfig(ChainId.HECO_TESTNET, otherNetworkHTTPEndpoint, Provider.PUBLIC_RPC)],
  ["matic-mainnet", getChainConfig(ChainId.MATIC_MAINNET, infuraNetworkHTTPEndpoint, Provider.INFURA)],
  ["matic-mumbai", getChainConfig(ChainId.MATIC_MUMBAI, infuraNetworkHTTPEndpoint, Provider.INFURA)],
  ["moonbeam-mainnet", getChainConfig(ChainId.MOONBEAM_MAINNET, otherNetworkHTTPEndpoint, Provider.PUBLIC_RPC)],
  ["moonbeam-moonriver", getChainConfig(ChainId.MOONBEAM_MOONRIVER, otherNetworkHTTPEndpoint, Provider.PUBLIC_RPC)],
  ["moonbeam-alpha", getChainConfig(ChainId.MOONBEAM_ALPHA, otherNetworkHTTPEndpoint, Provider.PUBLIC_RPC)],
  // ["moonbeam-rock", getChainConfig(ChainId.MOONBEAM_ROCK, otherNetworkHTTPEndpoint, Provider.PUBLIC_RPC)],
  ["one-mainnet", getChainConfig(ChainId.ONE_MAINNET, otherNetworkHTTPEndpoint, Provider.PUBLIC_RPC)],
  ["one-testnet", getChainConfig(ChainId.ONE_TESTNET, otherNetworkHTTPEndpoint, Provider.PUBLIC_RPC)],
  ["opt-kovan", getChainConfig(ChainId.OPT_KOVAN, infuraNetworkHTTPEndpoint, Provider.INFURA)],
  ["opt-mainnet", getChainConfig(ChainId.OPT_MAINNET, infuraNetworkHTTPEndpoint, Provider.INFURA)],
  ["spoa-sokol", getChainConfig(ChainId.SPOA_SOKOL, otherNetworkHTTPEndpoint, Provider.PUBLIC_RPC)],
  ["xdai-mainnet", getChainConfig(ChainId.XDAI_MAINNET, otherNetworkHTTPEndpoint, Provider.PUBLIC_RPC)],
]);
