import type { BigNumberish } from "ethers";

// General
export type JSONValue = string | number | boolean | null | JSONObject | JSONArray;

export interface JSONObject {
  [x: string]: JSONValue;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface JSONArray extends Array<JSONValue> {}

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
