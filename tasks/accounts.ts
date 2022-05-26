import { Signer } from "@ethersproject/abstract-signer";
import { task } from "hardhat/config";

import { logger } from "../utils/logger";

task("accounts", "Prints the list of accounts", async (_taskArgs, hre) => {
  const accounts: Signer[] = await hre.ethers.getSigners();

  const addresses: string[] = [];
  for (const account of accounts) {
    addresses.push(await account.getAddress());
  }
  logger.info(addresses, "addresses:");
});
