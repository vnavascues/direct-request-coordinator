import { JsonRpcProvider } from "@ethersproject/providers";
import type { HttpNetworkUserConfig } from "hardhat/types";
import path from "path";

import { logger as parentLogger } from "./logger";
import { networkUserConfigs } from "./networks";

const logger = parentLogger.child({ name: path.relative(process.cwd(), __filename) });

export function getJsonRpcProviderByNetworkName(network: string): JsonRpcProvider {
  const { url, chainId } = networkUserConfigs.get(network) as HttpNetworkUserConfig;
  let provider;
  try {
    provider = new JsonRpcProvider(url as string, {
      name: network,
      chainId: chainId as number,
    });
  } catch (error) {
    logger
      .child({
        name: network,
        chainId,
      })
      .error(error, `unexpected error instantiating JsonRpcProvider`);
    throw error;
  }
  return provider;
}
