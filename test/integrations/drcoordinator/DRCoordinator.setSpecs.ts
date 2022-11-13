import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

import {
  FeeType,
  MAX_PERMIRYAD_FEE,
  MAX_REQUEST_CONFIRMATIONS,
  PERMIRYAD,
  PaymentType,
} from "../../../tasks/drcoordinator/constants";
import { generateSpecKey, getSpecItemConvertedMap, parseSpecsFile } from "../../../tasks/drcoordinator/methods";
import type { SpecItemConverted } from "../../../tasks/drcoordinator/types";
import { LINK_TOTAL_SUPPLY, MIN_CONSUMER_GAS_LIMIT } from "../../../utils/chainlink-constants";
import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testSetSpecs(signers: Signers, context: Context): void {
  const filePath = path.resolve(__dirname, "specs");
  const symbolOperatorAsDRCoordinator = Symbol();
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts when the caller is not the owner", async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file1.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
    });
    const fileSpecMap = await getSpecItemConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.externalCaller).setSpecs([key], [specConverted]),
    ).to.be.revertedWith("Only callable by owner");
  });

  it("reverts when the keys array is empty", async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file1.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
    });
    const fileSpecMap = await getSpecItemConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).setSpecs([], [specConverted])).to.be.revertedWith(
      `DRCoordinator__ArrayIsEmpty("keys")`,
    );
  });

  it("reverts when the keys array does not have the same length than the entries array", async function () {
    // Arrange
    // 1. Insert the Spec
    const specs = parseSpecsFile(path.join(filePath, "file1.json"));
    specs.forEach(spec => {
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
    });
    const fileSpecMap = await getSpecItemConvertedMap(specs);
    const [key] = [...fileSpecMap.keys()];
    const specConverted = (fileSpecMap.get(key) as SpecItemConverted).specConverted;

    // Act & Assert
    await expect(
      context.drCoordinator.connect(signers.owner).setSpecs([key], [specConverted, specConverted]),
    ).to.be.revertedWith(`DRCoordinator__ArrayLengthsAreNotEqual("keys", 1, "specConsumers", 2)`);
  });

  const testCases = [
    {
      name: "specId is bytes32(0)",
      testData: {
        specId: "0x0000000000000000000000000000000000000000000000000000000000000000",
        customError: "DRCoordinator__SpecFieldSpecIdIsZero",
      },
    },
    {
      name: "operator is not a contract",
      testData: {
        operator: ethers.constants.AddressZero,
        customError: "DRCoordinator__SpecFieldOperatorIsNotContract",
      },
    },
    {
      name: "operator is DRCoordinator",
      testData: {
        operator: symbolOperatorAsDRCoordinator,
        customError: "DRCoordinator__SpecFieldOperatorIsDRCoordinator",
      },
    },
    {
      name: "payment is greater than LINK_TOTAL_SUPPLY (paymentType is PaymentType.FLAT)",
      testData: {
        paymentType: PaymentType.FLAT,
        payment: LINK_TOTAL_SUPPLY.add("1"),
        customError: "DRCoordinator__SpecFieldPaymentIsGtPermiryad",
      },
    },
    {
      name: "payment is greater than PERMIRYAD (paymentType is PaymentType.PERMIRYAD)",
      testData: {
        paymentType: PaymentType.PERMIRYAD,
        payment: PERMIRYAD + 1,
        customError: "DRCoordinator__SpecFieldPaymentIsGtPermiryad",
      },
    },
    {
      name: "gasLimit is less than MIN_CONSUMER_GAS_LIMIT",
      testData: {
        gasLimit: MIN_CONSUMER_GAS_LIMIT - 1,
        customError: "DRCoordinator__SpecFieldGasLimitIsLtMinRequestGasLimit",
      },
    },
    {
      name: "fee is greater than LINK_TOTAL_SUPPLY (feeType is FeeType.FLAT)",
      testData: {
        feeType: FeeType.FLAT,
        fee: LINK_TOTAL_SUPPLY.add("1"),
        customError: "DRCoordinator__SpecFieldFeeIsGtLinkTotalSupply",
      },
    },
    {
      name: "fee is greater than maxPermiryadFee (feeType is FeeType.PERMIRYAD)",
      testData: {
        feeType: FeeType.PERMIRYAD,
        fee: MAX_PERMIRYAD_FEE.mul("1").add("1"),
        customError: "DRCoordinator__SpecFieldFeeIsGtMaxPermiryadFee",
      },
    },
  ];
  for (const { name, testData } of testCases) {
    it(`reverts when ${name}`, async function () {
      // Arrange
      let operatorAddr = testData.operator ?? context.operator.address;
      if (operatorAddr === symbolOperatorAsDRCoordinator) {
        operatorAddr = context.drCoordinator.address;
      }
      const specId = testData.specId ?? "0x3666636566346637363332353438363539646665363462336438643732343365";
      const specConverted = {
        feeType: testData.feeType || FeeType.FLAT,
        fee: testData.fee ?? BigNumber.from("1000000000000000"),
        gasLimit: testData.gasLimit ?? MIN_CONSUMER_GAS_LIMIT + 1,
        key: generateSpecKey(operatorAddr as string, specId),
        operator: operatorAddr as string,
        paymentType: testData.paymentType || PaymentType.PERMIRYAD,
        payment: testData.payment ?? BigNumber.from("1000"),
        specId,
      };

      // Act & Assert
      await expect(
        context.drCoordinator.connect(signers.owner).setSpecs([specConverted.key], [specConverted]),
      ).to.be.revertedWith(testData.customError);
    });
  }

  it("sets (create) multiple Spec", async function () {
    // Arrange
    // 1. Insert the Specs
    const noSpecs = 2;
    const specs = parseSpecsFile(path.join(filePath, "file1.json"));
    // Overwrite 'requestData.externalJobId' with UUIDs
    const extendedSpecs = [...Array(noSpecs)].map(() => {
      const spec = JSON.parse(JSON.stringify(specs[0]));
      spec.configuration.operator = context.operator.address; // NB: overwrite with the right contract address
      spec.configuration.externalJobId = uuidv4();
      return spec;
    });
    const fileSpecMap = await getSpecItemConvertedMap(extendedSpecs);
    const [key0, key1] = [...fileSpecMap.keys()];
    const specConverted0 = (fileSpecMap.get(key0) as SpecItemConverted).specConverted;
    const specConverted1 = (fileSpecMap.get(key1) as SpecItemConverted).specConverted;

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).setSpecs([key0, key1], [specConverted0, specConverted1]))
      // NB: only the latest event assertion will be checked due to this Waffle bug:
      // https://github.com/TrueFiEng/Waffle/issues/749
      // TODO: remove this comment once Waffle bug is fixed
      .to.emit(context.drCoordinator, "SpecSet")
      .withArgs(key0, [
        specConverted0.specId,
        specConverted0.operator,
        specConverted0.payment,
        specConverted0.paymentType,
        specConverted0.fee,
        specConverted0.feeType,
        specConverted0.gasLimit,
      ])
      .to.emit(context.drCoordinator, "SpecSet")
      .withArgs(key1, [
        specConverted1.specId,
        specConverted1.operator,
        specConverted1.payment,
        specConverted1.paymentType,
        specConverted1.fee,
        specConverted1.feeType,
        specConverted1.gasLimit,
      ]);
    expect(await context.drCoordinator.connect(signers.owner).getNumberOfSpecs()).to.equal(2);
  });
}
