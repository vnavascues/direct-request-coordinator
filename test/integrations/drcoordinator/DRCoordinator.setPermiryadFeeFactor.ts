import { expect } from "chai";
import { BigNumber } from "ethers";

import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testSetPermiryadFeeFactor(signers: Signers, context: Context): void {
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts when the caller is not the owner", async function () {
    // Arrange
    const permiryadFactor = BigNumber.from("2");

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.externalCaller).setPermiryadFeeFactor(permiryadFactor),
    ).to.be.revertedWith("Only callable by owner");
  });

  it("sets the permiryadFeeFactor", async function () {
    // Arrange
    const permiryadFactor = BigNumber.from("2");

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).setPermiryadFeeFactor(permiryadFactor))
      .to.emit(context.drCoordinator, `PermiryadFeeFactorSet`)
      .withArgs(permiryadFactor);
    expect(await context.drCoordinator.getPermiryadFeeFactor()).to.equal(permiryadFactor);
  });
}
