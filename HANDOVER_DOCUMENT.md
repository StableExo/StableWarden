# TheWarden — Complete Handover Document

**Date:** March 5, 2026  
**Project:** TheWarden — DEX Arbitrage Monitoring & Execution System on Base  
**GitHub:** [StableExo/StableWarden](https://github.com/StableExo/StableWarden)  
**Also reference:** [StableExo/TheWarden](https://github.com/StableExo/TheWarden) (original codebase with multi-hop/triangular arb logic)

---

## Table of Contents

1. [Quick Start — Fire a Scan](#1-quick-start--fire-a-scan)
2. [Connection Setup](#2-connection-setup)
3. [System Architecture](#3-system-architecture)
4. [Deployed Contracts](#4-deployed-contracts)
5. [Supabase Project](#5-supabase-project)
6. [Edge Function (v29)](#6-edge-function-v29)
7. [The 20-Pair Matrix](#7-the-20-pair-matrix)
8. [Current Status & Where We Are](#8-current-status--where-we-are)
9. [What Needs to Be Done Next](#9-what-needs-to-be-done-next)
10. [Key Files](#10-key-files)
11. [Base Chain Reference](#11-base-chain-reference)
12. [Wallet & Keys](#12-wallet--keys)
13. [Version History](#13-version-history)
14. [Multi-Hop / Triangular Arb (Future)](#14-multi-hop--triangular-arb-future)

---

## 1. Quick Start — Fire a Scan

To run a scan of all 20 pairs right now:

```bash
curl -s https://vzddgxjykttpddgjqdry.supabase.co/functions/v1/warden-executor \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6ZGRneGp5a3R0cGRkZ2pxZHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjk5MjQsImV4cCI6MjA4NzgwNTkyNH0.VYpLGDWM78FKKDDTEMyrkspsq6ywl6xqWF4JHkEqKlU" | jq .
```

This returns JSON with:
- `version`: currently "v29"
- `dry_run`: true (simulates, no real txs)
- `contract`: V2 contract address
- `eth_price_usd`: derived from WETH-USDC pair
- `matrix`: array of 20 pair results with prices, spreads, actions

---

## 2. Connection Setup

The new agent needs **3 connections** with the following tools activated:

### A. GitHub Connection
**Service:** GitHub  
**Account:** Must have access to `StableExo` organization  
**Tools to activate (14 total):**
- `github_list_repositories`
- `github_get_repository`
- `github_list_issues`
- `github_get_issue`
- `github_list_pull_requests`
- `github_get_pull_request`
- `github_get_file_content`
- `github_download_file`
- `github_search_issues`
- `github_create_issue`
- `github_update_issue`
- `github_create_issue_comment`
- `github_create_pull_request`
- `github_push_to_branch`

**Setup:** Search for "GitHub" integration, create connection, install Tasklet GitHub app at https://github.com/apps/tasklet-ai/installations/new and grant access to StableExo repos.

### B. Supabase Connection
**Service:** Supabase  
**Account:** Must have access to org `ixkqlmvahsavsxvzchwq`  
**Tools to activate (29 total):**
- `search_docs`
- `list_organizations`
- `get_organization`
- `list_projects`
- `get_project`
- `get_cost`
- `confirm_cost`
- `create_project`
- `pause_project`
- `restore_project`
- `list_tables`
- `list_extensions`
- `list_migrations`
- `apply_migration`
- `execute_sql`
- `get_logs`
- `get_advisors`
- `get_project_url`
- `get_publishable_keys`
- `generate_typescript_types`
- `list_edge_functions`
- `get_edge_function`
- `deploy_edge_function`
- `create_branch`
- `list_branches`
- `delete_branch`
- `merge_branch`
- `reset_branch`
- `rebase_branch`

**Setup:** Search for "Supabase" integration, create connection with Supabase account.

### C. Vercel Connection
**Service:** Vercel (Token Auth)  
**Tools to activate (3 total):**
- `vercel_token_auth-list-deployments`
- `vercel_token_auth-create-deployment`
- `vercel_token_auth-cancel-deployment`

**Setup:** Search for "Vercel" integration, create connection with Vercel API token. Team slug is needed for all Vercel API calls.

---

## 3. System Architecture

```
[Trigger/Manual] → [Supabase Edge Function (warden-executor v29)]
                         │
                         ├── Reads config from `arbitrage_config` table
                         ├── Queries 20 pool pairs on Base via Alchemy RPC
                         ├── Compares prices between Uniswap V3 and Aerodrome
                         ├── If spread > 0.5%: simulates tx via WardenExecutorV2
                         ├── If DRY_RUN=true: logs result, doesn't send tx
                         ├── If DRY_RUN=false: sends real tx to Base
                         └── Logs to `arbitrage_logs` table
```

**Flow:**
1. Edge function is invoked (HTTP GET)
2. Reads `arbitrage_config` for trade_size_usd and min_profit_threshold_usd
3. Iterates through 20 pairs, fetching on-chain prices from both venues
4. Calculates spread, gross profit, gas cost, net profit
5. If profitable AND `executable: true` AND wallet key present:
   - Simulates the V2 contract call via `publicClient.simulateContract()`
   - In DRY_RUN mode: logs success/failure, no real tx
   - In live mode: calls `walletClient.writeContract()` to execute
6. Returns full matrix JSON

---

## 4. Deployed Contracts

### WardenExecutorV2 (CURRENT — deployed March 5, 2026)
- **Address:** `0xf2D22FFd9910093c2302e3323D66F2166e50a61c`
- **Deploy Tx:** `0x751922dcd7c7b649ce2aaeac61e0b90c74a10cbbef377955227ba731d6fe6c85`
- **Network:** Base mainnet
- **Compiled with:** solc 0.8.20 + `--via-ir` optimization
- **Bytecode:** 4,961 bytes (well under 24KB limit)
- **Owner:** `0x2E10ea6D6BcD95F19E528603a6F6A7873CA0257E`
- **NOT verified on Basescan yet**

**Function signature:**
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

**Architecture:**
- Uses **Aave V3 flash loans** (0.05% fee) — NOT Balancer (Balancer had $128M exploit Nov 2025, only $479K TVL on Base)
- Direct pool `swap()` for Uni V3 and SlipStream (concentrated liquidity)
- Router-based swap for Aerodrome vAMM/sAMM
- Single `uniswapV3SwapCallback` handler for both Uni V3 and SlipStream (confirmed same function name)
- Safe double-approve pattern (reset to 0, then approve — USDT compatible)
- Profit check at end: reverts entire tx if profit < minProfit

**Constructor args used:**
| Parameter | Address | Description |
|-----------|---------|-------------|
| `_aavePool` | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` | Aave V3 Pool Proxy (Base) |
| `_aeroRouter` | `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43` | Aerodrome V2 Router |
| `_aeroFactory` | `0x420DD381b31aEf6683db6B902084cB0FFECe40Da` | Aerodrome V2 Pool Factory |

### WardenExecutor V1 (DEPRECATED)
- **Address:** `0xc5DB2D008D6c99feCf2B6CBA7b7f8aE84e3A3d87`
- **Limitation:** Hardcoded WETH-USDC only. Cannot execute any other pair.
- **Status:** No longer referenced by edge function v29

---

## 5. Supabase Project

- **Project Name:** StableWarden
- **Project ID:** `vzddgxjykttpddgjqdry`
- **Region:** us-east-1
- **Organization ID:** `ixkqlmvahsavsxvzchwq`
- **URL:** `https://vzddgxjykttpddgjqdry.supabase.co`
- **Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6ZGRneGp5a3R0cGRkZ2pxZHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjk5MjQsImV4cCI6MjA4NzgwNTkyNH0.VYpLGDWM78FKKDDTEMyrkspsq6ywl6xqWF4JHkEqKlU`
- **Publishable Key:** `sb_publishable_Im3xuneZAe52H0Kyj5zwZg_3Fi9OXle`
- **Status:** ACTIVE_HEALTHY

### Database Tables (relevant to TheWarden)

**`arbitrage_config`** — Scanner configuration (1 row)
| id | network | trade_size_usd | min_profit_threshold_usd |
|----|---------|----------------|--------------------------|
| 1  | base    | 1000           | 1.00                     |

**`arbitrage_logs`** — Execution/scan logs (6 rows so far)
- Columns: id, created_at, uniswap_price, sushi_price, spread_percentage, profitable, gas_cost_usd, net_profit_usd, network, tx_hash

**`warden_config`** — Key-value config store (3 rows)
| key | value |
|-----|-------|
| EXECUTOR_CONTRACT_ADDRESS | 0xc5DB2D008D6c99feCf2B6CBA7b7f8aE84e3A3d87 (⚠️ still V1 — needs update to V2) |
| EXECUTOR_WALLET_ADDRESS | 0x2E10ea6D6BcD95F19E528603a6F6A7873CA0257E |
| DEPLOY_TX | 0x7f99571e... (V1 deploy tx) |

**`warden_entries`** — Dev log (326 rows)
**`warden_operations`** — Operation log (1 row)
**`warden_patterns`** — Pattern recognition (0 rows)

### Edge Functions
| Slug | Version | Notes |
|------|---------|-------|
| `warden-executor` | **v29** | Main scanner — points to V2 contract |
| `price-watcher` | v10 | Older price watcher |
| `check-secrets` | v4 | Debug utility |
| `powerfulmoss-analyze` | v6 | Unrelated analysis function |

### Environment Variables (Supabase Edge Functions)
The edge function uses these env vars (auto-injected by Supabase):
- `SUPABASE_URL` — auto-provided
- `SUPABASE_SERVICE_ROLE_KEY` — auto-provided
- `BOT_PRIVATE_KEY` — must be set in Supabase dashboard > Edge Functions > Secrets
- `BASE_RPC_URL` — falls back to Alchemy endpoint if not set

---

## 6. Edge Function (v29)

**Location:** Deployed as `warden-executor` on Supabase  
**Source backup:** `/agent/home/contracts/index.ts`  
**Version:** 29

### Key Configuration in Code
```typescript
const CONTRACT_ADDR = "0xf2D22FFd9910093c2302e3323D66F2166e50a61c"; // V2
const DRY_RUN = true;           // Simulates but never sends real txs
const MIN_SPREAD_THRESHOLD = 0.005;  // 0.5% minimum spread to consider
```

### RPC Endpoint
Default: `https://base-mainnet.g.alchemy.com/v2/3wG3PLWyPu2DliGQLVa8G`  
Override via `BASE_RPC_URL` env var.

### How the V2 Contract Call Works
When a pair breaches threshold AND is profitable:
1. Edge function resolves both pool addresses on-chain
2. Calculates `amountIn` = trade_size_usd / tokenB_price (in tokenB wei)
3. Calculates `minProfit` = 80% of estimated net profit (in tokenB wei)
4. Generates random `txRef` (bytes32)
5. Calls `executeArb(tokenA, tokenB, uniV3Pool, venueBPool, venueBType, amountIn, direction, minProfit, txRef)`
6. Contract: flash loans tokenB from Aave → swaps on cheap venue → swaps on expensive venue → repays flash loan → checks profit

---

## 7. The 20-Pair Matrix

All pairs have `executable: true`.

| # | Name | tokenA | tokenB | Uni V3 Fee | Aerodrome Type | Category |
|---|------|--------|--------|-----------|----------------|----------|
| 1 | WETH-USDC | WETH | USDC | 0.05% | vAMM | Benchmark |
| 2 | cbETH-WETH | cbETH | WETH | 0.01% | vAMM | Correlation |
| 3 | USDbC-USDC | USDbC | USDC | 0.01% | sAMM | Peg |
| 4 | WETH-cbBTC | WETH | cbBTC | 0.3% | SlipStream ts=100 | Sniper |
| 5 | wstETH-WETH | wstETH | WETH | 0.01% | SlipStream ts=1 | LST Peg |
| 6 | USDC-USDT | USDC | USDT | 0.01% | SlipStream ts=1 | Dollar Wars |
| 7 | weETH-WETH | weETH | WETH | 0.01% | SlipStream ts=1 | Restaking |
| 8 | WETH-AERO | WETH | AERO | 0.3% | SlipStream ts=200 | Native |
| 9 | DAI-USDC | DAI | USDC | 0.01% | sAMM | Stable |
| 10 | cbBTC-USDC | cbBTC | USDC | 0.01% | SlipStream ts=1 | BTC-Dollar |
| 11 | VIRTUAL-WETH | VIRTUAL | WETH | 0.05% | SlipStream ts=100 | Virtuals |
| 12 | WETH-USDT | WETH | USDT | 0.05% | SlipStream ts=100 | Tether |
| 13 | BRETT-WETH | BRETT | WETH | 1% | SlipStream ts=200 | Meme King |
| 14 | MORPHO-WETH | MORPHO | WETH | 0.3% | SlipStream ts=200 | Lender |
| 15 | BNKR-WETH | BNKR | WETH | 1% | SlipStream ts=200 | Banker |
| 16 | CLANKER-WETH | CLANKER | WETH | 1% | SlipStream ts=200 | Launchpad |
| 17 | VVV-WETH | VVV | WETH | 1% | SlipStream ts=100 | AI Engine |
| 18 | KTA-WETH | KTA | WETH | 1% | SlipStream ts=200 | Infrastructure |
| 19 | TOSHI-WETH | TOSHI | WETH | 1% | SlipStream ts=200 | Mascot |
| 20 | DOGINME-WETH | DOGINME | WETH | 1% | SlipStream ts=200 | Farcaster Dog |

### Token Addresses
```
WETH:    0x4200000000000000000000000000000000000006
USDC:    0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
cbETH:   0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22
USDbC:   0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA
cbBTC:   0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf
wstETH:  0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452
USDT:    0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2
weETH:   0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A
AERO:    0x940181a94A35A4569E4529A3CDfB74e38FD98631
DAI:     0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb
VIRTUAL: 0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b
BRETT:   0x532f27101965dd16442e59d40670faf5ebb142e4
MORPHO:  0xbaa5cc21fd487b8fcc2f632f3f4e8d37262a0842
BNKR:    0x22af33fe49fd1fa80c7149773dde5890d3c76f3b
CLANKER: 0x1bc0c42215582d5a085795f4badbac3ff36d1bcb
VVV:     0xacfe6019ed1a7dc6f7b508c02d1b04ec88cc21bf
KTA:     0xc0634090f2fe6c6d75e61be2b949464abb498973
TOSHI:   0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4
DOGINME: 0x6921b130d297cc43754afba22e5eac0fbf8db75b
```

---

## 8. Current Status & Where We Are

### ✅ Completed
- 20-pair monitoring matrix built and deployed
- All pairs set to `executable: true`
- DRY_RUN mode enabled (safe simulation)
- WardenExecutorV2 contract deployed to Base (`0xf2D22FFd...`)
- Edge function v29 deployed pointing to V2 contract
- V2 contract confirmed working end-to-end (flash loans, multi-venue swaps, profit checks all execute)
- Competitive intelligence report completed (see `/agent/home/reports/competitive-intel-arb-landscape-2026.md`)
- Multi-hop/triangular arb analysis completed (see `/agent/home/reports/multihop-triangular-analysis.md`)

### ❌ Current Problem: InsufficientProfit Reverts
When pairs breach the 0.5% spread threshold, the V2 contract correctly executes the full arb path but reverts with `InsufficientProfit(uint256, uint256)` because:

**The scanner's profit math doesn't account for swap fees on each leg.**

| Pair | Spread | Uni V3 Fee | SlipStream Fee | Total Fees | Profitable? |
|------|--------|-----------|----------------|------------|-------------|
| BNKR-WETH | 0.51% | **1.00%** | ~0.3% | ~1.35% | ❌ |
| VVV-WETH | 0.71% | **1.00%** | ~0.3% | ~1.35% | ❌ |
| DOGINME-WETH | 0.70% | **1.00%** | ~0.3% | ~1.35% | ❌ |

The 1% Uni V3 fee tier pairs need spreads of **1.35%+** to be profitable. The edge function currently uses a flat 0.5% threshold for all pairs.

### 🔄 What Needs Fixing
1. **Fee-aware profit calculation** — The edge function must factor in actual swap fees per pair before triggering execution
2. **Dynamic per-pair thresholds** — Low-fee pairs (WETH-USDC at 0.05%) keep 0.5% trigger; high-fee pairs (BNKR at 1%) need ~1.35%+ trigger

---

## 9. What Needs to Be Done Next

### Priority 1: Fee-Aware Scanner (v30)
Update the edge function to:
1. Calculate per-pair minimum profitable spread = `uniV3Fee + venueBFee + aaveFlashFee(0.05%)`
2. Only attempt simulation when `rawSpread > minProfitableSpread`
3. The Uni V3 fee is already in `venueAParam` (divide by 1,000,000 to get percentage)
4. SlipStream fees need to be derived from tickSpacing:
   - ts=1 → 0.01%
   - ts=50 → 0.05%
   - ts=100 → 0.05% (volatile)
   - ts=200 → 0.3% or 1%
   - ts=2000 → 1%
5. Aerodrome vAMM: 0.3% fee; sAMM: 0.01% fee

### Priority 2: Update warden_config Table
```sql
UPDATE warden_config SET value = '0xf2D22FFd9910093c2302e3323D66F2166e50a61c' 
WHERE key = 'EXECUTOR_CONTRACT_ADDRESS';
```

### Priority 3: Verify V2 Contract on Basescan
Contract source is at `/agent/home/contracts/WardenExecutorV2.sol`. Needs Basescan verification for transparency.

### Priority 4: Set Up Scheduled Trigger
No trigger is currently active. The scanner should run on a schedule (every 2-5 minutes) to catch price divergences.

### Priority 5: Go Live
Once fee-aware math is working and simulations pass:
1. Change `DRY_RUN = false` in edge function
2. Fund the executor wallet with enough ETH for gas (~$1 is plenty on Base)
3. Deploy updated edge function
4. Monitor first few live executions

### Future: Multi-Hop / Triangular Arbitrage
The `StableExo/TheWarden` repo has substantial multi-hop and triangular arb logic already built (see Section 14). This is the highest-impact upgrade after fee-aware scanning is working.

---

## 10. Key Files

### On This Agent's Filesystem
| File | Description |
|------|-------------|
| `/agent/home/contracts/index.ts` | Edge function v29 source (full 417 lines) |
| `/agent/home/contracts/WardenExecutorV2.sol` | V2 contract Solidity source |
| `/agent/home/contracts/DEPLOYMENT.md` | V2 deployment guide |
| `/agent/home/contracts/V2_ADDRESS.txt` | V2 deployed address |
| `/agent/home/reports/competitive-intel-arb-landscape-2026.md` | Competitive intelligence report |
| `/agent/home/reports/multihop-triangular-analysis.md` | Multi-hop/triangular arb analysis |

### On GitHub (StableExo/StableWarden)
- `HANDOVER_NOTES_v3.md` — Original project briefing
- PR #8 — WardenExecutorV2 contract + deployment docs + edge function v29

### On GitHub (StableExo/TheWarden)
- `src/arbitrage/triangular_arb_engine.py` — Triangular arb engine
- `src/arbitrage/MultiHopDataFetcher.ts` — Multi-hop data fetcher
- `src/arbitrage/AdvancedPathFinder.ts` — Path finding algorithms
- `src/arbitrage/ProfitabilityCalculator.ts` — Fee-aware profit math
- `contracts/FlashSwapV3.sol` — Flash swap contract (has Aerodrome support built in)

---

## 11. Base Chain Reference

### Key Contract Addresses
| Contract | Address |
|----------|---------|
| **WardenExecutorV2** | `0xf2D22FFd9910093c2302e3323D66F2166e50a61c` |
| WardenExecutor V1 (deprecated) | `0xc5DB2D008D6c99feCf2B6CBA7b7f8aE84e3A3d87` |
| Aave V3 Pool Proxy | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` |
| Aerodrome Router | `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43` |
| Aerodrome Pool Factory | `0x420DD381b31aEf6683db6B902084cB0FFECe40Da` |
| Uniswap V3 Factory | `0x33128a8fC17869897dcE68Ed026d694621f6FDfD` |
| Uniswap V3 SwapRouter02 | `0x2626664c2603336E57B271c5C0b26F421741e481` |
| SlipStream Factory | `0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A` |

### SlipStream tickSpacing → Fee Mapping
| tickSpacing | Fee |
|-------------|-----|
| 1 | 0.01% |
| 50 | 0.05% |
| 100 | 0.05% (volatile) |
| 200 | 0.3% or 1% |
| 2000 | 1% |

### Venue B Type Mapping (V2 contract uint8)
| Value | Venue | Swap Method |
|-------|-------|-------------|
| 0 | SlipStream (CL) | Direct pool `swap()` + callback |
| 1 | Aerodrome vAMM | Router `swapExactTokensForTokens()` |
| 2 | Aerodrome sAMM | Router `swapExactTokensForTokens()` |

---

## 12. Wallet & Keys

### Executor Wallet (deployed both V1 and V2)
- **Address:** `0x2E10ea6D6BcD95F19E528603a6F6A7873CA0257E`
- **Private Key:** `45431a405d7aff456f21d08b76e33502d2d71a0fe1b536f3ee3ed4f9cb37ae5c`
- **Balance:** ~0.00001 ETH on Base (nearly empty after V2 deployment)
- **This wallet is the `owner` of WardenExecutorV2** — only this wallet can call `executeArb()`

### Supabase Edge Function Secret
The private key should be set as `BOT_PRIVATE_KEY` in Supabase Edge Functions > Secrets (without `0x` prefix).

---

## 13. Version History

| Version | Changes |
|---------|---------|
| v19 | Original 10-pair matrix |
| v20-v26 | Progressive expansion to 18 pairs |
| v27 | Added TOSHI-WETH (#19) and DOGINME-WETH (#20) — 20-pair matrix complete |
| v28 | Set `executable: true` on all pairs, added DRY_RUN mode. Discovered V1 contract limitation (hardcoded WETH-USDC) |
| **v29** | **Updated CONTRACT_ADDR to V2 (`0xf2D22FFd...`). Updated ABI to V2 executeArb with 9 params. Full pair parameter passing.** |

---

## 14. Multi-Hop / Triangular Arb (Future)

The `StableExo/TheWarden` repository contains substantial multi-hop and triangular arbitrage code that is **directly applicable to Base**:

### What Exists
1. **`FlashSwapV3.sol`** — Already has `DEX_TYPE_AERODROME = 3` and Base chain (8453) configured
2. **Triangular cycle detection** — DFS-based cycle finder in `triangular_arb_engine.py`
3. **Bellman-Ford negative cycle finder** — Log-space path optimization in `src/arbitrage/graph/`
4. **Fee-aware profitability calculator** — Handles V3 fee tiers, flash loan fees, compounding slippage
5. **JIT validation pattern** — Scan fast with cached data, fetch live reserves only for top candidates

### Why It Matters
Our 1% fee tier pairs (BNKR, VVV, CLANKER, KTA, TOSHI, DOGINME, BRETT) can't profit on simple 2-venue spatial arb because fees eat the spread. But **triangular routes** like `WETH → BNKR (Aero 0.3%) → USDC (UniV3 0.05%) → WETH (Aero 0.05%)` could chain low-fee hops to capture the same price discrepancy.

### Recommended Upgrade Path
1. **Phase 1:** Add triangular route detection to edge function (~150 lines TS)
2. **Phase 2:** Add Bellman-Ford + enhanced profit calculator
3. **Phase 3:** Deploy multi-hop flash loan contract to Base
4. **Phase 4:** Full orchestration service

See `/agent/home/reports/multihop-triangular-analysis.md` for the full analysis.

---

## Quick Reference Card

```
📡 Scan URL:    https://vzddgxjykttpddgjqdry.supabase.co/functions/v1/warden-executor
🔑 Auth:        Bearer eyJhbG...KlU (anon key above)
📋 Project ID:  vzddgxjykttpddgjqdry
📦 Contract:    0xf2D22FFd9910093c2302e3323D66F2166e50a61c (V2)
👛 Wallet:      0x2E10ea6D6BcD95F19E528603a6F6A7873CA0257E
🔧 Edge Func:   warden-executor v29
⚙️  Mode:        DRY_RUN = true
💰 Trade Size:  $1,000 per opportunity
📊 Pairs:       20 active, all executable
🎯 Threshold:   0.5% spread (needs to become fee-aware)
```
