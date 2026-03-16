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

const safeJson = (obj: any) =>
  JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);

const ALCHEMY_RPC_URL        = "https://base-mainnet.g.alchemy.com/v2/3wG3PLWyPu2DliGQLVa8G";
const BASE_RPC_URL           = Deno.env.get("BASE_RPC_URL") ?? ALCHEMY_RPC_URL;
const COINBASE_PAYMASTER_URL = Deno.env.get("COINBASE_PAYMASTER_URL") ?? "https://api.developer.coinbase.com/rpc/v1/base/ve3syal5dONMkAR38clgHXHLOdPDda1u";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_PRIVATE_KEY           = Deno.env.get("BOT_PRIVATE_KEY");

const CONTRACT_ADDR = "0xF249b64830D28721e1886D55B0359b7Fb41B62db" as `0x${string}`; // FlashSwapV3 v74
const DRY_RUN = false;

const QUOTER_V2_ADDRESS = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as `0x${string}`;
const QUOTER_V2_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
]);

const MIN_SQRT_PRICE = 2n ** 40n;
const AAVE_FLASH_FEE_PCT = 0.0009; // 0.09% Aave flash loan fee

const GAS_PRICE_ORACLE   = "0x420000000000000000000000000000000000000F" as `0x${string}`;
const ARB_CALLDATA_BYTES = 500;

const UNI_V3_FACTORY    = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" as `0x${string}`;
const SUSHI_V3_FACTORY  = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4" as `0x${string}`;
const SUSHI_V2_FACTORY  = "0x71524b4f93c58fcbf659783284e38825f0622859" as `0x${string}`;
const PANCAKE_V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" as `0x${string}`;
const NULL_ADDR         = "0x0000000000000000000000000000000000000000";

const WETH    = "0x4200000000000000000000000000000000000006";
const USDC    = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const cbETH   = "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22";
const USDbC   = "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA";
const cbBTC   = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
const wstETH  = "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452";
const USDT    = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";
const weETH   = "0x04C0599Ae5A44757c0af6F9eC3b93da8976c150a";
const AERO    = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";
const DAI     = "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb";

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
};

const stableTokens = [USDC, USDbC, USDT, DAI].map(t => t.toLowerCase());

type VenueBType = 'sushi_v2' | 'pancake_v3' | 'sushi_v3';

const VENUE_B_TYPE_MAP: Record<VenueBType, number> = {
  'sushi_v2':   1,
  'pancake_v3': 8,
  'sushi_v3':   7,
};

const VENUE_B_FEE_PCT: Record<VenueBType, number> = {
  'sushi_v2':   0.003,
  'pancake_v3': 0,
  'sushi_v3':   0,
};

