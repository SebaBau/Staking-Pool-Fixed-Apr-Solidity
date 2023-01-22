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
    error StakingPoolFixedApr_StakeNotExists();
    error StakingPoolFixedApr_CannotUnstakeYet();
    error StakingPoolFixedApr_CannotBeforeEndTime();
    error StakingPoolFixedApr_NothingToWithdraw();

    enum PoolStatus {
        Pending,
        Open,
        OpenWithoutRewards,
        Closed
    }

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

    struct StakeDTO {
        uint256 stakeId;
        uint256 stakingPoolId;
        uint256 staked;
        uint256 rewards;
        uint64 unstakePossibleAt;
    }

    struct StakingPoolDTO {
        uint256 rewardsAdded;
        uint256 rewardsDistributed;
        uint256 minimumToStake;
        IERC20 token;
        uint64 startTime;
        uint64 endTime;
        uint16 apr;
        PoolStatus status;
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

    event Staked(
        address indexed user,
        uint256 indexed stakeId,
        uint256 stakingPoolId,
        uint256 staked,
        uint256 rewards,
        uint64 unstakePossibleAt
    );

    event Unstaked(address indexed user, uint256 indexed stakeId);

    event Withdrawn(uint256 indexed stakingPoolId, uint256 amount);

    modifier isStakingPoolExists(uint256 stakingPoolId) {
        if (stakingPools[stakingPoolId].startTime == 0) revert StakingPoolFixedApr_PoolNotExists();
        _;
    }

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

    function stake(uint256 stakingPoolId, uint256 amount) external isStakingPoolExists(stakingPoolId) {
        StakingPool memory stakingPool = stakingPools[stakingPoolId];

        if (stakingPool.endTime <= block.timestamp) revert StakingPoolFixedApr_PoolClosed();

        if (amount < stakingPool.minimumToStake) revert StakingPoolFixedApr_AmountIsBelowMinimumToStake();

        uint64 startTime = block.timestamp > stakingPool.startTime ? uint64(block.timestamp) : stakingPool.startTime;

        uint256 calculatedRewards = _calculateRewards(amount, startTime, stakingPool.endTime, stakingPool.apr);

        if (calculatedRewards == 0) revert StakingPoolFixedApr_ZeroCalculatedRewards();

        if (stakingPool.rewardsAdded - rewardsDistributed[stakingPoolId] < calculatedRewards)
            revert StakingPoolFixedApr_NotEnoughTokensForReward();

        uint256 stakeId = ++lastStakeId;

        Stake storage userStake = stakes[stakeId];
        userStake.stakingPoolId = stakingPoolId;
        userStake.staked = amount;
        userStake.rewards = calculatedRewards;
        userStake.owner = msg.sender;
        userStake.unstakePossibleAt = stakingPool.endTime;

        userStakeIds[msg.sender].push(stakeId);

        rewardsDistributed[stakingPoolId] += calculatedRewards;

        if (amount != stakingPool.token.safeTransferFrom(msg.sender, address(this), amount))
            revert StakingPoolFixedApr_IncorrectAmountTransferred();

        emit Staked(msg.sender, stakeId, stakingPoolId, amount, calculatedRewards, stakingPool.endTime);
    }

    function unstake(uint256 stakeId) external {
        Stake memory userStake = stakes[stakeId];

        if (userStake.owner != msg.sender) revert StakingPoolFixedApr_StakeNotExists();

        if (userStake.unstakePossibleAt >= block.timestamp) revert StakingPoolFixedApr_CannotUnstakeYet();

        uint256 toWithdraw = userStake.staked + userStake.rewards;

        uint256 stakingPoolId = userStake.stakingPoolId;

        delete stakes[stakeId];

        stakingPools[stakingPoolId].token.safeTransfer(msg.sender, toWithdraw);

        emit Unstaked(msg.sender, stakeId);
    }

    function withdrawUnusedRewards(uint256 stakingPoolId) external onlyOwner isStakingPoolExists(stakingPoolId) {
        StakingPool memory stakingPool = stakingPools[stakingPoolId];

        if (stakingPool.endTime >= block.timestamp) revert StakingPoolFixedApr_CannotBeforeEndTime();

        uint256 amountToWithdraw = stakingPool.rewardsAdded - rewardsDistributed[stakingPoolId];

        if (amountToWithdraw == 0) revert StakingPoolFixedApr_NothingToWithdraw();

        rewardsDistributed[stakingPoolId] += amountToWithdraw;

        stakingPool.token.safeTransfer(owner, amountToWithdraw);

        emit Withdrawn(stakingPoolId, amountToWithdraw);
    }

    function getAllUserStakeIds(address user) external view returns (uint256[] memory) {
        return userStakeIds[user];
    }

    function getAllUserStakes(address user) external view returns (StakeDTO[] memory userStakes) {
        uint256 userStakeIdLength = userStakeIds[user].length;
        userStakes = new StakeDTO[](userStakeIdLength);

        for (uint256 i = 0; i < userStakeIdLength; i++) {
            StakeDTO memory userStakeDto;

            Stake memory userStake = stakes[userStakeIds[user][i]];

            userStakeDto.stakeId = userStakeIds[user][i];
            userStakeDto.stakingPoolId = userStake.stakingPoolId;
            userStakeDto.staked = userStake.staked;
            userStakeDto.rewards = userStake.rewards;
            userStakeDto.unstakePossibleAt = userStake.unstakePossibleAt;

            userStakes[i] = userStakeDto;
        }
    }

    function getAllStakingPools() external view returns (StakingPoolDTO[] memory stakingPoolDtos) {
        uint256 stakingPoolsAmount = lastStakingPoolId;
        stakingPoolDtos = new StakingPoolDTO[](stakingPoolsAmount);

        for (uint256 i = 1; i <= stakingPoolsAmount; i++) {
            StakingPool memory stakingPool = stakingPools[i];

            uint256 rewardsDistributed_ = rewardsDistributed[i];

            StakingPoolDTO memory stakingPoolDto;
            stakingPoolDto.rewardsAdded = stakingPool.rewardsAdded;
            stakingPoolDto.rewardsDistributed = rewardsDistributed_;
            stakingPoolDto.minimumToStake = stakingPool.minimumToStake;
            stakingPoolDto.token = stakingPool.token;
            stakingPoolDto.startTime = stakingPool.startTime;
            stakingPoolDto.endTime = stakingPool.endTime;
            stakingPoolDto.apr = stakingPool.apr;
            stakingPoolDto.status = _calculatePoolStatus(
                stakingPool.rewardsAdded,
                rewardsDistributed_,
                block.timestamp,
                stakingPool.startTime,
                stakingPool.endTime
            );

            stakingPoolDtos[i - 1] = stakingPoolDto;
        }
    }

    function getAllOpenStakingPoolsWithAvailableRewards()
        external
        view
        returns (StakingPoolDTO[] memory stakingPoolDtos)
    {
        uint256 stakingPoolsAmount = lastStakingPoolId;
        stakingPoolDtos = new StakingPoolDTO[](stakingPoolsAmount);

        for (uint256 i = 1; i <= stakingPoolsAmount; i++) {
            StakingPool memory stakingPool = stakingPools[i];

            uint256 rewardsDistributed_ = rewardsDistributed[i];

            PoolStatus status = _calculatePoolStatus(
                stakingPool.rewardsAdded,
                rewardsDistributed_,
                block.timestamp,
                stakingPool.startTime,
                stakingPool.endTime
            );

            if (status != PoolStatus.Open) continue;
            else {
                StakingPoolDTO memory stakingPoolDto;
                stakingPoolDto.rewardsAdded = stakingPool.rewardsAdded;
                stakingPoolDto.rewardsDistributed = rewardsDistributed_;
                stakingPoolDto.minimumToStake = stakingPool.minimumToStake;
                stakingPoolDto.token = stakingPool.token;
                stakingPoolDto.startTime = stakingPool.startTime;
                stakingPoolDto.endTime = stakingPool.endTime;
                stakingPoolDto.apr = stakingPool.apr;
                stakingPoolDto.status = PoolStatus.Open;

                stakingPoolDtos[i - 1] = stakingPoolDto;
            }
        }
    }

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

    function _calculatePoolStatus(
        uint256 rewardsAdded,
        uint256 rewardsDistributed_,
        uint256 currentTime,
        uint64 startTime,
        uint64 endTime
    ) private pure returns (PoolStatus) {
        if (startTime > currentTime) return PoolStatus.Pending;
        else if (startTime <= currentTime && endTime > currentTime && rewardsAdded == rewardsDistributed_)
            return PoolStatus.OpenWithoutRewards;
        else if (startTime <= currentTime && endTime > currentTime) return PoolStatus.Open;
        else return PoolStatus.Closed;
    }
}
