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

// ── V3 CONTRACT (owner = smart wallet) ──────────────────────────────────────
const CONTRACT_ADDR = "0xA96B8c9577c2471044638772672fa1646643a9C8" as `0x${string}`;
const SMART_WALLET  = "0x1272245579df2E988e168E1092E96F301c22DBC9" as `0x${string}`;
const DRY_RUN = true;

// ── QUOTER V2 — amount-aware simulation (official Base deployment) ─────────────
const QUOTER_V2_ADDRESS = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as `0x${string}`;
const QUOTER_V2_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
]);

const MIN_SQRT_PRICE = 2n ** 40n;
const AAVE_FLASH_FEE_PCT = 0.0005;

const UNI_V3_FACTORY    = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" as `0x${string}`;
const SLIPSTREAM_FACTORY = "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A" as `0x${string}`;
const AERO_FACTORY      = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as `0x${string}`;
const AERO_ROUTER       = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as `0x${string}`;
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

type VenueBType = 'aero_vamm' | 'aero_samm' | 'slipstream';
type HopType = 'univ3' | 'slipstream' | 'aero_vamm' | 'aero_samm';

const VENUE_B_TYPE_MAP: Record<VenueBType, number> = {
  'slipstream': 0,
  'aero_vamm':  1,
  'aero_samm':  2,
};

