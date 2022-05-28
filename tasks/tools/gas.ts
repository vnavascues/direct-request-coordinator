import { task } from "hardhat/config";
import { ethers } from "ethers";
import type { BigNumberish } from "ethers";
import type { TaskArguments } from "hardhat/types";

import { logger } from "../../utils/logger";

task("tools:gas:estimate", "Gas price per network via provider's getFeeData()").setAction(async function (
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
