import { BigNumber } from "ethers";

export const DEFAULT_BATCH_SIZE = 50;
export const DUMMY_SET_CODE_BYTES = "0x70657065"; // pepe
export const MAX_PERMYRIAD_FEE = BigNumber.from("10000"); // 100%
export const PERMYRIAD = 10_000; // 100%

export enum FeeType {
  FLAT = 0,
  PERMYRIAD = 1,
}

export enum PaymentNoFeeType {
  MAX = 0,
  SPOT = 1,
}

export enum PaymentType {
  FLAT = 0,
  PERMYRIAD = 1,
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
  OPT_GOERLI = "opt_goerli",
}

export enum ExternalAdapterId {
  // My Adapters
  MY_ADAPTER_EXAMPLE = "my_adapter_example",
  // Market.link adapters
  COINGECKO = "coingecko",
  THERUNDOWN = "therundown",
}
