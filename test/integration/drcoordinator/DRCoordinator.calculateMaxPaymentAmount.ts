import { expect } from "chai";
import { BigNumber } from "ethers";

import { FeeType } from "../../../tasks/drcoordinator/constants";
import { revertToSnapshot, takeSnapshot } from "../../helpers/snapshot";
import type { Context, Signers } from "./DRCoordinator";

export function testCalculateMaxPaymentAmount(signers: Signers, context: Context): void {
  let snapshotId: string;

  beforeEach(async function () {
    snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
  });

  it("reverts if 'feeType' is not supported", async function () {
    // Arrange
    const weiPerUnitGas = BigNumber.from("1");
    const paymentInEscrow = BigNumber.from("0");
    const gasLimit = BigNumber.from("1");
    const fee = BigNumber.from("0");
    const unsupportedFeeType = BigNumber.from("2");
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("1"));

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .calculateMaxPaymentAmount(weiPerUnitGas, paymentInEscrow, gasLimit, unsupportedFeeType, fee),
    ).to.be.reverted;
  });

  const testCases = [
    {
      name: "paymentNoFeeType.MAX, FeeType.FLAT and no payment in escrow (result is a positive LINK amount)",
      testData: {
        weiPerUnitGas: BigNumber.from("30000000000"),
        paymentInEscrow: BigNumber.from("0"), // 0 LINK
        gasLimit: BigNumber.from("2000000"),
        fee: BigNumber.from("1000000000000000000"), // 1 LINK
        feeType: FeeType.FLAT,
        expectedAmount: BigNumber.from("18191712914594219838"), // 18.19 LINK (to pay)
        expectedDelta: BigNumber.from("0"), // 0 LINK
      },
    },
    {
      name: "paymentNoFeeType.MAX, FeeType.FLAT and a payment in escrow (result is a positive LINK amount)",
      testData: {
        weiPerUnitGas: BigNumber.from("30000000000"),
        paymentInEscrow: BigNumber.from("2000000000000000000"), // 2 LINK
        gasLimit: BigNumber.from("2000000"),
        fee: BigNumber.from("1000000000000000000"), // 1 LINK
        feeType: FeeType.FLAT,
        expectedAmount: BigNumber.from("16191712914594219838"), // 16.19 LINK (to pay)
        expectedDelta: BigNumber.from("0"), // 0 LINK
      },
    },
    {
      name: "paymentNoFeeType.MAX, FeeType.FLAT and a payment in escrow (result is a negative LINK amount)",
      testData: {
        weiPerUnitGas: BigNumber.from("30000000000"),
        paymentInEscrow: BigNumber.from("20000000000000000000"), // 20 LINK
        gasLimit: BigNumber.from("2000000"),
        fee: BigNumber.from("1000000000000000000"), // 1 LINK
        feeType: FeeType.FLAT,
        expectedAmount: BigNumber.from("-1808287085405780162"), // -1.8 LINK (to refund)
        expectedDelta: BigNumber.from("0"), // 0 LINK
      },
    },
    {
      name: "paymentNoFeeType.MAX, FeeType.PERMYRIAD and no payment in escrow (result is a positive LINK amount)",
      testData: {
        weiPerUnitGas: BigNumber.from("30000000000"),
        paymentInEscrow: BigNumber.from("0"), // 0 LINK
        gasLimit: BigNumber.from("2000000"),
        fee: BigNumber.from("1225"), // 12.25%
        feeType: FeeType.PERMYRIAD,
        expectedAmount: BigNumber.from("19297697746632011768"), // 19.28 LINK (to pay)
        expectedDelta: BigNumber.from("0"), // 0 LINK
      },
    },
    {
      name: "paymentNoFeeType.MAX, FeeType.PERMYRIAD and a payment in escrow (result is a positive LINK amount)",
      testData: {
        weiPerUnitGas: BigNumber.from("30000000000"),
        paymentInEscrow: BigNumber.from("2000000000000000000"), // 2 LINK
        gasLimit: BigNumber.from("2000000"),
        fee: BigNumber.from("1225"), // 12.25%
        feeType: FeeType.PERMYRIAD,
        expectedAmount: BigNumber.from("17297697746632011768"), // 17.30 LINK (to pay)
        expectedDelta: BigNumber.from("0"), // 0 LINK
      },
    },
    {
      name: "paymentNoFeeType.MAX, FeeType.PERMYRIAD and a payment in escrow (result is a negative LINK amount)",
      testData: {
        weiPerUnitGas: BigNumber.from("30000000000"),
        paymentInEscrow: BigNumber.from("20000000000000000000"), // 20 LINK
        gasLimit: BigNumber.from("2000000"),
        fee: BigNumber.from("1225"), // 12.25%
        feeType: FeeType.PERMYRIAD,
        expectedAmount: BigNumber.from("-702302253367988232"), // -0.702 LINK (to refund)
        expectedDelta: BigNumber.from("0"), // 0 LINK
      },
    },
  ];
  for (const { name, testData } of testCases) {
    it(`calculates the payment amount for ${name}`, async function () {
      // Arrange
      await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("3490053626306509"));

      // Act
      const amount = await context.drCoordinator
        .connect(signers.externalCaller)
        .calculateMaxPaymentAmount(
          testData.weiPerUnitGas,
          testData.paymentInEscrow,
          testData.gasLimit,
          testData.feeType,
          testData.fee,
        );

      // Assert
      expect(amount).to.be.closeTo(testData.expectedAmount, testData.expectedDelta);
    });
  }
}
