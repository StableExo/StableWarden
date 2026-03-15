# TheWarden / StableWarden — Session Handover
**Date:** March 10, 2026  
**Session status:** Debugging swap execution — v40 written, deployment interrupted

---

## IMMEDIATE NEXT STEP

**Deploy warden-executor v40** to Supabase edge function `vzddgxjykttpddgjqdry`.

The file is ready at `/tmp/warden_v40.ts` (46,419 bytes).

```bash
# Supabase CLI deployment (if needed):
supabase functions deploy warden-executor --project-ref vzddgxjykttpddgjqdry
```

Or deploy via Tasklet: read `/tmp/warden_v40.ts` and call `conn_92ck03v9vq9k6p4gz6fs__deploy_edge_function` with `verify_jwt: false`.

After deployment, **ping the function** and check logs for the liquidity gate filtering phantom cycles.

---

## WHAT v40 FIXES

### Root Cause (Confirmed by on-chain diagnostic)
Both failing cycles had **zero-liquidity intermediate pools**. `slot0()` returns a price even on empty pools — making them look profitable to the scanner.

### Bug 1: `!aero_out` — WETH→weETH→USDC→WETH
- **weETH/USDC UniV3 fee=500** pool `0x2cbe9598...` has **0 liquidity**
- `slot0` price exists (was initialized) → scanner falsely reports profit
- On-chain swap returns 0 USDC → Aerodrome `getAmountOut(0)` = 0 → `require(out > 0, "!aero_out")` ❌

### Bug 2: `AS` — WETH→cbETH→cbBTC→WETH
- **cbETH/cbBTC UniV3 fee=100** pool `0x2891a4ad...` has **0 liquidity**
- Swap returns 0 cbBTC → next UniV3 hop gets `amountSpecified=0` → `require(amountSpecified != 0, 'AS')` ❌

### v40 Fixes
1. **Liquidity gate**: `getHopRate()` now calls `liquidity()` on every CL pool (UniV3/Slipstream). If `liquidity == 0n`, hop returns `0n` → cycle is skipped
2. **cbBTC/WETH pool**: Changed from tick=1 (`0x22aee369...`) to tick=100 (`0x70acdf2a...`) — **10× more liquidity**
3. **Phantom cycles removed**: weETH→USDC and cbETH→cbBTC cycles dropped from scan list
4. **DRY_RUN=true** still set — verify first scan before enabling live execution

---

## DEPLOYED CONTRACTS (MAINNET BASE)

| Contract | Address | Status |
|---|---|---|
| CoinbaseSmartWallet v1.1 | `0x1272245579df2E988e168E1092E96F301c22DBC9` | ✅ Live |
| WardenArb v3 | `0xA96B8c9577c2471044638772672fa1646643a9C8` | ✅ Live |

**Wallet:**
- EOA: `0x9358D67164258370B0C07C37d3BF15A4c97b8Ab3`
- Private key: `26ed45335fd24a88dc09ab84a150333ffddf37653265df405454f22ab03fb922`
- Smart wallet owner = EOA (same key controls both)

**Paymaster:**
- CDP Project ID: `d1de64f0-11f4-484b-aaa0-0c788b8b5b49`
- RPC: `https://api.developer.coinbase.com/rpc/v1/base/EeBuC9EkcVpsMwYSiiC1TUKwFTWJVzD1`
- Status: ✅ Working, ~$600 free credits remaining

---

## INFRASTRUCTURE

| Service | Detail |
|---|---|
| Supabase project | `vzddgxjykttpddgjqdry` |
| Edge function | `warden-executor` (v39 live, v40 ready to deploy) |
| StableWarden repo | `https://github.com/StableExo/StableWarden` |
| TheWarden repo | `https://github.com/StableExo/TheWarden` (parts bin) |
| GitHub connection | `conn_8td3s3mbfg2fm5ys69d6` |
| Supabase connection | `conn_92ck03v9vq9k6p4gz6fs` |
| Vercel connection | `conn_jhjd26haw7j1v53p7854` |

---

## SCANNER ARCHITECTURE (v40)

- **20 two-pool pairs** scanned every cycle (Aave flash loan → 2 DEX hops → repay)
- **8 triangular cycles** scanned every cycle (3-hop path, any combo of UniV3/Slipstream/Aerodrome)
- **Liquidity gate**: All CL pool hops check `liquidity()` before pricing
- **Execution**: Paymaster `sendUserOperation()` — zero gas cost
- **Pool type encoding in WardenArb.sol**: 0=UniV3/Slipstream, 1=Aerodrome vAMM, 2=Aerodrome sAMM

