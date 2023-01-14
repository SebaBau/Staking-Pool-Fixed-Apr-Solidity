// SPDX-License-Identifier: MIT

import "../interfaces/IERC20.sol";

pragma solidity 0.8.17;

library SafeERC20 {
    error SafeERC20_OnlyContractAllowed();
    error SafeERC20_TransferFailed();

    function safeTransfer(
        IERC20 token,
        address to,
        uint256 amount
    ) internal {
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transfer.selector, to, amount)
        );
        _validateTransfer(address(token), success, data);
    }

    function safeTransferFrom(
        IERC20 token,
        address from,
        address to,
        uint256 amount
    ) internal returns (uint256) {
        uint256 preTransferBalance = IERC20(token).balanceOf(to);
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transferFrom.selector, from, to, amount)
        );
        _validateTransfer(address(token), success, data);
        uint256 postTransferBalance = IERC20(token).balanceOf(to);

        return postTransferBalance - preTransferBalance;
    }

    function _validateTransfer(
        address token,
        bool success,
        bytes memory data
    ) private view {
        if (success) {
            if (data.length == 0) {
                if (token.code.length == 0) revert SafeERC20_OnlyContractAllowed();
            } else {
                if (!abi.decode(data, (bool))) revert SafeERC20_TransferFailed();
            }
        } else {
            revert SafeERC20_TransferFailed();
        }
    }
}