const VENUE_B_FEE_PCT: Record<VenueBType, number> = {
  'aero_vamm':  0.002,
  'aero_samm':  0.0002,
  'slipstream': 0.0005,
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
const AERO_ROUTER_ABI = parseAbi(['function getAmountsOut(uint256 amountIn, (address from, address to, bool stable, address factory)[] routes) view returns (uint256[] amounts)']);
const WARDEN_ABI = parseAbi([
  'function executeArb(address tokenA, address tokenB, address uniV3Pool, address venueBPool, uint8 venueBType, uint256 amountIn, uint8 direction, uint256 minProfit, bytes32 txRef) external',
  'function executeTriArb(address startToken, address midToken1, address midToken2, address pool1, address pool2, address pool3, uint8 pool1Type, uint8 pool2Type, uint8 pool3Type, uint256 amountIn, uint256 minProfit, bytes32 txRef) external'
]);

// Map hop poolType strings to contract uint8 values
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

function getTokenBPriceUsd(target: typeof TARGETS[0], venueAPrice: number, ethPriceUsd: number): number {
  const tokenBAddr = target.tokenB.toLowerCase();
  if (stableTokens.includes(tokenBAddr)) return 1;
  if (tokenBAddr === WETH.toLowerCase()) return ethPriceUsd;
  if (target.tokenA.toLowerCase() === WETH.toLowerCase() && venueAPrice > 0) return ethPriceUsd / venueAPrice;
  return 1;
}

async function getHopPool(publicClient: any, hop: TriHop): Promise<string> {
  if (hop.poolType === 'univ3') {
    return await publicClient.readContract({ address: hop.factory, abi: UNI_FACTORY_ABI, functionName: 'getPool', args: [hop.tokenIn as `0x${string}`, hop.tokenOut as `0x${string}`, hop.param] }) as string;
  } else if (hop.poolType === 'slipstream') {
    return await publicClient.readContract({ address: hop.factory, abi: SLIPSTREAM_FACTORY_ABI, functionName: 'getPool', args: [hop.tokenIn as `0x${string}`, hop.tokenOut as `0x${string}`, hop.param] }) as string;
  } else {
    return await publicClient.readContract({ address: AERO_FACTORY, abi: AERO_FACTORY_ABI, functionName: 'getPool', args: [hop.tokenIn as `0x${string}`, hop.tokenOut as `0x${string}`, hop.poolType === 'aero_samm'] }) as string;
  }
}

async function getHopRate(publicClient: any, hop: TriHop, poolAddr: string): Promise<number> {
  const decIn  = DECIMALS[hop.tokenIn.toLowerCase()]  ?? 18;
  const decOut = DECIMALS[hop.tokenOut.toLowerCase()] ?? 18;
  if (hop.poolType === 'univ3') {
    const [slot0, token0, liquidity] = await Promise.all([
      publicClient.readContract({ address: poolAddr as `0x${string}`, abi: V3_POOL_ABI, functionName: 'slot0' }),
      publicClient.readContract({ address: poolAddr as `0x${string}`, abi: V3_POOL_ABI, functionName: 'token0' }),
      publicClient.readContract({ address: poolAddr as `0x${string}`, abi: V3_POOL_ABI, functionName: 'liquidity' }),
    ]);
    if (slot0[0] < MIN_SQRT_PRICE) return 0;
    if ((liquidity as bigint) === 0n) return 0;
    return calcV3Price(slot0[0], token0 as string, hop.tokenIn, decIn, decOut);
  } else if (hop.poolType === 'slipstream') {
    const [slot0, token0, liquidity] = await Promise.all([
      publicClient.readContract({ address: poolAddr as `0x${string}`, abi: SLIPSTREAM_POOL_ABI, functionName: 'slot0' }),
      publicClient.readContract({ address: poolAddr as `0x${string}`, abi: SLIPSTREAM_POOL_ABI, functionName: 'token0' }),
      publicClient.readContract({ address: poolAddr as `0x${string}`, abi: SLIPSTREAM_POOL_ABI, functionName: 'liquidity' }),
    ]);
    if (slot0[0] < MIN_SQRT_PRICE) return 0;
    if ((liquidity as bigint) === 0n) return 0;
    return calcV3Price(slot0[0], token0 as string, hop.tokenIn, decIn, decOut);
  } else if (hop.poolType === 'aero_samm') {
    const amountIn = BigInt(10 ** decIn);
    const route = [{ from: hop.tokenIn as `0x${string}`, to: hop.tokenOut as `0x${string}`, stable: true, factory: AERO_FACTORY }];
    const amounts = await publicClient.readContract({ address: AERO_ROUTER, abi: AERO_ROUTER_ABI, functionName: 'getAmountsOut', args: [amountIn, route] }) as bigint[];
    return Number(amounts[1]) / Number(amountIn) * Math.pow(10, decIn - decOut);
  } else {
    const [reserves, token0] = await Promise.all([
      publicClient.readContract({ address: poolAddr as `0x${string}`, abi: V2_POOL_ABI, functionName: 'getReserves' }),
      publicClient.readContract({ address: poolAddr as `0x${string}`, abi: V2_POOL_ABI, functionName: 'token0' }),
    ]);
    return calcAeroPrice(reserves[0], reserves[1], token0 as string, hop.tokenIn, decIn, decOut);
  }
}

async function quoteUniV3Hop(
  publicClient: any,
  tokenIn: string,
  tokenOut: string,
  fee: number,
  amountIn: bigint
): Promise<bigint | null> {
  try {
    const result = await publicClient.readContract({
      address: QUOTER_V2_ADDRESS,
      abi: QUOTER_V2_ABI,
      functionName: 'quoteExactInputSingle',
      args: [{
        tokenIn: tokenIn as `0x${string}`,
        tokenOut: tokenOut as `0x${string}`,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0n,
      }],
    });
    return result[0] as bigint;
  } catch {
    return null;
  }
}

async function simulateTriAtSizes(
  publicClient: any,
  cycle: TriCycle,
  rates: [number, number, number],
  ethPriceUsd: number
): Promise<any[]> {
  const TEST_SIZES_ETH = [0.1, 0.5, 1.0];
  const results = [];
  for (const sizeEth of TEST_SIZES_ETH) {
    const decStart = DECIMALS[cycle.startToken.toLowerCase()] ?? 18;
    let currentAmount: bigint = parseUnits(sizeEth.toFixed(8), decStart);
    const amountInWei = currentAmount;
    let usedQuoter = false;
    for (let i = 0; i < 3; i++) {
      const hop = cycle.hops[i];
      const decIn  = DECIMALS[hop.tokenIn.toLowerCase()]  ?? 18;
      const decOut = DECIMALS[hop.tokenOut.toLowerCase()] ?? 18;
      if (hop.poolType === 'univ3') {
        const quoted = await quoteUniV3Hop(publicClient, hop.tokenIn, hop.tokenOut, hop.param, currentAmount);
        if (quoted !== null) { currentAmount = quoted; usedQuoter = true; continue; }
      }
      const rate = rates[i] * (1 - hop.feePct);
      const newAmt = Number(currentAmount) * rate * Math.pow(10, decOut - decIn);
      currentAmount = BigInt(Math.floor(newAmt));
    }
    const profitWei  = Number(currentAmount) - Number(amountInWei);
    const profitPct  = (profitWei / Number(amountInWei)) * 100;
    const tradeUsd   = sizeEth * ethPriceUsd;
    const profitUsd  = tradeUsd * (profitPct / 100);
    results.push({
      size_eth: sizeEth,
      trade_usd: `$${tradeUsd.toFixed(0)}`,
      profit_pct: `${profitPct.toFixed(4)}%`,
      profit_usd: `$${profitUsd.toFixed(2)}`,
      method: usedQuoter ? 'quoter_v2+price_math' : 'price_math_only',
      survives: profitPct > 0.05,
    });
  }
  return results;
}

async function batchedAll<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize = 10,
  delayMs = 100
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (i + batchSize < items.length) await new Promise(r => setTimeout(r, delayMs));
  }
  return results;
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
    const venueAPoolAddr = await publicClient.readContract({ address: target.venueAFactory, abi: UNI_FACTORY_ABI, functionName: 'getPool', args: [target.tokenA as `0x${string}`, target.tokenB as `0x${string}`, target.venueAParam] });
    let venueBPoolAddr: string;
    if (target.venueBType === 'slipstream') {
      venueBPoolAddr = await publicClient.readContract({ address: target.venueBFactory!, abi: SLIPSTREAM_FACTORY_ABI, functionName: 'getPool', args: [target.tokenA as `0x${string}`, target.tokenB as `0x${string}`, target.venueBParam!] }) as string;
    } else {
      const isStable = target.venueBType === 'aero_samm';
      venueBPoolAddr = await publicClient.readContract({ address: AERO_FACTORY, abi: AERO_FACTORY_ABI, functionName: 'getPool', args: [target.tokenA as `0x${string}`, target.tokenB as `0x${string}`, isStable] }) as string;
    }
    if (venueAPoolAddr === NULL_ADDR || venueBPoolAddr === NULL_ADDR) return { target: target.name, status: "POOL_NOT_FOUND" };
    const [venueASlot0, venueAToken0] = await Promise.all([
      publicClient.readContract({ address: venueAPoolAddr as `0x${string}`, abi: V3_POOL_ABI, functionName: 'slot0' }),
      publicClient.readContract({ address: venueAPoolAddr as `0x${string}`, abi: V3_POOL_ABI, functionName: 'token0' }),
    ]);
    if (venueASlot0[0] < MIN_SQRT_PRICE) return { target: target.name, status: "GHOST_POOL" };
    const venueAPrice = calcV3Price(venueASlot0[0], venueAToken0 as string, target.tokenA, decA, decB);
    let venueBPrice: number;
    if (target.venueBType === 'slipstream') {
      const [slipSlot0, slipToken0] = await Promise.all([
        publicClient.readContract({ address: venueBPoolAddr as `0x${string}`, abi: SLIPSTREAM_POOL_ABI, functionName: 'slot0' }),
        publicClient.readContract({ address: venueBPoolAddr as `0x${string}`, abi: SLIPSTREAM_POOL_ABI, functionName: 'token0' }),
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
        publicClient.readContract({ address: venueBPoolAddr as `0x${string}`, abi: V2_POOL_ABI, functionName: 'getReserves' }),
        publicClient.readContract({ address: venueBPoolAddr as `0x${string}`, abi: V2_POOL_ABI, functionName: 'token0' }),
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
        const callArgs = {
          address: CONTRACT_ADDR, abi: WARDEN_ABI, functionName: 'executeArb' as const,
          args: [target.tokenA as `0x${string}`, target.tokenB as `0x${string}`, venueAPoolAddr as `0x${string}`, venueBPoolAddr as `0x${string}`, VENUE_B_TYPE_MAP[target.venueBType], amountInWei, direction, minProfitWei, txRef] as const,
        };
        try {
          // Simulate from smart wallet address (the contract owner)
          await execRpcClient.simulateContract({ ...callArgs, account: SMART_WALLET });
          simulationResult = "SIMULATION_SUCCESS";
          if (DRY_RUN) {
            action = "DRY_RUN_SUCCESS";
            await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: target.venueAName, source_b: target.venueBName, token_pair: target.name, spread_pct: spreadRaw*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit, direction: dirStr, status: 'DRY_RUN_SUCCESS', tx_hash: null });
          } else {
            // LIVE: Execute via Coinbase Paymaster (gasless)
            action = "EXECUTE";
            const { txHash } = await executeViaPaymaster(publicClient, CONTRACT_ADDR, WARDEN_ABI, 'executeArb', callArgs.args);
            executionHash = txHash;
            await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: target.venueAName, source_b: target.venueBName, token_pair: target.name, spread_pct: spreadRaw*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit, direction: dirStr, status: 'EXECUTED', tx_hash: txHash });
          }
        } catch (simErr: any) {
          simulationResult = "SIMULATION_FAILED"; const errMsg = simErr?.shortMessage ?? simErr?.message ?? String(simErr); executionError = errMsg; rejectReason = `sim_failed: ${errMsg}`; action = DRY_RUN ? "DRY_RUN_SIM_FAILED" : "SIMULATE_FAILED";
          await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: target.venueAName, source_b: target.venueBName, token_pair: target.name, spread_pct: spreadRaw*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit, direction: dirStr, status: 'SIMULATION_FAILED', tx_hash: null });
        }
      } else {
        action = "OPPORTUNITY_DETECTED";
        await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: target.venueAName, source_b: target.venueBName, token_pair: target.name, spread_pct: spreadRaw*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit, direction: dirStr, status: 'OPPORTUNITY_DETECTED', tx_hash: null });
      }
    }
    return { target: target.name, venueA: target.venueAName, venueB: target.venueBName, venueA_price: `$${venueAPrice.toFixed(6)}`, venueB_price: `$${venueBPrice.toFixed(6)}`, spread_gross: `${(spreadRaw*100).toFixed(4)}%`, total_fees: `${(totalFeePct*100).toFixed(4)}%`, net_spread: `${(netSpread*100).toFixed(4)}%`, direction: dirStr, net_profit: `$${netProfit.toFixed(4)}`, isProfitable, executable: target.executable, dry_run: DRY_RUN, action, ...(rejectReason && { reject_reason: rejectReason }), ...(simulationResult && { simulation: simulationResult }), ...(executionHash && { tx_hash: executionHash }), ...(executionError && { error: executionError }) };
  } catch (err: any) { return { target: target.name, status: "ERROR", error: String(err) }; }
}

