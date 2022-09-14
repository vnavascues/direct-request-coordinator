import { expect } from "chai";

import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testPause(signers: Signers, context: Context): void {
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts when the caller is not the owner", async function () {
    // Act & Assert
    await expect(context.drCoordinator.connect(signers.externalCaller).pause()).to.be.revertedWith(
      "Only callable by owner",
    );
  });

  it("pauses the contract", async function () {
    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).pause())
      .to.emit(context.drCoordinator, `Paused`)
      .withArgs(signers.owner.address);
    expect(await context.drCoordinator.paused()).to.be.true;
  });
}
