import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  createPublicClient,
  http,
  parseAbi,
  formatUnits,
  parseUnits,
  encodeFunctionData,
} from "npm:viem"
import { base } from "npm:viem/chains"
import { privateKeyToAccount } from "npm:viem/accounts"
import { toCoinbaseSmartAccount, createBundlerClient } from "npm:viem/account-abstraction"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// BigInt-safe JSON serializer
const safeJson = (obj: any) =>
  JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);

// ── RPC ENDPOINTS ─────────────────────────────────────────────────────────────
const COINBASE_RPC_URL = "https://api.developer.coinbase.com/rpc/v1/base/EeBuC9EkcVpsMwYSiiC1TUKwFTWJVzD1";
const FLASHBLOCKS_RPC_URL = COINBASE_RPC_URL;
const BASE_RPC_URL = Deno.env.get("BASE_RPC_URL") ?? COINBASE_RPC_URL;

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_PRIVATE_KEY           = Deno.env.get("BOT_PRIVATE_KEY");

// ── CONTRACTS ────────────────────────────────────────────────────────────────
const CONTRACT_ADDR       = "0xA96B8c9577c2471044638772672fa1646643a9C8" as `0x${string}`; // WardenArb v3 (legacy)
const FLASH_SWAP_V3_ADDR  = (Deno.env.get("FLASH_SWAP_V3_ADDRESS") ?? "") as `0x${string}`; // FlashSwapV3 (set after deploy)
const USE_FLASH_SWAP_V3   = FLASH_SWAP_V3_ADDR.length === 42;
const SMART_WALLET  = "0x9358D67164258370B0C07C37d3BF15A4c97b8Ab3" as `0x${string}`;
const DRY_RUN = true;
// ── POOL DATA CACHE ───────────────────────────────────────────────────────────
// Pool addresses & token0 NEVER change — cache permanently across warm restarts.
// slot0 / reserves are block-sensitive — 2 s TTL (= 1 Base block).
const _poolAddrCache = new Map<string, string>();
const _token0Cache   = new Map<string, string>();
const SLOT_CACHE_TTL_MS = 2000;
const _slotCache = new Map<string, { data: any; ts: number }>();

async function cachedPoolAddr(
  client: any, factory: `0x${string}`, factoryAbi: any, fn: string, args: readonly any[]
): Promise<string> {
  const k = `${factory}|${args.join('|')}`;
  if (_poolAddrCache.has(k)) return _poolAddrCache.get(k)!;
  const v = await client.readContract({ address: factory, abi: factoryAbi, functionName: fn, args }) as string;
  _poolAddrCache.set(k, v);
  return v;
}

async function cachedToken0(client: any, pool: string, abi: any): Promise<string> {
  const k = pool.toLowerCase();
  if (_token0Cache.has(k)) return _token0Cache.get(k)!;
  const v = await client.readContract({ address: pool as `0x${string}`, abi, functionName: 'token0' }) as string;
  _token0Cache.set(k, v);
  return v;
}

function _slotFresh(k: string): any | null {
  const e = _slotCache.get(k);
  return e && (Date.now() - e.ts) < SLOT_CACHE_TTL_MS ? e.data : null;
}

async function cachedSlot0(client: any, pool: string, abi: any): Promise<any> {
  const k = `s0|${pool.toLowerCase()}`;
  const hit = _slotFresh(k); if (hit) return hit;
  const v = await client.readContract({ address: pool as `0x${string}`, abi, functionName: 'slot0' });
  _slotCache.set(k, { data: v, ts: Date.now() }); return v;
}

async function cachedLiquidity(client: any, pool: string, abi: any): Promise<bigint> {
  const k = `liq|${pool.toLowerCase()}`;
  const hit = _slotFresh(k); if (hit !== null) return hit as bigint;
  const v = await client.readContract({ address: pool as `0x${string}`, abi, functionName: 'liquidity' }) as bigint;
  _slotCache.set(k, { data: v, ts: Date.now() }); return v;
}

async function cachedReserves(client: any, pool: string): Promise<any> {
  const k = `rsv|${pool.toLowerCase()}`;
  const hit = _slotFresh(k); if (hit) return hit;
  const v = await client.readContract({ address: pool as `0x${string}`, abi: V2_POOL_ABI, functionName: 'getReserves' });
  _slotCache.set(k, { data: v, ts: Date.now() }); return v;
}


// ── QUOTER V2 — amount-aware simulation (official Base deployment) ─────────────
const QUOTER_V2_ADDRESS = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as `0x${string}`;
const QUOTER_V2_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
]);

const MIN_SQRT_PRICE = 2n ** 40n;
const AAVE_FLASH_FEE_PCT = 0.0005;

// ── BASE GAS PRICE ORACLE (predeployed at deterministic address on all OP-Stack chains) ─
// getL1FeeUpperBound(uint256 txSize) returns the L1 data-posting fee upper bound.
// This is the dominant cost component for small arb txs on Base — often 5-10x the L2 fee.
const GAS_PRICE_ORACLE   = "0x420000000000000000000000000000000000000F" as `0x${string}`;
const ARB_CALLDATA_BYTES = 500; // conservative estimate for a flash-loan arb tx

const UNI_V3_FACTORY    = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" as `0x${string}`;
const SLIPSTREAM_FACTORY = "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A" as `0x${string}`;
const AERO_FACTORY      = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as `0x${string}`;
const AERO_ROUTER       = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as `0x${string}`;
const SUSHI_V3_FACTORY  = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4" as `0x${string}`;  // SushiSwap V3 — same getPool(a,b,fee) ABI as UniV3
const SUSHI_V2_FACTORY  = "0x71524b4f93c58fcbf659783284e38825f0622859" as `0x${string}`;  // SushiSwap V2 — getPair(a,b) ABI
const ALIENBASE_FACTORY = "0x3e84d913803b02a4a7f027165e8ca42c14c0fde7" as `0x${string}`;  // AlienBase V2  — getPair(a,b) ABI
const NULL_ADDR         = "0x0000000000000000000000000000000000000000";

