import { Contract } from "ethers";

import { ChainId } from "./constants";

export function getNumberOfConfirmations(chainId?: ChainId, number = 10): number {
  return chainId === ChainId.HARDHAT ? 0 : number;
}

/**
 * From OpenZeppelin Address library:
 *
 * It is unsafe to assume that an address for which this function returns
 * false is an externally-owned account (EOA) and not a contract.
 *
 * Among others, `isContract` will return false for the following
 * types of addresses:
 *
 *  - an externally-owned account
 *  - a contract in construction
 *  - an address where a contract will be created
 *  - an address where a contract lived, but was destroyed
 *
 */
export async function isAddressAContract(contract: Contract): Promise<boolean> {
  const contractCode = await contract.provider.getCode(contract.address);
  return contractCode !== "0x";
}

// NB: only applies to Chainlink contracts that use transferOwnerwhip
export function validateProposedOwnerTaskArgument(owner: string, proposedOwner: string): void {
  if (proposedOwner && owner.toLocaleLowerCase() === proposedOwner.toLocaleLowerCase()) {
    throw new Error(
      `Remove task argument 'owner': ${owner}. It is the same address than the signer (the owner by default)`,
    );
  }
}
