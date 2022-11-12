import { expect } from "chai";
import { BigNumber } from "ethers";

import { FeeType } from "../../../tasks/drcoordinator/constants";
import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testCalculateSpotPaymentAmount(signers: Signers, context: Context): void {
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts if feeType is not supported", async function () {
    // Arrange
    const startGas = BigNumber.from("500000");
    const weiPerUnitGas = BigNumber.from("1");
    const paymentInEscrow = BigNumber.from("100000000000000000"); // 0.1 LINK
    const fee = BigNumber.from("0");
    const unsupportedFeeType = BigNumber.from("2");
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("1"));

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .calculateSpotPaymentAmount(startGas, weiPerUnitGas, paymentInEscrow, unsupportedFeeType, fee),
    ).to.be.reverted;
  });

  const testCases = [
    {
      name: "paymentNoFeeType.SPOT, FeeType.FLAT, and no payment in escrow (result is a positive LINK amount)",
      testData: {
        startGas: BigNumber.from("500000"),
        weiPerUnitGas: BigNumber.from("30000000000"),
        paymentInEscrow: BigNumber.from("0"), // 0 LINK
        fee: BigNumber.from("1000000000000000000"), // 1 LINK
        feeType: FeeType.FLAT,
        expectedAmount: BigNumber.from("1317608300240670914"), // 1.31 LINK (to pay)
        expectedDelta: BigNumber.from("0"), // 0 LINK
      },
    },
    {
      name: "paymentNoFeeType.SPOT, FeeType.FLAT, and a payment in escrow (result is a positive LINK amount)",
      testData: {
        startGas: BigNumber.from("500000"),
        weiPerUnitGas: BigNumber.from("30000000000"),
        paymentInEscrow: BigNumber.from("100000000000000000"), // 0.1 LINK
        fee: BigNumber.from("1000000000000000000"), // 1 LINK
        feeType: FeeType.FLAT,
        expectedAmount: BigNumber.from("1218227201905596306"), // 1.22 LINK (to pay)
        expectedDelta: BigNumber.from("0"), // 0 LINK
      },
    },
    {
      name: "paymentNoFeeType.SPOT, FeeType.FLAT, and a payment in escrow (result is a negative LINK amount)",
      testData: {
        startGas: BigNumber.from("500000"),
        weiPerUnitGas: BigNumber.from("30000000000"),
        paymentInEscrow: BigNumber.from("2000000000000000000"), // 2 LINK
        fee: BigNumber.from("1000000000000000000"), // 1 LINK
        feeType: FeeType.FLAT,
        expectedAmount: BigNumber.from("-681772798094403694"), // -0.68 LINK (to refund)
        expectedDelta: BigNumber.from("0"), // 0 LINK
      },
    },
    {
      name: "paymentNoFeeType.SPOT, FeeType.PERMIRYAD, and no payment in escrow (result is a positive LINK amount)",
      testData: {
        startGas: BigNumber.from("500000"),
        weiPerUnitGas: BigNumber.from("30000000000"),
        paymentInEscrow: BigNumber.from("0"), // 0 LINK
        fee: BigNumber.from("1225"), // 12.25%
        feeType: FeeType.PERMIRYAD,
        expectedAmount: BigNumber.from("356167958460713724"), // 0.36 LINK (to pay)
        expectedDelta: BigNumber.from("0"), // 0 LINK
      },
    },
    {
      name: "paymentNoFeeType.SPOT, FeeType.PERMIRYAD, and a payment in escrow (result is a positive LINK amount)",
      testData: {
        startGas: BigNumber.from("500000"),
        weiPerUnitGas: BigNumber.from("30000000000"),
        paymentInEscrow: BigNumber.from("100000000000000000"), // 0.1 LINK
        fee: BigNumber.from("1225"), // 12.25%
        feeType: FeeType.PERMIRYAD,
        expectedAmount: BigNumber.from("256862675579592477"), // 0.26 LINK (to pay)
        expectedDelta: BigNumber.from("0"), // 0 LINK
      },
    },
    {
      name: "paymentNoFeeType.SPOT, FeeType.PERMIRYAD, and a payment in escrow (result is a negative LINK amount)",
      testData: {
        startGas: BigNumber.from("500000"),
        weiPerUnitGas: BigNumber.from("30000000000"),
        paymentInEscrow: BigNumber.from("2000000000000000000"), // 2 LINK
        fee: BigNumber.from("1225"), // 12.25%
        feeType: FeeType.PERMIRYAD,
        expectedAmount: BigNumber.from("-1643137324420407523"), // -1.64 LINK (to refund)
        expectedDelta: BigNumber.from("0"), // 0 LINK
      },
    },
  ];
  for (const { name, testData } of testCases) {
    it(`calculates the payment amount for ${name}`, async function () {
      // Arrange
      await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("3490053626306509"));
      const gasAfterPaymentCalculation = await context.drCoordinator.GAS_AFTER_PAYMENT_CALCULATION();

      // Act
      const amount = await context.drCoordinator
        .connect(signers.externalCaller)
        .calculateSpotPaymentAmount(
          testData.startGas,
          testData.weiPerUnitGas,
          testData.paymentInEscrow,
          testData.feeType,
          testData.fee,
          {
            gasLimit: testData.startGas.add(gasAfterPaymentCalculation),
          },
        );

      // Assert
      expect(amount).to.be.closeTo(testData.expectedAmount, testData.expectedDelta);
    });
  }
}