const WETH    = "0x4200000000000000000000000000000000000006";
const USDC    = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const cbETH   = "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22";
const USDbC   = "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA";
const cbBTC   = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
const wstETH  = "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452";
const USDT    = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";
const weETH   = "0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A";
const AERO    = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";
const DAI     = "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb";
const VIRTUAL = "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b";
const BRETT   = "0x532f27101965dd16442e59d40670faf5ebb142e4";
const MORPHO  = "0xbaa5cc21fd487b8fcc2f632f3f4e8d37262a0842";
const BNKR    = "0x22af33fe49fd1fa80c7149773dde5890d3c76f3b";
const CLANKER = "0x1bc0c42215582d5a085795f4badbac3ff36d1bcb";
const VVV     = "0xacfe6019ed1a7dc6f7b508c02d1b04ec88cc21bf";
const KTA     = "0xc0634090f2fe6c6d75e61be2b949464abb498973";
const TOSHI   = "0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4";
const DOGINME = "0x6921b130d297cc43754afba22e5eac0fbf8db75b";

const DECIMALS: Record<string, number> = {
  [WETH.toLowerCase()]:    18,
  [USDC.toLowerCase()]:    6,
  [cbETH.toLowerCase()]:   18,
  [USDbC.toLowerCase()]:   6,
  [cbBTC.toLowerCase()]:   8,
  [wstETH.toLowerCase()]:  18,
  [USDT.toLowerCase()]:    6,
  [weETH.toLowerCase()]:   18,
  [AERO.toLowerCase()]:    18,
  [DAI.toLowerCase()]:     18,
  [VIRTUAL.toLowerCase()]: 18,
  [BRETT.toLowerCase()]:   18,
  [MORPHO.toLowerCase()]:  18,
  [BNKR.toLowerCase()]:    18,
  [CLANKER.toLowerCase()]: 18,
  [VVV.toLowerCase()]:     18,
  [KTA.toLowerCase()]:     18,
  [TOSHI.toLowerCase()]:   18,
  [DOGINME.toLowerCase()]: 18,
};

const stableTokens = [USDC, USDbC, USDT, DAI].map(t => t.toLowerCase());

type VenueBType = 'aero_vamm' | 'aero_samm' | 'slipstream' | 'sushi_v2' | 'alienbase_v2';
type HopType = 'univ3' | 'slipstream' | 'aero_vamm' | 'aero_samm';

const VENUE_B_TYPE_MAP: Record<VenueBType, number> = {
  'slipstream':   0,
  'aero_vamm':    1,
  'aero_samm':    2,
  'sushi_v2':     3,  // placeholder — contract support pending Balancer flash receiver upgrade
  'alienbase_v2': 4,  // placeholder — contract support pending Balancer flash receiver upgrade
};

const VENUE_B_FEE_PCT: Record<VenueBType, number> = {
  'aero_vamm':    0.002,
  'aero_samm':    0.0002,
  'slipstream':   0.0005,
  'sushi_v2':     0.003,   // SushiSwap V2 — 0.3% LP fee
  'alienbase_v2': 0.002,   // AlienBase     — 0.2% LP fee
};

