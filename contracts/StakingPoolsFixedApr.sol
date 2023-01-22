// SPDX-License-Identifier: MIT

import "./interfaces/IERC20.sol";

import "./helpers/Ownable.sol";

import "./libraries/SafeERC20.sol";
import "./libraries/StableMath.sol";

pragma solidity 0.8.17;

/**
 * @notice This is staking contract which allows for owner create Pools with defined start and end times, token,
 *         APR, minimum amount tokens to stake and rewards. APR is always fixed. Users have to stake given token
 *         defined by the owner in the given Pool and they also earn rewards in the same token. Users can join
 *         to Pool, stake tokens and earn rewards if given Pool has available rewards and isn't closed. Owner of
 *         this contract can withdraw unused rewards when Pool will be closed.
 */
contract StakingPoolsFixedApr is Ownable {
    // -----------------------------------------------------------------------
    //                                Libraries
    // -----------------------------------------------------------------------

    using SafeERC20 for IERC20;
    using StableMath for uint256;

    // -----------------------------------------------------------------------
    //                                 Errors
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    //                                 Enums
    // -----------------------------------------------------------------------

    /**
     * @dev Enum used in external view function which allows to show what is the
     *      status of current Pool.
     * @custom:Pending - Pool hasn't started yet and has available rewards.
     * @custom:Open - Pool already started and has available rewards.
     * @custom:WithoutRewards - Pool doesn't have any available rewards.
     * @custom:Closed - Pool is closed.
     */
    enum PoolStatus {
        Pending,
        Open,
        WithoutRewards,
        Closed
    }

    // -----------------------------------------------------------------------
    //                                 Structs
    // -----------------------------------------------------------------------

    /// @dev Struct used in state variables which stores Pool configuration.
    struct StakingPool {
        /// @dev Rewards added for the entire Pool.
        uint256 rewardsAdded;
        /// @dev Minimum amount of tokens which is required to join to this Pool.
        uint256 minimumToStake;
        /// @dev ERC-20 token used in this Pool.
        IERC20 token;
        /// @dev Pool start time.
        uint64 startTime;
        /// @dev Pool end time.
        uint64 endTime;
        /// @dev APR - 100 = 1%.
        uint16 apr;
    }

    /// @dev Struct used in state variables to store every user stake data.
    struct Stake {
        /// @dev Staking Pool id to which given stake belongs to.
        uint256 stakingPoolId;
        /// @dev Amount of staked tokens.
        uint256 staked;
        /// @dev Rewards which user will earn.
        uint256 rewards;
        /// @dev Owner of the given stake.
        address owner;
        /// @dev First possible time when user will be able to unstake his tokens with rewards.
        uint64 unstakePossibleAt;
    }

    /// @dev Struct used in view functions to return Stake data.
    struct StakeDTO {
        /// @dev Id of the given Stake.
        uint256 id;
        /// @dev Staking Pool id to which given stake belongs to.
        uint256 stakingPoolId;
        /// @dev Amount of staked tokens.
        uint256 staked;
        /// @dev Rewards which user will earn.
        uint256 rewards;
        /// @dev First possible time when user will be able to unstake his tokens with rewards.
        uint64 unstakePossibleAt;
    }

    /// @dev Struct used in view function to return Staking Pool data.
    struct StakingPoolDTO {
        /// @dev Id of the given Staking Pool.
        uint256 id;
        /// @dev Rewards added for the entire Pool.
        uint256 rewardsAdded;
        /// @dev Currently distributed rewards.
        uint256 rewardsDistributed;
        /// @dev Minimum amount of tokens which is required to join to this Pool.
        uint256 minimumToStake;
        /// @dev ERC-20 token used in this Pool.
        IERC20 token;
        /// @dev Pool start time.
        uint64 startTime;
        /// @dev Pool end time.
        uint64 endTime;
        /// @dev APR - 100 = 1%.
        uint16 apr;
        /// @dev Current Staking Pool status (more in enum section).
        PoolStatus status;
    }

    // -----------------------------------------------------------------------
    //                              State Variables
    // -----------------------------------------------------------------------

    /// @dev Last added Staking Pool id. Used during creating new Pool by incrementing by 1.
    uint256 private lastStakingPoolId;
    /// @dev Last added Stake id. Used during creating new Stake by incrementing by 1.
    uint256 private lastStakeId;

    /// @dev Mapping which stores all Staking Pools. Id => Staking Pool.
    mapping(uint256 => StakingPool) public stakingPools;
    /// @dev Mapping which stores currently distributed rewards for Pools. Staking Pool Id => Distributed rewards.
    mapping(uint256 => uint256) public rewardsDistributed;
    /// @dev Mapping which stores all Stakes. Id => Stake
    mapping(uint256 => Stake) public stakes;
    /// @dev Mapping which stores all user Stake ids. Address => Array of ids.
    mapping(address => uint256[]) public userStakeIds;

    // -----------------------------------------------------------------------
    //                                  Events
    // -----------------------------------------------------------------------

    /**
     * @dev Emitted when new Staking Pool was added.
     * @param stakingPoolId Id.
     * @param rewardsAdded Amount of rewards.
     * @param minimumToStake amount of tokens which is required to join to this Pool.
     * @param token Added of ERC-20 token used in this Pool.
     * @param startTime Pool start time.
     * @param endTime Pool end time.
     * @param apr APR - 100 = 1%.
     */
    event StakingPoolAdded(
        uint256 indexed stakingPoolId,
        uint256 rewardsAdded,
        uint256 minimumToStake,
        address token,
        uint64 startTime,
        uint64 endTime,
        uint16 apr
    );

    /**
     * @dev Emitted when user stake his tokens.
     * @param user Address which staked his tokens.
     * @param stakeId Id of the new created stake.
     * @param stakingPoolId Id of the Staking Pool to which user joined.
     * @param staked Amount of staked tokens.
     * @param rewards Amount of rewards which user will earn.
     * @param unstakePossibleAt First possible time when user will be able to unstake his tokens with rewards.
     */
    event Staked(
        address indexed user,
        uint256 indexed stakeId,
        uint256 stakingPoolId,
        uint256 staked,
        uint256 rewards,
        uint64 unstakePossibleAt
    );

    /**
     * @dev Emitted when user performed 'unstake' function.
     * @param user Address which performed unstake action.
     * @param stakeId Id of the unstaked Stake.
     */
    event Unstaked(address indexed user, uint256 indexed stakeId);

    /**
     * @dev Emitted when owner withdrew unused rewards.
     * @param stakingPoolId Id of the Staking Pool for which rewards were withdrawn.
     * @param amount Amount of withdrawn unused rewards.
     */
    event Withdrawn(uint256 indexed stakingPoolId, uint256 amount);

    // -----------------------------------------------------------------------
    //                                Modifiers
    // -----------------------------------------------------------------------

    modifier isStakingPoolExists(uint256 stakingPoolId) {
        if (stakingPools[stakingPoolId].startTime == 0) revert StakingPoolFixedApr_PoolNotExists();
        _;
    }

    // -----------------------------------------------------------------------
    //                            External Functions
    // -----------------------------------------------------------------------

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

        uint64 startTime = _calculateStartTime(uint64(block.timestamp), stakingPool.startTime);

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

        if (userStake.unstakePossibleAt > block.timestamp) revert StakingPoolFixedApr_CannotUnstakeYet();

        uint256 toWithdraw = userStake.staked + userStake.rewards;

        uint256 stakingPoolId = userStake.stakingPoolId;

        delete stakes[stakeId];

        _deleteFromStakeIds(msg.sender, stakeId);

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

    function calculateRewards(uint256 stakingPoolId, uint256 amount)
        external
        view
        isStakingPoolExists(stakingPoolId)
        returns (uint256)
    {
        StakingPool memory stakingPool = stakingPools[stakingPoolId];

        uint64 startTime = _calculateStartTime(uint64(block.timestamp), stakingPool.startTime);

        return _calculateRewards(amount, startTime, stakingPool.endTime, stakingPool.apr);
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

            userStakeDto.id = userStakeIds[user][i];
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
            stakingPoolDto.id = i;
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

    // -----------------------------------------------------------------------
    //                             Private Functions
    // -----------------------------------------------------------------------

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
        else if (rewardsAdded == rewardsDistributed_) return PoolStatus.WithoutRewards;
        else if (startTime <= currentTime && endTime > currentTime) return PoolStatus.Open;
        else return PoolStatus.Closed;
    }

    function _calculateStartTime(uint64 currentTimestamp, uint64 stakingPoolStartTime) private pure returns (uint64) {
        return currentTimestamp > stakingPoolStartTime ? currentTimestamp : stakingPoolStartTime;
    }
}
