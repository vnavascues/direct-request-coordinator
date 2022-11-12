import { expect } from "chai";
import { BigNumber } from "ethers";

import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testSetStalenessSeconds(signers: Signers, context: Context): void {
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts when the caller is not the owner", async function () {
    // Arrange
    const stalenessSeconds = BigNumber.from("777");

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.externalCaller).setStalenessSeconds(stalenessSeconds),
    ).to.be.revertedWith("Only callable by owner");
  });

  it("sets the stalenessSeconds", async function () {
    // Arrange
    const stalenessSeconds = BigNumber.from("777");

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).setStalenessSeconds(stalenessSeconds))
      .to.emit(context.drCoordinator, `StalenessSecondsSet`)
      .withArgs(stalenessSeconds);
    expect(await context.drCoordinator.getStalenessSeconds()).to.equal(stalenessSeconds);
  });
}
