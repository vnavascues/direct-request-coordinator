import { expect } from "chai";
import { BigNumber } from "ethers";

import type { Signers, Context } from "./DRCoordinator";
import { takeSnapshot, revertToSnapshot } from "../../helpers/snapshot";
import { FeeType } from "../../../tasks/drcoordinator/constants";

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
    const payment = BigNumber.from("100000000000000000"); // 0.1 LINK
    const gasLimit = BigNumber.from("1");
    const fulfillmentFee = BigNumber.from("0");
    const unsupportedFeeType = BigNumber.from("2");
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("1"));

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .calculateMaxPaymentAmount(weiPerUnitGas, payment, gasLimit, fulfillmentFee, unsupportedFeeType),
    ).to.be.reverted;
  });

  it("reverts if 'paymentNoFee' is zero", async function () {
    // Arrange
    const weiPerUnitGas = BigNumber.from("0");
    const payment = BigNumber.from("0");
    const gasLimit = BigNumber.from("0");
    const fulfillmentFee = BigNumber.from("0");
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("1"));

    // Act & Assert
    // TODO: amend once hardhat fixes custom error assertions https://github.com/ethers-io/ethers.js/discussions/2849
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .calculateMaxPaymentAmount(weiPerUnitGas, payment, gasLimit, fulfillmentFee, FeeType.FLAT),
    ).to.be.revertedWith(`DRCoordinator__PaymentNoFeeIsZero()`);
  });

  it("reverts if 'amount' is greater than all LINK supply", async function () {
    // Arrange
    const weiPerUnitGas = BigNumber.from("1");
    const payment = BigNumber.from("0");
    const gasLimit = BigNumber.from("1");
    const fulfillmentFee = BigNumber.from("10").pow("27"); // NB: LINK totalSupply (1e27)
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("1"));

    // Act & Assert
    // TODO: amend once hardhat fixes custom error assertions https://github.com/ethers-io/ethers.js/discussions/2849
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .calculateMaxPaymentAmount(weiPerUnitGas, payment, gasLimit, fulfillmentFee, FeeType.FLAT),
    ).to.be.revertedWith(`DRCoordinator__LinkPaymentIsTooLarge()`);
  });

  const testCases = [
    {
      name: "paymentNoFeeType.MAX and FeeType.FLAT",
      testData: {
        weiPerUnitGas: BigNumber.from("30000000000"),
        payment: BigNumber.from("100000000000000000"), // 0.1 LINK
        gasLimit: BigNumber.from("2000000"),
        fulfillmentFee: BigNumber.from("1000000000000000000"), // 1 LINK
        feeType: FeeType.FLAT,
        expectedDelta: BigNumber.from("1000000000000000"), // 0.001 LINK
        expectedAmount: BigNumber.from("18091712914594219838"), // 18 LINK
      },
    },
    {
      name: "paymentNoFeeType.MAX and FeeType.PERMIRYAD",
      testData: {
        weiPerUnitGas: BigNumber.from("30000000000"),
        payment: BigNumber.from("100000000000000000"), // 0.1 LINK
        gasLimit: BigNumber.from("2000000"),
        fulfillmentFee: BigNumber.from("1225"), // 12.25%
        feeType: FeeType.PERMIRYAD,
        expectedDelta: BigNumber.from("1000000000000000"), // 0.001 LINK
        expectedAmount: BigNumber.from("19185447746632011768"), // 19.18 LINK
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
          testData.payment,
          testData.gasLimit,
          testData.fulfillmentFee,
          testData.feeType,
        );

      // Assert
      expect(amount).to.be.closeTo(testData.expectedAmount, testData.expectedDelta);
    });
  }
}