const TARGETS: {
  name: string; tokenA: string; tokenB: string;
  venueAName: string; venueAFactory: `0x${string}`; venueAParam: number;
  venueBName: string; venueBType: VenueBType;
  venueBFactory?: `0x${string}`; venueBParam?: number;
  executable: boolean;
}[] = [
  // Uni ↔ PancakeSwap V3
  { name: "WETH-USDC [Uni↔PCS]",    tokenA: WETH,   tokenB: USDC,  venueAName: "UniswapV3_0.05%", venueAFactory: UNI_V3_FACTORY,      venueAParam: 500,  venueBName: "PancakeV3_0.05%", venueBType: 'pancake_v3', venueBFactory: PANCAKE_V3_FACTORY, venueBParam: 500,   executable: true },
  { name: "cbETH-WETH [Uni↔PCS]",   tokenA: cbETH,  tokenB: WETH,  venueAName: "UniswapV3_0.01%", venueAFactory: UNI_V3_FACTORY,      venueAParam: 100,  venueBName: "PancakeV3_0.05%", venueBType: 'pancake_v3', venueBFactory: PANCAKE_V3_FACTORY, venueBParam: 500,   executable: true },
  { name: "wstETH-WETH [Uni↔PCS]",  tokenA: wstETH, tokenB: WETH,  venueAName: "UniswapV3_0.01%", venueAFactory: UNI_V3_FACTORY,      venueAParam: 100,  venueBName: "PancakeV3_0.01%", venueBType: 'pancake_v3', venueBFactory: PANCAKE_V3_FACTORY, venueBParam: 100,   executable: true },
  { name: "WETH-USDT [Uni↔PCS]",    tokenA: WETH,   tokenB: USDT,  venueAName: "UniswapV3_0.05%", venueAFactory: UNI_V3_FACTORY,      venueAParam: 500,  venueBName: "PancakeV3_0.05%", venueBType: 'pancake_v3', venueBFactory: PANCAKE_V3_FACTORY, venueBParam: 500,   executable: true },
  { name: "USDbC-USDC [Uni↔PCS]",   tokenA: USDbC,  tokenB: USDC,  venueAName: "UniswapV3_0.01%", venueAFactory: UNI_V3_FACTORY,      venueAParam: 100,  venueBName: "PancakeV3_0.01%", venueBType: 'pancake_v3', venueBFactory: PANCAKE_V3_FACTORY, venueBParam: 100,   executable: true },
  { name: "DAI-USDC [Uni↔PCS]",     tokenA: DAI,    tokenB: USDC,  venueAName: "UniswapV3_0.01%", venueAFactory: UNI_V3_FACTORY,      venueAParam: 100,  venueBName: "PancakeV3_0.01%", venueBType: 'pancake_v3', venueBFactory: PANCAKE_V3_FACTORY, venueBParam: 100,   executable: true },
  { name: "WETH-cbBTC [Uni↔PCS]",   tokenA: WETH,   tokenB: cbBTC, venueAName: "UniswapV3_0.3%",  venueAFactory: UNI_V3_FACTORY,      venueAParam: 3000, venueBName: "PancakeV3_0.25%", venueBType: 'pancake_v3', venueBFactory: PANCAKE_V3_FACTORY, venueBParam: 2500,  executable: true },
  { name: "WETH-AERO [Uni↔PCS]",    tokenA: WETH,   tokenB: AERO,  venueAName: "UniswapV3_0.3%",  venueAFactory: UNI_V3_FACTORY,      venueAParam: 3000, venueBName: "PancakeV3_0.25%", venueBType: 'pancake_v3', venueBFactory: PANCAKE_V3_FACTORY, venueBParam: 2500,  executable: true },
  // Uni ↔ SushiSwap V3
  { name: "WETH-USDC [Uni↔Sushi]",  tokenA: WETH,   tokenB: USDC,  venueAName: "UniswapV3_0.05%", venueAFactory: UNI_V3_FACTORY,      venueAParam: 500,  venueBName: "SushiV3_0.05%",  venueBType: 'sushi_v3',   venueBFactory: SUSHI_V3_FACTORY,   venueBParam: 500,   executable: true },
  { name: "cbETH-WETH [Uni↔Sushi]", tokenA: cbETH,  tokenB: WETH,  venueAName: "UniswapV3_0.01%", venueAFactory: UNI_V3_FACTORY,      venueAParam: 100,  venueBName: "SushiV3_0.05%",  venueBType: 'sushi_v3',   venueBFactory: SUSHI_V3_FACTORY,   venueBParam: 500,   executable: true },
  { name: "WETH-cbBTC [Uni↔Sushi]", tokenA: WETH,   tokenB: cbBTC, venueAName: "UniswapV3_0.3%",  venueAFactory: UNI_V3_FACTORY,      venueAParam: 3000, venueBName: "SushiV3_0.3%",   venueBType: 'sushi_v3',   venueBFactory: SUSHI_V3_FACTORY,   venueBParam: 3000,  executable: true },
  { name: "wstETH-WETH [Uni↔Sushi]",tokenA: wstETH, tokenB: WETH,  venueAName: "UniswapV3_0.01%", venueAFactory: UNI_V3_FACTORY,      venueAParam: 100,  venueBName: "SushiV3_0.05%",  venueBType: 'sushi_v3',   venueBFactory: SUSHI_V3_FACTORY,   venueBParam: 500,   executable: true },
  { name: "WETH-USDT [Uni↔Sushi]",  tokenA: WETH,   tokenB: USDT,  venueAName: "UniswapV3_0.05%", venueAFactory: UNI_V3_FACTORY,      venueAParam: 500,  venueBName: "SushiV3_0.3%",   venueBType: 'sushi_v3',   venueBFactory: SUSHI_V3_FACTORY,   venueBParam: 3000,  executable: true },
  { name: "DAI-USDC [Uni↔Sushi]",   tokenA: DAI,    tokenB: USDC,  venueAName: "UniswapV3_0.01%", venueAFactory: UNI_V3_FACTORY,      venueAParam: 100,  venueBName: "SushiV3_0.01%",  venueBType: 'sushi_v3',   venueBFactory: SUSHI_V3_FACTORY,   venueBParam: 100,   executable: true },
  // PancakeSwap V3 ↔ SushiSwap V3
  { name: "WETH-USDT [PCS↔Sushi]",  tokenA: WETH,   tokenB: USDT,  venueAName: "PancakeV3_0.05%", venueAFactory: PANCAKE_V3_FACTORY,  venueAParam: 500,  venueBName: "SushiV3_0.3%",   venueBType: 'sushi_v3',   venueBFactory: SUSHI_V3_FACTORY,   venueBParam: 3000,  executable: true },
  // Uni ↔ SushiSwap V2
  { name: "WETH-USDC [Uni↔SushiV2]",tokenA: WETH,   tokenB: USDC,  venueAName: "UniswapV3_0.05%", venueAFactory: UNI_V3_FACTORY,      venueAParam: 500,  venueBName: "SushiSwap_V2",   venueBType: 'sushi_v2',   venueBFactory: SUSHI_V2_FACTORY,               executable: true },
];