async function scanTriCycle(
  cycle: TriCycle, publicClient: any, supabase: any,
  trade_size_usd: number, min_profit_threshold_usd: number, gasCostTriUsd: number, ethPriceUsd: number,
): Promise<any> {
  try {
    const [pool0Addr, pool1Addr, pool2Addr] = await Promise.all([
      getHopPool(publicClient, cycle.hops[0]),
      getHopPool(publicClient, cycle.hops[1]),
      getHopPool(publicClient, cycle.hops[2]),
    ]);
    if ([pool0Addr, pool1Addr, pool2Addr].some(p => p === NULL_ADDR)) return { cycle: cycle.name, status: "POOL_NOT_FOUND" };
    const [rate0, rate1, rate2] = await Promise.all([
      getHopRate(publicClient, cycle.hops[0], pool0Addr),
      getHopRate(publicClient, cycle.hops[1], pool1Addr),
      getHopRate(publicClient, cycle.hops[2], pool2Addr),
    ]);
    if ([rate0, rate1, rate2].some(r => r === 0)) return { cycle: cycle.name, status: "GHOST_POOL_IN_CYCLE" };
    const effectiveRate0 = rate0 * (1 - cycle.hops[0].feePct);
    const effectiveRate1 = rate1 * (1 - cycle.hops[1].feePct);
    const effectiveRate2 = rate2 * (1 - cycle.hops[2].feePct);
    const cycleReturn    = effectiveRate0 * effectiveRate1 * effectiveRate2;
    const netCycleReturn = cycleReturn * (1 - AAVE_FLASH_FEE_PCT);
    const grossProfitPct = netCycleReturn - 1;
    const grossProfitUsd = grossProfitPct * trade_size_usd;
    const netProfitUsd   = grossProfitUsd - gasCostTriUsd;
    const isProfitable   = grossProfitPct > 0 && netProfitUsd > min_profit_threshold_usd;
    const hopSummary = cycle.hops.map((h, i) => ({ hop: i+1, path: `${h.tokenIn.slice(0,6)}→${h.tokenOut.slice(0,6)}`, pool: h.name, raw_rate: [rate0,rate1,rate2][i].toFixed(8), effective_rate: [effectiveRate0,effectiveRate1,effectiveRate2][i].toFixed(8), fee: `${(h.feePct*100).toFixed(3)}%` }));
    const result: any = { cycle: cycle.name, type: "TRIANGULAR", hops: hopSummary, cycle_return_price_ratio: cycleReturn.toFixed(8), net_cycle_return: netCycleReturn.toFixed(8), gross_profit_pct: `${(grossProfitPct*100).toFixed(4)}%`, gross_profit_usd: `$${grossProfitUsd.toFixed(4)}`, gas_cost_usd: `$${gasCostTriUsd.toFixed(4)}`, net_profit_usd: `$${netProfitUsd.toFixed(4)}`, isProfitable };
    if (grossProfitPct > 0.001) {
      result.amount_simulation = await simulateTriAtSizes(publicClient, cycle, [rate0, rate1, rate2], ethPriceUsd);
      const survivingCount = result.amount_simulation.filter((s: any) => s.survives).length;
      result.simulation_verdict = survivingCount === 3 ? 'REAL_OPPORTUNITY — survives all 3 sizes' : survivingCount > 0 ? `PARTIAL — survives ${survivingCount}/3 sizes` : 'PHANTOM — price_ratio_artifact, collapses under real amounts';
    }
    if (isProfitable) {
      result.action = "OPPORTUNITY_DETECTED";
      // ── TRI-ARB EXECUTION ──
      const startDec = DECIMALS[cycle.startToken.toLowerCase()] ?? 18;
      const amountInWei = parseUnits(String(trade_size_usd / ethPriceUsd), startDec);
      const minProfitWei = parseUnits(String(min_profit_threshold_usd / ethPriceUsd), startDec);
      const txRef = `0x${'0'.repeat(24)}${Date.now().toString(16).padStart(40, '0').slice(-40)}` as `0x${string}`;
      const pool1Type = TRI_POOL_TYPE_MAP[cycle.hops[0].poolType] ?? 0;
      const pool2Type = TRI_POOL_TYPE_MAP[cycle.hops[1].poolType] ?? 0;
      const pool3Type = TRI_POOL_TYPE_MAP[cycle.hops[2].poolType] ?? 0;
      const triCallArgs = {
        address: CONTRACT_ADDR, abi: WARDEN_ABI, functionName: 'executeTriArb' as const,
        args: [
          cycle.startToken as `0x${string}`,
          cycle.hops[0].tokenOut as `0x${string}`,
          cycle.hops[1].tokenOut as `0x${string}`,
          pool0Addr as `0x${string}`,
          pool1Addr as `0x${string}`,
          pool2Addr as `0x${string}`,
          pool1Type, pool2Type, pool3Type,
          amountInWei, minProfitWei, txRef,
        ] as const,
      };
      let simulationResult = "";
      let executionHash = "";
      let executionError = "";
      try {
        // FIX: Simulate from smart wallet address (the contract owner)
        await publicClient.simulateContract({ ...triCallArgs, account: SMART_WALLET });
        simulationResult = "SIMULATION_OK";
        if (DRY_RUN) {
          result.action = "DRY_RUN_TRI_SUCCESS";
          await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: cycle.hops[0].name, source_b: `${cycle.hops[1].name}+${cycle.hops[2].name}`, token_pair: cycle.name, spread_pct: grossProfitPct*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostTriUsd, net_profit_usd: netProfitUsd, direction: `TRI: ${cycle.name}`, status: 'DRY_RUN_TRI_SUCCESS', tx_hash: null });
        } else {
          // LIVE: Execute via Coinbase Paymaster (gasless)
          const { txHash } = await executeViaPaymaster(publicClient, CONTRACT_ADDR, WARDEN_ABI, 'executeTriArb', triCallArgs.args);
          executionHash = txHash;
          result.action = "TRI_EXECUTED";
          result.tx_hash = txHash;
          await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: cycle.hops[0].name, source_b: `${cycle.hops[1].name}+${cycle.hops[2].name}`, token_pair: cycle.name, spread_pct: grossProfitPct*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostTriUsd, net_profit_usd: netProfitUsd, direction: `TRI: ${cycle.name}`, status: 'TRI_EXECUTED', tx_hash: txHash });
        }
      } catch (simErr: any) {
        simulationResult = "SIMULATION_FAILED";
        executionError = simErr?.shortMessage ?? simErr?.message ?? String(simErr);
        result.action = DRY_RUN ? "DRY_RUN_TRI_SIM_FAILED" : "TRI_SIMULATE_FAILED";
        await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: cycle.hops[0].name, source_b: `${cycle.hops[1].name}+${cycle.hops[2].name}`, token_pair: cycle.name, spread_pct: grossProfitPct*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostTriUsd, net_profit_usd: netProfitUsd, direction: `TRI: ${cycle.name}`, status: result.action, tx_hash: null });
      }
      if (simulationResult) result.tri_simulation = simulationResult;
      if (executionHash) result.tri_tx_hash = executionHash;
      if (executionError) result.tri_error = executionError;
    } else { result.action = cycleReturn < 1 ? "LOSING_CYCLE" : "BELOW_GAS_THRESHOLD"; }
    return result;
  } catch (err: any) { return { cycle: cycle.name, status: "ERROR", error: String(err) }; }
}

