import { Signer } from "@ethersproject/abstract-signer";
import { task } from "hardhat/config";
import path from "path";

import { logger as parentLogger } from "../utils/logger";

const logger = parentLogger.child({ name: path.relative(process.cwd(), __filename) });

task("accounts", "Prints the list of accounts", async (_taskArgs, hre) => {
  const accounts: Signer[] = await hre.ethers.getSigners();
  const addresses: string[] = [];
  for (const account of accounts) {
    addresses.push(await account.getAddress());
  }
  logger.info(addresses, "addresses:");
});
