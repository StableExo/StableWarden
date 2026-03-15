# WardenExecutorV2 — Deployment Guide

## Overview

WardenExecutorV2 is a universal multi-pair flash loan arbitrage executor for Base chain. It replaces V1 (WETH/USDC only) with support for all 20 monitored pairs.

**Key changes from V1:**
- Accepts token addresses, pool addresses, and venue type as parameters
- Supports Uniswap V3, Aerodrome SlipStream, Aerodrome vAMM, and Aerodrome sAMM
- Direct pool interaction for V3/SlipStream swaps (gas efficient)
- Same flash loan source: Aave V3 Pool on Base

## Constructor Arguments

| Parameter     | Address                                      | Description                    |
|---------------|----------------------------------------------|--------------------------------|
| `_aavePool`   | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` | Aave V3 Pool Proxy (Base)      |
| `_aeroRouter` | `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43` | Aerodrome V2 Router            |
| `_aeroFactory`| `0x420DD381b31aEf6683db6B902084cB0FFECe40Da` | Aerodrome V2 Pool Factory      |

## Deployment with Foundry

```bash
# 1. Create project (if not exists)
forge init warden-v2 --no-commit
cd warden-v2

# 2. Copy WardenExecutorV2.sol to src/
cp WardenExecutorV2.sol src/

# 3. Build
forge build

# 4. Deploy to Base
forge create src/WardenExecutorV2.sol:WardenExecutorV2 \
  --rpc-url https://mainnet.base.org \
  --private-key $BOT_PRIVATE_KEY \
  --constructor-args \
    0xA238Dd80C259a72e81d7e4664a9801593F98d1c5 \
    0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43 \
    0x420DD381b31aEf6683db6B902084cB0FFECe40Da

# 5. Verify on Basescan (optional)
forge verify-contract <DEPLOYED_ADDRESS> \
  src/WardenExecutorV2.sol:WardenExecutorV2 \
  --chain base \
  --constructor-args $(cast abi-encode "constructor(address,address,address)" \
    0xA238Dd80C259a72e81d7e4664a9801593F98d1c5 \
    0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43 \
    0x420DD381b31aEf6683db6B902084cB0FFECe40Da)
```

## Deployment with Remix

1. Open [Remix IDE](https://remix.ethereum.org)
2. Create `WardenExecutorV2.sol` and paste the contract code
3. Compile with Solidity 0.8.24, optimizer ON (200 runs)
4. Deploy tab → Injected Provider (MetaMask on Base)
5. Constructor args:
   - `_aavePool`: `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`
   - `_aeroRouter`: `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43`
   - `_aeroFactory`: `0x420DD381b31aEf6683db6B902084cB0FFECe40Da`
6. Click Deploy, confirm in MetaMask

## After Deployment

1. **Note the deployed contract address**
2. **Update the edge function:** Change `CONTRACT_ADDR` to the new V2 address
3. **Deploy the updated edge function** (v29) via Supabase
4. **Run a scan** to verify dry-run simulation passes for breaching pairs
5. **Verify on Basescan** for transparency

## Function Signature

```solidity
function executeArb(
    address tokenA,        // The "commodity" token (e.g., BNKR)
    address tokenB,        // The "settlement" token, flash-loaned (e.g., WETH)
    address uniV3Pool,     // Uniswap V3 pool address
    address venueBPool,    // Aerodrome/SlipStream pool address
    uint8   venueBType,    // 0=SlipStream, 1=Aero vAMM, 2=Aero sAMM
    uint256 amountIn,      // Flash loan amount in tokenB units
    uint8   direction,     // 0=buy venueB/sell UniV3, 1=buy UniV3/sell venueB
    uint256 minProfit,     // Minimum profit in tokenB
    bytes32 txRef          // Unique reference for logging
) external onlyOwner nonReentrant
```

## Venue Type Mapping

| Type Value | Venue              | Swap Method                |
|------------|--------------------|----------------------------|
| `0`        | SlipStream (CL)    | Direct pool `swap()` + callback |
| `1`        | Aerodrome vAMM     | Router `swapExactTokensForTokens()` |
| `2`        | Aerodrome sAMM     | Router `swapExactTokensForTokens()` |

## Security Notes

- `onlyOwner` — only the deployer wallet can call `executeArb`
- `nonReentrant` — prevents reentrancy attacks
- `executeOperation` validates both `msg.sender == aavePool` and `initiator == address(this)`
- V3 swap callback validates `msg.sender == _cbPool`
- Double approve pattern (reset to 0 first) handles tokens like USDT
- Flash loan premium is automatically included in the repay amount
- Profit check reverts the entire transaction if below minimum

## Flash Loan Availability

Aave V3 on Base supports flash loans for tokens it has deposits in:
- ✅ WETH — massive deposits, covers 12 pairs
- ✅ USDC — massive deposits, covers 4 pairs
- ✅ USDT — covers 2 pairs
- ⚠️ cbBTC — may need to verify availability (pair #4)
- ⚠️ AERO — may not be on Aave (pair #8)

If a flash loan fails for a specific tokenB, the transaction reverts safely (no gas cost beyond simulation).
