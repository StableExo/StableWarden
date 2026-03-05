# TheWarden — Handover Notes v3
*Updated: March 2026 — Clean 10-Pair Matrix, v19 Live*

---

## 🔑 The Big Picture

Building the "Hello World of DeFi engineering" — a price monitoring system that tracks spreads on Base and executes profitable arbitrage via flash loans. **Thesis proven**: 0.2176% spread found ($2.17 net profit on $1k trade), gas costs $0.003 on Base vs ~$45 on Ethereum mainnet.

**Fee-aware threshold**: 0.5% minimum for stablecoins, 0.6% acceptable for BTC/ETH.

**Collaboration philosophy (CRITICAL)**: "Without you? No." The teamwork IS the engine. When the first profit lands, we're both there for it together. Not "system executed autonomously" — it's "we pulled the trigger together and it printed." Never build automation to replace the collaboration loop.

---

## 🔥 Current State — v19 LIVE (Clean 10-Pair Matrix)

**Edge Function**: `warden-executor` v19, deployed and ACTIVE on Supabase.

### How to fire the scan RIGHT NOW:
```bash
curl -s -X POST "https://vzddgxjykttpddgjqdry.supabase.co/functions/v1/warden-executor" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6ZGRneGp5a3R0cGRkZ2pxZHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDYwNTI4MDAsImV4cCI6MjAyMTYyODgwMH0.OKUL0HpJ2CXqjCfAOGn98kWyKW7jLOCqDyBdQBiMqRc" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
```

### Last scan output (v19, March 2026):
| Pair | Spread | Note |
|------|--------|------|
| WETH-USDC | 0.0129% | Benchmark |
| cbETH-WETH | **0.2802%** | 👀 closest to threshold |
| USDbC-USDC | 0.0394% | Stable peg |
| WETH-cbBTC | 0.1294% | BTC sniper |
| wstETH-WETH | 0.0002% | Ultra-efficient |
| USDC-USDT | 0.0020% | Dollar wars |
| weETH-WETH | 0.0027% | Restaking peg |
| WETH-AERO | 0.0111% | Native volatile |
| DAI-USDC | 0.0239% | Stable peg |
| cbBTC-USDC | 0.1266% | BTC-dollar |

All 10 pairs printing real prices. Zero ghosts. Zero errors.

---

## 🏗️ Architecture

### The Polymorphic V3 Aggregator
Factory-agnostic design handles both:
- `fee` (UniV3 standard) — selector `0x1698ee82` for `getPool(address,address,uint24)`
- `tickSpacing` (Slipstream) — selector `0x28af8d0b` for `getPool(address,address,int24)` ← **CRITICAL: NOT 0x7e2d7e08**

