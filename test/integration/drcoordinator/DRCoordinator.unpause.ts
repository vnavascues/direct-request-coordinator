import { expect } from "chai";

import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testUnpause(signers: Signers, context: Context): void {
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts when the caller is not the owner", async function () {
    // Act & Assert
    await expect(context.drCoordinator.connect(signers.externalCaller).unpause()).to.be.revertedWith(
      "Only callable by owner",
    );
  });

  it("unpauses the contract", async function () {
    // Arrange
    await context.drCoordinator.connect(signers.owner).pause();

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).unpause())
      .to.emit(context.drCoordinator, `Unpaused`)
      .withArgs(signers.owner.address);
    expect(await context.drCoordinator.paused()).to.be.false;
  });
}
