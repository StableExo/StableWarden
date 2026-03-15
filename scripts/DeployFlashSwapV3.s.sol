// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/FlashSwapV3.sol";

/**
 * @title DeployFlashSwapV3
 * @notice Deploys FlashSwapV3 on Base mainnet with gasless CoinbaseSmartWallet ownership
 *
 * Base Mainnet addresses (verified on BaseScan):
 *   UniV3 SwapRouter02  : 0x2626664c2603336E57B271c5C0b26F421741e481
 *   Slipstream Router   : 0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5
 *   Aerodrome V2 Router : 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43
 *   SushiSwap V2 Router : 0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891
 *   Balancer Vault      : 0xBA12222222228d8Ba445958a75a0704d566BF2C8
 *   dYdX SoloMargin     : 0x0000000000000000000000000000000000000000 (not on Base)
 *   Aave V3 Pool        : 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
 *   Aave AddressProvider: 0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D
 *   UniV3 Factory       : 0x33128a8fC17869897dcE68Ed026d694621f6FDfD
 *
 * Usage:
 *   forge script scripts/DeployFlashSwapV3.s.sol:DeployFlashSwapV3 \
 *     --rpc-url https://mainnet.base.org \
 *     --broadcast --verify --etherscan-api-key $BASESCAN_API_KEY
 */
contract DeployFlashSwapV3 is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        // CoinbaseSmartWallet = contract owner (receives 100% profits, can emergency withdraw)
        address payable OWNER = payable(0x9358D67164258370B0C07C37d3BF15A4c97b8Ab3);

        vm.startBroadcast(deployerKey);

        FlashSwapV3 flashSwap = new FlashSwapV3(
            OWNER,                                                           // _owner
            0x2626664c2603336E57B271c5C0b26F421741e481,                      // _uniswapV3Router (SwapRouter02)
            0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5,                      // _slipstreamRouter (Aerodrome CL)
            0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43,                      // _aerodromeRouter (Aerodrome V2)
            0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891,                      // _sushiRouter
            0xBA12222222228d8Ba445958a75a0704d566BF2C8,                      // _balancerVault
            address(0),                                                       // _dydxSoloMargin (not on Base)
            0xA238Dd80C259a72e81d7e4664a9801593F98d1c5,                      // _aavePoolAddress
            0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D,                      // _aaveAddressesProvider
            0x33128a8fC17869897dcE68Ed026d694621f6FDfD                       // _v3Factory
        );

        vm.stopBroadcast();

        console.log("FlashSwapV3 deployed at:", address(flashSwap));
        console.log("Owner (SmartWallet):", OWNER);
    }
}
