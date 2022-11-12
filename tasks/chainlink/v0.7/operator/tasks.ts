import { task, types } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import path from "path";

import type { Operator } from "../../../../src/types";
import {
  getNetworkLinkAddressDeployingOnHardhat,
  getNumberOfConfirmations,
  getOverrides,
  validateProposedOwnerTaskArgument,
} from "../../../../utils/deployment";
import { logger as parentLogger } from "../../../../utils/logger";
import {
  address as typeAddress,
  addressesArray as typeAddressesArray,
} from "../../../../utils/task-arguments-validations";
import { setupOperatorAfterDeploy, verifyOperator } from "./methods";

const logger = parentLogger.child({ name: path.relative(process.cwd(), __filename) });

task("operator:v0.7:deploy", "Deploy, set-up and verify an Operator.sol")
  // Configuration after deployment
  .addFlag("setup", "Configs the Operator after deployment")
  .addOptionalParam("owner", "The address to transfer the ownership", undefined, typeAddress)
  .addOptionalParam("senders", "The authorized senders' addresses", undefined, typeAddressesArray)
  // Verification
  .addFlag("verify", "Verify the contract on Etherscan after deployment")
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
    validateProposedOwnerTaskArgument(signer.address, taskArguments.owner);
    const addressLink = await getNetworkLinkAddressDeployingOnHardhat(hre);
    const operatorFactory = await hre.ethers.getContractFactory("Operator");
    const operator = (await operatorFactory.deploy(addressLink, signer.address, overrides)) as Operator;
    logger.info(`Operator deployed to: ${operator.address} | Tx hash: ${operator.deployTransaction.hash}`);
    await operator.deployTransaction.wait(getNumberOfConfirmations(hre.network.config.chainId));

    // Setup
    if (taskArguments.setup) {
      await setupOperatorAfterDeploy(taskArguments, operator, overrides);
    }

    // Verify
    if (!taskArguments.verify) return;
    await verifyOperator(hre, operator.address, addressLink, signer.address);
  });

task("operator:v0.7:verify")
  .addParam("address", "The deployed contract address", undefined, typeAddress)
  .addOptionalParam("deployer", "The deployer address (the owner at creation time)", undefined, typeAddress)
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const addressLink = await getNetworkLinkAddressDeployingOnHardhat(hre);
    const addressOwner = taskArguments.deployer ?? (await hre.ethers.getSigners())[0];
    await verifyOperator(hre, taskArguments.address, addressLink, addressOwner);
  });
