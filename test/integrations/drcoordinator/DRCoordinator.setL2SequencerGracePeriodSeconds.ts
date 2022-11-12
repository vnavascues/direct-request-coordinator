import { expect } from "chai";
import { BigNumber } from "ethers";

import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testSetL2SequencerGracePeriodSeconds(signers: Signers, context: Context): void {
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts when the caller is not the owner", async function () {
    // Arrange
    const l2SequencerGracePeriod = BigNumber.from("777");

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.externalCaller).setL2SequencerGracePeriodSeconds(l2SequencerGracePeriod),
    ).to.be.revertedWith("Only callable by owner");
  });

  it("sets the l2SequencerGracePeriod", async function () {
    // Arrange
    const l2SequencerGracePeriod = BigNumber.from("777");

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).setL2SequencerGracePeriodSeconds(l2SequencerGracePeriod))
      .to.emit(context.drCoordinator, `L2SequencerGracePeriodSecondsSet`)
      .withArgs(l2SequencerGracePeriod);
    expect(await context.drCoordinator.getL2SequencerGracePeriodSeconds()).to.equal(l2SequencerGracePeriod);
  });
}
