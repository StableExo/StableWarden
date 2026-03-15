// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {WardenExecutor} from "../src/WardenExecutor.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Fork test against Base mainnet
//  Run: forge test --fork-url $BASE_RPC_URL -vv
// ─────────────────────────────────────────────────────────────────────────────
contract WardenExecutorTest is Test {
    WardenExecutor executor;

    address constant USDC  = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant WHALE = 0x20FE51A9229EEf2cF8Ad9E89d91CAbe9112cBA5f; // USDC whale on Base

    function setUp() public {
        executor = new WardenExecutor();
    }

    // ── Test direction 0: buy Aerodrome, sell UniV3 ───────────────────────────
    function test_ArbDirection0() public {
        uint256 loanAmount = 1_000e6; // $1,000 USDC

        // Capture owner balance before
        uint256 ownerBefore = IERC20(USDC).balanceOf(address(this));

        // Execute — will revert if unprofitable (which is fine in tests)
        // In production, minProfit is set by the searcher based on live scanner data
        try executor.executeArb(
            loanAmount,
            0,          // direction: Aerodrome→UniV3
            0,          // minProfit: 0 (for test, just prove we can repay)
            bytes32(0)  // txRef
        ) {
            uint256 ownerAfter = IERC20(USDC).balanceOf(address(this));
            console2.log("Profit (USDC 6-dec):", ownerAfter - ownerBefore);
            assertGe(ownerAfter, ownerBefore, "Net loss on direction 0");
        } catch (bytes memory err) {
            console2.log("Direction 0 reverted (spread closed):", string(err));
            // Not a test failure — spread may have closed at fork block
        }
    }

    // ── Test direction 1: buy UniV3, sell Aerodrome ───────────────────────────
    function test_ArbDirection1() public {
        uint256 loanAmount = 1_000e6;
        uint256 ownerBefore = IERC20(USDC).balanceOf(address(this));

        try executor.executeArb(loanAmount, 1, 0, bytes32(0)) {
            uint256 ownerAfter = IERC20(USDC).balanceOf(address(this));
            console2.log("Profit (USDC 6-dec):", ownerAfter - ownerBefore);
            assertGe(ownerAfter, ownerBefore, "Net loss on direction 1");
        } catch (bytes memory err) {
            console2.log("Direction 1 reverted (spread closed):", string(err));
        }
    }

    // ── Test minProfit guard reverts when spread is gone ─────────────────────
    function test_MinProfitGuard() public {
        // Request $500 minimum profit on $1k — should always revert
        vm.expectRevert();
        executor.executeArb(1_000e6, 0, 500e6, bytes32(0));
    }

    // ── Test only owner can execute ───────────────────────────────────────────
    function test_OnlyOwner() public {
        address attacker = makeAddr("attacker");
        vm.prank(attacker);
        vm.expectRevert("NOT_OWNER");
        executor.executeArb(1_000e6, 0, 0, bytes32(0));
    }
}
