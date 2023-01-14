// SPDX-License-Identifier: MIT

import "./interfaces/IERC20.sol";
import "./helpers/Ownable.sol";
import "./libraries/SafeERC20.sol";

pragma solidity 0.8.17;

/// @title
/// @notice
contract StakingPoolFixedApr is Ownable {
    using SafeERC20 for IERC20;

    error StakingPoolFixedApr_IncorrectAmountTransferred();

    struct StakingPool {
        uint256 rewardsAdded;
        IERC20 token;
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
        uint16 apr
    );

    function addStakingPool(
        uint256 rewards,
        IERC20 token_,
        uint64 startTime_,
        uint64 endTime_,
        uint16 apr_
    ) external onlyOwner {
        uint256 stakingPoolId = ++lastStakingPoolId;

        StakingPool storage stakingPool = stakingPools[stakingPoolId];
        stakingPool.rewardsAdded = rewards;
        stakingPool.token = token_;
        stakingPool.startTime = startTime_;
        stakingPool.endTime = endTime_;
        stakingPool.apr = apr_;

        if (rewards != token_.safeTransferFrom(msg.sender, address(this), rewards))
            revert StakingPoolFixedApr_IncorrectAmountTransferred();

        emit StakingPoolAdded(stakingPoolId, rewards, address(token_), startTime_, endTime_, apr_);
    }

    function stake() external {}

    function unstake() external {}

    function getAllStakingPools() external view returns (StakingPool[] memory stakingPools) {}

    function getAllActiveStakingPools() external view returns (StakingPool[] memory stakingPools) {}
}
