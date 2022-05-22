import type { ContractTransaction } from "@ethersproject/contracts";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, ethers } from "ethers";
import type { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";

import type { DRCoordinator } from "../../src/types";
import type { Overrides } from "../../utils/types";
import { logger } from "../../utils/logger";
import { setChainVerifyApiKeyEnv } from "../../utils/verification";

export async function transferOwnership(
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  owner: string,
  overrides?: Overrides,
): Promise<void> {
  const logObj = { owner };
  let tx: ContractTransaction;
  try {
    tx = await drCoordinator.connect(signer).transferOwnership(owner, overrides);
    logger.info(logObj, `transferOwnership() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(logObj).error(error, `transferOwnership() failed due to:`);
    throw error;
  }
}

export async function setupDRCoordinator(
  taskArguments: TaskArguments,
  drCoordinator: DRCoordinator,
  signer: ethers.Wallet | SignerWithAddress,
  overrides: Overrides,
) {
  // Transfer ownership
  if (taskArguments.owner) {
    await transferOwnership(drCoordinator, signer, taskArguments.owner as string, overrides);
  }
}

export async function verifyDRCoordinator(
  hre: HardhatRuntimeEnvironment,
  drCoordinator: string,
  addressLink: string,
  addressLinkTknFeed: string,
  description: string,
  fallbackWeiPerUnitLink: BigNumber,
  gasAfterPaymentCalc: BigNumber,
  stalenessSeconds: BigNumber,
  isSequencerDependant: boolean,
  sequencerOfflineFlag: string,
  addressChainlinkFlags: string,
): Promise<void> {
  setChainVerifyApiKeyEnv(hre.network.config.chainId as number, hre.config);
  await hre.run("verify:verify", {
    address: drCoordinator,
    constructorArguments: [
      addressLink,
      addressLinkTknFeed,
      description,
      fallbackWeiPerUnitLink,
      gasAfterPaymentCalc,
      stalenessSeconds,
      isSequencerDependant,
      sequencerOfflineFlag,
      addressChainlinkFlags,
    ],
  });
}
