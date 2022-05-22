import { task } from "hardhat/config";
import { TaskArguments } from "hardhat/types";
import { address } from "../utils/task-arguments-validations";
import { verifyByAddress } from "../utils/verification";

task("verify:by-address", "Verify a contract by address")
  .addParam("address", "The deployed contract address", undefined, address)
  .addOptionalParam("contract", "The contract path withing the project")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    await verifyByAddress(hre, taskArguments.address, taskArguments.contract);
  });
