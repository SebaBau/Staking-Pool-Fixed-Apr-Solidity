// SPDX-License-Identifier: MIT

import "./helpers/Ownable.sol";

pragma solidity 0.8.17;

/// @title
/// @notice
contract StakingPoolFixedApr is Ownable {
    struct StakingPool {
        uint256 rewardsAdded;
        address token;
        uint64 startTime;
        uint32 unstakePeriod;
        uint64 endTime;
        uint16 penaltyFee;
        uint16 apr;
    }

    uint256 private lastStakingPoolId;

    mapping(uint256 => StakingPool) public stakingPools;
    mapping(uint256 => uint256) public rewardsDistributedPerStakingPool;

    event StakingPoolAdded(
        uint256 indexed stakingPoolId,
        uint256 rewards,
        address token,
        uint64 startTime,
        uint64 endTime,
        uint32 unstakePeriod,
        uint16 penaltyFee,
        uint16 apr
    );

    function addStakingPool(
        uint256 rewards,
        address token_,
        uint64 startTime_,
        uint64 endTime_,
        uint32 unstakePeriod_,
        uint16 penaltyFee_,
        uint16 apr_
    ) external onlyOwner {
        uint256 stakingPoolId = ++lastStakingPoolId;

        StakingPool storage stakingPool = stakingPools[stakingPoolId];
        stakingPool.rewardsAdded = rewards;
        stakingPool.token = token_;
        stakingPool.startTime = startTime_;
        stakingPool.endTime = endTime_;
        stakingPool.unstakePeriod = unstakePeriod_;
        stakingPool.penaltyFee = penaltyFee_;
        stakingPool.apr = apr_;

        emit StakingPoolAdded(stakingPoolId, rewards, token_, startTime_, endTime_, unstakePeriod_, penaltyFee_, apr_);
    }

    function stake() external {}

    function requestUnstake() external {}

    function unstake() external {}

    function unstakeWithFee() external {}

    function getAllStakingPools() external view returns (StakingPool[] memory stakingPools) {}

    function getAllActiveStakingPools() external view returns (StakingPool[] memory stakingPools) {}
}
