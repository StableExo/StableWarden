# StableWarden Handover Notes
**Last Updated**: March 11, 2026 00:13 GMT-4
**Owner**: Taylor Marlow <marlowtaylor28@gmail.com>

---

## 🔑 CONNECTIONS & TOOLS (Recreate These in New Agent)

### 1. GitHub (`conn_gbyt2f2k13f9em56j62d`) — 14 tools
- **Account**: StableExo
- **Repos**: `StableWarden` (arbitrage system), `TheWarden` (old Ethereum framework)
- **Tools activated** (ALL 14): github_list_repositories, github_get_repository, github_list_issues, github_get_issue, github_list_pull_requests, github_get_pull_request, github_get_file_content, github_download_file, github_search_issues, github_create_issue, github_update_issue, github_create_issue_comment, github_create_pull_request, github_push_to_branch
- **Note**: Tasklet GitHub app must be installed at https://github.com/apps/tasklet-ai/installations/new for private repo access

### 2. Supabase (`conn_bn2fwarb7ppg48wa9dbk`) — 29 tools
- **Project ID**: `vzddgxjykttpddgjqdry`
- **Project URL**: `https://vzddgxjykttpddgjqdry.supabase.co`
- **Edge Function**: `warden-executor` (the main arbitrage executor)
- **DB Table**: `warden_pool_cache` (92 entries — 50 pool addresses + 42 token0 values)
- **Tools activated** (ALL 29): search_docs, list_organizations, get_organization, list_projects, get_project, get_cost, confirm_cost, create_project, pause_project, restore_project, list_tables, list_extensions, list_migrations, apply_migration, execute_sql, get_logs, get_advisors, get_project_url, get_publishable_keys, generate_typescript_types, list_edge_functions, get_edge_function, deploy_edge_function, create_branch, list_branches, delete_branch, merge_branch, reset_branch, rebase_branch

### 3. Vercel (`conn_zdqy7zkhfwdb6twhc6m1`) — 3 tools
- **Project**: `stablewarden` (FRONTEND ONLY — not involved in arbitrage)
- **Tools activated** (ALL 3): vercel_token_auth-list-deployments, vercel_token_auth-create-deployment, vercel_token_auth-cancel-deployment

### 4. Alchemy Base Mainnet (`conn_06211sx2f5jvds3v7wzr`) — 1 tool (Direct API / HTTP)
- **Type**: Direct API (remote_http)
- **Base URL**: `https://base-mainnet.g.alchemy.com/v2/3wG3PLWyPu2DliGQLVa8G`
- **WSS URL**: `wss://base-mainnet.g.alchemy.com/v2/3wG3PLWyPu2DliGQLVa8G`
- **Methods**: POST, GET, PUT, PATCH, DELETE
- **Tool**: remote_http_call
- **Key endpoints**: eth_blockNumber, eth_getBlockByNumber, eth_getTransactionByHash, eth_getLogs, eth_call (supports `"pending"` tag for Flashblocks!), alchemy_getAssetTransfers, alchemy_getTransactionReceipts
- **CRITICAL**: This is the WINNER endpoint. 51ms HTTP / 13ms WSS / supports Flashblocks `pending` tag / supports all subscriptions (pendingLogs, newHeads, newPendingTransactions)

### 5. Dune Analytics MCP (`conn_npyfp5fxs8h32fg8sgjv`) — 12 tools
- **Type**: MCP server
- **Server URL**: `https://api.dune.com/mcp/v1?api_key=swJfmj2azFXEMRvfvbHP2XKezIC4SRRl`
- **Account**: `@stableexo`
- **Tools activated** (ALL 12): searchDocs, searchTables, listBlockchains, searchTablesByContractAddress, createDuneQuery, getDuneQuery, executeQueryById, updateDuneQuery, getExecutionResults, getUsage, generateVisualization, getTableSize
- **Existing Queries**:
  - 6810943: Bot Activity by Revert Rate
  - 6810944: Known Bot Trades
  - 6810945: USDbC-USDC Spread History (60-day)
  - 6811023: Base MEV Bot Transaction Flows - Sankey Data (10 days)
  - 6811024: Base MEV Ecosystem - Top Arb Bots & Pool Targets (10 days)
  - 6811034: Base MEV Bot → Contract Target Flows
  - 6811245: Base MEV Bot Funding Sources (10 days)
  - 6811246: Base MEV Bot Outflows + Gas Fees (10 days)

---

## 📋 OPEN TASKS (Carry Forward)

1. **Draft the code changes needed for warden-executor** — Option C+ upgrade (Alchemy WSS + pending tag)
2. **Add PancakeSwap V3 as third venue to executor** — Integration verified, contracts live, code changes drafted
3. **Test scan with PancakeSwap pairs included** — After PancakeSwap code is deployed

