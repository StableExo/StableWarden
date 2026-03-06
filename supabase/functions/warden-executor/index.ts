import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  parseUnits,
} from "npm:viem"
import { base } from "npm:viem/chains"
import { privateKeyToAccount } from "npm:viem/accounts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// BigInt-safe JSON serializer
const safeJson = (obj: any) =>
  JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_RPC_URL              = Deno.env.get("BASE_RPC_URL") ?? "https://base-mainnet.g.alchemy.com/v2/3wG3PLWyPu2DliGQLVa8G";
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_PRIVATE_KEY           = Deno.env.get("BOT_PRIVATE_KEY");

// ── V2 CONTRACT ──────────────────────────────────────────────────────────────
// Update this after deploying WardenExecutorV2
const CONTRACT_ADDR             = "0xc5DB2D008D6c99feCf2B6CBA7b7f8aE84e3A3d87" as `0x${string}`;

// ── DRY RUN MODE ─────────────────────────────────────────────────────────────
// When true: simulates contract calls but never submits on-chain transactions.
// Set to false only when ready for live execution.
const DRY_RUN = true;

const MIN_SPREAD_THRESHOLD = 0.005;
const MIN_SQRT_PRICE = 2n ** 40n;

const UNI_V3_FACTORY      = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" as `0x${string}`;
const SLIPSTREAM_FACTORY   = "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A" as `0x${string}`;
const AERO_FACTORY         = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as `0x${string}`;
const AERO_ROUTER          = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as `0x${string}`;
const NULL_ADDR            = "0x0000000000000000000000000000000000000000";

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

// Map string venue type to V2 contract uint8
const VENUE_B_TYPE_MAP: Record<VenueBType, number> = {
  'slipstream': 0,
  'aero_vamm':  1,
  'aero_samm':  2,
};

