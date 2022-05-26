// Hardhat - Network config
export enum Provider {
  ALCHEMY = "alchemy",
  INFURA = "infura",
  PUBLIC_RPC = "public_rpc",
}

export enum ChainId {
  ETH_MAINNET = 1, // Ethereum - Mainnet
  ETH_ROPSTEN = 3, // Ethereum - Ropsten
  ETH_RINKEBY = 4, // Ethereum - Rinkeby
  ETH_GOERLI = 5, // Ethereum - Goerli
  OPT_MAINNET = 10, // Optimism- Mainnet
  RSK_MAINNET = 30, // RSK - Mainnet
  ETH_KOVAN = 42, // Ethereum - Kovan
  BSC_MAINNET = 56, // Binance Smart Chain - Mainnet
  OPT_KOVAN = 69, // Optimism- Kovan
  SPOA_SOKOL = 77, // POA Network Sokol
  BSC_TESTNET = 97, // Binance Smart Chain - Testnet
  XDAI_MAINNET = 100, // Gnosis Chain (formerly xDai - Mainnet)
  HECO_MAINNET = 128, // Huobi Eco Chain - Mainnet
  MATIC_MAINNET = 137, // Polygon - Mainnet
  FTM_MAINNET = 250, // Fantom - Mainnet
  HECO_TESTNET = 256, // Huobi Eco Chain - Testnet
  MOONBEAM_MAINNET = 1284, // Moonbeam - Mainnet (Polkadot)
  MOONBEAM_MOONRIVER = 1285, // Moonbeam - Moonriver (Kusama)
  MOONBEAM_ALPHA = 1287, // Moonbeam - Alpha (PureStake)
  // MOONBEAM_ROCK = 1288, // Moonrock - Rock (Rococo)
  FTM_TESTNET = 4002, // Fantom - Testnet
  HARDHAT = 31337,
  ARB_MAINNET = 42161, // Arbitrum One - Mainnet
  AVAX_FUJI = 43113, // Avalanche - Fuji
  AVAX_MAINNET = 43114, // Avalanche - Mainnet
  MATIC_MUMBAI = 80001, // Polygon - Mumbai
  ARB_RINKEBY = 421611, // Arbitrum - Rinkeby
  ONE_MAINNET = 1666600000, // Harmony - Mainnet (Shard 0)
  ONE_TESTNET = 1666700000, // Harmony - Testnet (Shard 0)
}

export const chainIdTkn: Map<ChainId, string> = new Map([
  [ChainId.ETH_MAINNET, "ETH"],
  [ChainId.ETH_RINKEBY, "ETH"],
  [ChainId.ETH_GOERLI, "ETH"],
  [ChainId.OPT_MAINNET, "ETH"],
  [ChainId.RSK_MAINNET, "RSK"],
  [ChainId.ETH_KOVAN, "ETH"],
  [ChainId.BSC_MAINNET, "BNB"],
  [ChainId.OPT_KOVAN, "ETH"],
  [ChainId.BSC_TESTNET, "BNB"],
  [ChainId.XDAI_MAINNET, "xDAI"],
  [ChainId.HECO_MAINNET, "HT"],
  [ChainId.MATIC_MAINNET, "MATIC"],
  [ChainId.FTM_MAINNET, "FRM"],
  [ChainId.MOONBEAM_MOONRIVER, "GLMR"],
  [ChainId.FTM_TESTNET, "FRM"],
  [ChainId.ARB_MAINNET, "ETH"],
  [ChainId.AVAX_FUJI, "AVAX"],
  [ChainId.AVAX_MAINNET, "AVAX"],
  [ChainId.MATIC_MUMBAI, "MATIC"],
  [ChainId.ARB_RINKEBY, "ETH"],
  [ChainId.ONE_MAINNET, "ONE"],
  [ChainId.ONE_TESTNET, "ONE"],
]);
