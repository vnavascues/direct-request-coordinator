import { expect } from "chai";
import { BigNumber } from "ethers";

import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testSetPermyriadFeeFactor(signers: Signers, context: Context): void {
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts when the caller is not the owner", async function () {
    // Arrange
    const permyriadFactor = BigNumber.from("2");

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.externalCaller).setPermyriadFeeFactor(permyriadFactor),
    ).to.be.revertedWith("Only callable by owner");
  });

  it("sets the permyriadFeeFactor", async function () {
    // Arrange
    const permyriadFactor = BigNumber.from("2");

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).setPermyriadFeeFactor(permyriadFactor))
      .to.emit(context.drCoordinator, `PermyriadFeeFactorSet`)
      .withArgs(permyriadFactor);
    expect(await context.drCoordinator.getPermyriadFeeFactor()).to.equal(permyriadFactor);
  });
}