const TARGETS: {
  name: string; tokenA: string; tokenB: string;
  venueAName: string; venueAFactory: `0x${string}`; venueAParam: number;
  venueBName: string; venueBType: VenueBType;
  venueBFactory?: `0x${string}`; venueBParam?: number;
  executable: boolean;
}[] = [
  { name: "WETH-USDC",    tokenA: WETH,    tokenB: USDC,   venueAName: "UniswapV3_0.05%",  venueAFactory: UNI_V3_FACTORY, venueAParam: 500,   venueBName: "Aerodrome_vAMM",    venueBType: 'aero_vamm',  executable: true },
  { name: "cbETH-WETH",   tokenA: cbETH,   tokenB: WETH,   venueAName: "UniswapV3_0.01%",  venueAFactory: UNI_V3_FACTORY, venueAParam: 100,   venueBName: "Aerodrome_vAMM",    venueBType: 'aero_vamm',  executable: true },
  { name: "USDbC-USDC",   tokenA: USDbC,   tokenB: USDC,   venueAName: "UniswapV3_0.01%",  venueAFactory: UNI_V3_FACTORY, venueAParam: 100,   venueBName: "Aerodrome_sAMM",    venueBType: 'aero_samm',  executable: true },
  { name: "WETH-cbBTC",   tokenA: WETH,    tokenB: cbBTC,  venueAName: "UniswapV3_0.3%",   venueAFactory: UNI_V3_FACTORY, venueAParam: 3000,  venueBName: "Slipstream_100",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 100,  executable: true },
  { name: "wstETH-WETH",  tokenA: wstETH,  tokenB: WETH,   venueAName: "UniswapV3_0.01%",  venueAFactory: UNI_V3_FACTORY, venueAParam: 100,   venueBName: "Slipstream_1",      venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 1,    executable: true },
  { name: "USDC-USDT",    tokenA: USDC,    tokenB: USDT,   venueAName: "UniswapV3_0.01%",  venueAFactory: UNI_V3_FACTORY, venueAParam: 100,   venueBName: "Slipstream_1",      venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 1,    executable: true },
  { name: "weETH-WETH",   tokenA: weETH,   tokenB: WETH,   venueAName: "UniswapV3_0.01%",  venueAFactory: UNI_V3_FACTORY, venueAParam: 100,   venueBName: "Slipstream_1",      venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 1,    executable: true },
  { name: "WETH-AERO",    tokenA: WETH,    tokenB: AERO,   venueAName: "UniswapV3_0.3%",   venueAFactory: UNI_V3_FACTORY, venueAParam: 3000,  venueBName: "Slipstream_200",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200,  executable: true },
  { name: "DAI-USDC",     tokenA: DAI,     tokenB: USDC,   venueAName: "UniswapV3_0.01%",  venueAFactory: UNI_V3_FACTORY, venueAParam: 100,   venueBName: "Aerodrome_sAMM",    venueBType: 'aero_samm',  executable: true },
  { name: "cbBTC-USDC",   tokenA: cbBTC,   tokenB: USDC,   venueAName: "UniswapV3_0.01%",  venueAFactory: UNI_V3_FACTORY, venueAParam: 100,   venueBName: "Slipstream_1",      venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 1,    executable: true },
  { name: "VIRTUAL-WETH", tokenA: VIRTUAL, tokenB: WETH,   venueAName: "UniswapV3_0.05%",  venueAFactory: UNI_V3_FACTORY, venueAParam: 500,   venueBName: "Slipstream_100",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 100,  executable: true },
  { name: "WETH-USDT",    tokenA: WETH,    tokenB: USDT,   venueAName: "UniswapV3_0.05%",  venueAFactory: UNI_V3_FACTORY, venueAParam: 500,   venueBName: "Slipstream_100",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 100,  executable: true },
  { name: "BRETT-WETH",   tokenA: BRETT,   tokenB: WETH,   venueAName: "UniswapV3_1%",     venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200,  executable: true },
  { name: "MORPHO-WETH",  tokenA: MORPHO,  tokenB: WETH,   venueAName: "UniswapV3_0.3%",   venueAFactory: UNI_V3_FACTORY, venueAParam: 3000,  venueBName: "Slipstream_200",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200,  executable: true },
  { name: "BNKR-WETH",    tokenA: BNKR,    tokenB: WETH,   venueAName: "UniswapV3_1%",     venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200,  executable: true },
  { name: "CLANKER-WETH", tokenA: CLANKER, tokenB: WETH,   venueAName: "UniswapV3_1%",     venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200,  executable: true },
  { name: "VVV-WETH",     tokenA: VVV,     tokenB: WETH,   venueAName: "UniswapV3_1%",     venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_100",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 100,  executable: true },
  { name: "KTA-WETH",     tokenA: KTA,     tokenB: WETH,   venueAName: "UniswapV3_1%",     venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200,  executable: true },
  { name: "TOSHI-WETH",   tokenA: TOSHI,   tokenB: WETH,   venueAName: "UniswapV3_1%",     venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200,  executable: true },
  { name: "DOGINME-WETH", tokenA: DOGINME, tokenB: WETH,   venueAName: "UniswapV3_1%",     venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200,  executable: true },

  // ── SUSHISWAP V3 — same getPool/slot0 interface as UniV3, drop-in venueA ──
  // executable: false until Balancer flash receiver contract deployed
  { name: "WETH-USDC [SushiV3]",  tokenA: WETH,  tokenB: USDC,  venueAName: "SushiV3_0.05%", venueAFactory: SUSHI_V3_FACTORY, venueAParam: 500,  venueBName: "Aerodrome_vAMM",  venueBType: 'aero_vamm',  executable: false },
  { name: "cbETH-WETH [SushiV3]", tokenA: cbETH, tokenB: WETH,  venueAName: "SushiV3_0.05%", venueAFactory: SUSHI_V3_FACTORY, venueAParam: 500,  venueBName: "Aerodrome_vAMM",  venueBType: 'aero_vamm',  executable: false },
  { name: "WETH-cbBTC [SushiV3]", tokenA: WETH,  tokenB: cbBTC, venueAName: "SushiV3_0.3%",  venueAFactory: SUSHI_V3_FACTORY, venueAParam: 3000, venueBName: "Slipstream_100",  venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 100, executable: false },

  // ── SUSHISWAP V2 — getPair factory, getReserves pricing ──
  { name: "WETH-USDC [SushiV2]",  tokenA: WETH,  tokenB: USDC,  venueAName: "UniswapV3_0.05%", venueAFactory: UNI_V3_FACTORY, venueAParam: 500, venueBName: "SushiSwap_V2",   venueBType: 'sushi_v2',    venueBFactory: SUSHI_V2_FACTORY,  executable: false },

  // ── ALIENBASE V2 — Base-native DEX, strong BRETT liquidity ──
  { name: "BRETT-WETH [AlienBase]", tokenA: BRETT, tokenB: WETH, venueAName: "UniswapV3_1%",    venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "AlienBase_V2", venueBType: 'alienbase_v2', venueBFactory: ALIENBASE_FACTORY, executable: false },
  { name: "WETH-USDC [AlienBase]",  tokenA: WETH,  tokenB: USDC, venueAName: "UniswapV3_0.05%", venueAFactory: UNI_V3_FACTORY, venueAParam: 500,   venueBName: "AlienBase_V2", venueBType: 'alienbase_v2', venueBFactory: ALIENBASE_FACTORY, executable: false },
];

interface TriHop {
  name: string;
  tokenIn: string;
  tokenOut: string;
  factory: `0x${string}`;
  param: number;
  poolType: HopType;
  feePct: number;
}

interface TriCycle {
  name: string;
  startToken: string;
  hops: [TriHop, TriHop, TriHop];
}

const TRI_CYCLES: TriCycle[] = [
  { name: "WETH→USDC→cbBTC→WETH", startToken: WETH, hops: [
      { name: "UniV3_0.05%",  tokenIn: WETH,  tokenOut: USDC,  factory: UNI_V3_FACTORY,    param: 500,  poolType: 'univ3',      feePct: 0.0005 },
      { name: "UniV3_0.01%",  tokenIn: USDC,  tokenOut: cbBTC, factory: UNI_V3_FACTORY,    param: 100,  poolType: 'univ3',      feePct: 0.0001 },
      { name: "Slip_100",     tokenIn: cbBTC, tokenOut: WETH,  factory: SLIPSTREAM_FACTORY, param: 100, poolType: 'slipstream', feePct: 0.0001 },
  ]},
  { name: "WETH→cbETH→USDC→WETH", startToken: WETH, hops: [
      { name: "UniV3_0.01%",  tokenIn: WETH,  tokenOut: cbETH, factory: UNI_V3_FACTORY,    param: 100,  poolType: 'univ3',      feePct: 0.0001 },
      { name: "UniV3_0.05%",  tokenIn: cbETH, tokenOut: USDC,  factory: UNI_V3_FACTORY,    param: 500,  poolType: 'univ3',      feePct: 0.0005 },
      { name: "Aero_vAMM",    tokenIn: USDC,  tokenOut: WETH,  factory: AERO_FACTORY,      param: 0,    poolType: 'aero_vamm',  feePct: 0.002  },
  ]},
  { name: "WETH→wstETH→USDC→WETH", startToken: WETH, hops: [
      { name: "UniV3_0.01%",  tokenIn: WETH,   tokenOut: wstETH, factory: UNI_V3_FACTORY,    param: 100,  poolType: 'univ3',      feePct: 0.0001 },
      { name: "UniV3_0.05%",  tokenIn: wstETH, tokenOut: USDC,   factory: UNI_V3_FACTORY,    param: 500,  poolType: 'univ3',      feePct: 0.0005 },
      { name: "Aero_vAMM",    tokenIn: USDC,   tokenOut: WETH,   factory: AERO_FACTORY,      param: 0,    poolType: 'aero_vamm',  feePct: 0.002  },
  ]},
  // REMOVED: WETH→weETH→USDC→WETH — weETH/USDC UniV3 fee=500 pool has 0 liquidity (phantom pool)
  { name: "WETH→AERO→USDC→WETH", startToken: WETH, hops: [
      { name: "Slip_200",     tokenIn: WETH, tokenOut: AERO, factory: SLIPSTREAM_FACTORY,  param: 200,  poolType: 'slipstream', feePct: 0.0005 },
      { name: "UniV3_0.3%",   tokenIn: AERO, tokenOut: USDC, factory: UNI_V3_FACTORY,      param: 3000, poolType: 'univ3',      feePct: 0.003  },
      { name: "Aero_vAMM",    tokenIn: USDC, tokenOut: WETH, factory: AERO_FACTORY,        param: 0,    poolType: 'aero_vamm',  feePct: 0.002  },
  ]},
  { name: "WETH→VIRTUAL→USDC→WETH", startToken: WETH, hops: [
      { name: "Slip_100",     tokenIn: WETH,    tokenOut: VIRTUAL, factory: SLIPSTREAM_FACTORY, param: 100,  poolType: 'slipstream', feePct: 0.0005 },
      { name: "UniV3_0.05%",  tokenIn: VIRTUAL, tokenOut: USDC,    factory: UNI_V3_FACTORY,     param: 500,  poolType: 'univ3',      feePct: 0.0005 },
      { name: "Aero_vAMM",    tokenIn: USDC,    tokenOut: WETH,    factory: AERO_FACTORY,       param: 0,    poolType: 'aero_vamm',  feePct: 0.002  },
  ]},
  { name: "USDC→WETH→cbBTC→USDC", startToken: USDC, hops: [
      { name: "Aero_vAMM",    tokenIn: USDC,  tokenOut: WETH,  factory: AERO_FACTORY,      param: 0,    poolType: 'aero_vamm',  feePct: 0.002  },
      { name: "UniV3_0.3%",   tokenIn: WETH,  tokenOut: cbBTC, factory: UNI_V3_FACTORY,    param: 3000, poolType: 'univ3',      feePct: 0.003  },
      { name: "Slip_1",       tokenIn: cbBTC, tokenOut: USDC,  factory: SLIPSTREAM_FACTORY, param: 1,   poolType: 'slipstream', feePct: 0.0001 },
  ]},
  // REMOVED: WETH→cbETH→cbBTC→WETH — cbETH/cbBTC UniV3 fee=100 pool has 0 liquidity (phantom pool)
];

const UNI_FACTORY_ABI = parseAbi(['function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)']);
const SLIPSTREAM_FACTORY_ABI = parseAbi(['function getPool(address tokenA, address tokenB, int24 tickSpacing) view returns (address pool)']);
const AERO_FACTORY_ABI = parseAbi(['function getPool(address tokenA, address tokenB, bool stable) view returns (address pool)']);
const V3_POOL_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function liquidity() view returns (uint128)'
]);
const SLIPSTREAM_POOL_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)',
  'function token0() view returns (address)',
  'function liquidity() view returns (uint128)'
]);
const V2_POOL_ABI = parseAbi([
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)'
]);
// V2-style DEX factory ABI (SushiSwap V2, AlienBase) — uses getPair instead of getPool
const V2_PAIR_FACTORY_ABI = parseAbi(['function getPair(address tokenA, address tokenB) view returns (address pair)']);
const AERO_ROUTER_ABI = parseAbi(['function getAmountsOut(uint256 amountIn, (address from, address to, bool stable, address factory)[] routes) view returns (uint256[] amounts)']);
const GAS_PRICE_ORACLE_ABI = parseAbi([
  'function getL1FeeUpperBound(uint256 unsignedTxSize) view returns (uint256)'
]);

