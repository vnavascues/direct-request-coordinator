import { expect } from "chai";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

import { getSpecItemConvertedMap, parseSpecsFile } from "../../../tasks/drcoordinator/methods";
import type { SpecItemConverted } from "../../../tasks/drcoordinator/types";
import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testRemoveSpecs(signers: Signers, context: Context): void {
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
    await expect(context.drCoordinator.connect(signers.externalCaller).removeSpecs([key])).to.be.revertedWith(
      "Only callable by owner",
    );
  });

  it("reverts when the keys array is empty", async function () {
    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).removeSpecs([])).to.be.revertedWith(
      `DRCoordinator__ArrayIsEmpty("keys")`,
    );
  });

  it("reverts when the Spec is not inserted", async function () {
    // Arrange
    const key = "0x769fd51a582eda993bbc632329b0937ae591ac75b8255873ec83b743a906f4f9";

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).removeSpecs([key])).to.be.revertedWith(
      `DRCoordinator__SpecIsNotInserted("${key}")`,
    );
  });

  it(`removes multiple Spec with & without authorized consumers`, async function () {
    // Arrange
    // 1. Insert the Specs
    const noSpecs = 3;
    const specs = parseSpecsFile(path.join(filePath, "file3.json"));
    // Overwrite 'requestData.externalJobId' with UUIDs
    const extendedSpecs = [...Array(noSpecs)].map(() => {
      const spec = JSON.parse(JSON.stringify(specs[0]));
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
      spec.configuration.externalJobId = uuidv4();
      return spec;
    });
    const fileSpecMap = await getSpecItemConvertedMap(extendedSpecs);
    const [key0, key1, key2] = [...fileSpecMap.keys()];
    const specConverted0 = (fileSpecMap.get(key0) as SpecItemConverted).specConverted;
    const specConverted1 = (fileSpecMap.get(key1) as SpecItemConverted).specConverted;
    const specConverted2 = (fileSpecMap.get(key2) as SpecItemConverted).specConverted;
    await context.drCoordinator
      .connect(signers.owner)
      .setSpecs([key0, key1, key2], [specConverted0, specConverted1, specConverted2]);
    // 2. Add autorhized consumers to specConverted0
    const authorizedConsumers = (fileSpecMap.get(key0) as SpecItemConverted).specAuthorizedConsumers;
    await context.drCoordinator.connect(signers.owner).addSpecAuthorizedConsumers(key0, authorizedConsumers);

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).removeSpecs([key0, key2]))
      // NB: only the latest event assertion will be checked due to this Waffle bug:
      // https://github.com/TrueFiEng/Waffle/issues/749
      // TODO: remove this comment once Waffle bug is fixed
      .to.emit(context.drCoordinator, "AuthorizedConsumersRemoved")
      .withArgs(key0, authorizedConsumers)
      .to.emit(context.drCoordinator, "SpecRemoved")
      .withArgs(key0)
      .to.emit(context.drCoordinator, "SpecRemoved")
      .withArgs(key2);
    expect(await context.drCoordinator.connect(signers.owner).getNumberOfSpecs()).to.equal(1);
    expect(await context.drCoordinator.connect(signers.owner).getSpecMapKeys()).to.have.ordered.members([key1]);
  });
}
