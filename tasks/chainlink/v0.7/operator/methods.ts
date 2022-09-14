import type { ContractTransaction } from "@ethersproject/contracts";
import type { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";
import path from "path";

import type { Operator } from "../../../../src/types";
import { logger as parentLogger } from "../../../../utils/logger";
import type { Overrides } from "../../../../utils/types";
import { setChainVerifyApiKeyEnv } from "../../../../utils/verification";

const logger = parentLogger.child({ name: path.relative(process.cwd(), __filename) });

export async function setupOperatorAfterDeploy(taskArguments: TaskArguments, operator: Operator, overrides: Overrides) {
  // Set authorized senders
  const senders = taskArguments.senders as string[];
  let tx: ContractTransaction;
  try {
    tx = await operator.setAuthorizedSenders(senders, overrides);
    logger.info(senders, `setAuthorizedSenders() | Tx hash: ${tx.hash}`);
    await tx.wait();
  } catch (error) {
    logger.child(senders).error(error, `setAuthorizedSenders() failed due to:`);
    throw error;
  }

  // Transfer ownership
  const owner = taskArguments.owner;
  if (owner) {
    try {
      tx = await operator.transferOwnership(taskArguments.owner as string, overrides);
      logger.info({ owner }, `transferOwnership() | Tx hash: ${tx.hash}`);
      await tx.wait();
    } catch (error) {
      logger.child({ owner }).error(error, `transferOwnership() failed due to:`);
      throw error;
    }
  }
}

export async function verifyOperator(
  hre: HardhatRuntimeEnvironment,
  addressContract: string,
  addressLink: string,
  addressOwner: string,
  contract?: string,
): Promise<void> {
  setChainVerifyApiKeyEnv(hre.network.config.chainId as number, hre.config);
  await hre.run("verify:verify", {
    address: addressContract,
    constructorArguments: [addressLink, addressOwner],
    contract,
  });
}
