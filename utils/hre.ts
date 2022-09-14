import { BigNumber } from "ethers";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

export async function impersonateAccount(hre: HardhatRuntimeEnvironment, address: string): Promise<void> {
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });
}

export async function setAddressBalance(
  hre: HardhatRuntimeEnvironment,
  address: string,
  balance: BigNumber,
): Promise<void> {
  await hre.network.provider.send("hardhat_setBalance", [address, balance.toHexString()]);
}

export async function setAddressCode(hre: HardhatRuntimeEnvironment, address: string, value: string): Promise<void> {
  await hre.network.provider.send("hardhat_setCode", [address, value]);
}

export async function stopImpersonatingAccount(hre: HardhatRuntimeEnvironment, address: string): Promise<void> {
  await hre.network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [address],
  });
}
