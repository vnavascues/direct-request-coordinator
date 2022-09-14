import { ethers } from "ethers";
import path from "path";

import { logger as parentLogger } from "./logger";
import { getJsonRpcProviderByNetworkName } from "./providers";

const logger = parentLogger.child({ name: path.relative(process.cwd(), __filename) });

export function getHDWalletSigner(mnemonic: string, addressIndex: number, path = "m/44'/60'/0'/0"): ethers.Wallet {
  if (addressIndex < 0) {
    throw new Error(`Invalid 'addressIndex': ${addressIndex}. Expected number greater or equal than zero`);
  }
  let signer: ethers.Wallet;
  try {
    signer = ethers.Wallet.fromMnemonic(mnemonic, `${path}/${addressIndex}`);
  } catch (error) {
    logger
      .child({
        mnemonic,
        path,
        addressIndex,
      })
      .error(error, `unexpected error instantiating Wallet from mnemonic (HDWallet)`);
    throw error;
  }
  return signer;
}

export function getHDWalletSignersConsecutive(
  mnemonic: string,
  count = 10,
  startAtIndex = 0,
  path = "m/44'/60'/0'/0",
): ethers.Wallet[] {
  const signers: ethers.Wallet[] = [];
  for (let i = 0; i < count; i++) {
    signers.push(getHDWalletSigner(mnemonic, startAtIndex + i, path));
  }
  return signers;
}

export function getWalletSigner(privateKey: string): ethers.Wallet {
  let signer: ethers.Wallet;
  try {
    signer = new ethers.Wallet(privateKey);
  } catch (error) {
    logger.child({ privateKey }).error(error, `unexpected error instantiating Wallet`);
    throw error;
  }
  return signer;
}

export function getWalletSignerConnected(network: string, privateKey: string): ethers.Wallet {
  const provider = getJsonRpcProviderByNetworkName(network);
  let signer = getWalletSigner(privateKey);
  try {
    signer = signer.connect(provider);
  } catch (error) {
    logger
      .child({
        provider,
        signer,
      })
      .error(error, `unexpected error connecting signer with provider`);
    throw error;
  }
  return signer;
}