const TRI_CYCLES: any[] = [];

const UNI_FACTORY_ABI   = parseAbi(['function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)']);
const V3_POOL_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function liquidity() view returns (uint128)'
]);
const V2_POOL_ABI = parseAbi([
  'function getReserves() returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)'
]);
const V2_PAIR_FACTORY_ABI = parseAbi(['function getPair(address tokenA, address tokenB) view returns (address pair)']);
const GAS_PRICE_ORACLE_ABI = parseAbi([
  'function getL1FeeUpperBound(uint256 unsignedTxSize) view returns (uint256)'
]);

const DEX_GAS_UNITS: Record<string, number> = {
  'sushi_v2':   100_000,
  'pancake_v3': 120_000,
  'sushi_v3':   120_000,
};

function estimatePairGasUnits(venueBType: VenueBType): bigint {
  return BigInt(120_000 + (DEX_GAS_UNITS[venueBType] ?? 120_000));
}

const WARDEN_ABI = parseAbi([
  'function executeArbitrage(address borrowToken, uint256 borrowAmount, ((address pool, address tokenIn, address tokenOut, uint24 fee, uint256 minOut, uint8 dexType)[] steps, uint256 borrowAmount, uint256 minFinalAmount) path) external'
]);

function getVenueADexType(factory: string): number {
  if (factory.toLowerCase() === PANCAKE_V3_FACTORY.toLowerCase()) return 8;
  if (factory.toLowerCase() === SUSHI_V3_FACTORY.toLowerCase())   return 7;
  return 0;
}

function buildTwoStepPath(
  t: typeof TARGETS[0],
  direction: number,
  amountInWei: bigint,
  minFinalAmount: bigint,
  venueAPoolAddr: string,
  venueBPoolAddr: string,
  useTokenABorrow: boolean,
): { steps: any[]; borrowAmount: bigint; minFinalAmount: bigint } {
  const venueADexType = getVenueADexType(t.venueAFactory);
  const venueBDexType = VENUE_B_TYPE_MAP[t.venueBType];
  const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as `0x${string}`;
  const venueAPool = (venueADexType === 7 ? venueAPoolAddr : ZERO_ADDR) as `0x${string}`;
  const venueBPool = (venueBDexType === 7 ? venueBPoolAddr : ZERO_ADDR) as `0x${string}`;

  let steps: any[];
  if (!useTokenABorrow) {
    steps = direction === 0
      ? [
          { pool: venueBPool, tokenIn: t.tokenB as `0x${string}`, tokenOut: t.tokenA as `0x${string}`, fee: t.venueBParam ?? 0, minOut: 0n, dexType: venueBDexType },
          { pool: venueAPool, tokenIn: t.tokenA as `0x${string}`, tokenOut: t.tokenB as `0x${string}`, fee: t.venueAParam,        minOut: 0n, dexType: venueADexType },
        ]
      : [
          { pool: venueAPool, tokenIn: t.tokenB as `0x${string}`, tokenOut: t.tokenA as `0x${string}`, fee: t.venueAParam,        minOut: 0n, dexType: venueADexType },
          { pool: venueBPool, tokenIn: t.tokenA as `0x${string}`, tokenOut: t.tokenB as `0x${string}`, fee: t.venueBParam ?? 0, minOut: 0n, dexType: venueBDexType },
        ];
  } else {
    steps = direction === 0
      ? [
          { pool: venueAPool, tokenIn: t.tokenA as `0x${string}`, tokenOut: t.tokenB as `0x${string}`, fee: t.venueAParam,        minOut: 0n, dexType: venueADexType },
          { pool: venueBPool, tokenIn: t.tokenB as `0x${string}`, tokenOut: t.tokenA as `0x${string}`, fee: t.venueBParam ?? 0, minOut: 0n, dexType: venueBDexType },
        ]
      : [
          { pool: venueBPool, tokenIn: t.tokenA as `0x${string}`, tokenOut: t.tokenB as `0x${string}`, fee: t.venueBParam ?? 0, minOut: 0n, dexType: venueBDexType },
          { pool: venueAPool, tokenIn: t.tokenB as `0x${string}`, tokenOut: t.tokenA as `0x${string}`, fee: t.venueAParam,        minOut: 0n, dexType: venueADexType },
        ];
  }
  return { steps, borrowAmount: amountInWei, minFinalAmount };
}