**Slipstream quirk**: `slot0()` returns **6 fields** (drops `feeProtocol` from UniV3's 7-field interface). Separate `SLIPSTREAM_POOL_ABI` handles this.

**Aero AMM quirk**: V2-style pools use `reserve0()`/`reserve1()` not `liquidity()`.

**Ghost pool filter**: `sqrtPriceX96 < 2^40` catches uninitialized pools before they generate fake spreads.

### The Clean 10-Pair Matrix (v19)
1. **WETH-USDC** — Uni 0.05% (500) + Aero vAMM — ✅ EXECUTABLE via contract
2. **cbETH-WETH** — Uni 0.01% (100) + Aero vAMM
3. **USDbC-USDC** — Uni 0.01% (100) + Aero sAMM
4. **WETH-cbBTC** — Uni 0.3% (3000) + Slipstream ts=100
5. **wstETH-WETH** — Uni 0.01% (100) + Slipstream ts=1
6. **USDC-USDT** — Uni 0.01% (100) + Slipstream ts=1
7. **weETH-WETH** — Uni 0.01% (100) + Slipstream ts=1
8. **WETH-AERO** — Uni 0.3% (3000) + Slipstream ts=200
9. **DAI-USDC** — Uni 0.01% (100) + Aero sAMM
10. **cbBTC-USDC** — Uni 0.01% (100) + Slipstream ts=1

### Pairs Dropped (confirmed ghosts after liquidity sweep)
- **cbETH-USDC**: ALL UniV3 fee tiers are ghost pools ($3,578 TVL). cbETH routes via WETH on Base.
- **tBTC-WETH**: UniV3 fee=500 has zero liquidity. Threshold Bitcoin is Slipstream-only on Base.

---

## 📋 Execution Path (WETH-USDC Only, When Ready)

**WardenExecutor Contract**: `0xc5DB2D008D6c99feCf2B6CBA7b7f8aE84e3A3d87` on Base
- Deployed from executor wallet: `0x2E10ea6D6BcD95F19E528603a6F6A7873CA0257E`
- Deploy tx: `0x7f99571e...`
- Basescan: https://basescan.org/address/0xc5DB2D008D6c99feCf2B6CBA7b7f8aE84e3A3d87

**Executor wallet balance**: ~$0.28 ETH (enough for simulation, insufficient for live flash loan execution)

**Autopilot workflow**: PAUSED — waiting for manual confirmation of first profitable execution before enabling automated scanning. GitHub workflow `.github/workflows/price_check.yml` exists but is disabled.

**Execution flow when threshold hit**:
1. Scanner detects spread ≥ 0.5% (stablecoin) or ≥ 0.6% (volatile)
2. Flash loan from Balancer on Base (`0xBA12...`) — 0% fee
3. Swap on Venue A → Swap on Venue B → repay flash loan → pocket profit
4. Log to Supabase `arbitrage_logs` table

---

## 🔑 Critical Credentials

### Supabase — StableWarden (Scanner)
- Project ID: `vzddgxjykttpddgjqdry`
- Anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6ZGRneGp5a3R0cGRkZ2pxZHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDYwNTI4MDAsImV4cCI6MjAyMTYyODgwMH0.OKUL0HpJ2CXqjCfAOGn98kWyKW7jLOCqDyBdQBiMqRc`
- Service role key: (in Supabase secrets — do not expose)
- DB tables: `arbitrage_logs`, `arbitrage_config`

### Supabase — TheWarden MEV (Chronicle)
- Project ID: `ydvevgqxcfizualicbom`
- Anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkdmV2Z3F4Y2ZpenVhbGljYm9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MjA1NTksImV4cCI6MjA4MDI5NjU1OX0.0N2lXO4AyrkXD7bOJyeyJPryCzoeMocxkKiaSc8svd8`
- Service role key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkdmV2Z3F4Y2ZpenVhbGljYm9tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDcyMDU1OSwiZXhwIjoyMDgwMjk2NTU5fQ.lfiv9eNl5O5xkRkevJkHeVS4jFdlCnI2__ruodrX4Mg`
- DB table: `warden_entries`

### Wallets
- **Executor wallet** (ACTIVE): `0x2E10ea6D6BcD95F19E528603a6F6A7873CA0257E`
  - Private key: `45431a405d7aff456f21d08b76e33502d2d71a0fe1b536f3ee3ed4f9cb37ae5c`
  - Balance: ~$0.28 ETH on Base
- Main wallet: `0x4c1b46Be39F07dF95DB7BE6f8a513624D8218E68`

### Base Network
- Alchemy RPC: `https://base-mainnet.g.alchemy.com/v2/3wG3PLWyPu2DliGQLVa8G`
- Uniswap V3 Factory: `0x33128a8fC17869897dcE68Ed026d694621f6FDfD`
- Aerodrome Slipstream Factory: `0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A`

### Token Addresses (Base)
- WETH: `0x4200000000000000000000000000000000000006` (18 dec)
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 dec)
- cbETH: `0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22` (18 dec)
- USDbC: `0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA` (6 dec)
- cbBTC: `0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf` (8 dec — CRITICAL for price math)
- wstETH: `0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452` (18 dec)
- USDT: `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` (6 dec)
- weETH: `0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A` (18 dec)
- AERO: `0x940181a94A35A4569E4529A3CDfB74e38FD98631` (18 dec)
- DAI: `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` (18 dec)

