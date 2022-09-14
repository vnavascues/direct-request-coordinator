import type { BigNumberish } from "ethers";

// General
export type JSONValue = string | number | boolean | null | JSONObject | JSONArray;

export interface JSONObject {
  [x: string]: JSONValue;
}

export type JSONArray = Array<JSONValue>;

export interface HardhatNetworkForkingUserConfig {
  enabled?: boolean;
  url: string;
  blockNumber?: number;
}

// ethers.js - overrides
export interface Overrides {
  from?: string;
  value?: BigNumberish;
  gasLimit?: BigNumberish;
  gasPrice?: BigNumberish;
  maxFeePerGas?: BigNumberish;
  maxPriorityFeePerGas?: BigNumberish;
}

export interface TxType0GasParams {
  gasPrice: BigNumberish;
}

export interface TxType2GasParams {
  maxFeePerGas: BigNumberish;
  maxPriorityFeePerGas: BigNumberish;
}

export interface NetworkUrl {
  http?: string;
  wss?: string;
}
