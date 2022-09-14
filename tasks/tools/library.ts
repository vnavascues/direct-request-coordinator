import { task, types } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import path from "path";

import { getNumberOfConfirmations, getOverrides } from "../../utils/deployment";
import { logger as parentLogger } from "../../utils/logger";
import { address as typeAddress } from "../../utils/task-arguments-validations";
import { setChainVerifyApiKeyEnv, verifyByAddress } from "../../utils/verification";

const logger = parentLogger.child({ name: path.relative(process.cwd(), __filename) });

task("tools:library:deploy")
  .addParam("name", "The consumer contract name", undefined, types.string)
  // Verification
  .addFlag("verify", "Verify the contract on Etherscan after deployment")
  .addOptionalParam("contract", "The contract path withing the project")
  // Tx customisation (ethers.js Overrides)
  .addFlag("overrides", "Customise the tx overrides")
  .addOptionalParam("gaslimit", "The tx gasLimit", undefined, types.int)
  .addOptionalParam("txtype", "The tx gas type (0 or 2)", undefined, types.int)
  .addOptionalParam("gasprice", "Type 0 tx gasPrice", undefined, types.float)
  .addOptionalParam("gasmaxfee", "Type 2 tx maxFeePerGas", undefined, types.float)
  .addOptionalParam("gasmaxpriority", "Type 2 tx maxPriorityFeePerGas", undefined, types.float)
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const [signer] = await hre.ethers.getSigners();
    logger.info(`signer address: ${signer.address}`);

    // Get the contract method overrides
    const overrides = await getOverrides(taskArguments, hre);

    // Deploy
    const libraryFactory = await hre.ethers.getContractFactory(taskArguments.name);
    const library = await libraryFactory.deploy(overrides);
    logger.info(`${taskArguments.name} deployed to: ${library.address} | Tx hash: ${library.deployTransaction.hash}`);
    await library.deployTransaction.wait(getNumberOfConfirmations(hre.network.config.chainId));
    if (!taskArguments.verify) return;

    // Verify
    // NB: contract verification request may fail if the contract address does not have bytecode. Wait until it's mined
    setChainVerifyApiKeyEnv(hre.network.config.chainId as number, hre.config);
    await hre.run("verify:verify", {
      address: library.address,
      contract: taskArguments.contract,
    });
  });

task("tools:library:verify")
  .addParam("address", "The deployed contract address", undefined, typeAddress)
  .addOptionalParam("contract", "The contract path withing the project")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    await verifyByAddress(hre, taskArguments.address, taskArguments.contract);
  });