// ── PER-DEX GAS UNIT ESTIMATES ────────────────────────────────────────────────
// Ported from TheWarden AdvancedGasEstimator DEFAULT_DEX_CONFIGS (Base mainnet validated).
// venueA is always UniV3/SushiV3 (120k CL swap). venueB varies by AMM type.
const DEX_GAS_UNITS: Record<string, number> = {
  'univ3':        120_000,  // Uniswap V3 / SushiSwap V3 — concentrated liquidity
  'slipstream':   120_000,  // Aerodrome Slipstream CL — same interface
  'aero_vamm':    120_000,  // Aerodrome vAMM
  'aero_samm':    120_000,  // Aerodrome sAMM (stable)
  'sushi_v2':     100_000,  // SushiSwap V2 — simpler constant-product AMM
  'alienbase_v2': 100_000,  // AlienBase V2 — same V2 interface
};

// Total gas for a 2-pool arb = venueA (always UniV3/SushiV3, 120k) + venueB (type-dependent)
function estimatePairGasUnits(venueBType: VenueBType): bigint {
  return BigInt(120_000 + (DEX_GAS_UNITS[venueBType] ?? 120_000));
}
const WARDEN_ABI = parseAbi([
  'function executeArb(address tokenA, address tokenB, address uniV3Pool, address venueBPool, uint8 venueBType, uint256 amountIn, uint8 direction, uint256 minProfit, bytes32 txRef) external',
  'function executeTriArb(address startToken, address midToken1, address midToken2, address pool1, address pool2, address pool3, uint8 pool1Type, uint8 pool2Type, uint8 pool3Type, uint256 amountIn, uint256 minProfit, bytes32 txRef) external'
]);

// ── FLASH SWAP V3 ABI ─────────────────────────────────────────────────────
// executeArbitrage(address borrowToken, uint256 borrowAmount, (SwapStep[] steps, uint256 borrowAmount, uint256 minFinalAmount) path)
// SwapStep = (address pool, address tokenIn, address tokenOut, uint24 fee, uint256 minOut, uint8 dexType)
const FLASH_SWAP_V3_ABI = parseAbi([
  'function executeArbitrage(address borrowToken, uint256 borrowAmount, ((address pool, address tokenIn, address tokenOut, uint24 fee, uint256 minOut, uint8 dexType)[] steps, uint256 borrowAmount, uint256 minFinalAmount) path) external',
]);

// FlashSwapV3 DEX type constants
const FSV3_DEX_UNIV3       = 0;
const FSV3_DEX_SUSHISWAP   = 1;
const FSV3_DEX_AERODROME   = 3;  // Aerodrome V2 vAMM/sAMM — fee: 0=volatile, 1=stable
const FSV3_DEX_SLIPSTREAM  = 7;  // Aerodrome CL — fee = tickSpacing (1, 100, 200)

// Map HopType → FlashSwapV3 dexType
const FSV3_DEX_MAP: Record<string, number> = {
  'univ3':       FSV3_DEX_UNIV3,
  'slipstream':  FSV3_DEX_SLIPSTREAM,
  'aero_vamm':   FSV3_DEX_AERODROME,
  'aero_samm':   FSV3_DEX_AERODROME,
};