let _bundlerClient: any = null;
let _smartAccount: any = null;
let _smartWalletAddr: `0x${string}` | null = null;

async function getBundlerClient(publicClient: any) {
  if (_bundlerClient) return _bundlerClient;
  if (!BOT_PRIVATE_KEY) throw new Error("BOT_PRIVATE_KEY not set");
  const eoaAccount = privateKeyToAccount(`0x${BOT_PRIVATE_KEY}` as `0x${string}`);

  _smartAccount = await toCoinbaseSmartAccount({ client: publicClient, owners: [eoaAccount], version: '1.1' });
  _smartWalletAddr = _smartAccount.address as `0x${string}`;

  // NO estimateGas hook — all gas values set explicitly in sendUserOperation to avoid conflicts.
  // Hook + explicit params caused ambiguity: v79-v80 (hook only) = "too low" (paymaster overrode),
  // v81 (explicit 2M) = "too high" (found CDP ceiling), v82-v83 (explicit 800k) = testing.
  // Conclusion: explicit params bypass paymaster override AND stay under CDP ceiling.

  _bundlerClient = createBundlerClient({
    account:   _smartAccount,
    client:    publicClient,
    transport: http(COINBASE_PAYMASTER_URL),
    chain:     base,
    paymaster: true,
  });

  return _bundlerClient;
}

async function executeViaPaymaster(
  publicClient: any,
  contractAddr: `0x${string}`,
  abi: any,
  functionName: string,
  args: readonly any[],
  nonceKey?: bigint  // ERC-4337 nonce lane key — unique per trade = independent parallel execution
): Promise<{ txHash: string; userOpHash: string }> {
  const bundlerClient = await getBundlerClient(publicClient);
  const callData = encodeFunctionData({ abi, functionName, args });

  // Gas values — all explicit, no hook, no ambiguity.
  //
  // verificationGasLimit: 150k (wallet deployed - only sig validation needed)
  //   - CDP bundler ceiling confirmed < 2M (v81 rejected). 800k is our binary search midpoint.
  //   - Covers: wallet deployment (~300-500k) + signature validation (~50k) with buffer.
  //   - At current Base gas (~0.006 Gwei): 800k × 6e6 wei = $0.012. Far under $15 paymaster limit.
  //
  // callGasLimit: 800k
  //   - Flash loan + 2 V3/V2 swaps typical actual usage: ~400-600k. 800k = 1.5× buffer.
  //
  // preVerificationGas: 300k
  //   - CDP recommends 2× bundler estimate. Bundler returns ~150k; 300k = safe 2× floor.
  //
  // Total estimated paymaster cost at 0.006 Gwei / $2500 ETH:
  //   (800k×2 + 800k + 300k) × 6e6 wei / 1e18 × $2500 ≈ $0.048 << $15
  // Unique nonce lane per trade: nonce = key<<64|seq. Different keys = independent lanes.
  // This prevents sequential blocking — ID8 timed out waiting for ID7 on the same lane (key=0).
  const nonce = nonceKey !== undefined ? await _smartAccount.getNonce({ key: nonceKey }) : undefined;

  const userOpHash = await bundlerClient.sendUserOperation({
    calls: [{ to: contractAddr, data: callData, value: 0n }],
    verificationGasLimit: 150_000n,
    callGasLimit:         800_000n,
    preVerificationGas:   300_000n,
    ...(nonce !== undefined && { nonce }),
  });

  const receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
    timeout: 60_000, // 60s max wait for receipt
  });
  return { txHash: receipt.receipt.transactionHash, userOpHash };
}

function calcV3Price(sqrtPriceX96: bigint, token0Addr: string, tokenA: string, decA: number, decB: number): number {
  const sqrtP = Number(sqrtPriceX96);
  const rawRatio = (sqrtP / 2 ** 96) ** 2;
  const tokenAIsToken0 = token0Addr.toLowerCase() === tokenA.toLowerCase();
  return tokenAIsToken0 ? rawRatio * Math.pow(10, decA - decB) : (1 / rawRatio) * Math.pow(10, decA - decB);
}

function calcAeroPrice(r0: bigint, r1: bigint, token0Addr: string, tokenA: string, decA: number, decB: number): number {
  const R0 = Number(r0); const R1 = Number(r1);
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

function venueAPoolKey(t: typeof TARGETS[0]): string {
  return `${t.venueAFactory}|${t.tokenA}|${t.tokenB}|${t.venueAParam}`;
}

function venueBPoolKey(t: typeof TARGETS[0]): string {
  if (t.venueBType === 'pancake_v3' || t.venueBType === 'sushi_v3') return `${t.venueBFactory}|${t.tokenA}|${t.tokenB}|${t.venueBParam}`;
  return `${t.venueBFactory}|${t.tokenA}|${t.tokenB}|getPair`;
}

async function loadPoolCache(supabase: any): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('warden_pool_cache').select('cache_key,cache_value').eq('cache_type', 'pool_addr');
  if (error || !data) return new Map();
  return new Map(data.map((r: any) => [r.cache_key, r.cache_value]));
}

