// SPDX-License-Identifier: MIT

import "./interfaces/IERC20.sol";

import "./helpers/Ownable.sol";

import "./libraries/SafeERC20.sol";
import "./libraries/StableMath.sol";

pragma solidity 0.8.17;

/// @title
/// @notice
contract StakingPoolsFixedApr is Ownable {
    using SafeERC20 for IERC20;
    using StableMath for uint256;

    error StakingPoolFixedApr_IncorrectAmountTransferred();
    error StakingPoolFixedApr_ZeroRewardsAmount();
    error StakingPoolFixedApr_StartTimeMustBeInTheFuture();
    error StakingPoolFixedApr_StartTimeMustBeLaterThanEndTime();
    error StakingPoolFixedApr_PoolNotExists();
    error StakingPoolFixedApr_PoolClosed();
    error StakingPoolFixedApr_AmountIsBelowMinimumToStake();
    error StakingPoolFixedApr_ZeroCalculatedRewards();
    error StakingPoolFixedApr_NotEnoughTokensForReward();

    struct StakingPool {
        uint256 rewardsAdded;
        uint256 minimumToStake;
        IERC20 token;
        uint64 startTime;
        uint64 endTime;
        uint16 apr;
    }

    struct Stake {
        uint256 stakingPoolId;
        uint256 staked;
        uint256 rewards;
        address owner;
        uint64 unstakePossibleAt;
    }

    uint256 private lastStakingPoolId;
    uint256 private lastStakeId;

    mapping(uint256 => StakingPool) public stakingPools;
    mapping(uint256 => uint256) public rewardsDistributed;
    mapping(uint256 => Stake) public stakes;
    mapping(address => uint256[]) public userStakeIds;

    event StakingPoolAdded(
        uint256 indexed stakingPoolId,
        uint256 rewardsAdded,
        uint256 minimumToStake,
        address token,
        uint64 startTime,
        uint64 endTime,
        uint16 apr
    );

    function addStakingPool(
        uint256 rewardsAmount,
        uint256 minimumToStake_,
        IERC20 token_,
        uint64 startTime_,
        uint64 endTime_,
        uint16 apr_
    ) external onlyOwner {
        uint256 stakingPoolId = ++lastStakingPoolId;

        _validateStakingPoolData(rewardsAmount, startTime_, endTime_);

        StakingPool storage stakingPool = stakingPools[stakingPoolId];
        stakingPool.rewardsAdded = rewardsAmount;
        stakingPool.minimumToStake = minimumToStake_;
        stakingPool.token = token_;
        stakingPool.startTime = startTime_;
        stakingPool.endTime = endTime_;
        stakingPool.apr = apr_;

        if (rewardsAmount != token_.safeTransferFrom(msg.sender, address(this), rewardsAmount))
            revert StakingPoolFixedApr_IncorrectAmountTransferred();

        emit StakingPoolAdded(
            stakingPoolId,
            rewardsAmount,
            minimumToStake_,
            address(token_),
            startTime_,
            endTime_,
            apr_
        );
    }

    function stake(uint256 stakingPoolId, uint256 amount) external {
        StakingPool memory stakingPool = stakingPools[stakingPoolId];

        if (stakingPool.startTime == 0) revert StakingPoolFixedApr_PoolNotExists();

        if (stakingPool.endTime <= block.timestamp) revert StakingPoolFixedApr_PoolClosed();

        if (amount < stakingPool.minimumToStake) revert StakingPoolFixedApr_AmountIsBelowMinimumToStake();

        uint64 startTime = block.timestamp > stakingPool.startTime ? uint64(block.timestamp) : stakingPool.startTime;

        uint256 calculatedRewards = _calculateRewards(amount, startTime, stakingPool.endTime, stakingPool.apr);

        if (calculatedRewards == 0) revert StakingPoolFixedApr_ZeroCalculatedRewards();

        if (stakingPool.rewardsAdded - rewardsDistributed[stakingPoolId] < calculatedRewards)
            revert StakingPoolFixedApr_NotEnoughTokensForReward();

        Stake storage userStake = stakes[++lastStakeId];
        userStake.stakingPoolId = stakingPoolId;
        userStake.staked = amount;
        userStake.rewards = calculatedRewards;
        userStake.owner = msg.sender;
        userStake.unstakePossibleAt = stakingPool.endTime;

        if (amount != stakingPool.token.safeTransferFrom(msg.sender, address(this), amount))
            revert StakingPoolFixedApr_IncorrectAmountTransferred();
    }

    function unstake() external {}

    function getAllUserStakes(address user) external view returns (Stake[] memory stakes) {}

    function getAllStakingPools() external view returns (StakingPool[] memory stakingPools) {}

    function getAllActiveStakingPools() external view returns (StakingPool[] memory stakingPools) {}

    function _deleteFromStakeIds(address user, uint256 stakeId) private {
        uint256 length = userStakeIds[user].length;

        if (length > 0) {
            for (uint256 i = 0; i < length; i++) {
                if (userStakeIds[user][i] == stakeId) {
                    userStakeIds[user][i] = userStakeIds[user][length - 1];
                    userStakeIds[user].pop();
                    break;
                }
            }
        } else {
            userStakeIds[user].pop();
        }
    }

    function _validateStakingPoolData(
        uint256 rewardsAmount,
        uint64 startTime,
        uint64 endTime
    ) private view {
        if (rewardsAmount == 0) revert StakingPoolFixedApr_ZeroRewardsAmount();

        if (startTime < block.timestamp) revert StakingPoolFixedApr_StartTimeMustBeInTheFuture();

        if (startTime >= endTime) revert StakingPoolFixedApr_StartTimeMustBeLaterThanEndTime();
    }

    function _calculateRewards(
        uint256 stakedAmount,
        uint64 startTime,
        uint64 endTime,
        uint16 apr
    ) private pure returns (uint256) {
        uint256 annualAmount = (stakedAmount * apr) / 10000;
        uint256 period = endTime - startTime;
        uint256 timeRatio = period.divPrecisely(365 days);
        return annualAmount.mulTruncate(timeRatio);
    }
}