// Map VenueBType → FlashSwapV3 dexType + fee encoding
const FSV3_VENUE_B_MAP: Record<VenueBType, { dexType: number; fee: number }> = {
  'slipstream': { dexType: FSV3_DEX_SLIPSTREAM, fee: 0 },  // fee overridden by venueBParam (tickSpacing)
  'aero_vamm':  { dexType: FSV3_DEX_AERODROME,  fee: 0 },  // 0 = volatile
  'aero_samm':  { dexType: FSV3_DEX_AERODROME,  fee: 1 },  // 1 = stable
};

// Aerodrome factory addresses for route encoding
const AERO_DEFAULT_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";

// Map hop poolType strings to WardenArb v3 contract uint8 values (legacy)
const TRI_POOL_TYPE_MAP: Record<string, number> = {
  'univ3': 0,        // POOL_UNIV3
  'slipstream': 0,   // Same UniV3-style CL interface
  'aero_vamm': 1,    // POOL_AERO_VAMM
  'aero_samm': 2,    // POOL_AERO_SAMM
};

// ── PAYMASTER EXECUTION ─────────────────────────────────────────────────────
// Lazy-initialized bundler client for gasless execution via Coinbase Paymaster
let _bundlerClient: any = null;
let _smartAccount: any = null;

async function getBundlerClient(publicClient: any) {
  if (_bundlerClient) return _bundlerClient;
  if (!BOT_PRIVATE_KEY) throw new Error("BOT_PRIVATE_KEY not set");
  const eoaAccount = privateKeyToAccount(`0x${BOT_PRIVATE_KEY}` as `0x${string}`);
  const paymasterClient = createPublicClient({ chain: base, transport: http(COINBASE_RPC_URL) });
  _smartAccount = await toCoinbaseSmartAccount({
    client: paymasterClient,
    owners: [eoaAccount],
    version: '1.1',
  });
  _bundlerClient = createBundlerClient({
    account: _smartAccount,
    client: paymasterClient,
    transport: http(COINBASE_RPC_URL),
    chain: base,
  });
  return _bundlerClient;
}

// Execute a contract call via Paymaster (gasless)
async function executeViaPaymaster(
  publicClient: any,
  contractAddr: `0x${string}`,
  abi: any,
  functionName: string,
  args: readonly any[],
): Promise<{ txHash: string; userOpHash: string }> {
  const bundlerClient = await getBundlerClient(publicClient);
  const callData = encodeFunctionData({ abi, functionName, args });
  const userOpHash = await bundlerClient.sendUserOperation({
    calls: [{ to: contractAddr, data: callData, value: 0n }],
    paymaster: true,
  });
  const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });
  return { txHash: receipt.receipt.transactionHash, userOpHash };
}

function calcV3Price(sqrtPriceX96: bigint, token0Addr: string, tokenA: string, decA: number, decB: number): number {
  const sqrtP = Number(sqrtPriceX96);
  const rawRatio = (sqrtP / 2 ** 96) ** 2;
  const tokenAIsToken0 = token0Addr.toLowerCase() === tokenA.toLowerCase();
  return tokenAIsToken0 ? rawRatio * Math.pow(10, decA - decB) : (1 / rawRatio) * Math.pow(10, decA - decB);
}

function calcAeroPrice(r0: bigint, r1: bigint, token0Addr: string, tokenA: string, decA: number, decB: number): number {
  const R0 = Number(r0);
  const R1 = Number(r1);
  const tokenAIsToken0 = token0Addr.toLowerCase() === tokenA.toLowerCase();
  return tokenAIsToken0 ? R1 * Math.pow(10, decA - decB) / R0 : R0 * Math.pow(10, decA - decB) / R1;
}

/// Derive the USD price of tokenB for a given pair
function getTokenBPriceUsd(
  target: typeof TARGETS[0],
  venueAPrice: number,
  ethPriceUsd: number
): number {
  const tokenBAddr = target.tokenB.toLowerCase();

  // Stablecoins: $1
  if (stableTokens.includes(tokenBAddr)) return 1;

  // WETH: use tracked ETH price
  if (tokenBAddr === WETH.toLowerCase()) return ethPriceUsd;

  // For exotic tokenB (cbBTC, AERO), derive from pair prices:
  // If tokenA is WETH: venueAPrice = WETH/tokenB ratio
  //   → tokenB price = ethPriceUsd / venueAPrice
  if (target.tokenA.toLowerCase() === WETH.toLowerCase() && venueAPrice > 0) {
    return ethPriceUsd / venueAPrice;
  }

  // Fallback: use $1 (conservative — contract profit check protects us)
  return 1;
}

