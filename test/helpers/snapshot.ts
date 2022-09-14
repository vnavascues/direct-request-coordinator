import { waffle } from "hardhat";

const { provider } = waffle;

export async function takeSnapshot(): Promise<string> {
  return provider.send("evm_snapshot", []);
}

export async function revertToSnapshot(snapshotId?: string): Promise<void> {
  const id = snapshotId ? [snapshotId] : [];
  return provider.send("evm_revert", id);
}