async function discoverAndCacheMissingPools(publicClient: any, supabase: any, poolCache: Map<string, string>): Promise<void> {
  interface DiscoverSpec { key: string; address: `0x${string}`; abi: any; functionName: string; args: any[]; }
  const specs: DiscoverSpec[] = [];
  for (const t of TARGETS) {
    const kaKey = venueAPoolKey(t);
    if (!poolCache.has(kaKey)) specs.push({ key: kaKey, address: t.venueAFactory, abi: UNI_FACTORY_ABI, functionName: 'getPool', args: [t.tokenA, t.tokenB, t.venueAParam] });
    const kbKey = venueBPoolKey(t);
    if (!poolCache.has(kbKey)) {
      if (t.venueBType === 'pancake_v3' || t.venueBType === 'sushi_v3') {
        specs.push({ key: kbKey, address: t.venueBFactory!, abi: UNI_FACTORY_ABI, functionName: 'getPool', args: [t.tokenA, t.tokenB, t.venueBParam!] });
      } else {
        specs.push({ key: kbKey, address: t.venueBFactory!, abi: V2_PAIR_FACTORY_ABI, functionName: 'getPair', args: [t.tokenA, t.tokenB] });
      }
    }
  }
  if (specs.length === 0) return;
  const contracts = specs.map(s => ({ address: s.address, abi: s.abi, functionName: s.functionName, args: s.args }));
  const results = await publicClient.multicall({ contracts, allowFailure: true });
  const toUpsert: any[] = [];
  for (let i = 0; i < specs.length; i++) {
    const r = results[i];
    if (r.status === 'success' && r.result && (r.result as string).toLowerCase() !== NULL_ADDR) {
      const poolAddr = r.result as string;
      poolCache.set(specs[i].key, poolAddr);
      toUpsert.push({ cache_key: specs[i].key, cache_value: poolAddr, cache_type: 'pool_addr' });
    }
  }
  if (toUpsert.length > 0) await supabase.from('warden_pool_cache').upsert(toUpsert);
}

interface PriceCallSpec { targetIdx: number; role: 'venueA_slot0' | 'venueA_token0' | 'venueB_slot0' | 'venueB_token0' | 'venueB_reserves' | 'venueB_token0v2'; }

function buildPriceMulticall(poolCache: Map<string, string>): { contracts: any[]; specs: PriceCallSpec[]; skipped: Set<number>; } {
  const contracts: any[] = []; const specs: PriceCallSpec[] = []; const skipped = new Set<number>();
  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    const venueAPoolAddr = poolCache.get(venueAPoolKey(t));
    const venueBPoolAddr = poolCache.get(venueBPoolKey(t));
    if (!venueAPoolAddr || venueAPoolAddr.toLowerCase() === NULL_ADDR) { skipped.add(i); continue; }
    if (!venueBPoolAddr || venueBPoolAddr.toLowerCase() === NULL_ADDR) { skipped.add(i); continue; }
    contracts.push({ address: venueAPoolAddr as `0x${string}`, abi: V3_POOL_ABI, functionName: 'slot0' }); specs.push({ targetIdx: i, role: 'venueA_slot0' });
    contracts.push({ address: venueAPoolAddr as `0x${string}`, abi: V3_POOL_ABI, functionName: 'token0' }); specs.push({ targetIdx: i, role: 'venueA_token0' });
    if (t.venueBType === 'pancake_v3' || t.venueBType === 'sushi_v3') {
      contracts.push({ address: venueBPoolAddr as `0x${string}`, abi: V3_POOL_ABI, functionName: 'slot0' }); specs.push({ targetIdx: i, role: 'venueB_slot0' });
      contracts.push({ address: venueBPoolAddr as `0x${string}`, abi: V3_POOL_ABI, functionName: 'token0' }); specs.push({ targetIdx: i, role: 'venueB_token0' });
    } else {
      contracts.push({ address: venueBPoolAddr as `0x${string}`, abi: V2_POOL_ABI, functionName: 'getReserves' }); specs.push({ targetIdx: i, role: 'venueB_reserves' });
      contracts.push({ address: venueBPoolAddr as `0x${string}`, abi: V2_POOL_ABI, functionName: 'token0' }); specs.push({ targetIdx: i, role: 'venueB_token0v2' });
    }
  }
  return { contracts, specs, skipped };
}

