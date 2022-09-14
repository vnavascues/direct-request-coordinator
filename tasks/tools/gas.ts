import { ethers } from "ethers";
import type { BigNumberish } from "ethers";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import path from "path";

import { logger as parentLogger } from "../../utils/logger";

const logger = parentLogger.child({ name: path.relative(process.cwd(), __filename) });

task("tools:gas:estimate", "ETH gas per network via provider getFeeData()").setAction(async function (
  taskArguments: TaskArguments,
  hre,
) {
  const formatEthGas = (gasValue: BigNumberish): string => {
    return ethers.utils.formatUnits(gasValue.toString(), "gwei").toString();
  };
  const gasEstimate = await hre.ethers.provider.getFeeData();
  const maxFeePerGas = gasEstimate.maxFeePerGas ? formatEthGas(gasEstimate.maxFeePerGas) : "NA";
  const maxPriorityFeePerGas = gasEstimate.maxPriorityFeePerGas ? formatEthGas(gasEstimate.maxPriorityFeePerGas) : "NA";
  const gasPrice = gasEstimate.gasPrice ? formatEthGas(gasEstimate.gasPrice) : "NA";
  logger.info(
    { network: hre.network.name, chainId: hre.network.config.chainId, maxFeePerGas, maxPriorityFeePerGas, gasPrice },
    `Gas Estimation (gwei)`,
  );
});
