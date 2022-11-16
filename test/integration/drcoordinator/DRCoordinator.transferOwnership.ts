import { expect } from "chai";

import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testTransferOwnership(signers: Signers, context: Context): void {
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts when the caller is not the owner", async function () {
    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.externalCaller).transferOwnership(signers.externalCaller.address),
    ).to.be.revertedWith("Only callable by owner");
  });

  it("reverts when owner is proposing itself", async function () {
    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.owner).transferOwnership(signers.owner.address),
    ).to.be.revertedWith("Cannot transfer to self");
  });

  it("transfers the ownership", async function () {
    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).transferOwnership(signers.externalCaller.address))
      .to.emit(context.drCoordinator, "OwnershipTransferRequested")
      .withArgs(signers.owner.address, signers.externalCaller.address);
    expect(await context.drCoordinator.owner()).to.equal(signers.owner.address);
  });
}