function parsePriceResults(mcResults: any[], specs: PriceCallSpec[]): Map<number, any> {
  const parsed = new Map<number, any>();
  for (const s of specs) { if (!parsed.has(s.targetIdx)) parsed.set(s.targetIdx, {}); }
  for (let i = 0; i < specs.length; i++) {
    const { targetIdx, role } = specs[i]; const r = mcResults[i]; const d = parsed.get(targetIdx)!;
    if (r.status !== 'success') { d.error = `${role}: ${r.error?.message ?? r.error ?? 'call_failed'}`; continue; }
    switch (role) {
      case 'venueA_slot0':    d.venueASlot0   = r.result; break;
      case 'venueA_token0':   d.venueAToken0  = r.result as string; break;
      case 'venueB_slot0':    d.venueBSlot0   = r.result; break;
      case 'venueB_token0':   d.venueBToken0  = r.result as string; break;
      case 'venueB_reserves': d.venueBReserves = r.result; break;
      case 'venueB_token0v2': d.venueBToken0  = r.result as string; break;
    }
  }
  return parsed;
}

async function batchScanAllTargets(
  publicClient: any, execRpcClient: any, supabase: any,
  trade_size_usd: number, min_profit_threshold_usd: number,
  gasPrice: bigint, ethPriceRef: { value: number }
): Promise<any[]> {
  const poolCache = await loadPoolCache(supabase);
  await discoverAndCacheMissingPools(publicClient, supabase, poolCache);
  const { contracts, specs, skipped } = buildPriceMulticall(poolCache);
  const l1FeeCallIdx = contracts.length;
  contracts.push({ address: GAS_PRICE_ORACLE, abi: GAS_PRICE_ORACLE_ABI, functionName: 'getL1FeeUpperBound', args: [BigInt(ARB_CALLDATA_BYTES)] });
  let mcResults: any[];
  try { mcResults = await publicClient.multicall({ contracts, allowFailure: true, blockTag: 'pending' }); }
  catch (batchErr: any) { const errMsg = batchErr?.message ?? String(batchErr); return TARGETS.map(t => ({ target: t.name, status: 'BATCH_RPC_ERROR', error: errMsg })); }
  const l1FeeRes = mcResults[l1FeeCallIdx];
  const l1FeeWei = (l1FeeRes?.status === 'success') ? (l1FeeRes.result as bigint) : 0n;
  const l1FeeEth = Number(formatUnits(l1FeeWei, 18));
  const parsedPrices = parsePriceResults(mcResults, specs);
  const results: any[] = [];
  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    if (skipped.has(i)) { results.push({ target: t.name, status: 'POOL_NOT_FOUND' }); continue; }
    const d = parsedPrices.get(i);
    if (!d || d.error) { results.push({ target: t.name, status: 'PRICE_READ_ERROR', error: d?.error ?? 'no_data' }); continue; }
    try {
      const decA = DECIMALS[t.tokenA.toLowerCase()] ?? 18;
      const decB = DECIMALS[t.tokenB.toLowerCase()] ?? 18;
      const venueAPoolAddr = poolCache.get(venueAPoolKey(t))!;
      const venueBPoolAddr = poolCache.get(venueBPoolKey(t))!;
      if (!d.venueASlot0 || !d.venueAToken0) { results.push({ target: t.name, status: 'GHOST_POOL', detail: 'venueA_slot0_missing' }); continue; }
      if ((d.venueASlot0[0] as bigint) < MIN_SQRT_PRICE) { results.push({ target: t.name, status: 'GHOST_POOL', detail: 'venueA_sqrtPrice_zero' }); continue; }
      const venueAPrice = calcV3Price(d.venueASlot0[0] as bigint, d.venueAToken0, t.tokenA, decA, decB);
      let venueBPrice: number;
      if (t.venueBType === 'pancake_v3' || t.venueBType === 'sushi_v3') {
        if (!d.venueBSlot0 || !d.venueBToken0) { results.push({ target: t.name, status: 'GHOST_POOL', detail: 'venueB_slot0_missing' }); continue; }
        if ((d.venueBSlot0[0] as bigint) < MIN_SQRT_PRICE) { results.push({ target: t.name, status: 'GHOST_POOL', detail: 'venueB_sqrtPrice_zero' }); continue; }
        venueBPrice = calcV3Price(d.venueBSlot0[0] as bigint, d.venueBToken0, t.tokenA, decA, decB);
      } else {
        if (!d.venueBReserves || !d.venueBToken0) { results.push({ target: t.name, status: 'GHOST_POOL', detail: 'venueB_reserves_missing' }); continue; }
        venueBPrice = calcAeroPrice(d.venueBReserves[0] as bigint, d.venueBReserves[1] as bigint, d.venueBToken0, t.tokenA, decA, decB);
      }
      if (t.name === 'WETH-USDC [Uni↔PCS]') ethPriceRef.value = (venueAPrice + venueBPrice) / 2;
      const spreadRaw  = Math.abs(venueAPrice - venueBPrice) / Math.max(venueAPrice, venueBPrice);
      const direction  = venueAPrice >= venueBPrice ? 0 : 1;
      const dirStr     = venueAPrice >= venueBPrice ? `BUY_${t.venueBName}->SELL_${t.venueAName}` : `BUY_${t.venueAName}->SELL_${t.venueBName}`;
      const venueAFeePct = t.venueAParam / 1_000_000;
      const venueBFeePct = (t.venueBType === 'pancake_v3' || t.venueBType === 'sushi_v3') ? (t.venueBParam ?? 0) / 1_000_000 : VENUE_B_FEE_PCT[t.venueBType];
      const totalFeePct  = venueAFeePct + venueBFeePct + AAVE_FLASH_FEE_PCT;
      const netSpread    = spreadRaw - totalFeePct;
      if (netSpread <= 0) {
        results.push({ target: t.name, venueA_price: `$${venueAPrice.toFixed(6)}`, venueB_price: `$${venueBPrice.toFixed(6)}`, spread_gross: `${(spreadRaw*100).toFixed(4)}%`, total_fees: `${(totalFeePct*100).toFixed(4)}%`, net_spread: `${(netSpread*100).toFixed(4)}%`, action: 'SKIPPED_FEES_EXCEED_SPREAD', reject_reason: `fees(${(totalFeePct*100).toFixed(2)}%) > spread(${(spreadRaw*100).toFixed(2)}%)` });
        continue;
      }
      const tokenBPriceUsd = getTokenBPriceUsd(t, venueAPrice, ethPriceRef.value);
      const grossProfitUsd = trade_size_usd * netSpread;
      const pairGasUnits   = estimatePairGasUnits(t.venueBType);
      const l2GasWei       = gasPrice * pairGasUnits;
      const gasCostUsd     = Number(formatUnits(l2GasWei + l1FeeWei, 18)) * ethPriceRef.value;
      const netProfit      = grossProfitUsd - gasCostUsd;
      const isProfitable   = netProfit > min_profit_threshold_usd;
      let action = 'HOLD'; let executionHash: string | null = null; let executionError: string | null = null; let rejectReason: string | null = null;
      if (!isProfitable) rejectReason = `net_profit $${netProfit.toFixed(4)} < threshold $${min_profit_threshold_usd}`;
      if (isProfitable) {
        if (t.executable && BOT_PRIVATE_KEY) {
          const wethAddr = WETH.toLowerCase();
          let effectiveBorrowToken: string;
          let useTokenABorrow: boolean;
          if (t.tokenA.toLowerCase() === wethAddr) {
            effectiveBorrowToken = t.tokenA; useTokenABorrow = true;
          } else if (t.tokenB.toLowerCase() === wethAddr) {
            effectiveBorrowToken = t.tokenB; useTokenABorrow = false;
          } else {
            const AAVE_SUPPORTED_STABLE = new Set([
              "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
              "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca",
              "0x50c5725949a6f0c72e6c4a641f24049a917db0cb",
              "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22",
              "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
              "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452",
              "0x04c0599ae5a44757c0af6f9ec3b93da8976c150a",
            ]);
            const tokenAOk = AAVE_SUPPORTED_STABLE.has(t.tokenA.toLowerCase());
            useTokenABorrow = tokenAOk;
            effectiveBorrowToken = tokenAOk ? t.tokenA : t.tokenB;
          }
          const decEffective = DECIMALS[effectiveBorrowToken.toLowerCase()] ?? 18;
          const effectivePriceUsd = effectiveBorrowToken.toLowerCase() === wethAddr ? ethPriceRef.value : tokenBPriceUsd;
          const effectiveTokenAmount = trade_size_usd / effectivePriceUsd;
          const amountInWei = parseUnits(effectiveTokenAmount.toFixed(decEffective > 6 ? 8 : 6), decEffective);
          const aaveFeeWei = (amountInWei * 9n) / 10000n;
          const minFinalAmount = amountInWei + aaveFeeWei + 1n;
          const path = buildTwoStepPath(t, direction, amountInWei, minFinalAmount, venueAPoolAddr, venueBPoolAddr, useTokenABorrow);
          const callArgs = [effectiveBorrowToken as `0x${string}`, amountInWei, path] as const;
          try {
            if (DRY_RUN) {
              action = 'DRY_RUN_SUCCESS';
              await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: t.venueAName, source_b: t.venueBName, token_pair: t.name, spread_pct: spreadRaw*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit, direction: dirStr, status: 'DRY_RUN_SUCCESS', tx_hash: null });
            } else {
              action = 'EXECUTE';
              const { txHash } = await executeViaPaymaster(publicClient, CONTRACT_ADDR, WARDEN_ABI, 'executeArbitrage', callArgs, BigInt(i));
              executionHash = txHash;
              await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: t.venueAName, source_b: t.venueBName, token_pair: t.name, spread_pct: spreadRaw*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit, direction: dirStr, status: 'EXECUTED', tx_hash: txHash });
            }
          } catch (execErr: any) {
            const errMsg = execErr?.shortMessage ?? execErr?.message ?? String(execErr);
            executionError = errMsg; rejectReason = `exec_failed: ${errMsg}`;
            action = DRY_RUN ? 'DRY_RUN_FAILED' : 'EXECUTE_FAILED';
            // Log with full error_message so we can diagnose bundler rejections
            await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: t.venueAName, source_b: t.venueBName, token_pair: t.name, spread_pct: spreadRaw*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit, direction: dirStr, status: 'EXECUTE_FAILED', tx_hash: null, error_message: errMsg });
          }
        } else {
          action = 'OPPORTUNITY_DETECTED';
          await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: t.venueAName, source_b: t.venueBName, token_pair: t.name, spread_pct: spreadRaw*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit, direction: dirStr, status: 'OPPORTUNITY_DETECTED', tx_hash: null });
        }
      }
      results.push({ target: t.name, venueA: t.venueAName, venueB: t.venueBName, venueA_price: `$${venueAPrice.toFixed(6)}`, venueB_price: `$${venueBPrice.toFixed(6)}`, spread_gross: `${(spreadRaw*100).toFixed(4)}%`, total_fees: `${(totalFeePct*100).toFixed(4)}%`, net_spread: `${(netSpread*100).toFixed(4)}%`, direction: dirStr, net_profit: `$${netProfit.toFixed(4)}`, isProfitable, executable: t.executable, dry_run: DRY_RUN, action, ...(rejectReason && { reject_reason: rejectReason }), ...(executionHash && { tx_hash: executionHash }), ...(executionError && { error: executionError }) });
    } catch (err: any) { results.push({ target: t.name, status: 'ERROR', error: String(err) }); }
  }
  return results;
}