serve(async (_req) => {
  const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const [configRes, gasPrice] = await Promise.all([
      supabase.from('arbitrage_config').select('*').eq('id', 1).single(),
      publicClient.getGasPrice(),
    ]);

    const { trade_size_usd, min_profit_threshold_usd } = configRes.data;
    const estimatedGasUnits = 450000n; // V2 uses more gas (multi-swap + callback)
    const gasCostEth = Number(formatUnits(gasPrice * estimatedGasUnits, 18));
    let ethPriceUsd = 2000;
    const matrixResults: any[] = [];

    for (const target of TARGETS) {
      try {
        const decA = DECIMALS[target.tokenA.toLowerCase()] ?? 18;
        const decB = DECIMALS[target.tokenB.toLowerCase()] ?? 18;

        const venueAPoolAddr = await publicClient.readContract({
          address: target.venueAFactory, abi: UNI_FACTORY_ABI, functionName: 'getPool',
          args: [target.tokenA as `0x${string}`, target.tokenB as `0x${string}`, target.venueAParam],
        });

        let venueBPoolAddr: string;
        if (target.venueBType === 'slipstream') {
          venueBPoolAddr = await publicClient.readContract({
            address: target.venueBFactory!, abi: SLIPSTREAM_FACTORY_ABI, functionName: 'getPool',
            args: [target.tokenA as `0x${string}`, target.tokenB as `0x${string}`, target.venueBParam!],
          }) as string;
        } else {
          const isStable = target.venueBType === 'aero_samm';
          venueBPoolAddr = await publicClient.readContract({
            address: AERO_FACTORY, abi: AERO_FACTORY_ABI, functionName: 'getPool',
            args: [target.tokenA as `0x${string}`, target.tokenB as `0x${string}`, isStable],
          }) as string;
        }

async function scanTarget(
  target: typeof TARGETS[0],
  publicClient: any,
  execRpcClient: any,
  supabase: any,
  trade_size_usd: number,
  min_profit_threshold_usd: number,
  gasCostEth: number,
  ethPriceRef: { value: number },
): Promise<any> {
  try {
    const decA = DECIMALS[target.tokenA.toLowerCase()] ?? 18;
    const decB = DECIMALS[target.tokenB.toLowerCase()] ?? 18;
    const venueAPoolAddr = await cachedPoolAddr(publicClient, target.venueAFactory, UNI_FACTORY_ABI, 'getPool',
      [target.tokenA as `0x${string}`, target.tokenB as `0x${string}`, target.venueAParam]);
    let venueBPoolAddr: string;
    if (target.venueBType === 'slipstream') {
      venueBPoolAddr = await cachedPoolAddr(publicClient, target.venueBFactory!, SLIPSTREAM_FACTORY_ABI, 'getPool',
        [target.tokenA as `0x${string}`, target.tokenB as `0x${string}`, target.venueBParam!]);
    } else {
      const isStable = target.venueBType === 'aero_samm';
      venueBPoolAddr = await cachedPoolAddr(publicClient, AERO_FACTORY, AERO_FACTORY_ABI, 'getPool',
        [target.tokenA as `0x${string}`, target.tokenB as `0x${string}`, isStable]);
    }
    if (venueAPoolAddr === NULL_ADDR || venueBPoolAddr === NULL_ADDR) return { target: target.name, status: "POOL_NOT_FOUND" };
    const [venueASlot0, venueAToken0] = await Promise.all([
      cachedSlot0(publicClient, venueAPoolAddr, V3_POOL_ABI),
      cachedToken0(publicClient, venueAPoolAddr, V3_POOL_ABI),
    ]);
    if (venueASlot0[0] < MIN_SQRT_PRICE) return { target: target.name, status: "GHOST_POOL" };
    const venueAPrice = calcV3Price(venueASlot0[0], venueAToken0 as string, target.tokenA, decA, decB);
    let venueBPrice: number;
    if (target.venueBType === 'slipstream') {
      const [slipSlot0, slipToken0] = await Promise.all([
        cachedSlot0(publicClient, venueBPoolAddr, SLIPSTREAM_POOL_ABI),
        cachedToken0(publicClient, venueBPoolAddr, SLIPSTREAM_POOL_ABI),
      ]);
      if (slipSlot0[0] < MIN_SQRT_PRICE) return { target: target.name, status: "GHOST_POOL" };
      venueBPrice = calcV3Price(slipSlot0[0], slipToken0 as string, target.tokenA, decA, decB);
    } else if (target.venueBType === 'aero_samm') {
      const amountIn = BigInt(10 ** decA);
      const route = [{ from: target.tokenA as `0x${string}`, to: target.tokenB as `0x${string}`, stable: true, factory: AERO_FACTORY }];
      const amounts = await publicClient.readContract({ address: AERO_ROUTER, abi: AERO_ROUTER_ABI, functionName: 'getAmountsOut', args: [amountIn, route] }) as bigint[];
      venueBPrice = Number(amounts[1]) / Number(amountIn) * Math.pow(10, decA - decB);
    } else {
      const [aeroReserves, aeroToken0] = await Promise.all([
        cachedReserves(publicClient, venueBPoolAddr),
        cachedToken0(publicClient, venueBPoolAddr, V2_POOL_ABI),
      ]);
      venueBPrice = calcAeroPrice(aeroReserves[0], aeroReserves[1], aeroToken0 as string, target.tokenA, decA, decB);
    }
    if (target.name === "WETH-USDC") ethPriceRef.value = (venueAPrice + venueBPrice) / 2;
    const spreadRaw = Math.abs(venueAPrice - venueBPrice) / Math.max(venueAPrice, venueBPrice);
    const direction = venueAPrice >= venueBPrice ? 0 : 1;
    const dirStr = venueAPrice >= venueBPrice ? `BUY_${target.venueBName}→SELL_${target.venueAName}` : `BUY_${target.venueAName}→SELL_${target.venueBName}`;
    const venueAFeePct  = target.venueAParam / 1_000_000;
    const venueBFeePct  = VENUE_B_FEE_PCT[target.venueBType];
    const totalFeePct   = venueAFeePct + venueBFeePct + AAVE_FLASH_FEE_PCT;
    const netSpread     = spreadRaw - totalFeePct;
    if (netSpread <= 0) return { target: target.name, venueA_price: `$${venueAPrice.toFixed(6)}`, venueB_price: `$${venueBPrice.toFixed(6)}`, spread_gross: `${(spreadRaw*100).toFixed(4)}%`, total_fees: `${(totalFeePct*100).toFixed(4)}%`, net_spread: `${(netSpread*100).toFixed(4)}%`, action: "SKIPPED_FEES_EXCEED_SPREAD", reject_reason: `fees(${(totalFeePct*100).toFixed(2)}%) > spread(${(spreadRaw*100).toFixed(2)}%)` };
    const tokenBPriceUsd = getTokenBPriceUsd(target, venueAPrice, ethPriceRef.value);
    const grossProfitUsd = trade_size_usd * netSpread;
    const gasCostUsd     = gasCostEth * ethPriceRef.value;
    const netProfit      = grossProfitUsd - gasCostUsd;
    const isProfitable   = netProfit > min_profit_threshold_usd;
    let action = "HOLD"; let simulationResult = null; let executionHash = null; let executionError = null; let rejectReason = null;
    if (!isProfitable) rejectReason = `net_profit $${netProfit.toFixed(4)} < threshold $${min_profit_threshold_usd}`;
    if (isProfitable) {
      if (target.executable && BOT_PRIVATE_KEY) {
        const amountInTokenB = trade_size_usd / tokenBPriceUsd;
        const amountInWei = parseUnits(amountInTokenB.toFixed(decB > 6 ? 8 : 6), decB);
        const minProfitTokenB = (netProfit * 0.8) / tokenBPriceUsd;
        const minProfitWei = parseUnits(minProfitTokenB > 0 ? minProfitTokenB.toFixed(decB > 6 ? 8 : 6) : "0", decB);
        const txRef = `0x${crypto.randomUUID().replace(/-/g, '').padEnd(64, '0')}` as `0x${string}`;

        // ── Build call args: FlashSwapV3 (0% Balancer flash loan) or legacy WardenArb v3 ──
        const contractAddr = USE_FLASH_SWAP_V3 ? FLASH_SWAP_V3_ADDR : CONTRACT_ADDR;
        const contractAbi  = USE_FLASH_SWAP_V3 ? FLASH_SWAP_V3_ABI  : WARDEN_ABI;
        let callArgs: any;

        if (USE_FLASH_SWAP_V3) {
          // Build FlashSwapV3 universal swap path (2 hops)
          // Borrow tokenB → swap tokenB→tokenA on cheap venue → swap tokenA→tokenB on expensive venue
          const venueBMapping = FSV3_VENUE_B_MAP[target.venueBType];
          const venueBFee = target.venueBType === 'slipstream' ? (target.venueBParam ?? 100) : venueBMapping.fee;

          const step1 = direction === 0
            ? { pool: venueAPoolAddr as `0x${string}`, tokenIn: target.tokenB as `0x${string}`, tokenOut: target.tokenA as `0x${string}`, fee: target.venueAParam, minOut: 0n, dexType: FSV3_DEX_UNIV3 }
            : { pool: venueBPoolAddr as `0x${string}`, tokenIn: target.tokenB as `0x${string}`, tokenOut: target.tokenA as `0x${string}`, fee: venueBFee, minOut: 0n, dexType: venueBMapping.dexType };
          const step2 = direction === 0
            ? { pool: venueBPoolAddr as `0x${string}`, tokenIn: target.tokenA as `0x${string}`, tokenOut: target.tokenB as `0x${string}`, fee: venueBFee, minOut: 0n, dexType: venueBMapping.dexType }
            : { pool: venueAPoolAddr as `0x${string}`, tokenIn: target.tokenA as `0x${string}`, tokenOut: target.tokenB as `0x${string}`, fee: target.venueAParam, minOut: 0n, dexType: FSV3_DEX_UNIV3 };

          const path = {
            steps: [step1, step2],
            borrowAmount: amountInWei,
            minFinalAmount: amountInWei + minProfitWei,  // must return borrow + min profit
          };

          callArgs = {
            address: FLASH_SWAP_V3_ADDR,
            abi: FLASH_SWAP_V3_ABI,
            functionName: 'executeArbitrage' as const,
            args: [target.tokenB as `0x${string}`, amountInWei, path] as const,
          };
        } else {
          // Legacy WardenArb v3 path
          callArgs = {
            address: CONTRACT_ADDR, abi: WARDEN_ABI, functionName: 'executeArb' as const,
            args: [target.tokenA as `0x${string}`, target.tokenB as `0x${string}`, venueAPoolAddr as `0x${string}`, venueBPoolAddr as `0x${string}`, VENUE_B_TYPE_MAP[target.venueBType], amountInWei, direction, minProfitWei, txRef] as const,
          };
        }

        try {
          // Simulate from smart wallet address (the contract owner)
          await execRpcClient.simulateContract({ ...callArgs, account: SMART_WALLET });
          simulationResult = "SIMULATION_SUCCESS";
          if (DRY_RUN) {
            action = "DRY_RUN_SUCCESS";
            await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: target.venueAName, source_b: target.venueBName, token_pair: target.name, spread_pct: spreadRaw*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit, direction: dirStr, status: 'DRY_RUN_SUCCESS', tx_hash: null, execution_engine: USE_FLASH_SWAP_V3 ? 'flash_swap_v3' : 'warden_arb_v3' });
          } else {
            // LIVE: Execute via Coinbase Paymaster (gasless)
            action = "EXECUTE";
            const fnName = USE_FLASH_SWAP_V3 ? 'executeArbitrage' : 'executeArb';
            const { txHash } = await executeViaPaymaster(publicClient, contractAddr, contractAbi, fnName, callArgs.args);
            executionHash = txHash;
            await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: target.venueAName, source_b: target.venueBName, token_pair: target.name, spread_pct: spreadRaw*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit, direction: dirStr, status: 'EXECUTED', tx_hash: txHash, execution_engine: USE_FLASH_SWAP_V3 ? 'flash_swap_v3' : 'warden_arb_v3' });
        if (venueAPoolAddr === NULL_ADDR || venueBPoolAddr === NULL_ADDR) {
          matrixResults.push({ target: target.name, status: "POOL_NOT_FOUND", venueA_pool: venueAPoolAddr, venueB_pool: venueBPoolAddr });
          continue;
        }

        const [venueASlot0, venueAToken0] = await Promise.all([
          publicClient.readContract({ address: venueAPoolAddr as `0x${string}`, abi: V3_POOL_ABI, functionName: 'slot0' }),
          publicClient.readContract({ address: venueAPoolAddr as `0x${string}`, abi: V3_POOL_ABI, functionName: 'token0' }),
        ]);

        if (venueASlot0[0] < MIN_SQRT_PRICE) {
          matrixResults.push({ target: target.name, status: "GHOST_POOL", venue: target.venueAName, pool: venueAPoolAddr });
          continue;
        }
        const venueAPrice = calcV3Price(venueASlot0[0], venueAToken0 as string, target.tokenA, decA, decB);

        let venueBPrice: number;

        if (target.venueBType === 'slipstream') {
          const [slipSlot0, slipToken0] = await Promise.all([
            publicClient.readContract({ address: venueBPoolAddr as `0x${string}`, abi: SLIPSTREAM_POOL_ABI, functionName: 'slot0' }),
            publicClient.readContract({ address: venueBPoolAddr as `0x${string}`, abi: SLIPSTREAM_POOL_ABI, functionName: 'token0' }),
          ]);
          if (slipSlot0[0] < MIN_SQRT_PRICE) {
            matrixResults.push({ target: target.name, status: "GHOST_POOL", venue: target.venueBName, pool: venueBPoolAddr });
            continue;
          }
          venueBPrice = calcV3Price(slipSlot0[0], slipToken0 as string, target.tokenA, decA, decB);
        } else if (target.venueBType === 'aero_samm') {
          const amountIn = BigInt(10 ** decA);
          const route = [{ from: target.tokenA as `0x${string}`, to: target.tokenB as `0x${string}`, stable: true, factory: AERO_FACTORY }];
          const amounts = await publicClient.readContract({
            address: AERO_ROUTER, abi: AERO_ROUTER_ABI, functionName: 'getAmountsOut', args: [amountIn, route],
          }) as bigint[];
          venueBPrice = Number(amounts[1]) / Number(amountIn) * Math.pow(10, decA - decB);
        } else {
          const [aeroReserves, aeroToken0] = await Promise.all([
            publicClient.readContract({ address: venueBPoolAddr as `0x${string}`, abi: V2_POOL_ABI, functionName: 'getReserves' }),
            publicClient.readContract({ address: venueBPoolAddr as `0x${string}`, abi: V2_POOL_ABI, functionName: 'token0' }),
          ]);
          venueBPrice = calcAeroPrice(aeroReserves[0], aeroReserves[1], aeroToken0 as string, target.tokenA, decA, decB);
        }

        if (target.name === "WETH-USDC") ethPriceUsd = (venueAPrice + venueBPrice) / 2;

        const spreadRaw = Math.abs(venueAPrice - venueBPrice) / Math.max(venueAPrice, venueBPrice);
        const direction = venueAPrice >= venueBPrice ? 0 : 1;
        const dirStr = venueAPrice >= venueBPrice
          ? `BUY_${target.venueBName}\u2192SELL_${target.venueAName}`
          : `BUY_${target.venueAName}\u2192SELL_${target.venueBName}`;

        if (spreadRaw < MIN_SPREAD_THRESHOLD) {
          matrixResults.push({ target: target.name, venueA_price: `$${venueAPrice.toFixed(6)}`, venueB_price: `$${venueBPrice.toFixed(6)}`, spread_pct: `${(spreadRaw * 100).toFixed(4)}%`, action: "SKIPPED_LOW_SPREAD" });
          continue;
        }

        // ── V2: Calculate tokenB-denominated trade size and profit ────────
        const tokenBPriceUsd = getTokenBPriceUsd(target, venueAPrice, ethPriceUsd);
        const aaveFlashFeePct = 0.0005; // Aave V3 flash loan fee: 0.05%
        const grossProfitUsd = Number(trade_size_usd) * spreadRaw;
        const aaveFeeCostUsd = Number(trade_size_usd) * aaveFlashFeePct;
        const gasCostUsd = gasCostEth * ethPriceUsd;
        const netProfit = grossProfitUsd - gasCostUsd - aaveFeeCostUsd;
        const isProfitable = netProfit > Number(min_profit_threshold_usd);

        let action = "HOLD";
        let simulationResult: string | null = null;
        let executionHash: string | null = null;
        let executionError: string | null = null;

        if (isProfitable) {
          if (target.executable && BOT_PRIVATE_KEY) {
            const account = privateKeyToAccount(`0x${BOT_PRIVATE_KEY}` as `0x${string}`);
            const walletClient = createWalletClient({ account, chain: base, transport: http(BASE_RPC_URL) });

            // ── V2: Build contract call with full pair parameters ────────
            // amountIn: trade_size_usd converted to tokenB units
            const amountInTokenB = Number(trade_size_usd) / tokenBPriceUsd;
            const amountInWei = parseUnits(amountInTokenB.toFixed(decB > 6 ? 8 : 6), decB);

            // minProfit: 80% of net profit in tokenB units
            const minProfitTokenB = (netProfit * 0.8) / tokenBPriceUsd;
            const minProfitWei = parseUnits(
              minProfitTokenB > 0 ? minProfitTokenB.toFixed(decB > 6 ? 8 : 6) : "0",
              decB
            );

            const txRef = `0x${crypto.randomUUID().replace(/-/g, '').padEnd(64, '0')}` as `0x${string}`;

            const callArgs = {
              address: CONTRACT_ADDR,
              abi: WARDEN_ABI,
              functionName: 'executeArb' as const,
              args: [
                target.tokenA as `0x${string}`,       // tokenA
                target.tokenB as `0x${string}`,       // tokenB (flash loaned)
                venueAPoolAddr as `0x${string}`,      // uniV3Pool
                venueBPoolAddr as `0x${string}`,      // venueBPool
                VENUE_B_TYPE_MAP[target.venueBType],  // venueBType (uint8)
                amountInWei,                           // amountIn
                direction,                             // direction
                minProfitWei,                          // minProfit
                txRef,                                 // txRef
              ] as const,
            };

            try {
              await publicClient.simulateContract({ ...callArgs, account });
              simulationResult = "SIMULATION_SUCCESS";
              if (DRY_RUN) {
                action = "DRY_RUN_SUCCESS";
                await supabase.from('arbitrage_logs').insert({
                  network: 'base', source_a: target.venueAName, source_b: target.venueBName,
                  token_pair: target.name, spread_pct: spreadRaw * 100,
                  gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit,
                  direction: dirStr, status: 'DRY_RUN_SUCCESS', tx_hash: null
                });
              } else {
                action = "EXECUTE";
                const txHash = await walletClient.writeContract(callArgs);
                executionHash = txHash;
                await supabase.from('arbitrage_logs').insert({
                  network: 'base', source_a: target.venueAName, source_b: target.venueBName,
                  token_pair: target.name, spread_pct: spreadRaw * 100,
                  gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit,
                  direction: dirStr, status: 'EXECUTED', tx_hash: txHash
                });
              }
            } catch (simErr: any) {
              simulationResult = "SIMULATION_FAILED";
              executionError = simErr?.shortMessage ?? simErr?.message ?? String(simErr);
              action = DRY_RUN ? "DRY_RUN_SIM_FAILED" : "SIMULATE_FAILED";
              await supabase.from('arbitrage_logs').insert({
                network: 'base', source_a: target.venueAName, source_b: target.venueBName,
                token_pair: target.name, spread_pct: spreadRaw * 100,
                gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit,
                direction: dirStr, status: 'SIMULATION_FAILED', tx_hash: null
              });
            }
          } else {
            action = "OPPORTUNITY_DETECTED";
            await supabase.from('arbitrage_logs').insert({
              network: 'base', source_a: target.venueAName, source_b: target.venueBName,
              token_pair: target.name, spread_pct: spreadRaw * 100,
              gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit,
              direction: dirStr, status: 'OPPORTUNITY_DETECTED', tx_hash: null
            });
          }
        }

        matrixResults.push({
          target: target.name, venueA: target.venueAName, venueB: target.venueBName,
          venueA_price: `$${venueAPrice.toFixed(6)}`, venueB_price: `$${venueBPrice.toFixed(6)}`,
          spread_pct: `${(spreadRaw * 100).toFixed(4)}%`, direction: dirStr,
          net_profit: `$${netProfit.toFixed(4)}`, isProfitable, executable: target.executable,
          dry_run: DRY_RUN, action,
          ...(simulationResult && { simulation: simulationResult }),
          ...(executionHash && { tx_hash: executionHash }),
          ...(executionError && { error: executionError }),
        });

      } catch (targetErr: any) {
        matrixResults.push({ target: target.name, status: "ERROR", error: String(targetErr) });
      }
    }

    return new Response(safeJson({ version: "v29", network: "base", dry_run: DRY_RUN, contract: CONTRACT_ADDR, eth_price_usd: ethPriceUsd.toFixed(2), matrix: matrixResults }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(safeJson({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
