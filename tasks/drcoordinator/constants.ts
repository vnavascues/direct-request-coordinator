import { BigNumber } from "ethers";

export const DUMMY_SET_CODE_BYTES = "0x70657065"; // pepe
export const MAX_REQUEST_CONFIRMATIONS = BigNumber.from("200");

export enum FeeType {
  FLAT = 0,
  PERMIRYAD = 1,
}

export enum FulfillMode {
  FALLBACK = 0,
  FULFILL_DATA = 1,
}

export enum PaymentNoFeeType {
  MAX = 0,
  SPOT = 1,
}

export enum TaskName {
  IMPORT_FILE = "import_file",
  SET_STUFF = "set_stuff",
  WITHDRAW = "withdraw",
}

export enum TaskExecutionMode {
  DRYRUN = "dryrun", // Executed on an instance of Hardhat Network (from the scratch)
  FORKING = "forking", // Executed on an instance of Hardhat Network that forks another network
  PROD = "prod", // Executed on a network
}

export enum ChainlinkNodeId {
  ETH_KOVAN = "eth_kovan",
  ETH_GOERLI = "eth_goerli",
  ETH_RINKEBY = "eth_rinkeby",
}

export enum ExternalAdapterId {
  // My Adapters
  MY_ADAPTER_EXAMPLE = "my_adapter_example",
  // Market.link adapters
  COINGECKO = "coingecko",
  THERUNDOWN = "therundown",
}
