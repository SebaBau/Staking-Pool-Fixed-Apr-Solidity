import { ethers } from "hardhat";
import { BigNumber } from "ethers";

export async function advanceBlock() {
  return ethers.provider.send("evm_mine", []);
}

export async function advanceBlockTo(blockNumber) {
  for (let i = await ethers.provider.getBlockNumber(); i < blockNumber; i++) {
    await advanceBlock();
  }
}

export async function increase(value) {
  await ethers.provider.send("evm_increaseTime", [value.toNumber()]);
  await advanceBlock();
}

export async function latest(): Promise<any> {
  const block = await ethers.provider.getBlock("latest");
  return BigNumber.from(block.timestamp);
}

export async function advanceTimeAndBlock(time) {
  await advanceTime(time);
  await advanceBlock();
}

export async function advanceTime(time) {
  await ethers.provider.send("evm_increaseTime", [time]);
}

export async function getLastBlockTimestamp() {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp;
}

export async function setNextBlockTimestamp(time) {
  return ethers.provider.send("evm_setNextBlockTimestamp", [time]);
}

export async function setNextBlockTimestampAndAdvanceBlock(time) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [time]);
  await advanceBlock();
}

export const duration: any = {
  seconds: function (val) {
    return BigNumber.from(val);
  },
  minutes: function (val) {
    return BigNumber.from(val).mul(duration.seconds("60"));
  },
  hours: function (val) {
    return BigNumber.from(val).mul(duration.minutes("60"));
  },
  days: function (val) {
    return BigNumber.from(val).mul(duration.hours("24"));
  },
  weeks: function (val) {
    return BigNumber.from(val).mul(duration.days("7"));
  },
  years: function (val) {
    return BigNumber.from(val).mul(duration.days("365"));
  },
};
