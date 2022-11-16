import { expect } from "chai";
import { BigNumber } from "ethers";

import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testSetFallbackWeiPerUnitLink(signers: Signers, context: Context): void {
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts when the caller is not the owner", async function () {
    // Arrange
    const fallbackWeiPerUnitLink = BigNumber.from("777");

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.externalCaller).setFallbackWeiPerUnitLink(fallbackWeiPerUnitLink),
    ).to.be.revertedWith("Only callable by owner");
  });

  it("reverts when the fallbackWeiPerUnitLink is zero", async function () {
    // Arrange
    const fallbackWeiPerUnitLink = BigNumber.from("0");

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.owner).setFallbackWeiPerUnitLink(fallbackWeiPerUnitLink),
    ).to.be.revertedWith("DRCoordinator__FallbackWeiPerUnitLinkIsZero");
  });

  it("sets the fallbackWeiPerUnitLink", async function () {
    // Arrange
    const fallbackWeiPerUnitLink = BigNumber.from("777");

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).setFallbackWeiPerUnitLink(fallbackWeiPerUnitLink))
      .to.emit(context.drCoordinator, `FallbackWeiPerUnitLinkSet`)
      .withArgs(fallbackWeiPerUnitLink);
    expect(await context.drCoordinator.getFallbackWeiPerUnitLink()).to.equal(fallbackWeiPerUnitLink);
  });
}
