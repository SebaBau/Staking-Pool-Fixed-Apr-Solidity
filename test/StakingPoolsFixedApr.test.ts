import { ethers } from "hardhat";
import { expect } from "chai";
import { getBigNumber, getLastBlockTimestamp } from "./utilities";

import { StakingPoolsFixedApr, ERC20FeeMock } from "../typechain";
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("Test Set Name", () => {
  let [deployer, alice, bob]: SignerWithAddress[] = [];

  let lastBlockTime: number;

  let stakingContract: StakingPoolsFixedApr;
  let erc20fee: ERC20FeeMock;

  const Ownable_NotOwner_Error = "Ownable_NotOwner";
  const StakingPoolFixedApr_ZeroRewardsAmount_Error = "StakingPoolFixedApr_ZeroRewardsAmount";
  const StakingPoolFixedApr_StartTimeMustBeInTheFuture_Error = "StakingPoolFixedApr_StartTimeMustBeInTheFuture";
  const StakingPoolFixedApr_StartTimeMustBeLaterThanEndTime_Error =
    "StakingPoolFixedApr_StartTimeMustBeLaterThanEndTime";
  const StakingPoolFixedApr_IncorrectAmountTransferred_Error = "StakingPoolFixedApr_IncorrectAmountTransferred";

  const StakingPoolFixedApr_StakingPoolAdded_Event = "StakingPoolAdded";
  const StakingPoolFixedApr_Staked_Event = "Staked";

  beforeEach(async () => {
    const signers = await ethers.getSigners();
    deployer = signers[0];
    alice = signers[1];
    bob = signers[2];

    const stakingContractFactory = await ethers.getContractFactory("StakingPoolsFixedApr");
    stakingContract = (await stakingContractFactory.deploy()) as StakingPoolsFixedApr;

    const erc20feeFactory = await ethers.getContractFactory("ERC20FeeMock");
    erc20fee = (await erc20feeFactory.deploy(getBigNumber(1_000_000))) as ERC20FeeMock;

    await erc20fee.updateExcludedFromFee(deployer.address, true);

    await erc20fee.transfer(alice.address, getBigNumber(10_000));
    await erc20fee.transfer(bob.address, getBigNumber(10_000));
  });

  describe("'addStakingPool' function tests", () => {
    it("Should work correctly and add new Staking Pool", async () => {
      const preStakingPool = await stakingContract.stakingPools(1);

      lastBlockTime = await getLastBlockTimestamp();

      await erc20fee.approve(stakingContract.address, getBigNumber(10_000));

      await expect(
        stakingContract.addStakingPool(
          getBigNumber(10_000),
          getBigNumber(1),
          erc20fee.address,
          lastBlockTime + 60,
          lastBlockTime + 3_660,
          1_000
        )
      )
        .to.emit(stakingContract, StakingPoolFixedApr_StakingPoolAdded_Event)
        .withArgs(
          1,
          getBigNumber(10_000),
          getBigNumber(1),
          erc20fee.address,
          lastBlockTime + 60,
          lastBlockTime + 3_660,
          1_000
        );

      const postStakingPool = await stakingContract.stakingPools(1);

      expect(preStakingPool.rewardsAdded).to.be.equal(0);
      expect(preStakingPool.minimumToStake).to.be.equal(0);
      expect(preStakingPool.token).to.be.equal(ethers.constants.AddressZero);
      expect(preStakingPool.startTime).to.be.equal(0);
      expect(preStakingPool.endTime).to.be.equal(0);
      expect(preStakingPool.apr).to.be.equal(0);

      expect(postStakingPool.rewardsAdded).to.be.equal(getBigNumber(10_000));
      expect(postStakingPool.minimumToStake).to.be.equal(getBigNumber(1));
      expect(postStakingPool.token).to.be.equal(erc20fee.address);
      expect(postStakingPool.startTime).to.be.equal(lastBlockTime + 60);
      expect(postStakingPool.endTime).to.be.equal(lastBlockTime + 3_660);
      expect(postStakingPool.apr).to.be.equal(1_000);
    });

    it("Should revert when caller is not the owner", async () => {
      lastBlockTime = await getLastBlockTimestamp();

      await expect(
        stakingContract
          .connect(alice)
          .addStakingPool(
            getBigNumber(10_000),
            getBigNumber(1),
            erc20fee.address,
            lastBlockTime + 60,
            lastBlockTime + 3_660,
            1_000
          )
      ).to.be.revertedWithCustomError(stakingContract, Ownable_NotOwner_Error);
    });

    it("Should revert for zero amount of rewards", async () => {
      lastBlockTime = await getLastBlockTimestamp();

      await expect(
        stakingContract.addStakingPool(
          0,
          getBigNumber(1),
          erc20fee.address,
          lastBlockTime + 60,
          lastBlockTime + 3_660,
          1_000
        )
      ).to.be.revertedWithCustomError(stakingContract, StakingPoolFixedApr_ZeroRewardsAmount_Error);
    });

    it("Should revert when start time is in the past", async () => {
      lastBlockTime = await getLastBlockTimestamp();

      await expect(
        stakingContract.addStakingPool(
          getBigNumber(10_000),
          getBigNumber(1),
          erc20fee.address,
          lastBlockTime - 1,
          lastBlockTime + 3_660,
          1_000
        )
      ).to.be.revertedWithCustomError(stakingContract, StakingPoolFixedApr_StartTimeMustBeInTheFuture_Error);
    });

    it("Should revert when start time is greater than end time", async () => {
      lastBlockTime = await getLastBlockTimestamp();

      await expect(
        stakingContract.addStakingPool(
          getBigNumber(10_000),
          getBigNumber(1),
          erc20fee.address,
          lastBlockTime + 1_000,
          lastBlockTime + 900,
          1_000
        )
      ).to.be.revertedWithCustomError(stakingContract, StakingPoolFixedApr_StartTimeMustBeLaterThanEndTime_Error);
    });

    it("Should revert when start time is equal end time", async () => {
      lastBlockTime = await getLastBlockTimestamp();

      await expect(
        stakingContract.addStakingPool(
          getBigNumber(10_000),
          getBigNumber(1),
          erc20fee.address,
          lastBlockTime + 1_000,
          lastBlockTime + 1_000,
          1_000
        )
      ).to.be.revertedWithCustomError(stakingContract, StakingPoolFixedApr_StartTimeMustBeLaterThanEndTime_Error);
    });

    it("Should revert when incorrect amount of tokens are transferred", async () => {
      lastBlockTime = await getLastBlockTimestamp();

      await erc20fee.approve(stakingContract.address, getBigNumber(10_000));
      await erc20fee.updateExcludedFromFee(deployer.address, false);

      await expect(
        stakingContract.addStakingPool(
          getBigNumber(10_000),
          getBigNumber(1),
          erc20fee.address,
          lastBlockTime + 10,
          lastBlockTime + 3_660,
          1_000
        )
      ).to.be.revertedWithCustomError(stakingContract, StakingPoolFixedApr_IncorrectAmountTransferred_Error);
    });
  });

  describe("'stake' function tests", () => {
    let startTime;
    let endTime;

    beforeEach(async () => {
      lastBlockTime = await getLastBlockTimestamp();

      startTime = lastBlockTime + 60;
      endTime = lastBlockTime + 3_660;

      await erc20fee.approve(stakingContract.address, getBigNumber(10_000));

      await stakingContract.addStakingPool(
        getBigNumber(10_000),
        getBigNumber(1),
        erc20fee.address,
        startTime,
        endTime,
        1_000
      );

      await erc20fee.updateExcludedFromFee(stakingContract.address, true);
    });

    it("Should work correctly and add new stake", async () => {
      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await expect(stakingContract.connect(alice).stake(1, getBigNumber(1_000)))
        .to.emit(stakingContract, StakingPoolFixedApr_Staked_Event)
        .withArgs(alice.address, 1, 1, getBigNumber(1_000), BigNumber.from("11415525114155200"), endTime);
    });

    it("Should work correctly and add more than 1 stake to the same Staking Pool", async () => {
      throw Error("Not Implemented!");
    });

    it("Should work correctly and add more than 1 stake in different Staking Pools", async () => {
      throw Error("Not Implemented!");
    });

    it("Should revert when Staking Pool doesn't exist", async () => {
      throw Error("Not Implemented!");
    });

    it("Should revert when Staking Pool is closed", async () => {
      throw Error("Not Implemented!");
    });

    it("Should revert when given amount is below minimum to stake value", async () => {
      throw Error("Not Implemented!");
    });

    it("Should revert when calculated rewards equal zero", async () => {
      throw Error("Not Implemented!");
    });

    it("Should revert when calculated rewards are greater than available rewards", async () => {
      throw Error("Not Implemented!");
    });

    it("Should revert when incorrect amount of tokens are transferred from user to contract", async () => {
      throw Error("Not Implemented!");
    });
  });
});
