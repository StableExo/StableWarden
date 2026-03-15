// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {WardenExecutor} from "../src/WardenExecutor.sol";

contract DeployWardenExecutor is Script {
    function run() external returns (WardenExecutor executor) {
        // Reads PRIVATE_KEY from environment (set in .env or CI secret)
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        console2.log("Deploying WardenExecutor");
        console2.log("  Deployer:", deployer);
        console2.log("  Balance: ", deployer.balance / 1e18, "ETH");

        vm.startBroadcast(deployerKey);
        executor = new WardenExecutor();
        vm.stopBroadcast();

        console2.log("  Contract:", address(executor));
        console2.log("  Owner:   ", executor.owner());
    }
}
