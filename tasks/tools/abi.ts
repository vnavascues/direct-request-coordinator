import { task, types } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import path from "path";

import { convertFunctionNametoSignature } from "../../utils/abi";
import { logger as parentLogger } from "../../utils/logger";

const logger = parentLogger.child({ name: path.relative(process.cwd(), __filename) });

task("tools:abi:functionsignature")
  .addParam("function", "The function name", undefined, types.string)
  .setAction(async function (taskArguments: TaskArguments) {
    const hexStr = convertFunctionNametoSignature(taskArguments.function as string);
    logger.info(`bytes4: ${hexStr}`);
  });
