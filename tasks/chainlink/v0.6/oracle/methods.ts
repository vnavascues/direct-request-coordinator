import type { ContractTransaction } from "@ethersproject/contracts";
import type { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import path from "path";

import type { Oracle } from "../../../../src/types";
import { logger as parentLogger } from "../../../../utils/logger";
import type { Overrides } from "../../../../utils/types";
import { setChainVerifyApiKeyEnv } from "../../../../utils/verification";

const logger = parentLogger.child({ name: path.relative(process.cwd(), __filename) });

export async function setupOracleAfterDeploy(taskArguments: TaskArguments, oracle: Oracle, overrides: Overrides) {
  // Set fulfillment permission per sender
  const senders = taskArguments.senders as string[];
  let tx: ContractTransaction;
  for (const sender of senders) {
    try {
      tx = await oracle.setFulfillmentPermission(sender, true, overrides);
      logger.info(sender, `setFulfillmentPermission() | Tx hash: ${tx.hash}`);
      await tx.wait();
    } catch (error) {
      logger.child({ sender }).error(error, `setFulfillmentPermission() failed due to:`);
      throw error;
    }
  }

  // Transfer ownership
  const owner = taskArguments.owner;
  if (owner) {
    try {
      tx = await oracle.transferOwnership(taskArguments.owner as string, overrides);
      logger.info({ owner }, `transferOwnership() | Tx hash: ${tx.hash}`);
      await tx.wait();
    } catch (error) {
      logger.child({ owner }).error(error, `transferOwnership() failed due to:`);
      throw error;
    }
  }
}

export async function verifyOracle(
  hre: HardhatRuntimeEnvironment,
  addressContract: string,
  addressLink: string,
  contract?: string,
): Promise<void> {
  setChainVerifyApiKeyEnv(hre.network.config.chainId as number, hre.config);
  await hre.run("verify:verify", {
    address: addressContract,
    constructorArguments: [addressLink],
    contract,
  });
}
