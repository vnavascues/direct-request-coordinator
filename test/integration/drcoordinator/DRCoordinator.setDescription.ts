import { expect } from "chai";

import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testSetDescription(signers: Signers, context: Context): void {
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts when the caller is not the owner", async function () {
    // Arrange
    const description = "PepeCoordinator";

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.externalCaller).setDescription(description)).to.be.revertedWith(
      "Only callable by owner",
    );
  });

  it("sets the description", async function () {
    // Arrange
    const description = "PepeCoordinator";

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).setDescription(description))
      .to.emit(context.drCoordinator, `DescriptionSet`)
      .withArgs(description);
    expect(await context.drCoordinator.getDescription()).to.equal(description);
  });
}