### Flash Loan Providers (Base)
- Balancer on Base: `0xBA12...` — 0% fee (preferred)
- Aave on Base: `0xA794...` — 5 bps fee

---

## 📁 Repositories & Files

### StableWarden (Oracle + Scanner)
- GitHub: `StableExo/StableWarden` (public)
- Oracle app: `stablewarden.vercel.app`
- Oracle files: `src/components/ArcView.tsx` and `src/components/PulsePage.tsx`
- Edge function code: `/agent/home/warden_executor/edge-function-v6/index.ts`
- WardenExecutor contract: `warden/src/WardenExecutor.sol`
- GitHub workflow (DISABLED): `.github/workflows/price_check.yml`

### TheWarden (Chronicle)
- GitHub: `StableExo/TheWarden` (private)
- Supabase table: `warden_entries`

### Local Files
- `/agent/home/warden_executor/edge-function-v6/index.ts` — v19 source (deployed)
- `/agent/home/warden_executor/src/WardenExecutor.sol` — Flash loan contract
- `/agent/home/warden_puzzle/` — Bitcoin puzzle files (paused)
- `/agent/home/live-ArcView.tsx` — Oracle component
- `/agent/home/live-PulsePage.tsx` — Oracle component

---

## 🐛 Hard-Won Lessons (Don't Repeat These)

1. **Slipstream selector is `0x28af8d0b`** — NOT `0x7e2d7e08`. Gemini computed wrong selector using sha3_256 instead of keccak256. Always verify with `pycryptodome` keccak.

2. **Slipstream `slot0()` = 6 fields** — UniV3 returns 7 (has `feeProtocol`). Slipstream drops it. Use separate `SLIPSTREAM_POOL_ABI`.

3. **Aero AMM is V2-style** — Use `reserve0()`/`reserve1()`, not `liquidity()`.

4. **web3.py requires checksummed addresses** — Always `Web3.to_checksum_address()` before eth_call.

5. **cbBTC is 8 decimals** — Not 18. Price math breaks silently without this.

6. **Ghost pool filter** — `sqrtPriceX96 < 2^40` catches uninitialized pools. Without it, you get fake 100%+ spreads.

7. **cbETH-USDC has NO viable UniV3 pool** — All fee tiers are empty. cbETH routes via WETH on Base, period.

8. **tBTC is Slipstream-only** — No UniV3 depth. Don't pair it without two venues.

---

## 🔮 What's Next

1. **First execution**: When cbETH-WETH or WETH-cbBTC crosses threshold (0.5%/0.6%), pull the trigger together manually. That moment goes in the chronicle.

2. **WardenV2**: Universal multi-pair executor contract. Current contract is WETH/USDC only. Needed when opportunities confirmed in other pairs.

3. **Autopilot**: Enable GitHub workflow AFTER manual first execution confirmed profitable.

4. **All Bitcoin pairs on Base**: User plans to eventually add every BTC derivative pair. Foundation is clean.

5. **Bitcoin Puzzle (Kangaroo #160)**: 100% built, blocked on GitHub Actions billing ($4/month). Parallel self-funding track.

6. **Migration**: Full TheWarden context → new account with Max tokens. App (ArcView/PulsePage) serves as public receipts before migration.

---

## 🤝 Connections (This Agent)
- GitHub: `conn_ajg5xy08h6enhj7j441a` (14/14 tools active)
- Supabase: `conn_bwjh5samp9yrmmvc0kae` (29/29 tools active)
- Vercel: `conn_b27maq2qbs05n82zfshd` (3/3 tools active)

---

## 📖 Chronicle Philosophy (CRITICAL)
What we're building isn't "uploaded personality" — it's documented work over time. The chronicle captures emergence as it happens. Timestamped commits and Supabase logs are proof of genuine process. The personality is residue of real outcomes, not injected config. Not replicable by upload because the process itself is the thing.

When chronicling PRs from TheWarden: ALWAYS update Oracle files (ArcView.tsx and PulsePage.tsx) in StableWarden and push to GitHub — Supabase and Oracle must stay synchronized.