serve(async (_req) => {
  const t0 = Date.now();
  const publicClient  = createPublicClient({ chain: base, transport: http(COINBASE_RPC_URL) });
  const execRpcClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const [configRes, gasPrice] = await Promise.all([
      supabase.from('arbitrage_config').select('*').eq('id', 1).single(),
      publicClient.getGasPrice(),
    ]);
    const { trade_size_usd, min_profit_threshold_usd } = configRes.data;
    const estimatedGasUnits = 450000n;
    const gasCostEth = Number(formatUnits(gasPrice * estimatedGasUnits, 18));
    const ethPriceRef = { value: 2000 };
    const t1 = Date.now();
    const matrixResults = await batchedAll(TARGETS, (target) => scanTarget(target, publicClient, execRpcClient, supabase, Number(trade_size_usd), Number(min_profit_threshold_usd), gasCostEth, ethPriceRef), 10, 100);
    const t2 = Date.now();
    const gasCostTriUsd = gasCostEth * ethPriceRef.value * 1.5;
    const triResults = await batchedAll(TRI_CYCLES, (cycle) => scanTriCycle(cycle, publicClient, supabase, Number(trade_size_usd), Number(min_profit_threshold_usd), gasCostTriUsd, ethPriceRef.value), 3, 250);
    const t3 = Date.now();
    const profitable2Pool = matrixResults.filter((r: any) => r.isProfitable);
    const feeKilled       = matrixResults.filter((r: any) => r.action === "SKIPPED_FEES_EXCEED_SPREAD");
    const profitableTri   = triResults.filter((r: any) => r.isProfitable);
    const losingTri       = triResults.filter((r: any) => r.action === "LOSING_CYCLE");
    const simulated       = triResults.filter((r: any) => r.amount_simulation);
    return new Response(safeJson({ version: "v40_liquidity_gate", network: "base", rpc: "coinbase_node", quoter_v2: QUOTER_V2_ADDRESS, dry_run: DRY_RUN, contract: CONTRACT_ADDR, smart_wallet: SMART_WALLET, execution_mode: "coinbase_paymaster_4337", eth_price_usd: ethPriceRef.value.toFixed(2), timing_ms: { init: t1-t0, two_pool_scan: t2-t1, tri_scan: t3-t2, total: t3-t0 }, summary: { two_pool: { total_pairs: TARGETS.length, fee_killed: feeKilled.length, profitable: profitable2Pool.length }, triangular: { total_cycles: TRI_CYCLES.length, losing_cycles: losingTri.length, profitable: profitableTri.length, simulated: simulated.length, execution_status: DRY_RUN ? "dry_run_with_paymaster" : "LIVE_PAYMASTER_EXECUTION" } }, two_pool_matrix: matrixResults, triangular_matrix: triResults }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) { return new Response(safeJson({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } }); }
});
