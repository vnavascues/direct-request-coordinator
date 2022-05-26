import { BigNumberish, ethers } from "ethers";
import { HardhatRuntimeEnvironment, TaskArguments } from "hardhat/types";

import { formatNumericEnumValuesPretty } from "./enums";
import { throwNewError } from "./errors";
import { TxType0GasParams, TxType2GasParams } from "./types";

export enum TxType {
  TYPE_0 = 0, // Legacy
  TYPE_2 = 2, // EIP-1559
}

export function getType0GasParamsFromTaskArgs(taskArguments: TaskArguments, units = 9): TxType0GasParams {
  const gasprice: number =
    taskArguments.gasprice ?? throwNewError(`Task argument 'gasprice' is required for tx type 0`);
  let gasPrice: BigNumberish;
  try {
    gasPrice = ethers.utils.parseUnits(gasprice.toString(), units);
  } catch (error) {
    throw new Error(
      `Failed to convert tx type 0 'gasprice': ${gasprice}, with 'units': ${units} to wei. Reason: ${error}`,
    );
  }
  return {
    gasPrice,
  };
}

export function getType2GasParamsFromTaskArgs(taskArguments: TaskArguments, units = 9): TxType2GasParams {
  const gasmaxfee: number =
    taskArguments.gasmaxfee ?? throwNewError(`Task argument 'gasmaxfee' is required for tx type 2`);
  const gasmaxpriority: number =
    taskArguments.gasmaxpriority ?? throwNewError(`Task argument 'gasmaxpriority' is required for tx type 2`);
  let maxFeePerGas: BigNumberish;
  let maxPriorityFeePerGas: BigNumberish;
  try {
    maxFeePerGas = ethers.utils.parseUnits(gasmaxfee.toString(), units);
  } catch (error) {
    throw new Error(
      `Failed to convert tx type 2 'gasmaxfee': ${gasmaxfee}, with 'units': ${units} to wei. Reason: ${error}`,
    );
  }
  try {
    maxPriorityFeePerGas = ethers.utils.parseUnits(gasmaxpriority.toString(), units);
  } catch (error) {
    throw new Error(
      `Failed to convert tx type 2 'gasmaxpriority': ${gasmaxpriority}, with 'units': ${units} to wei. Reason: ${error}`,
    );
  }
  return {
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
}

export function getTxTypeGasParamsFromTaskArgs(taskArguments: TaskArguments) {
  taskArguments.type ??
    throwNewError(
      `Task argument 'type' is required. Supported values are: ${formatNumericEnumValuesPretty(
        TxType as unknown as Record<string, number>,
      )}.`,
    );
  let gasParams: TxType0GasParams | TxType2GasParams;
  switch (Number(taskArguments.type)) {
    case TxType.TYPE_0:
      gasParams = getType0GasParamsFromTaskArgs(taskArguments);
      break;
    case TxType.TYPE_2:
      gasParams = getType2GasParamsFromTaskArgs(taskArguments);
      break;
    default:
      throw new Error(`Unsupported transaction type: ${taskArguments.type}`);
  }
  return gasParams;
}

export async function checkNetworkTxTypeSupport(
  taskArguments: TaskArguments,
  hre: HardhatRuntimeEnvironment,
): Promise<void> {
  taskArguments.type ??
    throwNewError(
      `Task argument 'type' is required. Supported values are: ${formatNumericEnumValuesPretty(
        TxType as unknown as Record<string, number>,
      )}.`,
    );

  const gasEstimate = await hre.ethers.provider.getFeeData();
  const errorMsg = `Unsupported tx type: ${taskArguments.type} on network: ${hre.network.name} (ID: ${hre.network.config.chainId}).`;
  switch (Number(taskArguments.type)) {
    case TxType.TYPE_0:
      gasEstimate.gasPrice ?? throwNewError(errorMsg);
      break;
    case TxType.TYPE_2:
      gasEstimate.maxFeePerGas ?? throwNewError(errorMsg);
      gasEstimate.maxPriorityFeePerGas ?? throwNewError(errorMsg);
      break;
    default:
      throw new Error(`Unsupported transaction type: ${taskArguments.type}`);
  }
}

export async function getGasOverridesFromTaskArgs(taskArguments: TaskArguments, hre: HardhatRuntimeEnvironment) {
  await checkNetworkTxTypeSupport(taskArguments, hre);
  return getTxTypeGasParamsFromTaskArgs(taskArguments);
}
