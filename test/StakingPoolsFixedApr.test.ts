import { ethers } from "hardhat";
import { expect } from "chai";
import {
  getBigNumber,
  getLastBlockTimestamp,
  setNextBlockTimestamp,
  setNextBlockTimestampAndAdvanceBlock,
} from "./utilities";

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
  const StakingPoolFixedApr_PoolNotExists_Error = "StakingPoolFixedApr_PoolNotExists";
  const StakingPoolFixedApr_PoolClosed_Error = "StakingPoolFixedApr_PoolClosed";
  const StakingPoolFixedApr_AmountIsBelowMinimumToStake_Error = "StakingPoolFixedApr_AmountIsBelowMinimumToStake";
  const StakingPoolFixedApr_ZeroCalculatedRewards_Error = "StakingPoolFixedApr_ZeroCalculatedRewards";
  const StakingPoolFixedApr_NotEnoughTokensForReward_Error = "StakingPoolFixedApr_NotEnoughTokensForReward";
  const StakingPoolFixedApr_StakeNotExists_Error = "StakingPoolFixedApr_StakeNotExists";
  const StakingPoolFixedApr_CannotUnstakeYet_Error = "StakingPoolFixedApr_CannotUnstakeYet";
  const StakingPoolFixedApr_CannotBeforeEndTime_Error = "StakingPoolFixedApr_CannotBeforeEndTime";
  const StakingPoolFixedApr_NothingToWithdraw_Error = "StakingPoolFixedApr_NothingToWithdraw";

  const StakingPoolFixedApr_StakingPoolAdded_Event = "StakingPoolAdded";
  const StakingPoolFixedApr_Staked_Event = "Staked";
  const StakingPoolFixedApr_Unstaked_Event = "Unstaked";
  const StakingPoolFixedApr_Withdrawn_Event = "Withdrawn";

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
      const preUserids = await stakingContract.getAllUserStakeIds(alice.address);
      const preStakeData = await stakingContract.stakes(1);
      const preRewardsDistributed = await stakingContract.rewardsDistributed(1);
      const preUserBalance = await erc20fee.balanceOf(alice.address);
      const preStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await expect(stakingContract.connect(alice).stake(1, getBigNumber(1_000)))
        .to.emit(stakingContract, StakingPoolFixedApr_Staked_Event)
        .withArgs(alice.address, 1, 1, getBigNumber(1_000), BigNumber.from("11415525114155200"), endTime);

      const postUserids = await stakingContract.getAllUserStakeIds(alice.address);
      const postStakeData = await stakingContract.stakes(1);
      const postRewardsDistributed = await stakingContract.rewardsDistributed(1);
      const postUserBalance = await erc20fee.balanceOf(alice.address);
      const postStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      // Pre Data

      expect(preUserids.length).to.be.equal(0);

      expect(preStakeData.stakingPoolId).to.be.equal(0);
      expect(preStakeData.staked).to.be.equal(0);
      expect(preStakeData.rewards).to.be.equal(0);
      expect(preStakeData.owner).to.be.equal(ethers.constants.AddressZero);
      expect(preStakeData.unstakePossibleAt).to.be.equal(0);

      expect(preRewardsDistributed).to.be.equal(0);

      expect(preUserBalance).to.be.equal(getBigNumber(10_000));

      expect(preStakingContractBalance).to.be.equal(getBigNumber(10_000));

      // Post Data

      expect(postUserids.length).to.be.equal(1);
      expect(postUserids[0]).to.be.equal(1);

      expect(postStakeData.stakingPoolId).to.be.equal(1);
      expect(postStakeData.staked).to.be.equal(getBigNumber(1_000));
      expect(postStakeData.rewards).to.be.equal(BigNumber.from("11415525114155200"));
      expect(postStakeData.owner).to.be.equal(alice.address);
      expect(postStakeData.unstakePossibleAt).to.be.equal(endTime);

      expect(postRewardsDistributed).to.be.equal(BigNumber.from("11415525114155200"));

      expect(postUserBalance).to.be.equal(getBigNumber(9_000));

      expect(postStakingContractBalance).to.be.equal(getBigNumber(11_000));
    });

    it("Should work correctly and add more than 1 stake to the same Staking Pool", async () => {
      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await expect(stakingContract.connect(alice).stake(1, getBigNumber(1_000)))
        .to.emit(stakingContract, StakingPoolFixedApr_Staked_Event)
        .withArgs(alice.address, 1, 1, getBigNumber(1_000), BigNumber.from("11415525114155200"), endTime);

      await erc20fee.connect(bob).approve(stakingContract.address, getBigNumber(10_000));

      const preUserids = await stakingContract.getAllUserStakeIds(bob.address);
      const preStakeData = await stakingContract.stakes(2);
      const preRewardsDistributed = await stakingContract.rewardsDistributed(1);
      const preUserBalance = await erc20fee.balanceOf(bob.address);
      const preStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      await expect(stakingContract.connect(bob).stake(1, getBigNumber(10_000)))
        .to.emit(stakingContract, StakingPoolFixedApr_Staked_Event)
        .withArgs(bob.address, 2, 1, getBigNumber(10_000), BigNumber.from("114155251141552000"), endTime);

      const postUserids = await stakingContract.getAllUserStakeIds(bob.address);
      const postStakeData = await stakingContract.stakes(2);
      const postRewardsDistributed = await stakingContract.rewardsDistributed(1);
      const postUserBalance = await erc20fee.balanceOf(bob.address);
      const postStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      // Pre Data

      expect(preUserids.length).to.be.equal(0);

      expect(preStakeData.stakingPoolId).to.be.equal(0);
      expect(preStakeData.staked).to.be.equal(0);
      expect(preStakeData.rewards).to.be.equal(0);
      expect(preStakeData.owner).to.be.equal(ethers.constants.AddressZero);
      expect(preStakeData.unstakePossibleAt).to.be.equal(0);

      expect(preRewardsDistributed).to.be.equal(BigNumber.from("11415525114155200"));

      expect(preUserBalance).to.be.equal(getBigNumber(10_000));

      expect(preStakingContractBalance).to.be.equal(getBigNumber(11_000));

      // Post Data

      expect(postUserids.length).to.be.equal(1);
      expect(postUserids[0]).to.be.equal(2);

      expect(postStakeData.stakingPoolId).to.be.equal(1);
      expect(postStakeData.staked).to.be.equal(getBigNumber(10_000));
      expect(postStakeData.rewards).to.be.equal(BigNumber.from("114155251141552000"));
      expect(postStakeData.owner).to.be.equal(bob.address);
      expect(postStakeData.unstakePossibleAt).to.be.equal(endTime);

      expect(postRewardsDistributed).to.be.equal(BigNumber.from("125570776255707200"));

      expect(postUserBalance).to.be.equal(0);

      expect(postStakingContractBalance).to.be.equal(getBigNumber(21_000));
    });

    it("Should work correctly and add more than 1 stake in different Staking Pools", async () => {
      await erc20fee.approve(stakingContract.address, getBigNumber(10_000));

      lastBlockTime = await getLastBlockTimestamp();

      const secondStakingPoolStartTime = lastBlockTime + 10;
      const secondStakingPoolEndTime = lastBlockTime + 63_072_010;

      await stakingContract.addStakingPool(
        getBigNumber(10_000),
        getBigNumber(1),
        erc20fee.address,
        secondStakingPoolStartTime,
        secondStakingPoolEndTime,
        5_000
      );

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(6_000));

      await expect(stakingContract.connect(alice).stake(1, getBigNumber(1_000)))
        .to.emit(stakingContract, StakingPoolFixedApr_Staked_Event)
        .withArgs(alice.address, 1, 1, getBigNumber(1_000), BigNumber.from("11415525114155200"), endTime);

      lastBlockTime = await getLastBlockTimestamp();

      const preUserids = await stakingContract.getAllUserStakeIds(alice.address);
      const preSecondStakeData = await stakingContract.stakes(2);
      const preSecondPoolRewardsDistributed = await stakingContract.rewardsDistributed(2);
      const preUserBalance = await erc20fee.balanceOf(alice.address);
      const preStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      await setNextBlockTimestamp(secondStakingPoolStartTime + 100);

      await expect(stakingContract.connect(alice).stake(2, getBigNumber(5_000)))
        .to.emit(stakingContract, StakingPoolFixedApr_Staked_Event)
        .withArgs(
          alice.address,
          2,
          2,
          getBigNumber(5_000),
          BigNumber.from("4999992072552004057500"),
          secondStakingPoolEndTime
        );

      const postUserids = await stakingContract.getAllUserStakeIds(alice.address);
      const postFirstStakeData = await stakingContract.stakes(1);
      const postSecondStakeData = await stakingContract.stakes(2);
      const postFirstPoolRewardsDistributed = await stakingContract.rewardsDistributed(1);
      const postSecondPoolRewardsDistributed = await stakingContract.rewardsDistributed(2);
      const postUserBalance = await erc20fee.balanceOf(alice.address);
      const postStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      // Pre Data

      expect(preUserids.length).to.be.equal(1);
      expect(preUserids[0]).to.be.equal(1);

      expect(preSecondStakeData.stakingPoolId).to.be.equal(0);
      expect(preSecondStakeData.staked).to.be.equal(0);
      expect(preSecondStakeData.rewards).to.be.equal(0);
      expect(preSecondStakeData.owner).to.be.equal(ethers.constants.AddressZero);
      expect(preSecondStakeData.unstakePossibleAt).to.be.equal(0);

      expect(preSecondPoolRewardsDistributed).to.be.equal(0);

      expect(preUserBalance).to.be.equal(getBigNumber(9_000));

      expect(preStakingContractBalance).to.be.equal(getBigNumber(21_000));

      // Post Data

      expect(postUserids.length).to.be.equal(2);
      expect(postUserids[0]).to.be.equal(1);
      expect(postUserids[1]).to.be.equal(2);

      expect(postFirstStakeData.stakingPoolId).to.be.equal(1);
      expect(postFirstStakeData.staked).to.be.equal(getBigNumber(1_000));
      expect(postFirstStakeData.rewards).to.be.equal(BigNumber.from("11415525114155200"));
      expect(postFirstStakeData.owner).to.be.equal(alice.address);
      expect(postFirstStakeData.unstakePossibleAt).to.be.equal(endTime);

      expect(postSecondStakeData.stakingPoolId).to.be.equal(2);
      expect(postSecondStakeData.staked).to.be.equal(getBigNumber(5_000));
      expect(postSecondStakeData.rewards).to.be.equal(BigNumber.from("4999992072552004057500"));
      expect(postSecondStakeData.owner).to.be.equal(alice.address);
      expect(postSecondStakeData.unstakePossibleAt).to.be.equal(secondStakingPoolEndTime);

      expect(postFirstPoolRewardsDistributed).to.be.equal(BigNumber.from("11415525114155200"));

      expect(postSecondPoolRewardsDistributed).to.be.equal(BigNumber.from("4999992072552004057500"));

      expect(postUserBalance).to.be.equal(getBigNumber(4_000));

      expect(postStakingContractBalance).to.be.equal(getBigNumber(26_000));
    });

    it("Should revert when Staking Pool doesn't exist", async () => {
      await expect(stakingContract.connect(alice).stake(2, getBigNumber(1_000))).to.be.revertedWithCustomError(
        stakingContract,
        StakingPoolFixedApr_PoolNotExists_Error
      );
    });

    it("Should revert when Staking Pool is closed (current timestamp is equal end time)", async () => {
      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await setNextBlockTimestamp(endTime);

      await expect(stakingContract.connect(alice).stake(1, getBigNumber(1_000))).to.be.revertedWithCustomError(
        stakingContract,
        StakingPoolFixedApr_PoolClosed_Error
      );
    });

    it("Should revert when Staking Pool is closed (current timestamp is greater end time)", async () => {
      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await setNextBlockTimestamp(endTime + 1);

      await expect(stakingContract.connect(alice).stake(1, getBigNumber(1_000))).to.be.revertedWithCustomError(
        stakingContract,
        StakingPoolFixedApr_PoolClosed_Error
      );
    });

    it("Should revert when given amount is below minimum to stake value", async () => {
      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await expect(
        stakingContract.connect(alice).stake(1, BigNumber.from("99999999999999999"))
      ).to.be.revertedWithCustomError(stakingContract, StakingPoolFixedApr_AmountIsBelowMinimumToStake_Error);
    });

    it("Should revert when calculated rewards equal zero", async () => {
      await erc20fee.approve(stakingContract.address, getBigNumber(10_000));

      await stakingContract.addStakingPool(getBigNumber(10_000), 0, erc20fee.address, startTime, endTime, 1_000);

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await expect(stakingContract.connect(alice).stake(2, BigNumber.from("5000"))).to.be.revertedWithCustomError(
        stakingContract,
        StakingPoolFixedApr_ZeroCalculatedRewards_Error
      );
    });

    it("Should revert when calculated rewards are greater than available rewards", async () => {
      await erc20fee.approve(stakingContract.address, getBigNumber(10_000));

      lastBlockTime = await getLastBlockTimestamp();

      const secondStakingPoolStartTime = lastBlockTime + 10;
      const secondStakingPoolEndTime = lastBlockTime + 63_072_010;

      await stakingContract.addStakingPool(
        getBigNumber(10_000),
        getBigNumber(1),
        erc20fee.address,
        secondStakingPoolStartTime,
        secondStakingPoolEndTime,
        5_100
      );

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(10_000));

      await expect(stakingContract.connect(alice).stake(2, getBigNumber(10_000))).to.be.revertedWithCustomError(
        stakingContract,
        StakingPoolFixedApr_NotEnoughTokensForReward_Error
      );
    });

    it("Should revert when incorrect amount of tokens are transferred from user to contract", async () => {
      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await erc20fee.updateExcludedFromFee(stakingContract.address, false);

      await expect(stakingContract.connect(alice).stake(1, getBigNumber(1_000))).to.be.revertedWithCustomError(
        stakingContract,
        StakingPoolFixedApr_IncorrectAmountTransferred_Error
      );
    });
  });

  describe("'unstake' function tests", () => {
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

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(1_000));
    });

    it("Should work correctly and unstake when user has 1 stake", async () => {
      lastBlockTime = await getLastBlockTimestamp();

      await setNextBlockTimestamp(endTime);

      const preStakeData = await stakingContract.stakes(1);
      const preUserids = await stakingContract.getAllUserStakeIds(alice.address);
      const preUserBalance = await erc20fee.balanceOf(alice.address);
      const preStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      await expect(stakingContract.connect(alice).unstake(1))
        .to.emit(stakingContract, StakingPoolFixedApr_Unstaked_Event)
        .withArgs(alice.address, 1);

      const postStakeData = await stakingContract.stakes(1);
      const postUserids = await stakingContract.getAllUserStakeIds(alice.address);
      const postUserBalance = await erc20fee.balanceOf(alice.address);
      const postStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      // Pre Data

      expect(preStakeData.stakingPoolId).to.be.equal(1);
      expect(preStakeData.staked).to.be.equal(getBigNumber(1_000));
      expect(preStakeData.rewards).to.be.equal(BigNumber.from("11415525114155200"));
      expect(preStakeData.owner).to.be.equal(alice.address);
      expect(preStakeData.unstakePossibleAt).to.be.equal(endTime);

      expect(preUserids.length).to.be.equal(1);
      expect(preUserids[0]).to.be.equal(1);

      expect(preUserBalance).to.be.equal(getBigNumber(9_000));

      expect(preStakingContractBalance).to.be.equal(getBigNumber(11_000));

      // Post Data

      expect(postStakeData.stakingPoolId).to.be.equal(0);
      expect(postStakeData.staked).to.be.equal(0);
      expect(postStakeData.rewards).to.be.equal(0);
      expect(postStakeData.owner).to.be.equal(ethers.constants.AddressZero);
      expect(postStakeData.unstakePossibleAt).to.be.equal(0);

      expect(postUserids.length).to.be.equal(0);

      expect(postUserBalance).to.be.equal(BigNumber.from("10000011415525114155200"));

      expect(postStakingContractBalance).to.be.equal(BigNumber.from("9999988584474885844800"));
    });

    it("Should work correctly and unstake when user has few stakes (last stake to unstake)", async () => {
      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(1_000));

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(1_000));

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(1_000));

      lastBlockTime = await getLastBlockTimestamp();

      await setNextBlockTimestamp(endTime);

      const preStakeData = await stakingContract.stakes(4);
      const preUserids = await stakingContract.getAllUserStakeIds(alice.address);
      const preUserBalance = await erc20fee.balanceOf(alice.address);
      const preStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      await expect(stakingContract.connect(alice).unstake(4))
        .to.emit(stakingContract, StakingPoolFixedApr_Unstaked_Event)
        .withArgs(alice.address, 4);

      const postStakeData = await stakingContract.stakes(4);
      const postUserids = await stakingContract.getAllUserStakeIds(alice.address);
      const postUserBalance = await erc20fee.balanceOf(alice.address);
      const postStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      // Pre Data

      expect(preStakeData.stakingPoolId).to.be.equal(1);
      expect(preStakeData.staked).to.be.equal(getBigNumber(1_000));
      expect(preStakeData.rewards).to.be.equal(BigNumber.from("11415525114155200"));
      expect(preStakeData.owner).to.be.equal(alice.address);
      expect(preStakeData.unstakePossibleAt).to.be.equal(endTime);

      expect(preUserids.length).to.be.equal(4);
      expect(preUserids[0]).to.be.equal(1);
      expect(preUserids[1]).to.be.equal(2);
      expect(preUserids[2]).to.be.equal(3);
      expect(preUserids[3]).to.be.equal(4);

      expect(preUserBalance).to.be.equal(getBigNumber(6_000));

      expect(preStakingContractBalance).to.be.equal(getBigNumber(14_000));

      // Post Data

      expect(postStakeData.stakingPoolId).to.be.equal(0);
      expect(postStakeData.staked).to.be.equal(0);
      expect(postStakeData.rewards).to.be.equal(0);
      expect(postStakeData.owner).to.be.equal(ethers.constants.AddressZero);
      expect(postStakeData.unstakePossibleAt).to.be.equal(0);

      expect(postUserids.length).to.be.equal(3);
      expect(postUserids[0]).to.be.equal(1);
      expect(postUserids[1]).to.be.equal(2);
      expect(postUserids[2]).to.be.equal(3);

      expect(postUserBalance).to.be.equal(BigNumber.from("7000011415525114155200"));

      expect(postStakingContractBalance).to.be.equal(BigNumber.from("12999988584474885844800"));
    });

    it("Should work correctly and unstake when user has few stakes (one from middle stakes)", async () => {
      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(1_000));

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(1_000));

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(1_000));

      lastBlockTime = await getLastBlockTimestamp();

      await setNextBlockTimestamp(endTime);

      const preStakeData = await stakingContract.stakes(2);
      const preUserids = await stakingContract.getAllUserStakeIds(alice.address);
      const preUserBalance = await erc20fee.balanceOf(alice.address);
      const preStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      await expect(stakingContract.connect(alice).unstake(2))
        .to.emit(stakingContract, StakingPoolFixedApr_Unstaked_Event)
        .withArgs(alice.address, 2);

      const postStakeData = await stakingContract.stakes(2);
      const postUserids = await stakingContract.getAllUserStakeIds(alice.address);
      const postUserBalance = await erc20fee.balanceOf(alice.address);
      const postStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      // Pre Data

      expect(preStakeData.stakingPoolId).to.be.equal(1);
      expect(preStakeData.staked).to.be.equal(getBigNumber(1_000));
      expect(preStakeData.rewards).to.be.equal(BigNumber.from("11415525114155200"));
      expect(preStakeData.owner).to.be.equal(alice.address);
      expect(preStakeData.unstakePossibleAt).to.be.equal(endTime);

      expect(preUserids.length).to.be.equal(4);
      expect(preUserids[0]).to.be.equal(1);
      expect(preUserids[1]).to.be.equal(2);
      expect(preUserids[2]).to.be.equal(3);
      expect(preUserids[3]).to.be.equal(4);

      expect(preUserBalance).to.be.equal(getBigNumber(6_000));

      expect(preStakingContractBalance).to.be.equal(getBigNumber(14_000));

      // Post Data

      expect(postStakeData.stakingPoolId).to.be.equal(0);
      expect(postStakeData.staked).to.be.equal(0);
      expect(postStakeData.rewards).to.be.equal(0);
      expect(postStakeData.owner).to.be.equal(ethers.constants.AddressZero);
      expect(postStakeData.unstakePossibleAt).to.be.equal(0);

      expect(postUserids.length).to.be.equal(3);
      expect(postUserids[0]).to.be.equal(1);
      expect(postUserids[1]).to.be.equal(4);
      expect(postUserids[2]).to.be.equal(3);

      expect(postUserBalance).to.be.equal(BigNumber.from("7000011415525114155200"));

      expect(postStakingContractBalance).to.be.equal(BigNumber.from("12999988584474885844800"));
    });

    it("Should revert when stake doesn't exist (invalid user)", async () => {
      await erc20fee.connect(bob).approve(stakingContract.address, getBigNumber(1_000));

      await stakingContract.connect(bob).stake(1, getBigNumber(1_000));

      await expect(stakingContract.connect(alice).unstake(2)).to.be.revertedWithCustomError(
        stakingContract,
        StakingPoolFixedApr_StakeNotExists_Error
      );
    });

    it("Should revert when stake doesn't exist (doesn't really exist)", async () => {
      await expect(stakingContract.connect(alice).unstake(2)).to.be.revertedWithCustomError(
        stakingContract,
        StakingPoolFixedApr_StakeNotExists_Error
      );
    });

    it("Should revert when user cannot unstake yet", async () => {
      await expect(stakingContract.connect(alice).unstake(1)).to.be.revertedWithCustomError(
        stakingContract,
        StakingPoolFixedApr_CannotUnstakeYet_Error
      );
    });
  });

  describe("'withdrawUnusedRewards' function tests", () => {
    let startTime;
    let endTime;

    beforeEach(async () => {
      await erc20fee.approve(stakingContract.address, getBigNumber(10_000));

      lastBlockTime = await getLastBlockTimestamp();

      startTime = lastBlockTime + 10;
      endTime = lastBlockTime + 63_072_010;

      await stakingContract.addStakingPool(
        getBigNumber(10_000),
        getBigNumber(1),
        erc20fee.address,
        startTime,
        endTime,
        5_000
      );

      await erc20fee.updateExcludedFromFee(stakingContract.address, true);
    });

    it("Should work correctly and withdraw unused rewards", async () => {
      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(5_000));

      await setNextBlockTimestamp(startTime - 5);

      await stakingContract.connect(alice).stake(1, getBigNumber(5_000));

      await setNextBlockTimestamp(endTime + 1);

      const preOwnerBalance = await erc20fee.balanceOf(deployer.address);
      const preStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      await expect(stakingContract.withdrawUnusedRewards(1))
        .to.emit(stakingContract, StakingPoolFixedApr_Withdrawn_Event)
        .withArgs(1, getBigNumber(5_000));

      const postOwnerBalance = await erc20fee.balanceOf(deployer.address);
      const postStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      // Pre Data

      expect(preOwnerBalance).to.be.equal(getBigNumber(970_000));

      expect(preStakingContractBalance).to.be.equal(getBigNumber(15_000));

      // Post Data

      expect(postOwnerBalance).to.be.equal(getBigNumber(975_000));

      expect(postStakingContractBalance).to.be.equal(getBigNumber(10_000));
    });

    it("Should revert when caller isn't the owner", async () => {
      await expect(stakingContract.connect(alice).withdrawUnusedRewards(1)).to.be.revertedWithCustomError(
        stakingContract,
        Ownable_NotOwner_Error
      );
    });

    it("Should revert when Staking Pool doesn't exist", async () => {
      await expect(stakingContract.withdrawUnusedRewards(2)).to.be.revertedWithCustomError(
        stakingContract,
        StakingPoolFixedApr_PoolNotExists_Error
      );
    });

    it("Should revert when Pool is still open", async () => {
      await expect(stakingContract.withdrawUnusedRewards(1)).to.be.revertedWithCustomError(
        stakingContract,
        StakingPoolFixedApr_CannotBeforeEndTime_Error
      );
    });

    it("Should revert when all rewards are distributed", async () => {
      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(5_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(5_000));

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(5_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(5_000));

      await setNextBlockTimestamp(endTime + 1);

      await expect(stakingContract.withdrawUnusedRewards(1)).to.be.revertedWithCustomError(
        stakingContract,
        StakingPoolFixedApr_NothingToWithdraw_Error
      );
    });
  });

  describe("'calculateRewards' function tests", () => {
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
    });

    it("Should work correctly and calculate rewards (before Staking Pool start time)", async () => {
      const calculatedRewards = await stakingContract.calculateRewards(1, getBigNumber(10_000));

      expect(calculatedRewards).to.be.equal(BigNumber.from("114155251141552000"));
    });

    it("Should work correctly and calculate rewards (after Staking Pool start time)", async () => {
      await setNextBlockTimestampAndAdvanceBlock(startTime + 100);

      const calculatedRewards = await stakingContract.calculateRewards(1, getBigNumber(10_000));

      expect(calculatedRewards).to.be.equal(BigNumber.from("110984271943176000"));
    });

    it("Should revert when Staking Pool doesn't exist", async () => {
      await expect(stakingContract.calculateRewards(2, getBigNumber(500))).to.be.revertedWithCustomError(
        stakingContract,
        StakingPoolFixedApr_PoolNotExists_Error
      );
    });
  });

  describe("'getAllUserids' function tests", () => {
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

    it("Should return empty array", async () => {
      const ids = await stakingContract.getAllUserStakeIds(alice.address);

      expect(ids.length).to.be.equal(0);
    });

    it("Should return array with values", async () => {
      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(1_000));

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(9_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(9_000));

      const ids = await stakingContract.getAllUserStakeIds(alice.address);

      expect(ids.length).to.be.equal(2);
      expect(ids[0]).to.be.equal(1);
      expect(ids[1]).to.be.equal(2);
    });
  });

  describe("'getAllUserStakes' function tests", () => {
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

    it("Should return empty array", async () => {
      const stakes = await stakingContract.getAllUserStakes(alice.address);

      expect(stakes.length).to.be.equal(0);
    });

    it("Should return array of stakes", async () => {
      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(1_000));

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(2_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(2_000));

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(4_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(4_000));

      const stakes = await stakingContract.getAllUserStakes(alice.address);

      expect(stakes.length).to.be.equal(3);

      expect(stakes[0].id).to.be.equal(1);
      expect(stakes[0].stakingPoolId).to.be.equal(1);
      expect(stakes[0].staked).to.be.equal(getBigNumber(1_000));
      expect(stakes[0].rewards).to.be.equal(BigNumber.from("11415525114155200"));
      expect(stakes[0].unstakePossibleAt).to.be.equal(endTime);

      expect(stakes[1].id).to.be.equal(2);
      expect(stakes[1].stakingPoolId).to.be.equal(1);
      expect(stakes[1].staked).to.be.equal(getBigNumber(2_000));
      expect(stakes[1].rewards).to.be.equal(BigNumber.from("22831050228310400"));
      expect(stakes[1].unstakePossibleAt).to.be.equal(endTime);

      expect(stakes[2].id).to.be.equal(3);
      expect(stakes[2].stakingPoolId).to.be.equal(1);
      expect(stakes[2].staked).to.be.equal(getBigNumber(4_000));
      expect(stakes[2].rewards).to.be.equal(BigNumber.from("45662100456620800"));
      expect(stakes[2].unstakePossibleAt).to.be.equal(endTime);
    });

    it("Should return array of stakes (after user unstake some stake)", async () => {
      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(1_000));

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(2_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(2_000));

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(4_000));

      await stakingContract.connect(alice).stake(1, getBigNumber(4_000));

      await setNextBlockTimestamp(endTime);

      await stakingContract.connect(alice).unstake(2);

      const stakes = await stakingContract.getAllUserStakes(alice.address);

      expect(stakes.length).to.be.equal(2);

      expect(stakes[0].id).to.be.equal(1);
      expect(stakes[0].stakingPoolId).to.be.equal(1);
      expect(stakes[0].staked).to.be.equal(getBigNumber(1_000));
      expect(stakes[0].rewards).to.be.equal(BigNumber.from("11415525114155200"));
      expect(stakes[0].unstakePossibleAt).to.be.equal(endTime);

      expect(stakes[1].id).to.be.equal(3);
      expect(stakes[1].stakingPoolId).to.be.equal(1);
      expect(stakes[1].staked).to.be.equal(getBigNumber(4_000));
      expect(stakes[1].rewards).to.be.equal(BigNumber.from("45662100456620800"));
      expect(stakes[1].unstakePossibleAt).to.be.equal(endTime);
    });
  });

  describe("'getAllStakingPools' function tests", () => {
    it("Should return empty array", async () => {
      const stakingPools = await stakingContract.getAllStakingPools();

      expect(stakingPools.length).to.be.equal(0);
    });

    it("Should return array of correct values (with different Pool statuses)", async () => {
      lastBlockTime = await getLastBlockTimestamp();

      const firstStartTime = lastBlockTime + 10;
      const firstEndTime = lastBlockTime + 1_000;

      const secondStartTime = lastBlockTime + 100;
      const secondEndTime = lastBlockTime + 1_100;

      const thirdStartTime = lastBlockTime + 2_000;
      const thirdEndTime = lastBlockTime + 3_000;

      const fourthStartTime = lastBlockTime + 10;
      const fourthEndTime = lastBlockTime + 63_072_010;

      await erc20fee.approve(stakingContract.address, getBigNumber(50_000));

      await erc20fee.updateExcludedFromFee(stakingContract.address, true);

      await stakingContract.addStakingPool(
        getBigNumber(10_000),
        getBigNumber(1),
        erc20fee.address,
        firstStartTime,
        firstEndTime,
        1_000
      );

      await stakingContract.addStakingPool(
        getBigNumber(20_000),
        getBigNumber(1),
        erc20fee.address,
        secondStartTime,
        secondEndTime,
        1_000
      );

      await stakingContract.addStakingPool(
        getBigNumber(10_000),
        getBigNumber(1),
        erc20fee.address,
        thirdStartTime,
        thirdEndTime,
        1_000
      );

      await stakingContract.addStakingPool(
        getBigNumber(10_000),
        getBigNumber(1),
        erc20fee.address,
        fourthStartTime,
        fourthEndTime,
        5_000
      );

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(5_000));

      await stakingContract.connect(alice).stake(4, getBigNumber(5_000));

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(5_000));

      await stakingContract.connect(alice).stake(4, getBigNumber(5_000));

      await setNextBlockTimestampAndAdvanceBlock(lastBlockTime + 1_050);

      const stakingPools = await stakingContract.getAllStakingPools();

      expect(stakingPools.length).to.be.equal(4);

      expect(stakingPools[0].id).to.be.equal(1);
      expect(stakingPools[0].rewardsAdded).to.be.equal(getBigNumber(10_000));
      expect(stakingPools[0].rewardsDistributed).to.be.equal(0);
      expect(stakingPools[0].minimumToStake).to.be.equal(getBigNumber(1));
      expect(stakingPools[0].token).to.be.equal(erc20fee.address);
      expect(stakingPools[0].startTime).to.be.equal(firstStartTime);
      expect(stakingPools[0].endTime).to.be.equal(firstEndTime);
      expect(stakingPools[0].apr).to.be.equal(1_000);
      expect(stakingPools[0].status).to.be.equal(3);

      expect(stakingPools[1].id).to.be.equal(2);
      expect(stakingPools[1].rewardsAdded).to.be.equal(getBigNumber(20_000));
      expect(stakingPools[1].rewardsDistributed).to.be.equal(0);
      expect(stakingPools[1].minimumToStake).to.be.equal(getBigNumber(1));
      expect(stakingPools[1].token).to.be.equal(erc20fee.address);
      expect(stakingPools[1].startTime).to.be.equal(secondStartTime);
      expect(stakingPools[1].endTime).to.be.equal(secondEndTime);
      expect(stakingPools[1].apr).to.be.equal(1_000);
      expect(stakingPools[1].status).to.be.equal(1);

      expect(stakingPools[2].id).to.be.equal(3);
      expect(stakingPools[2].rewardsAdded).to.be.equal(getBigNumber(10_000));
      expect(stakingPools[2].rewardsDistributed).to.be.equal(0);
      expect(stakingPools[2].minimumToStake).to.be.equal(getBigNumber(1));
      expect(stakingPools[2].token).to.be.equal(erc20fee.address);
      expect(stakingPools[2].startTime).to.be.equal(thirdStartTime);
      expect(stakingPools[2].endTime).to.be.equal(thirdEndTime);
      expect(stakingPools[2].apr).to.be.equal(1_000);
      expect(stakingPools[2].status).to.be.equal(0);

      expect(stakingPools[3].id).to.be.equal(4);
      expect(stakingPools[3].rewardsAdded).to.be.equal(getBigNumber(10_000));
      expect(stakingPools[3].rewardsDistributed).to.be.equal(getBigNumber(10_000));
      expect(stakingPools[3].minimumToStake).to.be.equal(getBigNumber(1));
      expect(stakingPools[3].token).to.be.equal(erc20fee.address);
      expect(stakingPools[3].startTime).to.be.equal(fourthStartTime);
      expect(stakingPools[3].endTime).to.be.equal(fourthEndTime);
      expect(stakingPools[3].apr).to.be.equal(5_000);
      expect(stakingPools[3].status).to.be.equal(2);
    });
  });
});