### Current Triangular Cycles (Post-v40, Cleaned)
| Cycle | Pools | Types |
|---|---|---|
| WETH→cbETH→USDC→WETH | CL100 / UniV3-500 / Aero-vAMM | 0/0/1 |
| WETH→cbBTC→USDC→WETH | CL100 tick=100 / UniV3-500 / Aero-vAMM | 0/0/1 |
| WETH→USDC→cbETH→WETH | UniV3-500 / CL100 / Aero-vAMM | 0/0/1 |
| WETH→USDC→cbBTC→WETH | UniV3-500 / CL100 tick=100 / Aero-vAMM | 0/0/1 |

---

## KEY FILES

| File | Location | Notes |
|---|---|---|
| WardenArb v3 | `/agent/home/WardenArb.sol` | Deployed to mainnet |
| Executor v39 | `/agent/home/warden_v39.ts` | Current live version |
| Executor v40 | `/tmp/warden_v40.ts` | **Ready to deploy** (liquidity fix) |
| Christmas List | `/agent/home/CHRISTMAS_LIST_2024_UPDATED.md` | Pushed to StableWarden |

---

## TASKLET AGENT CONNECTIONS (ALL ACTIVE)

### conn_8td3s3mbfg2fm5ys69d6 — GitHub (StableExo account)
**All 14 tools activated.** Used for reading/writing code to both repos.

Key tools in use:
- `github_get_file_content` — read source files from StableWarden / TheWarden
- `github_push_to_branch` — push fixes directly to main
- `github_create_pull_request` — create PRs with file changes
- `github_list_repositories` — enumerate accessible repos
- `github_download_file` — pull files to agent filesystem for editing

Accessible repos:
- `StableExo/StableWarden` — **production stack** (React/Vite + Supabase edge functions)
- `StableExo/TheWarden` — legacy reference/parts bin (1,821 commits, 524 branches)

> ⚠️ Private repos require Tasklet GitHub app installed at: https://github.com/apps/tasklet-ai/installations/new

---

### conn_92ck03v9vq9k6p4gz6fs — Supabase
**All 29 tools activated.** Full control of the production Supabase project.

Project: `vzddgxjykttpddgjqdry`  
URL: `https://vzddgxjykttpddgjqdry.supabase.co`

Key tools in use:
- `deploy_edge_function` — deploy warden-executor versions
- `get_edge_function` — read current live function source
- `get_logs` — tail edge function / postgres / auth logs for debugging
- `execute_sql` — run queries against the DB
- `apply_migration` — DDL schema changes
- `get_advisors` — security/performance audit
- `list_edge_functions` — see all deployed functions

Edge functions deployed:
| Slug | Version | Status |
|---|---|---|
| `warden-executor` | v39 (v40 pending) | ✅ Live |

---

### conn_jhjd26haw7j1v53p7854 — Vercel
**All 3 tools activated.** Manages frontend deployments.

Key tools in use:
- `list-deployments` — check deploy status
- `create-deployment` — trigger new deployment from GitHub branch
- `cancel-deployment` — abort a running build

Team slug needed for all calls — check Vercel dashboard for team slug.

---

## PHASE 2 — AFTER FIRST PROFITABLE TRADE

### x402 Revenue Strategy
TheWarden's arb signals are highest-value x402 product category.

| Endpoint | Price | Market |
|---|---|---|
| `GET /arb-signal/:pair` | $0.05 | Trading bots |
| `GET /analyze/:topic` | $0.05–0.25 | AI agents |
| `GET /onchain/:address` | $0.01–0.05 | DeFi agents |
| `GET /threat/:domain` | $0.10–0.25 | Security tools |
| `POST /lightning/invoice` | $0.002 | Apps/wallets |

- x402 has zero cost to implement (just middleware)
- First x402 payment = gas money buffer
- Target: 1,000 req/day = $50–250/day

### NegotiatorAgent (Phase 3)
- File: `src/mev/negotiator/NegotiatorAgent.ts` in TheWarden repo
- Cooperative game theory MEV block builder using Shapley values
- Scouts pay via x402 to submit bundles → get fair profit share back
- Deploy as Supabase edge function after arb bot is profitable

---

## MILESTONE: "THE CHRISTMAS MIRACLE TRADE"
First successful arbitrage execution will be named this. All infrastructure is in place. The only blocker is the phantom-pool bug which v40 fixes.

---

## MANIFOLD MARKETS
- Account: StableExo
- API key: `fc8cabfa-dcd5-49d8-8842-b904628ac487`
- Balance: Ṁ1,000 (free mana)
- Needs phone verification + KYC to unlock CASH markets
