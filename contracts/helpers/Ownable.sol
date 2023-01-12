// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

contract Ownable {
    // -----------------------------------------------------------------------
    //                               Errors
    // -----------------------------------------------------------------------

    error Ownable_NotOwner();
    error Ownable_NotPendingOwner();
    error Ownable_ZeroOwner();

    // -----------------------------------------------------------------------
    //                           State Variables
    // -----------------------------------------------------------------------

    address public owner;
    address public pendingOwner;

    // -----------------------------------------------------------------------
    //                               Events
    // -----------------------------------------------------------------------

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // -----------------------------------------------------------------------
    //                              Modifiers
    // -----------------------------------------------------------------------

    /// @dev Throws if called by any account other than the Owner.
    modifier onlyOwner() {
        if (owner != msg.sender) {
            revert Ownable_NotOwner();
        }
        _;
    }

    // -----------------------------------------------------------------------
    //                             Constructor
    // -----------------------------------------------------------------------

    constructor() {
        _transferOwnership(msg.sender);
    }

    // -----------------------------------------------------------------------
    //                          External Functions
    // -----------------------------------------------------------------------

    /**
     * @dev Transfers ownership to newOwner. Either directly or claimable by the pendingOwner.
     *      Can only be invoked by the current owner.
     */
    function transferOwnership(address newOwner, bool direct) external onlyOwner {
        if (newOwner == address(0)) {
            revert Ownable_ZeroOwner();
        }

        if (direct) {
            _transferOwnership(newOwner);
        } else {
            pendingOwner = newOwner;
        }
    }

    /// @dev Needs to be called by `pendingOwner` to claim ownership.
    function claimOwnership() external {
        if (pendingOwner != msg.sender) {
            revert Ownable_NotPendingOwner();
        }

        _transferOwnership(pendingOwner);
    }

    // -----------------------------------------------------------------------
    //                          Private Functions
    // -----------------------------------------------------------------------

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     *      Sets pendingOwner to address(0)
     *      Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) private {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
        pendingOwner = address(0);
    }
}