---

## 🏗️ ARCHITECTURE

### Execution Stack
```
HTTP POST → warden-executor (Supabase Edge Function)
  ├── Two-pool scanning (20 pairs currently, expanding to ~44 with PancakeSwap)
  └── Tri-arb scanning (8 cycles)
         ↓
  executeViaPaymaster()
         ↓
  Coinbase ERC-4337 Bundler (gasless)
         ↓
  Contract 0xA96B8c... on Base
```

### Entry Point
`supabase/functions/warden-executor/index.ts`

### Current Version: v55
- Supabase DB cache layer (deployed and live)
- 20 two-pool + 8 tri-arb cycles
- Coinbase Paymaster ERC-4337 (gasless)
- Per-hop slippage protection

### ⚠️ CRITICAL
- `DRY_RUN = true` hardcoded at line 28. Production must be `false` or trades won't execute.

### Scanner Invocation
```bash
curl -s -X POST "https://vzddgxjykttpddgjqdry.supabase.co/functions/v1/warden-executor" \
  -H "Authorization: Bearer <anon_key>" \
  -H "Content-Type: application/json" \
  -d '{"action":"scan"}'
```
Get anon key via `get_publishable_keys` for project `vzddgxjykttpddgjqdry`.

---

## 🎯 IMMEDIATE NEXT STEPS

### Step 1: Option C+ — Alchemy WSS Upgrade (Quick Win)
**What**: Swap primary RPC from Coinbase → Alchemy, use `"pending"` block tag for pool reads
**Why**: 20x latency improvement (240ms → 12ms), 200ms fresher state via Flashblocks
**Risk**: Near-zero — same viem library, just different URL and block tag
**Keep Coinbase RPC for**: Paymaster/bundler client (needs Coinbase infrastructure for ERC-4337)

### Step 2: PancakeSwap V3 Integration (Ready to Code)
**PancakeSwap V3 on Base Contracts**:
- Factory: `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865`
- QuoterV2: `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997`
- SmartRouter: `0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86`

**Why PancakeSwap**: UniV3 fork — same `slot0()`, `sqrtPriceX96`, `getPool()`. Zero code friction. 22 active pools found across our token set. Live spreads detected (WETH-AERO 0.95%, WETH-USDT 0.60% at time of scan).

**Code Changes Needed**:
1. Add `PANCAKE_V3_FACTORY` constant
2. Add `'pancake_v3'` to `VenueBType` union
3. Add to `VENUE_B_TYPE_MAP` (maps to 0 — same UniV3 interface on contract)
4. Dynamic fee calc: `venueBParam / 1_000_000` instead of fixed `VENUE_B_FEE_PCT`
5. Pool lookup: use `UNI_FACTORY_ABI` with `PANCAKE_V3_FACTORY`
6. Price reading: use `V3_POOL_ABI` (same as UniV3, NOT Slipstream)
7. Add ~10 new UniV3↔PancakeSwap TARGETS
8. Add ~4 PancakeSwap↔Aerodrome TARGETS (PCS as venueA)

**PancakeSwap Fee Tiers on Base**: 100 (0.01%), 500 (0.05%), 2500 (0.25%), 10000 (1%)

**Verified Pool Fee Tiers** (from benchmark):
| Pair | PCS Fee Tier |
|------|-------------|
| WETH-USDC | 500 |
| cbETH-WETH | 500 |
| wstETH-WETH | 100 |
| WETH-USDT | 500 |
| USDbC-USDC | 100 |
| DAI-USDC | 100 |
| WETH-cbBTC | 2500 |
| WETH-AERO | 2500 |
| BRETT-WETH | 10000 |
| VIRTUAL-WETH | 2500 |

### Step 3: Flashblocks WebSocket (Endgame)
- **Option B**: Always-on listener (Railway/Fly.io/VPS) maintaining persistent WSS to Alchemy
- Alchemy WSS at `wss://base-mainnet.g.alchemy.com/v2/3wG3PLWyPu2DliGQLVa8G` confirmed working
- Supports `eth_subscribe("pendingLogs")` for real-time pool event streaming
- Edge Function has 400s max duration — can't hold persistent WebSocket

---

## 📊 BENCHMARK RESULTS SUMMARY

