import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  parseUnits,
  encodeFunctionData,
} from "npm:viem"
import { base } from "npm:viem/chains"
import { privateKeyToAccount } from "npm:viem/accounts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_RPC_URL            = Deno.env.get("BASE_RPC_URL")!;
const SUPABASE_URL            = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Bot wallet private key — set as Supabase secret (NEVER commit to git)
// Funded with ~$2 ETH on Base for gas
const BOT_PRIVATE_KEY = Deno.env.get("BOT_PRIVATE_KEY");

// Deployed contract address — set after deployment
const WARDEN_CONTRACT = Deno.env.get("WARDEN_CONTRACT_ADDRESS");

// ── Addresses ─────────────────────────────────────────────────────────────────
const UNI_V3_POOL    = "0x4C36388bE6F416A29C8d8Eee81C771cE6bE14B18";
const AERODROME_POOL = "0xcDAC0d6c6C59727a65F871236188350531885C43";

// ── ABIs ──────────────────────────────────────────────────────────────────────
const V3_ABI = parseAbi([
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
]);
const V2_ABI = parseAbi([
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
]);
const WARDEN_ABI = parseAbi([
  'function executeArb(uint256 usdcAmount, uint8 direction, uint256 minProfit, bytes32 txRef) external'
]);

// ── Scanner + Executor ────────────────────────────────────────────────────────
serve(async (_req) => {
  const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });
  const supabase     = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1. Load config and chain data in parallel
    const [configRes, uniSlot0, aeroReserves, gasPrice] = await Promise.all([
      supabase.from('arbitrage_config').select('*').eq('id', 1).single(),
      publicClient.readContract({ address: UNI_V3_POOL, abi: V3_ABI, functionName: 'slot0' }),
      publicClient.readContract({ address: AERODROME_POOL, abi: V2_ABI, functionName: 'getReserves' }),
      publicClient.getGasPrice()
    ]);

    const { trade_size_usd, min_profit_threshold_usd } = configRes.data;

    // 2. Price math
    const sqrtP     = Number(uniSlot0[0]);
    const uniPrice  = (sqrtP / (2 ** 96)) ** 2 * 1e12;
    const aeroPrice = Number(aeroReserves[1]) / Number(aeroReserves[0]) * 1e12;

    // 3. Determine direction
    // direction 0: UniV3 > Aero → buy cheap on Aero, sell on UniV3
    // direction 1: Aero > UniV3 → buy cheap on UniV3, sell on Aero
    const direction: number = uniPrice >= aeroPrice ? 0 : 1;
    const spread = Math.abs((uniPrice - aeroPrice) / uniPrice);

    // 4. Gas math
    const estimatedGasUnits = 350000n; // flash loan is heavier than simple swap
    const gasCostEth        = Number(formatUnits(gasPrice * estimatedGasUnits, 18));
    const gasCostUsd        = gasCostEth * uniPrice;

    // 5. P&L
    const grossProfit = Number(trade_size_usd) * spread;
    const netProfit   = grossProfit - gasCostUsd;
    const isProfitable = netProfit > Number(min_profit_threshold_usd);

    // 6. Build a reference ID for correlation (logged + passed on-chain)
    const txRef = crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    const txRefBytes32 = `0x${txRef.padEnd(64, '0')}` as `0x${string}`;

    // 7. Execute if profitable AND contract + key are configured
    let executionHash: string | null = null;
    let executionError: string | null = null;

    if (isProfitable && BOT_PRIVATE_KEY && WARDEN_CONTRACT) {
      try {
        const account      = privateKeyToAccount(`0x${BOT_PRIVATE_KEY}` as `0x${string}`);
        const walletClient = createWalletClient({ account, chain: base, transport: http(BASE_RPC_URL) });

        // minProfit in USDC (6 dec) — set to 80% of calculated net to absorb small slippage
        const minProfitUsdc = parseUnits(
          (netProfit * 0.8).toFixed(6),
          6
        );

        const tradeAmountUsdc = parseUnits(
          Number(trade_size_usd).toFixed(6),
          6
        );

        executionHash = await walletClient.writeContract({
          address:      WARDEN_CONTRACT as `0x${string}`,
          abi:          WARDEN_ABI,
          functionName: 'executeArb',
          args:         [tradeAmountUsdc, direction, minProfitUsdc, txRefBytes32],
        });

        console.log(`WARDEN FIRED: tx=${executionHash} dir=${direction} net=$${netProfit.toFixed(4)}`);
      } catch (execErr: any) {
        executionError = execErr.message;
        console.error("Execution failed:", execErr.message);
      }
    }

    // 8. Log everything to Supabase
    await supabase.from('arbitrage_logs').insert({
      uniswap_price:      uniPrice,
      sushi_price:        aeroPrice,
      spread_percentage:  spread * 100,
      gas_cost_usd:       gasCostUsd,
      net_profit_usd:     netProfit,
      profitable:         isProfitable,
      network:            'base',
      // extra context stored as stringified JSON in any available text col
      // (extend schema if you want structured querying)
    });

    // 9. Return full report
    const report = {
      network:         'base',
      source_A:        'UniswapV3_0.05%',
      source_B:        'Aerodrome_vAMM',
      uniV3_price:     '$' + uniPrice.toFixed(4),
      aerodrome_price: '$' + aeroPrice.toFixed(4),
      direction:       direction === 0 ? 'BUY_Aero→SELL_Uni' : 'BUY_Uni→SELL_Aero',
      spread_pct:      (spread * 100).toFixed(4) + '%',
      gross_profit:    '$' + grossProfit.toFixed(4),
      gas_cost:        '$' + gasCostUsd.toFixed(6),
      net_profit:      '$' + netProfit.toFixed(4),
      trade_size:      '$' + trade_size_usd,
      isProfitable,
      ...(executionHash  ? { execution_tx:    executionHash }  : {}),
      ...(executionError ? { execution_error: executionError } : {}),
      ...(isProfitable && !WARDEN_CONTRACT ? { status: 'PROFITABLE_PENDING_DEPLOYMENT' } : {}),
    };

    return new Response(JSON.stringify(report, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
