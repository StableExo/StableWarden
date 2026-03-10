// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IBalancerVault
 * @notice Interface for Balancer V2 Vault flash loan functionality
 * @dev Balancer offers 0% fee flash loans!
 * Balancer Vault Address (same across all chains incl. Base):
 * 0xBA12222222228d8Ba445958a75a0704d566BF2C8
 */
interface IBalancerVault {
    function flashLoan(
        IFlashLoanRecipient recipient,
        IERC20[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;
}

interface IFlashLoanRecipient {
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external;
}