### RPC Endpoint Rankings
| Endpoint | HTTP Latency | WSS Latency | Reliability | Flashblocks |
|----------|-------------|-------------|-------------|-------------|
| **Alchemy** | **51ms** | **13ms** | **100%** | ✅ `pending` tag works |
| Coinbase RPC | 240ms | N/A | 60-80% (drops calls!) | Not tested |
| GetBlock Standard | 314ms | ❌ 403 | HTTP only | ✅ `pending` 210ms |
| GetBlock MEV-Protected | N/A | ❌ 405 | Dead | N/A |
| Preconf Public | ❌ 403 | N/A | Dead | N/A |

### Current Pair Thresholds (from last scan)
**Closest to profit**:
1. cbETH-WETH: 0.042% gap (84% to breakeven)
2. USDbC-USDC: 0.025% gap (69% to breakeven)
3. BNKR-WETH: 0.218% gap but highest raw spread (0.88%)

**All pairs underwater in calm markets** — the game is catching spikes (March 4: 11,487% USDbC spike, March 8-9: 30% AERO swing).

---

## 🔬 RESEARCH COMPLETED

### Deep-Dive MEV Research (3 Rounds with Grok + Gemini)
All saved in conversation history. Key findings:
- **Q1**: Only Slot 1 of each 200ms Flashblock has fee-based ordering. Slots 2-9 are FCFS.
- **Q2**: ERC-4337 Paymaster gives asymmetric advantage — private bundler, zero revert cost, infinite parallelism
- **Q3**: Sequencer timing attacks — 190ms real window per slot, preconf-timed 60-80% Slot 1 hit rate

### Key Discovery: Coinbase Paradox
- 78.6% of MEV bot funding (8,435 ETH) comes from Coinbase hot wallets
- Single bot `0xd0d0` routes through ParaSwap/0x Protocol — likely Coinbase market-making
- Coinbase has zero incentive to stop spam (pure revenue from sequencer fees)

### TheWarden Compatible Features
| Feature | Status |
|---------|--------|
| Pool Data Caching | ✅ Implemented (v55 DB cache) |
| Conflict Detection | ✅ Ready to port |
| Shapley Value Math | ✅ Repurpose for internal optimization |
| Gas Spike Protection | ✅ Not yet ported |
| Congestion Sensor | ✅ Can drive dynamic priority fees |
| Multi-Builder Submission | ❌ Not applicable to Base |
| Multi-Searcher Coalition | ❌ Not applicable to Base |

---

## 📱 INSTANT APPS CREATED

All in `/agent/home/apps/`:
1. **base-tx-flow/** — 4-tab architecture diagram (Tx Flow, Flashblocks, MEV, Our Path)
2. **base-sankey/** — Ethereum PBS vs Base single funnel comparison
3. **base-mev-flows/** — Real bot activity from 2.27M txs (Top 20/40/Fleet views)
4. **base-money-trail/** — Full funding flow (funders → bot fleets → destinations)

---

## 🔐 API KEYS & ENDPOINTS

| Service | Key/URL |
|---------|---------|
| Alchemy Base | `https://base-mainnet.g.alchemy.com/v2/3wG3PLWyPu2DliGQLVa8G` |
| Alchemy WSS | `wss://base-mainnet.g.alchemy.com/v2/3wG3PLWyPu2DliGQLVa8G` |
| Dune API | `swJfmj2azFXEMRvfvbHP2XKezIC4SRRl` |
| Supabase Project | `vzddgxjykttpddgjqdry` |
| BaseScan API 1 | `QT7KI56B365U22NXMJJM4IU7Q8MVER69RY` (Etherscan V2, chainid=8453) |
| BaseScan API 2 | `ES16B14B19XWKXJBIHUAJRXJHECXHM6WEK` (BaseScan direct) |
| GetBlock Standard | `https://go.getblock.us/d95bfd1a425c465c9ace56d94dee73ea` |
| GetBlock MEV WSS | `wss://go.getblock.us/2c0953c89cf847ee9eb4d928bddfa52c` |
| Flashblocks Official | `wss://mainnet-preconf.base.org` (403 — may need special access) |
| Flashblocks Raw | `wss://mainnet.flashblocks.base.org/ws` (Brotli compressed) |
| Flashblocks HTTP | `https://mainnet-preconf.base.org` |
| Contract | `0xA96B8c...` on Base |

---

## 📁 FILES ON DISK

- `/agent/home/HANDOVER-NOTES.md` — This file
- `/agent/home/index.ts` — Current warden-executor source (v55, downloaded from GitHub)
- `/agent/home/apps/base-tx-flow/` — Architecture diagram app
- `/agent/home/apps/base-sankey/` — Sankey comparison app
- `/agent/home/apps/base-mev-flows/` — Real MEV bot flows app
- `/agent/home/apps/base-money-trail/` — Money trail visualization app
- `/agent/home/base-tx-flow.zip` — Downloadable zip of architecture app
