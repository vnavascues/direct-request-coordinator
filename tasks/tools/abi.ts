import { task, types } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

import { convertFunctionNametoSignature } from "../../utils/abi";
import { logger } from "../../utils/logger";

task("tools:abi:functionsignature")
  .addParam("function", "The function name", undefined, types.string)
  .setAction(async function (taskArguments: TaskArguments) {
    const hexStr = convertFunctionNametoSignature(taskArguments.function as string);
    logger.info(`bytes4: ${hexStr}`);
  });
