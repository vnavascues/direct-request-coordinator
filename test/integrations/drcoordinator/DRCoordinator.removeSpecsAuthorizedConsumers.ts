import { expect } from "chai";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

import { getSpecItemConvertedMap, parseSpecsFile } from "../../../tasks/drcoordinator/methods";
import type { SpecItemConverted } from "../../../tasks/drcoordinator/types";
import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testRemoveSpecsAuthorizedConsumers(signers: Signers, context: Context): void {
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
      context.drCoordinator
        .connect(signers.externalCaller)
        .removeSpecsAuthorizedConsumers([key], [authorizedConsumers]),
    ).to.be.revertedWith("Only callable by owner");
  });

  it("reverts when the keys array is empty", async function () {
    // Arrange
    const authorizedConsumers = ["0x0000000000000000000000000000000000000001"];

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.owner).removeSpecsAuthorizedConsumers([], [authorizedConsumers]),
    ).to.be.revertedWith(`DRCoordinator__ArrayIsEmpty("keys")`);
  });

  it("reverts when the keys array does not have the same length than the Spec's consumers array", async function () {
    // Arrange
    const key = "0x769fd51a582eda993bbc632329b0937ae591ac75b8255873ec83b743a906f4f9";
    const authorizedConsumers = ["0x0000000000000000000000000000000000000001"];

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.owner)
        .removeSpecsAuthorizedConsumers([key], [authorizedConsumers, authorizedConsumers]),
    ).to.be.revertedWith(`DRCoordinator__ArrayLengthsAreNotEqual("keys", 1, "authConsumersArray", 2)`);
  });

  it("reverts when the Spec is not inserted", async function () {
    // Arrange
    const key = "0x769fd51a582eda993bbc632329b0937ae591ac75b8255873ec83b743a906f4f9";
    const authorizedConsumers = ["0x0000000000000000000000000000000000000001"];

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.owner).removeSpecsAuthorizedConsumers([key], [authorizedConsumers]),
    ).to.be.revertedWith(`DRCoordinator__SpecIsNotInserted("${key}")`);
  });

  it("reverts when the Spec consumers array is empty", async function () {
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
    // 2. Add authorized consumers
    const authorizedConsumers = (fileSpecMap.get(key) as SpecItemConverted).specAuthorizedConsumers;
    await context.drCoordinator.connect(signers.owner).addSpecAuthorizedConsumers(key, authorizedConsumers);

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.owner).removeSpecsAuthorizedConsumers([key], [[]]),
    ).to.be.revertedWith(`DRCoordinator__ArrayIsEmpty("authConsumers")`);
  });

  it("reverts when a Spec consumer is not inserted", async function () {
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
    // 2. Add authorized consumers
    const authorizedConsumers = (fileSpecMap.get(key) as SpecItemConverted).specAuthorizedConsumers;
    await context.drCoordinator.connect(signers.owner).addSpecAuthorizedConsumers(key, authorizedConsumers);

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.owner).removeSpecsAuthorizedConsumers([key], [[signers.owner.address]]),
    ).to.be.revertedWith(`InsertedAddressLibrary__AddressIsNotInserted`);
  });

  it(`removes multiple authorized consumers per Spec`, async function () {
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
    // 2. Add authorized consumers for spec0 and spec2
    const [authorizedConsumer0, authorizedConsumer1] = (fileSpecMap.get(key0) as SpecItemConverted)
      .specAuthorizedConsumers;
    const authorizedConsumersSpec0 = [authorizedConsumer0, authorizedConsumer1];
    const authorizedConsumersSpec2 = [authorizedConsumer0];
    await context.drCoordinator
      .connect(signers.owner)
      .addSpecsAuthorizedConsumers([key0, key2], [authorizedConsumersSpec0, authorizedConsumersSpec2]);

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.owner)
        .removeSpecsAuthorizedConsumers([key0, key2], [[authorizedConsumer1], [authorizedConsumer0]]),
    )
      .to.be.emit(context.drCoordinator, "AuthorizedConsumersRemoved")
      .withArgs(key0, [authorizedConsumer1])
      .to.be.emit(context.drCoordinator, "AuthorizedConsumersRemoved")
      .withArgs(key2, [authorizedConsumer0]);
    expect(await context.drCoordinator.connect(signers.owner).getSpecAuthorizedConsumers(key0)).to.have.ordered.members(
      [authorizedConsumer0],
    );
    expect(await context.drCoordinator.connect(signers.owner).getSpecAuthorizedConsumers(key2)).to.have.length(0);
  });
}