serve(async (_req) => {
  const t0 = Date.now();
  const publicClient  = createPublicClient({ chain: base, transport: http(ALCHEMY_RPC_URL) });
  const execRpcClient = createPublicClient({ chain: base, transport: http(ALCHEMY_RPC_URL) });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const [configRes, gasPrice] = await Promise.all([
      supabase.from('arbitrage_config').select('*').eq('id', 1).single(),
      publicClient.getGasPrice()
    ]);
    const { trade_size_usd, min_profit_threshold_usd } = configRes.data;
    const ethPriceRef = { value: 2000 };
    const t1 = Date.now();
    const matrixResults = await batchScanAllTargets(publicClient, execRpcClient, supabase, Number(trade_size_usd), Number(min_profit_threshold_usd), gasPrice, ethPriceRef);
    const t2 = Date.now();
    const profitable2Pool = matrixResults.filter((r: any) => r.isProfitable);
    const feeKilled       = matrixResults.filter((r: any) => r.action === 'SKIPPED_FEES_EXCEED_SPREAD');
    const executed        = matrixResults.filter((r: any) => r.tx_hash);
    const failed          = matrixResults.filter((r: any) => r.action === 'EXECUTE_FAILED');
    return new Response(safeJson({
      version: "v85_nonce_lanes",
      network: "base",
      rpc: "alchemy_pending",
      dry_run: DRY_RUN,
      contract: CONTRACT_ADDR,
      smart_wallet: _smartWalletAddr ?? "not_initialized",
      execution_mode: "coinbase_paymaster_4337",
      gas_strategy: "explicit_150k_verif+800k_call+300k_preverif__deployed_wallet_no_hook+nonce_lanes",
      paymaster_limit: "$15/UserOp (updated from $5)",
      eth_price_usd: ethPriceRef.value.toFixed(2),
      gas_price_gwei: Number(formatUnits(gasPrice, 9)).toFixed(6),
      threshold_usd: min_profit_threshold_usd,
      trade_size_usd: trade_size_usd,
      sim_gate: "REMOVED — FSV3:IFR contract guard protects. simulateContract(smartWallet) was always failing (AA≠EOA).",
      timing_ms: { init: t1 - t0, two_pool_scan: t2 - t1, total: t2 - t0 },
      summary: {
        total_pairs: TARGETS.length,
        fee_killed: feeKilled.length,
        profitable: profitable2Pool.length,
        executed: executed.length,
        failed: failed.length,
      },
      two_pool_matrix: matrixResults,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) { return new Response(safeJson({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } }); }
});
