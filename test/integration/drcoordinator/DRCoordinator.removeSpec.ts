import { expect } from "chai";
import * as path from "path";

import { getSpecItemConvertedMap, parseSpecsFile } from "../../../tasks/drcoordinator/methods";
import type { SpecItemConverted } from "../../../tasks/drcoordinator/types";
import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testRemoveSpec(signers: Signers, context: Context): void {
  const filePath = path.resolve(__dirname, "specs");
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts when the caller is not the owner", async function () {
    // Arrange
    const key = "0x769fd51a582eda993bbc632329b0937ae591ac75b8255873ec83b743a906f4f9";

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.externalCaller).removeSpec(key)).to.be.revertedWith(
      "Only callable by owner",
    );
  });

  it("reverts when the Spec is not inserted", async function () {
    // Arrange
    const key = "0x769fd51a582eda993bbc632329b0937ae591ac75b8255873ec83b743a906f4f9";

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).removeSpec(key)).to.be.revertedWith(
      `DRCoordinator__SpecIsNotInserted("${key}")`,
    );
  });

  it(`removes a Spec without authorized consumers`, async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file1.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
    });
    const fileSpecMap = await getSpecItemConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;
    await context.drCoordinator.connect(signers.owner).setSpec(key, specConverted);

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).removeSpec(key))
      .to.emit(context.drCoordinator, "SpecRemoved")
      .withArgs(key);
    expect(await context.drCoordinator.connect(signers.owner).getNumberOfSpecs()).to.equal(0);
  });

  it(`removes a Spec with authorized consumers`, async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file3.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
    });
    const fileSpecMap = await getSpecItemConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;
    await context.drCoordinator.connect(signers.owner).setSpec(key, specConverted);
    // 2. Add autorhized consumers
    const authorizedConsumers = (fileSpecMap.get(key) as SpecItemConverted).specAuthorizedConsumers;
    await context.drCoordinator.connect(signers.owner).addSpecAuthorizedConsumers(key, authorizedConsumers);

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).removeSpec(key))
      // NB: only the latest event assertion will be checked due to this Waffle bug:
      // https://github.com/TrueFiEng/Waffle/issues/749
      // TODO: remove this comment once Waffle bug is fixed
      .to.emit(context.drCoordinator, "AuthorizedConsumersRemoved")
      .withArgs(key, authorizedConsumers)
      .to.emit(context.drCoordinator, "SpecRemoved")
      .withArgs(key);
    expect(await context.drCoordinator.connect(signers.owner).getNumberOfSpecs()).to.equal(0);
  });
}