const TARGETS: {
  name: string; tokenA: string; tokenB: string;
  venueAName: string; venueAFactory: `0x${string}`; venueAParam: number;
  venueBName: string; venueBType: VenueBType;
  venueBFactory?: `0x${string}`; venueBParam?: number;
  executable: boolean;
}[] = [
  // 1. THE BENCHMARK
  { name: "WETH-USDC", tokenA: WETH, tokenB: USDC, venueAName: "UniswapV3_0.05%", venueAFactory: UNI_V3_FACTORY, venueAParam: 500, venueBName: "Aerodrome_vAMM", venueBType: 'aero_vamm', executable: true },
  // 2. THE CORRELATION
  { name: "cbETH-WETH", tokenA: cbETH, tokenB: WETH, venueAName: "UniswapV3_0.01%", venueAFactory: UNI_V3_FACTORY, venueAParam: 100, venueBName: "Aerodrome_vAMM", venueBType: 'aero_vamm', executable: true },
  // 3. THE PEG
  { name: "USDbC-USDC", tokenA: USDbC, tokenB: USDC, venueAName: "UniswapV3_0.01%", venueAFactory: UNI_V3_FACTORY, venueAParam: 100, venueBName: "Aerodrome_sAMM", venueBType: 'aero_samm', executable: true },
  // 4. THE SNIPER
  { name: "WETH-cbBTC", tokenA: WETH, tokenB: cbBTC, venueAName: "UniswapV3_0.3%", venueAFactory: UNI_V3_FACTORY, venueAParam: 3000, venueBName: "Slipstream_100", venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 100, executable: true },
  // 5. THE LST PEG
  { name: "wstETH-WETH", tokenA: wstETH, tokenB: WETH, venueAName: "UniswapV3_0.01%", venueAFactory: UNI_V3_FACTORY, venueAParam: 100, venueBName: "Slipstream_1", venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 1, executable: true },
  // 6. THE DOLLAR WARS
  { name: "USDC-USDT", tokenA: USDC, tokenB: USDT, venueAName: "UniswapV3_0.01%", venueAFactory: UNI_V3_FACTORY, venueAParam: 100, venueBName: "Slipstream_1", venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 1, executable: true },
  // 7. THE RESTAKING PEG
  { name: "weETH-WETH", tokenA: weETH, tokenB: WETH, venueAName: "UniswapV3_0.01%", venueAFactory: UNI_V3_FACTORY, venueAParam: 100, venueBName: "Slipstream_1", venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 1, executable: true },
  // 8. THE NATIVE — WETH/AERO
  { name: "WETH-AERO", tokenA: WETH, tokenB: AERO, venueAName: "UniswapV3_0.3%", venueAFactory: UNI_V3_FACTORY, venueAParam: 3000, venueBName: "Slipstream_200", venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200, executable: true },
  // 9. THE DAI SPREAD
  { name: "DAI-USDC", tokenA: DAI, tokenB: USDC, venueAName: "UniswapV3_0.01%", venueAFactory: UNI_V3_FACTORY, venueAParam: 100, venueBName: "Aerodrome_sAMM", venueBType: 'aero_samm', executable: true },
  // 10. THE BTC-DOLLAR
  { name: "cbBTC-USDC", tokenA: cbBTC, tokenB: USDC, venueAName: "UniswapV3_0.01%", venueAFactory: UNI_V3_FACTORY, venueAParam: 100, venueBName: "Slipstream_1", venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 1, executable: true },
  // 11. THE VIRTUALS
  { name: "VIRTUAL-WETH", tokenA: VIRTUAL, tokenB: WETH, venueAName: "UniswapV3_0.05%", venueAFactory: UNI_V3_FACTORY, venueAParam: 500, venueBName: "Slipstream_100", venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 100, executable: true },
  // 12. THE TETHER
  { name: "WETH-USDT", tokenA: WETH, tokenB: USDT, venueAName: "UniswapV3_0.05%", venueAFactory: UNI_V3_FACTORY, venueAParam: 500, venueBName: "Slipstream_100", venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 100, executable: true },
  // 13. THE MEME KING — BRETT/WETH
  { name: "BRETT-WETH", tokenA: BRETT, tokenB: WETH, venueAName: "UniswapV3_1%", venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200", venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200, executable: true },
  // 14. THE LENDER — MORPHO/WETH
  { name: "MORPHO-WETH", tokenA: MORPHO, tokenB: WETH, venueAName: "UniswapV3_0.3%", venueAFactory: UNI_V3_FACTORY, venueAParam: 3000, venueBName: "Slipstream_200", venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200, executable: true },
  // 15. THE BANKER — BNKR/WETH
  { name: "BNKR-WETH", tokenA: BNKR, tokenB: WETH, venueAName: "UniswapV3_1%", venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200", venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200, executable: true },
  // 16. THE LAUNCHPAD — CLANKER/WETH
  { name: "CLANKER-WETH", tokenA: CLANKER, tokenB: WETH, venueAName: "UniswapV3_1%", venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200", venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200, executable: true },
  // 17. THE AI ENGINE — VVV/WETH, Venice Token
  { name: "VVV-WETH", tokenA: VVV, tokenB: WETH, venueAName: "UniswapV3_1%", venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_100", venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 100, executable: true },
  // 18. THE INFRASTRUCTURE — KTA/WETH, Keeta
  { name: "KTA-WETH", tokenA: KTA, tokenB: WETH, venueAName: "UniswapV3_1%", venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200", venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200, executable: true },
  // 19. THE MASCOT — TOSHI/WETH, Base's AI cat token
  { name: "TOSHI-WETH", tokenA: TOSHI, tokenB: WETH, venueAName: "UniswapV3_1%", venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200", venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200, executable: true },
  // 20. THE FARCASTER DOG — DOGINME/WETH, Farcaster's origin meme token
  { name: "DOGINME-WETH", tokenA: DOGINME, tokenB: WETH, venueAName: "UniswapV3_1%", venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200", venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200, executable: true },
];

const UNI_FACTORY_ABI = parseAbi(['function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)']);
const SLIPSTREAM_FACTORY_ABI = parseAbi(['function getPool(address tokenA, address tokenB, int24 tickSpacing) view returns (address pool)']);
const AERO_FACTORY_ABI = parseAbi(['function getPool(address tokenA, address tokenB, bool stable) view returns (address pool)']);
const V3_POOL_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)'
]);
const SLIPSTREAM_POOL_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)',
  'function token0() view returns (address)'
]);
const V2_POOL_ABI = parseAbi([
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)'
]);
const AERO_ROUTER_ABI = parseAbi(['function getAmountsOut(uint256 amountIn, (address from, address to, bool stable, address factory)[] routes) view returns (uint256[] amounts)']);

// ── V2 ABI ──────────────────────────────────────────────────────────────────
// Updated for WardenExecutorV2 — accepts all pair parameters
const WARDEN_ABI = parseAbi([
  'function executeArb(address tokenA, address tokenB, address uniV3Pool, address venueBPool, uint8 venueBType, uint256 amountIn, uint8 direction, uint256 minProfit, bytes32 txRef) external'
]);

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
