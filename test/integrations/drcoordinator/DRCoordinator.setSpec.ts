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
import { convertJobIdToBytes32 } from "../../../utils/chainlink";
import { LINK_TOTAL_SUPPLY, MIN_CONSUMER_GAS_LIMIT } from "../../../utils/chainlink-constants";
import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testSetSpec(signers: Signers, context: Context): void {
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
    await expect(context.drCoordinator.connect(signers.externalCaller).setSpec(key, specConverted)).to.be.revertedWith(
      "Only callable by owner",
    );
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
      name: "minConfirmations is greater than MAX_REQUEST_CONFIRMATIONS",
      testData: {
        minConfirmations: MAX_REQUEST_CONFIRMATIONS + 1,
        customError: "DRCoordinator__SpecFieldMinConfirmationsIsGtMaxRequestConfirmations",
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
        minConfirmations: testData.minConfirmations ?? 2,
        operator: operatorAddr as string,
        paymentType: testData.paymentType || PaymentType.PERMIRYAD,
        payment: testData.payment ?? BigNumber.from("1000"),
        specId,
      };

      // Act & Assert
      await expect(
        context.drCoordinator.connect(signers.owner).setSpec(specConverted.key, specConverted),
      ).to.be.revertedWith(testData.customError);
    });
  }

  it("sets (creates) a Spec", async function () {
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
    await expect(context.drCoordinator.connect(signers.owner).setSpec(key, specConverted))
      .to.emit(context.drCoordinator, "SpecSet")
      .withArgs(key, [
        specConverted.specId,
        specConverted.operator,
        specConverted.payment,
        specConverted.paymentType,
        specConverted.fee,
        specConverted.feeType,
        specConverted.gasLimit,
        specConverted.minConfirmations,
      ]);
    expect(await context.drCoordinator.connect(signers.owner).getNumberOfSpecs()).to.equal(1);
  });

  it("sets (updates) a Spec", async function () {
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
    // 2. Define new values
    // NB: currently it allows to overwrite all fields, including operator and specId
    specConverted.feeType = FeeType.PERMIRYAD;
    specConverted.fee = BigNumber.from("10000");
    specConverted.gasLimit = specConverted.gasLimit + 1;
    specConverted.minConfirmations = specConverted.minConfirmations + 1;
    specConverted.operator = context.drCoordinatorConsumerTH.address;
    specConverted.payment = specConverted.payment.add("1");
    specConverted.paymentType = PaymentType.FLAT;
    specConverted.specId = convertJobIdToBytes32(uuidv4());

    // Act & Assert
    await expect(context.drCoordinator.connect(signers.owner).setSpec(key, specConverted))
      .to.emit(context.drCoordinator, "SpecSet")
      .withArgs(key, [
        specConverted.specId,
        specConverted.operator,
        specConverted.payment,
        specConverted.paymentType,
        specConverted.fee,
        specConverted.feeType,
        specConverted.gasLimit,
        specConverted.minConfirmations,
      ]);
    expect(await context.drCoordinator.connect(signers.owner).getNumberOfSpecs()).to.equal(1);
  });
}
