import { expect } from "chai";
import { BigNumber } from "ethers";

import type { Signers, Context } from "./DRCoordinator";
import { takeSnapshot, revertToSnapshot } from "../../helpers/snapshot";
import { FeeType } from "../../../tasks/drcoordinator/constants";

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
    const payment = BigNumber.from("100000000000000000"); // 0.1 LINK
    const fulfillmentFee = BigNumber.from("0");
    const unsupportedFeeType = BigNumber.from("2");
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("1"));

    // Act & Assert
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .calculateSpotPaymentAmount(startGas, weiPerUnitGas, payment, fulfillmentFee, unsupportedFeeType),
    ).to.be.reverted;
  });

  it("reverts if 'paymentPreFee' is less or equal than 'payment'", async function () {
    // Arrange
    const startGas = BigNumber.from("500000");
    const weiPerUnitGas = BigNumber.from("0");
    const payment = BigNumber.from("0");
    const fulfillmentFee = BigNumber.from("0");
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("1"));

    // Act & Assert
    // TODO: amend once hardhat fixes custom error assertions https://github.com/ethers-io/ethers.js/discussions/2849
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .calculateSpotPaymentAmount(startGas, weiPerUnitGas, payment, fulfillmentFee, FeeType.FLAT, {
          gasLimit: startGas,
        }),
    ).to.be.revertedWith(`DRCoordinator__PaymentPreFeeIsLtePayment`);
  });

  it("reverts if amount is greater than all LINK supply", async function () {
    // Arrange
    const startGas = BigNumber.from("500000");
    const weiPerUnitGas = BigNumber.from("1");
    const payment = BigNumber.from("0");
    const fulfillmentFee = BigNumber.from("10").pow("27"); // NB: LINK totalSupply (1e27)
    await context.mockV3Aggregator.connect(signers.deployer).updateAnswer(BigNumber.from("1"));

    // Act & Assert
    // TODO: amend once hardhat fixes custom error assertions https://github.com/ethers-io/ethers.js/discussions/2849
    await expect(
      context.drCoordinator
        .connect(signers.externalCaller)
        .calculateSpotPaymentAmount(startGas, weiPerUnitGas, payment, fulfillmentFee, FeeType.FLAT, {
          gasLimit: startGas,
        }),
    ).to.be.revertedWith(`DRCoordinator__PaymentAfterFeeIsGtLinkTotalSupply`);
  });

  const testCases = [
    {
      name: "paymentNoFeeType.SPOT and FeeType.FLAT",
      testData: {
        startGas: BigNumber.from("500000"),
        weiPerUnitGas: BigNumber.from("30000000000"),
        payment: BigNumber.from("100000000000000000"), // 0.1 LINK
        fulfillmentFee: BigNumber.from("1000000000000000000"), // 1 LINK
        feeType: FeeType.FLAT,
        expectedDelta: BigNumber.from("1000000000000000"), // 0.001 LINK
        expectedAmount: BigNumber.from("1219550963800020061"), // 1.22 LINK
      },
    },
    {
      name: "paymentNoFeeType.SPOT and FeeType.PERMIRYAD",
      testData: {
        startGas: BigNumber.from("500000"),
        weiPerUnitGas: BigNumber.from("30000000000"),
        payment: BigNumber.from("100000000000000000"), // 0.1 LINK
        fulfillmentFee: BigNumber.from("1225"), // 12.25%
        feeType: FeeType.PERMIRYAD,
        expectedDelta: BigNumber.from("1000000000000000"), // 0.001 LINK
        expectedAmount: BigNumber.from("246098598306083142"), // 0.24 LINK
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
          testData.payment,
          testData.fulfillmentFee,
          testData.feeType,
          {
            gasLimit: testData.startGas.add(gasAfterPaymentCalculation),
          },
        );

      // Assert
      expect(amount).to.be.closeTo(testData.expectedAmount, testData.expectedDelta);
    });
  }
}
