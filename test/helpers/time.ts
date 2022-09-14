/**
 * This is a port from the `time` OpenZeppelin Test Helper:
 *  - https://github.com/OpenZeppelin/openzeppelin-test-helpers/blob/master/test/src/time.test.js
 *
 * Hardhat Network JSON-RPC methods:
 *  - https://hardhat.org/hardhat-network/reference/#json-rpc-methods-support
 */
import { waffle, network } from "hardhat";
import { BigNumberish, BigNumber } from "ethers";

const { provider } = waffle;

// List of networks that behave different than ganache-cli, requiring an extra block
// NB: "localhost" is used by ETH Gas Reporter
const DELTA_BLOCK_NETWORKS = ["hardhat", "localhost"];

async function advanceBlock(target?: number) {
  const timestamp = target ? [target] : [];
  return provider.send("evm_mine", timestamp);
}

export async function advanceBlockAt(target: BigNumberish): Promise<void> {
  if (!BigNumber.isBigNumber(target)) {
    target = BigNumber.from(target);
  }
  return advanceBlock(target.toNumber());
}

export async function advanceBlockTo(target: BigNumberish): Promise<void> {
  if (!BigNumber.isBigNumber(target)) {
    target = BigNumber.from(target);
  }

  const currentBlock = await latestBlock();
  const start = Date.now();
  let notified = false;

  if (target.lt(currentBlock)) {
    const exc_msg = `Target block (${target}) is lower than current block (${currentBlock}).`;
    throw Error(exc_msg);
  }
  while (BigNumber.from(await latestBlock()).lt(target)) {
    if (!notified && Date.now() - start >= 5000) {
      notified = true;
      console.log("Warning advanceBlockTo(): advancing too many blocks is causing this test to be slow.");
    }
    await advanceBlock();
  }
}

export async function latest(): Promise<BigNumber> {
  const block = await provider.getBlock("latest");
  return BigNumber.from(block.timestamp);
}

export async function latestBlock(): Promise<BigNumber> {
  const block = await provider.getBlock("latest");
  return BigNumber.from(block.number);
}

async function increase(duration: BigNumberish) {
  if (!BigNumber.isBigNumber(duration)) {
    duration = BigNumber.from(duration);
  }

  if (duration.isNegative()) {
    throw Error(`Cannot increase time by a negative amount (${duration}).`);
  }

  await provider.send("evm_increaseTime", [duration.toNumber()]);
  await advanceBlock();
}

export async function increaseTo(target: BigNumberish): Promise<void> {
  if (!BigNumber.isBigNumber(target)) {
    target = BigNumber.from(target);
  }
  const now = await latest();

  if (target.lt(now)) {
    const exc_msg = `Cannot increase current time (${now}) to a moment in the past (${target}).`;
    throw Error(exc_msg);
  }
  const diff = target.sub(now);
  return increase(diff);
}

// NB: method not tested
export async function setNextBlockTimestamp(target: BigNumberish): Promise<void> {
  await provider.send("evm_setNextBlockTimestamp", [target]);
  return provider.send("evm_mine", []);
}

export const duration = {
  networkDeltaBlock: function (): BigNumber {
    const deltaBlock = DELTA_BLOCK_NETWORKS.includes(network.name) ? "1" : "0";
    return BigNumber.from(deltaBlock);
  },
  seconds: function (val: BigNumberish): BigNumber {
    return BigNumber.from(val);
  },
  minutes: function (val: BigNumberish): BigNumber {
    return BigNumber.from(val).mul(this.seconds("60"));
  },
  hours: function (val: BigNumberish): BigNumber {
    return BigNumber.from(val).mul(this.minutes("60"));
  },
  days: function (val: BigNumberish): BigNumber {
    return BigNumber.from(val).mul(this.hours("24"));
  },
  weeks: function (val: BigNumberish): BigNumber {
    return BigNumber.from(val).mul(this.days("7"));
  },
  years: function (val: BigNumberish): BigNumber {
    return BigNumber.from(val).mul(this.days("365"));
  },
};
