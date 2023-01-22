import { ethers } from "hardhat";
import { expect } from "chai";
import { getBigNumber, getLastBlockTimestamp, setNextBlockTimestamp } from "./utilities";

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
      const preUserStakeIds = await stakingContract.getAllUserStakeIds(alice.address);
      const preStakeData = await stakingContract.stakes(1);
      const preRewardsDistributed = await stakingContract.rewardsDistributed(1);
      const preUserBalance = await erc20fee.balanceOf(alice.address);
      const preStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      await erc20fee.connect(alice).approve(stakingContract.address, getBigNumber(1_000));

      await expect(stakingContract.connect(alice).stake(1, getBigNumber(1_000)))
        .to.emit(stakingContract, StakingPoolFixedApr_Staked_Event)
        .withArgs(alice.address, 1, 1, getBigNumber(1_000), BigNumber.from("11415525114155200"), endTime);

      const postUserStakeIds = await stakingContract.getAllUserStakeIds(alice.address);
      const postStakeData = await stakingContract.stakes(1);
      const postRewardsDistributed = await stakingContract.rewardsDistributed(1);
      const postUserBalance = await erc20fee.balanceOf(alice.address);
      const postStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      // Pre Data

      expect(preUserStakeIds.length).to.be.equal(0);

      expect(preStakeData.stakingPoolId).to.be.equal(0);
      expect(preStakeData.staked).to.be.equal(0);
      expect(preStakeData.rewards).to.be.equal(0);
      expect(preStakeData.owner).to.be.equal(ethers.constants.AddressZero);
      expect(preStakeData.unstakePossibleAt).to.be.equal(0);

      expect(preRewardsDistributed).to.be.equal(0);

      expect(preUserBalance).to.be.equal(getBigNumber(10_000));

      expect(preStakingContractBalance).to.be.equal(getBigNumber(10_000));

      // Post Data

      expect(postUserStakeIds.length).to.be.equal(1);
      expect(postUserStakeIds[0]).to.be.equal(1);

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

      const preUserStakeIds = await stakingContract.getAllUserStakeIds(bob.address);
      const preStakeData = await stakingContract.stakes(2);
      const preRewardsDistributed = await stakingContract.rewardsDistributed(1);
      const preUserBalance = await erc20fee.balanceOf(bob.address);
      const preStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      await expect(stakingContract.connect(bob).stake(1, getBigNumber(10_000)))
        .to.emit(stakingContract, StakingPoolFixedApr_Staked_Event)
        .withArgs(bob.address, 2, 1, getBigNumber(10_000), BigNumber.from("114155251141552000"), endTime);

      const postUserStakeIds = await stakingContract.getAllUserStakeIds(bob.address);
      const postStakeData = await stakingContract.stakes(2);
      const postRewardsDistributed = await stakingContract.rewardsDistributed(1);
      const postUserBalance = await erc20fee.balanceOf(bob.address);
      const postStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      // Pre Data

      expect(preUserStakeIds.length).to.be.equal(0);

      expect(preStakeData.stakingPoolId).to.be.equal(0);
      expect(preStakeData.staked).to.be.equal(0);
      expect(preStakeData.rewards).to.be.equal(0);
      expect(preStakeData.owner).to.be.equal(ethers.constants.AddressZero);
      expect(preStakeData.unstakePossibleAt).to.be.equal(0);

      expect(preRewardsDistributed).to.be.equal(BigNumber.from("11415525114155200"));

      expect(preUserBalance).to.be.equal(getBigNumber(10_000));

      expect(preStakingContractBalance).to.be.equal(getBigNumber(11_000));

      // Post Data

      expect(postUserStakeIds.length).to.be.equal(1);
      expect(postUserStakeIds[0]).to.be.equal(2);

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

      const preUserStakeIds = await stakingContract.getAllUserStakeIds(alice.address);
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

      const postUserStakeIds = await stakingContract.getAllUserStakeIds(alice.address);
      const postFirstStakeData = await stakingContract.stakes(1);
      const postSecondStakeData = await stakingContract.stakes(2);
      const postFirstPoolRewardsDistributed = await stakingContract.rewardsDistributed(1);
      const postSecondPoolRewardsDistributed = await stakingContract.rewardsDistributed(2);
      const postUserBalance = await erc20fee.balanceOf(alice.address);
      const postStakingContractBalance = await erc20fee.balanceOf(stakingContract.address);

      // Pre Data

      expect(preUserStakeIds.length).to.be.equal(1);
      expect(preUserStakeIds[0]).to.be.equal(1);

      expect(preSecondStakeData.stakingPoolId).to.be.equal(0);
      expect(preSecondStakeData.staked).to.be.equal(0);
      expect(preSecondStakeData.rewards).to.be.equal(0);
      expect(preSecondStakeData.owner).to.be.equal(ethers.constants.AddressZero);
      expect(preSecondStakeData.unstakePossibleAt).to.be.equal(0);

      expect(preSecondPoolRewardsDistributed).to.be.equal(0);

      expect(preUserBalance).to.be.equal(getBigNumber(9_000));

      expect(preStakingContractBalance).to.be.equal(getBigNumber(21_000));

      // Post Data

      expect(postUserStakeIds.length).to.be.equal(2);
      expect(postUserStakeIds[0]).to.be.equal(1);
      expect(postUserStakeIds[1]).to.be.equal(2);

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
});
