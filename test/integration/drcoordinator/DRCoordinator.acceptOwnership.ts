import { expect } from "chai";

import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testAcceptOwnership(signers: Signers, context: Context): void {
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts when the caller is not the proposed owner", async function () {
    // Arrange
    await context.drCoordinator.connect(signers.owner).transferOwnership(signers.externalCaller.address);

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).acceptOwnership()).to.be.revertedWith(
      "Must be proposed owner",
    );
  });

  it("accepts the ownership", async function () {
    // Arrange
    await context.drCoordinator.connect(signers.owner).transferOwnership(signers.externalCaller.address);

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.externalCaller).acceptOwnership())
      .to.emit(context.drCoordinator, "OwnershipTransferred")
      .withArgs(signers.owner.address, signers.externalCaller.address);
    expect(await context.drCoordinator.owner()).to.equal(signers.externalCaller.address);
  });
}
