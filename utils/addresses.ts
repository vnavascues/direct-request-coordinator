import { ethers } from "ethers";

export function getChecksumAddress(address: string) {
  let checksumAddress: string;
  try {
    checksumAddress = ethers.utils.getAddress(address);
  } catch (error) {
    throw new Error(`Invalid address: ${address}.`);
  }
  return checksumAddress;
}
