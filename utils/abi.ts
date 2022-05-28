import { ethers } from "ethers";

export function convertFunctionNametoSelector(name: string): string {
  const buffer = Buffer.from(name);
  const hexStr = ethers.utils.keccak256(`0x${buffer.toString("hex")}`);
  return hexStr.slice(0, 10);
}
