// NB: this file is ignored by prettier due to dotenvConfig call before loading network configs
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@openzeppelin/hardhat-upgrades";
import "@typechain/hardhat";
import { config as dotenvConfig } from "dotenv";
import "hardhat-dependency-compiler";
import "hardhat-gas-reporter";
import type { HardhatUserConfig } from "hardhat/config";
import { resolve } from "path";
import "solidity-coverage";
dotenvConfig({ path: resolve(__dirname, process.env.NODE_ENV ? "./.env.ci" : "./.env"), override: true });

import "./tasks/accounts";
import "./tasks/chainlink";
import "./tasks/drcoordinator";
import "./tasks/tools";
import { ChainId, DEFAULT_HARDHAT_MNEMONIC } from "./utils/constants";
import { getHardhatNetworkForkingUserConfig, networkUserConfigs } from "./utils/networks";

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
    src: "./contracts",
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic: process.env.MNEMONIC || DEFAULT_HARDHAT_MNEMONIC,
      },
      chainId: ChainId.HARDHAT,
      forking: getHardhatNetworkForkingUserConfig(),
    },
    // TODO: add the other EVM compatible networks our infra supports (e.g. Fantom, Binance Chain, RSK),
    ...Object.fromEntries(networkUserConfigs.entries()),
  },
  etherscan: {
    // NB: supported by default by @nomiclabs/hardhat-etherscan 3.1.0
    customChains: [
      {
        network: "arbitrumGoerli",
        chainId: ChainId.ARB_GOERLI,
        urls: {
          apiURL: "https://goerli.arbiscan.io/api",
          browserURL: "https://goerli.arbiscan.io//",
        },
      },
      {
        network: "optimisticGoerli",
        chainId: ChainId.OPT_GOERLI,
        urls: {
          apiURL: "https://api-goerli-optimism.etherscan.io/api",
          browserURL: "https://goerli-optimism.etherscan.io/",
        },
      },
    ],
    // NB: currently the plugin only supports Etherscan explorers
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY as string,
      ropsten: process.env.ETHERSCAN_API_KEY as string,
      rinkeby: process.env.ETHERSCAN_API_KEY as string,
      goerli: process.env.ETHERSCAN_API_KEY as string,
      kovan: process.env.ETHERSCAN_API_KEY as string,
      // binance smart chain
      bsc: process.env.BSCSCAN_API_KEY as string,
      bscTestnet: process.env.BSCSCAN_API_KEY as string,
      // huobi eco chain
      heco: process.env.HECHOINFO_API_KEY as string,
      hecoTestnet: process.env.HECHOINFO_API_KEY as string,
      // fantom mainnet
      opera: process.env.FTMSCAN_API_KEY as string,
      ftmTestnet: process.env.FTMSCAN_API_KEY as string,
      // optimistim
      optimisticEthereum: process.env.OPTIMISTIC_ETHERSCAN_API_KEY as string,
      optimisticGoerli: process.env.OPTIMISTIC_ETHERSCAN_API_KEY as string,
      optimisticKovan: process.env.OPTIMISTIC_ETHERSCAN_API_KEY as string,
      // polygon
      polygon: process.env.POLYGONSCAN_API_KEY as string,
      polygonMumbai: process.env.POLYGONSCAN_API_KEY as string,
      // arbitrum
      arbitrumGoerli: process.env.ARBISCAN_API_KEY as string,
      arbitrumOne: process.env.ARBISCAN_API_KEY as string,
      arbitrumTestnet: process.env.ARBISCAN_API_KEY as string,
      // avalanche
      avalanche: process.env.SNOWTRACE_API_KEY as string,
      avalancheFujiTestnet: process.env.SNOWTRACE_API_KEY as string,
      // moonbeam
      // moonbeam: process.env.MOONBEAM_MOONSCAN_API_KEY, // NB: not yet supported
      moonriver: process.env.MOONRIVER_MOONSCAN_API_KEY as string,
      moonbaseAlpha: process.env.MOONRIVER_MOONSCAN_API_KEY as string,
      // xdai and sokol don't need an API key, but you still need
      // to specify one; any string placeholder will work
      xdai: "api-key",
      sokol: "api-key",
    },
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    compilers: [
      {
        version: "0.4.24",
        settings: {
          metadata: {
            // Not including the metadata hash
            // https://github.com/paulrberg/solidity-template/issues/31
            bytecodeHash: "none",
          },
          // Disable the optimizer when debugging
          // https://hardhat.org/hardhat-network/#solidity-optimizer-support
          optimizer: {
            enabled: true,
            runs: 800,
          },
        },
      },
      {
        version: "0.6.6",
        settings: {
          metadata: {
            // Not including the metadata hash
            // https://github.com/paulrberg/solidity-template/issues/31
            bytecodeHash: "none",
          },
          // Disable the optimizer when debugging
          // https://hardhat.org/hardhat-network/#solidity-optimizer-support
          optimizer: {
            enabled: true,
            runs: 800,
          },
        },
      },
      {
        version: "0.7.6",
        settings: {
          metadata: {
            // Not including the metadata hash
            // https://github.com/paulrberg/solidity-template/issues/31
            bytecodeHash: "none",
          },
          // Disable the optimizer when debugging
          // https://hardhat.org/hardhat-network/#solidity-optimizer-support
          optimizer: {
            enabled: true,
            runs: 800,
          },
        },
      },
      {
        version: "0.8.2",
        settings: {
          metadata: {
            // Not including the metadata hash
            // https://github.com/paulrberg/solidity-template/issues/31
            bytecodeHash: "none",
          },
          // Disable the optimizer when debugging
          // https://hardhat.org/hardhat-network/#solidity-optimizer-support
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.6",
        settings: {
          metadata: {
            // Not including the metadata hash
            // https://github.com/paulrberg/solidity-template/issues/31
            bytecodeHash: "none",
          },
          // Disable the optimizer when debugging
          // https://hardhat.org/hardhat-network/#solidity-optimizer-support
          optimizer: {
            enabled: true,
            runs: 800,
          },
        },
      },
      {
        version: "0.8.15",
        settings: {
          metadata: {
            // Not including the metadata hash
            // https://github.com/paulrberg/solidity-template/issues/31
            bytecodeHash: "none",
          },
          // Disable the optimizer when debugging
          // https://hardhat.org/hardhat-network/#solidity-optimizer-support
          optimizer: {
            enabled: true,
            runs: 800,
          },
        },
      },
      {
        version: "0.8.17",
        settings: {
          metadata: {
            // Not including the metadata hash
            // https://github.com/paulrberg/solidity-template/issues/31
            bytecodeHash: "none",
          },
          // Disable the optimizer when debugging
          // https://hardhat.org/hardhat-network/#solidity-optimizer-support
          optimizer: {
            enabled: true,
            runs: 800,
          },
          viaIR: true,
        },
      },
    ],
  },
  typechain: {
    outDir: "src/types",
    target: "ethers-v5",
  },
  dependencyCompiler: {
    paths: [
      "@chainlink/contracts/src/v0.8/ChainlinkClient.sol",
      // '@openzeppelin/contracts/token/ERC20/IERC20.sol',
    ],
  },
};

export default config;
