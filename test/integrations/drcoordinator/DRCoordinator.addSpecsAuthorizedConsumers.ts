import { expect } from "chai";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

import { getSpecItemConvertedMap, parseSpecsFile } from "../../../tasks/drcoordinator/methods";
import type { SpecItemConverted } from "../../../tasks/drcoordinator/types";
import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testAddSpecsAuthorizedConsumers(signers: Signers, context: Context): void {
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
    const authorizedConsumers = ["0x0000000000000000000000000000000000000001"];

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.externalCaller).addSpecsAuthorizedConsumers([key], [authorizedConsumers]),
    ).to.be.revertedWith("Only callable by owner");
  });

  it("reverts when the keys array is empty", async function () {
    // Arrange
    const authorizedConsumers = ["0x0000000000000000000000000000000000000001"];

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.owner).addSpecsAuthorizedConsumers([], [authorizedConsumers]),
    ).to.be.revertedWith(`DRCoordinator__ArrayIsEmpty("keys")`);
  });

  it("reverts when the keys array does not have the same length than the authorized consumers array", async function () {
    // Arrange
    const key = "0x769fd51a582eda993bbc632329b0937ae591ac75b8255873ec83b743a906f4f9";
    const authorizedConsumers = ["0x0000000000000000000000000000000000000001"];

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.owner)
        .addSpecsAuthorizedConsumers([key], [authorizedConsumers, authorizedConsumers]),
    ).to.be.revertedWith(`DRCoordinator__ArrayLengthsAreNotEqual("keys", 1, "authConsumersArray", 2)`);
  });

  it("reverts when the Spec is not inserted", async function () {
    // Arrange
    const key = "0x769fd51a582eda993bbc632329b0937ae591ac75b8255873ec83b743a906f4f9";
    const authorizedConsumers = ["0x0000000000000000000000000000000000000001"];

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.owner).addSpecsAuthorizedConsumers([key], [authorizedConsumers]),
    ).to.be.revertedWith(`DRCoordinator__SpecIsNotInserted("${key}")`);
  });

  it("reverts when the consumers array is empty", async function () {
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
    const authorizedConsumers: string[] = [];

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.owner).addSpecsAuthorizedConsumers([key], [authorizedConsumers]),
    ).to.be.revertedWith(`DRCoordinator__ArrayIsEmpty("authConsumers")`);
  });

  it("adds multiple authorized consumers per Spec", async function () {
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
    const [authorizedConsumer0, authorizedConsumer1] = (fileSpecMap.get(key0) as SpecItemConverted)
      .specAuthorizedConsumers;
    const authorizedConsumersSpec0 = [authorizedConsumer0, authorizedConsumer1];
    const authorizedConsumersSpec2 = [authorizedConsumer0];

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.owner)
        .addSpecsAuthorizedConsumers([key0, key2], [authorizedConsumersSpec0, authorizedConsumersSpec2]),
    )
      // NB: only the latest event assertion will be checked due to this Waffle bug:
      // https://github.com/TrueFiEng/Waffle/issues/749
      // TODO: remove this comment once Waffle bug is fixed
      .to.emit(context.drCoordinator, "AuthorizedConsumersAdded")
      .withArgs(key0, authorizedConsumersSpec0)
      .to.emit(context.drCoordinator, "AuthorizedConsumersAdded")
      .withArgs(key2, authorizedConsumersSpec2);
    expect(await context.drCoordinator.connect(signers.owner).getSpecAuthorizedConsumers(key0)).to.have.ordered.members(
      authorizedConsumersSpec0,
    );
    expect(await context.drCoordinator.connect(signers.owner).getSpecAuthorizedConsumers(key1)).to.have.length(0);
    expect(await context.drCoordinator.connect(signers.owner).getSpecAuthorizedConsumers(key2)).to.have.ordered.members(
      authorizedConsumersSpec2,
    );
  });
}
