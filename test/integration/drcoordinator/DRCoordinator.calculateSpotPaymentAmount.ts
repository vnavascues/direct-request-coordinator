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
        expectedAmount: BigNumber.from("1318562440307430893"), // 1.31 LINK (to pay)
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
        expectedAmount: BigNumber.from("1219181341972356285"), // 1.22 LINK (to pay)
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
        expectedAmount: BigNumber.from("-680818658027643715"), // -0.68 LINK (to refund)
        expectedDelta: BigNumber.from("0"), // 0 LINK
      },
    },
    {
      name: "paymentNoFeeType.SPOT, FeeType.PERMYRIAD, and no payment in escrow (result is a positive LINK amount)",
      testData: {
        startGas: BigNumber.from("500000"),
        weiPerUnitGas: BigNumber.from("30000000000"),
        paymentInEscrow: BigNumber.from("0"), // 0 LINK
        fee: BigNumber.from("1225"), // 12.25%
        feeType: FeeType.PERMYRIAD,
        expectedAmount: BigNumber.from("357238980685651801"), // 0.36 LINK (to pay)
        expectedDelta: BigNumber.from("0"), // 0 LINK
      },
    },
    {
      name: "paymentNoFeeType.SPOT, FeeType.PERMYRIAD, and a payment in escrow (result is a positive LINK amount)",
      testData: {
        startGas: BigNumber.from("500000"),
        weiPerUnitGas: BigNumber.from("30000000000"),
        paymentInEscrow: BigNumber.from("100000000000000000"), // 0.1 LINK
        fee: BigNumber.from("1225"), // 12.25%
        feeType: FeeType.PERMYRIAD,
        expectedAmount: BigNumber.from("257933697804530553"), // 0.26 LINK (to pay)
        expectedDelta: BigNumber.from("0"), // 0 LINK
      },
    },
    {
      name: "paymentNoFeeType.SPOT, FeeType.PERMYRIAD, and a payment in escrow (result is a negative LINK amount)",
      testData: {
        startGas: BigNumber.from("500000"),
        weiPerUnitGas: BigNumber.from("30000000000"),
        paymentInEscrow: BigNumber.from("2000000000000000000"), // 2 LINK
        fee: BigNumber.from("1225"), // 12.25%
        feeType: FeeType.PERMYRIAD,
        expectedAmount: BigNumber.from("-1642066302195469447"), // -1.64 LINK (to refund)
        expectedDelta: BigNumber.from("0"), // 0 LINK
      },
    },
  ];
  for (const { name, testData } of testCases) {
    it(`calculates the payment amount for ${name}`, async function () {
      // Arrange
      await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("3490053626306509"));
      const gasAfterPaymentCalculation = await context.drCoordinator.getGasAfterPaymentCalculation();

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
