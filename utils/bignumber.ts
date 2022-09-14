import { BigNumber, BigNumberish } from "ethers";

export const BIG_NUMBER_MAX_SAFE_INTEGER = BigNumber.from(Number.MAX_SAFE_INTEGER.toString());

export function convertBigNumberToNumberOrString(value: BigNumber): number | string {
  return value.gt(BIG_NUMBER_MAX_SAFE_INTEGER) ? value.toString() : value.toNumber();
}

export function logBigNumberish(value: BigNumberish): number | string {
  const valueBigNumber = BigNumber.isBigNumber(value) ? value : BigNumber.from(value);
  return convertBigNumberToNumberOrString(valueBigNumber);
}
