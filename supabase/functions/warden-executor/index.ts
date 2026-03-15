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

const COINBASE_RPC_URL  = "https://api.developer.coinbase.com/rpc/v1/base/EeBuC9EkcVpsMwYSiiC1TUKwFTWJVzD1";
const ALCHEMY_RPC_URL   = "https://base-mainnet.g.alchemy.com/v2/3wG3PLWyPu2DliGQLVa8G";
const FLASHBLOCKS_RPC_URL = ALCHEMY_RPC_URL;
const BASE_RPC_URL = Deno.env.get("BASE_RPC_URL") ?? ALCHEMY_RPC_URL;

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_PRIVATE_KEY           = Deno.env.get("BOT_PRIVATE_KEY");

const CONTRACT_ADDR = "0xF249b64830D28721e1886D55B0359b7Fb41B62db" as `0x${string}`; // FlashSwapV3 v74 - Aave-only flash loan (Balancer isBalancerSupported fix)
const DRY_RUN = false;

const QUOTER_V2_ADDRESS = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as `0x${string}`;
const QUOTER_V2_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
]);

const MIN_SQRT_PRICE = 2n ** 40n;
const AAVE_FLASH_FEE_PCT = 0.0005;

// Tokens that Aave V3 on Base supports for flash loans
const AAVE_FLASH_SUPPORTED = new Set([
  "0x4200000000000000000000000000000000000006",  // WETH
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",  // USDC
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22",  // cbETH
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",  // cbBTC
  "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452",  // wstETH
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca",  // USDbC
  "0x04c0599ae5a44757c0af6f9ec3b93da8976c150a",  // weETH
  "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",  // USDT
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb",  // DAI
]);

const GAS_PRICE_ORACLE   = "0x420000000000000000000000000000000000000F" as `0x${string}`;
const ARB_CALLDATA_BYTES = 500;

const UNI_V3_FACTORY    = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" as `0x${string}`;
const SLIPSTREAM_FACTORY = "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A" as `0x${string}`;
const AERO_FACTORY      = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" as `0x${string}`;
const AERO_ROUTER       = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as `0x${string}`;
const SUSHI_V3_FACTORY  = "0xc35DADB65012eC5796536bD9864eD8773aBc74C4" as `0x${string}`;
const SUSHI_V2_FACTORY  = "0x71524b4f93c58fcbf659783284e38825f0622859" as `0x${string}`;
const PANCAKE_V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" as `0x${string}`;
const ALIENBASE_FACTORY = "0x3e84d913803b02a4a7f027165e8ca42c14c0fde7" as `0x${string}`;
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

type VenueBType = 'aero_vamm' | 'aero_samm' | 'slipstream' | 'sushi_v2' | 'alienbase_v2' | 'pancake_v3' | 'sushi_v3';
type HopType = 'univ3' | 'slipstream' | 'aero_vamm' | 'aero_samm';

const VENUE_B_TYPE_MAP: Record<VenueBType, number> = {
  'slipstream':   0,  // DEX_TYPE_UNISWAP_V3
  'aero_vamm':    3,  // DEX_TYPE_AERODROME
  'aero_samm':    3,  // DEX_TYPE_AERODROME
  'sushi_v2':     1,  // DEX_TYPE_SUSHISWAP
  'alienbase_v2': 9,  // DEX_TYPE_ALIENBASE_V2
  'pancake_v3':   8,  // DEX_TYPE_PANCAKESWAP_V3
  'sushi_v3':     7,  // DEX_TYPE_SUSHISWAP_V3
};

const VENUE_B_FEE_PCT: Record<VenueBType, number> = {
  'aero_vamm':    0.002,
  'aero_samm':    0.0002,
  'slipstream':   0.0005,
  'sushi_v2':     0.003,
  'alienbase_v2': 0.002,
  'pancake_v3':   0,
  'sushi_v3':     0,
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
  { name: "MORPHO-WETH",  tokenA: MORPHO,  tokenB: WETH,   venueAName: "UniswapV3_0.3%",   venueAFactory: UNI_V3_FACTORY, venueAParam: 3000,  venueBName: "Slipstream_200",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200,  executable: true },
  { name: "BNKR-WETH",    tokenA: BNKR,    tokenB: WETH,   venueAName: "UniswapV3_1%",     venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200,  executable: true },
  { name: "CLANKER-WETH", tokenA: CLANKER, tokenB: WETH,   venueAName: "UniswapV3_1%",     venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200,  executable: true },
  { name: "VVV-WETH",     tokenA: VVV,     tokenB: WETH,   venueAName: "UniswapV3_1%",     venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_100",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 100,  executable: true },
  { name: "KTA-WETH",     tokenA: KTA,     tokenB: WETH,   venueAName: "UniswapV3_1%",     venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200,  executable: true },
  { name: "TOSHI-WETH",   tokenA: TOSHI,   tokenB: WETH,   venueAName: "UniswapV3_1%",     venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200,  executable: true },
  { name: "DOGINME-WETH", tokenA: DOGINME, tokenB: WETH,   venueAName: "UniswapV3_1%",     venueAFactory: UNI_V3_FACTORY, venueAParam: 10000, venueBName: "Slipstream_200",    venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200,  executable: true },
  { name: "WETH-USDC [SushiV3]",  tokenA: WETH,  tokenB: USDC,  venueAName: "SushiV3_0.05%", venueAFactory: SUSHI_V3_FACTORY, venueAParam: 500,  venueBName: "Aerodrome_vAMM",  venueBType: 'aero_vamm',  executable: true },
  { name: "cbETH-WETH [SushiV3]", tokenA: cbETH, tokenB: WETH,  venueAName: "SushiV3_0.05%", venueAFactory: SUSHI_V3_FACTORY, venueAParam: 500,  venueBName: "Aerodrome_vAMM",  venueBType: 'aero_vamm',  executable: true },
  { name: "WETH-cbBTC [SushiV3]", tokenA: WETH,  tokenB: cbBTC, venueAName: "SushiV3_0.3%",  venueAFactory: SUSHI_V3_FACTORY, venueAParam: 3000, venueBName: "Slipstream_100",  venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 100, executable: true },
  { name: "WETH-USDC [SushiV2]",  tokenA: WETH,  tokenB: USDC,  venueAName: "UniswapV3_0.05%", venueAFactory: UNI_V3_FACTORY, venueAParam: 500, venueBName: "SushiSwap_V2",   venueBType: 'sushi_v2',    venueBFactory: SUSHI_V2_FACTORY,  executable: true },
  { name: "WETH-USDC [AlienBase]",  tokenA: WETH,  tokenB: USDC, venueAName: "UniswapV3_0.05%", venueAFactory: UNI_V3_FACTORY, venueAParam: 500,   venueBName: "AlienBase_V2", venueBType: 'alienbase_v2', venueBFactory: ALIENBASE_FACTORY, executable: true },
  { name: "WETH-USDC [Uni↔PCS]",    tokenA: WETH,    tokenB: USDC,   venueAName: "UniswapV3_0.05%",  venueAFactory: UNI_V3_FACTORY,   venueAParam: 500,   venueBName: "PancakeV3_0.05%",  venueBType: 'pancake_v3', venueBFactory: PANCAKE_V3_FACTORY, venueBParam: 500,   executable: true },
  { name: "cbETH-WETH [Uni↔PCS]",   tokenA: cbETH,   tokenB: WETH,   venueAName: "UniswapV3_0.01%",  venueAFactory: UNI_V3_FACTORY,   venueAParam: 100,   venueBName: "PancakeV3_0.05%",  venueBType: 'pancake_v3', venueBFactory: PANCAKE_V3_FACTORY, venueBParam: 500,   executable: true },
  { name: "wstETH-WETH [Uni↔PCS]",  tokenA: wstETH,  tokenB: WETH,   venueAName: "UniswapV3_0.01%",  venueAFactory: UNI_V3_FACTORY,   venueAParam: 100,   venueBName: "PancakeV3_0.01%",  venueBType: 'pancake_v3', venueBFactory: PANCAKE_V3_FACTORY, venueBParam: 100,   executable: true },
  { name: "WETH-USDT [Uni↔PCS]",    tokenA: WETH,    tokenB: USDT,   venueAName: "UniswapV3_0.05%",  venueAFactory: UNI_V3_FACTORY,   venueAParam: 500,   venueBName: "PancakeV3_0.05%",  venueBType: 'pancake_v3', venueBFactory: PANCAKE_V3_FACTORY, venueBParam: 500,   executable: true },
  { name: "USDbC-USDC [Uni↔PCS]",   tokenA: USDbC,   tokenB: USDC,   venueAName: "UniswapV3_0.01%",  venueAFactory: UNI_V3_FACTORY,   venueAParam: 100,   venueBName: "PancakeV3_0.01%",  venueBType: 'pancake_v3', venueBFactory: PANCAKE_V3_FACTORY, venueBParam: 100,   executable: true },
  { name: "DAI-USDC [Uni↔PCS]",     tokenA: DAI,     tokenB: USDC,   venueAName: "UniswapV3_0.01%",  venueAFactory: UNI_V3_FACTORY,   venueAParam: 100,   venueBName: "PancakeV3_0.01%",  venueBType: 'pancake_v3', venueBFactory: PANCAKE_V3_FACTORY, venueBParam: 100,   executable: true },
  { name: "WETH-cbBTC [Uni↔PCS]",   tokenA: WETH,    tokenB: cbBTC,  venueAName: "UniswapV3_0.3%",   venueAFactory: UNI_V3_FACTORY,   venueAParam: 3000,  venueBName: "PancakeV3_0.25%",  venueBType: 'pancake_v3', venueBFactory: PANCAKE_V3_FACTORY, venueBParam: 2500,  executable: true },
  { name: "WETH-AERO [Uni↔PCS]",    tokenA: WETH,    tokenB: AERO,   venueAName: "UniswapV3_0.3%",   venueAFactory: UNI_V3_FACTORY,   venueAParam: 3000,  venueBName: "PancakeV3_0.25%",  venueBType: 'pancake_v3', venueBFactory: PANCAKE_V3_FACTORY, venueBParam: 2500,  executable: true },
  { name: "WETH-AERO [PCS↔Aero]",   tokenA: WETH,    tokenB: AERO,   venueAName: "PancakeV3_0.25%",  venueAFactory: PANCAKE_V3_FACTORY, venueAParam: 2500,  venueBName: "Slipstream_200",   venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 200,  executable: true },
  { name: "WETH-USDT [PCS↔Aero]",   tokenA: WETH,    tokenB: USDT,   venueAName: "PancakeV3_0.05%",  venueAFactory: PANCAKE_V3_FACTORY, venueAParam: 500,   venueBName: "Slipstream_100",   venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 100,  executable: true },
  { name: "WETH-cbBTC [PCS↔Aero]",  tokenA: WETH,    tokenB: cbBTC,  venueAName: "PancakeV3_0.25%",  venueAFactory: PANCAKE_V3_FACTORY, venueAParam: 2500,  venueBName: "Slipstream_100",   venueBType: 'slipstream', venueBFactory: SLIPSTREAM_FACTORY, venueBParam: 100,  executable: true },
  { name: "WETH-USDC [PCS↔Aero]",   tokenA: WETH,    tokenB: USDC,   venueAName: "PancakeV3_0.05%",  venueAFactory: PANCAKE_V3_FACTORY, venueAParam: 500,   venueBName: "Aerodrome_vAMM",   venueBType: 'aero_vamm',  executable: true },
  { name: "WETH-USDC [Uni↔Sushi]",    tokenA: WETH,    tokenB: USDC,   venueAName: "UniswapV3_0.05%",  venueAFactory: UNI_V3_FACTORY,   venueAParam: 500,   venueBName: "SushiV3_0.05%",    venueBType: 'sushi_v3', venueBFactory: SUSHI_V3_FACTORY, venueBParam: 500,   executable: true },
  { name: "cbETH-WETH [Uni↔Sushi]",   tokenA: cbETH,   tokenB: WETH,   venueAName: "UniswapV3_0.01%",  venueAFactory: UNI_V3_FACTORY,   venueAParam: 100,   venueBName: "SushiV3_0.05%",    venueBType: 'sushi_v3', venueBFactory: SUSHI_V3_FACTORY, venueBParam: 500,   executable: true },
  { name: "WETH-cbBTC [Uni↔Sushi]",   tokenA: WETH,    tokenB: cbBTC,  venueAName: "UniswapV3_0.3%",   venueAFactory: UNI_V3_FACTORY,   venueAParam: 3000,  venueBName: "SushiV3_0.3%",     venueBType: 'sushi_v3', venueBFactory: SUSHI_V3_FACTORY, venueBParam: 3000,  executable: true },
  { name: "wstETH-WETH [Uni↔Sushi]",  tokenA: wstETH,  tokenB: WETH,   venueAName: "UniswapV3_0.01%",  venueAFactory: UNI_V3_FACTORY,   venueAParam: 100,   venueBName: "SushiV3_0.05%",    venueBType: 'sushi_v3', venueBFactory: SUSHI_V3_FACTORY, venueBParam: 500,   executable: true },
  { name: "WETH-USDT [Uni↔Sushi]",    tokenA: WETH,    tokenB: USDT,   venueAName: "UniswapV3_0.05%",  venueAFactory: UNI_V3_FACTORY,   venueAParam: 500,   venueBName: "SushiV3_0.3%",     venueBType: 'sushi_v3', venueBFactory: SUSHI_V3_FACTORY, venueBParam: 3000,  executable: true },
  { name: "DAI-USDC [Uni↔Sushi]",     tokenA: DAI,     tokenB: USDC,   venueAName: "UniswapV3_0.01%",  venueAFactory: UNI_V3_FACTORY,   venueAParam: 100,   venueBName: "SushiV3_0.01%",    venueBType: 'sushi_v3', venueBFactory: SUSHI_V3_FACTORY, venueBParam: 100,   executable: true },
  { name: "WETH-USDC [SushiV3↔Aero]", tokenA: WETH,    tokenB: USDC,   venueAName: "SushiV3_0.05%",   venueAFactory: SUSHI_V3_FACTORY, venueAParam: 500,   venueBName: "Aerodrome_vAMM",   venueBType: 'aero_vamm', executable: true },
  { name: "WETH-USDT [PCS↔Sushi]",    tokenA: WETH,    tokenB: USDT,   venueAName: "PancakeV3_0.05%",  venueAFactory: PANCAKE_V3_FACTORY, venueAParam: 500, venueBName: "SushiV3_0.3%",     venueBType: 'sushi_v3', venueBFactory: SUSHI_V3_FACTORY, venueBParam: 3000,  executable: true },
];

interface TriHop {
  name: string; tokenIn: string; tokenOut: string;
  factory: `0x${string}`; param: number; poolType: HopType; feePct: number;
}
interface TriCycle {
  name: string; startToken: string; hops: [TriHop, TriHop, TriHop];
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
  'function getReserves() returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)'
]);
const V2_PAIR_FACTORY_ABI = parseAbi(['function getPair(address tokenA, address tokenB) view returns (address pair)']);
const AERO_ROUTER_ABI = parseAbi(['function getAmountsOut(uint256 amountIn, (address from, address to, bool stable, address factory)[] routes) view returns (uint256[] amounts)']);
const GAS_PRICE_ORACLE_ABI = parseAbi([
  'function getL1FeeUpperBound(uint256 unsignedTxSize) view returns (uint256)'
]);

const DEX_GAS_UNITS: Record<string, number> = {
  'univ3':        120_000,
  'slipstream':   120_000,
  'aero_vamm':    120_000,
  'aero_samm':    120_000,
  'sushi_v2':     100_000,
  'alienbase_v2': 100_000,
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
  useTokenABorrow: boolean = false,
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

const TRI_POOL_TYPE_MAP: Record<string, number> = {
  'univ3': 0, 'slipstream': 0, 'aero_vamm': 3, 'aero_samm': 3,
};

let _bundlerClient: any = null;
let _smartAccount: any = null;
let _smartWalletAddr: `0x${string}` | null = null;

async function getBundlerClient(publicClient: any) {
  if (_bundlerClient) return _bundlerClient;
  if (!BOT_PRIVATE_KEY) throw new Error("BOT_PRIVATE_KEY not set");
  const eoaAccount = privateKeyToAccount(`0x${BOT_PRIVATE_KEY}` as `0x${string}`);
  const paymasterClient = createPublicClient({ chain: base, transport: http(COINBASE_RPC_URL) });
  _smartAccount = await toCoinbaseSmartAccount({ client: paymasterClient, owners: [eoaAccount], version: '1.1' });
  _smartWalletAddr = _smartAccount.address as `0x${string}`;
  _bundlerClient = createBundlerClient({ account: _smartAccount, client: paymasterClient, transport: http(COINBASE_RPC_URL), chain: base });
  return _bundlerClient;
}

async function executeViaPaymaster(publicClient: any, contractAddr: `0x${string}`, abi: any, functionName: string, args: readonly any[]): Promise<{ txHash: string; userOpHash: string }> {
  const bundlerClient = await getBundlerClient(publicClient);
  const callData = encodeFunctionData({ abi, functionName, args });

  // Estimate gas and apply +30% callGasLimit buffer to prevent out-of-gas failures
  const gasEstimate = await bundlerClient.estimateUserOperationGas({
    calls: [{ to: contractAddr, data: callData, value: 0n }],
    paymaster: true,
  });
  const paddedCallGasLimit = (gasEstimate.callGasLimit * 130n) / 100n;

  const userOpHash = await bundlerClient.sendUserOperation({
    calls: [{ to: contractAddr, data: callData, value: 0n }],
    paymaster: true,
    callGasLimit: paddedCallGasLimit,
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
  if (t.venueBType === 'slipstream')    return `${t.venueBFactory}|${t.tokenA}|${t.tokenB}|${t.venueBParam}`;
  if (t.venueBType === 'aero_samm')     return `${AERO_FACTORY}|${t.tokenA}|${t.tokenB}|true`;
  if (t.venueBType === 'aero_vamm')     return `${AERO_FACTORY}|${t.tokenA}|${t.tokenB}|false`;
  if (t.venueBType === 'pancake_v3')    return `${t.venueBFactory}|${t.tokenA}|${t.tokenB}|${t.venueBParam}`;
  if (t.venueBType === 'sushi_v3')      return `${t.venueBFactory}|${t.tokenA}|${t.tokenB}|${t.venueBParam}`;
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
      if (t.venueBType === 'slipstream') specs.push({ key: kbKey, address: t.venueBFactory!, abi: SLIPSTREAM_FACTORY_ABI, functionName: 'getPool', args: [t.tokenA, t.tokenB, t.venueBParam!] });
      else if (t.venueBType === 'aero_samm' || t.venueBType === 'aero_vamm') specs.push({ key: kbKey, address: AERO_FACTORY, abi: AERO_FACTORY_ABI, functionName: 'getPool', args: [t.tokenA, t.tokenB, t.venueBType === 'aero_samm'] });
      else if (t.venueBType === 'pancake_v3' || t.venueBType === 'sushi_v3') specs.push({ key: kbKey, address: t.venueBFactory!, abi: UNI_FACTORY_ABI, functionName: 'getPool', args: [t.tokenA, t.tokenB, t.venueBParam!] });
      else specs.push({ key: kbKey, address: t.venueBFactory!, abi: V2_PAIR_FACTORY_ABI, functionName: 'getPair', args: [t.tokenA, t.tokenB] });
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

interface PriceCallSpec { targetIdx: number; role: 'venueA_slot0' | 'venueA_token0' | 'venueB_slot0' | 'venueB_token0' | 'venueB_reserves' | 'venueB_token0v2' | 'venueB_amounts'; }

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
    if (t.venueBType === 'slipstream') {
      contracts.push({ address: venueBPoolAddr as `0x${string}`, abi: SLIPSTREAM_POOL_ABI, functionName: 'slot0' }); specs.push({ targetIdx: i, role: 'venueB_slot0' });
      contracts.push({ address: venueBPoolAddr as `0x${string}`, abi: SLIPSTREAM_POOL_ABI, functionName: 'token0' }); specs.push({ targetIdx: i, role: 'venueB_token0' });
    } else if (t.venueBType === 'pancake_v3' || t.venueBType === 'sushi_v3') {
      contracts.push({ address: venueBPoolAddr as `0x${string}`, abi: V3_POOL_ABI, functionName: 'slot0' }); specs.push({ targetIdx: i, role: 'venueB_slot0' });
      contracts.push({ address: venueBPoolAddr as `0x${string}`, abi: V3_POOL_ABI, functionName: 'token0' }); specs.push({ targetIdx: i, role: 'venueB_token0' });
    } else if (t.venueBType === 'aero_samm') {
      const decA = DECIMALS[t.tokenA.toLowerCase()] ?? 18;
      const amountIn = 10n ** BigInt(decA);
      const route = [{ from: t.tokenA as `0x${string}`, to: t.tokenB as `0x${string}`, stable: true as const, factory: AERO_FACTORY }];
      contracts.push({ address: AERO_ROUTER, abi: AERO_ROUTER_ABI, functionName: 'getAmountsOut', args: [amountIn, route] }); specs.push({ targetIdx: i, role: 'venueB_amounts' });
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
      case 'venueB_amounts':  d.venueBAmounts = r.result as bigint[]; break;
    }
  }
  return parsed;
}

async function batchScanAllTargets(publicClient: any, execRpcClient: any, supabase: any, trade_size_usd: number, min_profit_threshold_usd: number, gasPrice: bigint, ethPriceRef: { value: number }): Promise<any[]> {
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
      if (t.venueBType === 'slipstream' || t.venueBType === 'pancake_v3' || t.venueBType === 'sushi_v3') {
        if (!d.venueBSlot0 || !d.venueBToken0) { results.push({ target: t.name, status: 'GHOST_POOL', detail: 'venueB_slot0_missing' }); continue; }
        if ((d.venueBSlot0[0] as bigint) < MIN_SQRT_PRICE) { results.push({ target: t.name, status: 'GHOST_POOL', detail: 'venueB_sqrtPrice_zero' }); continue; }
        venueBPrice = calcV3Price(d.venueBSlot0[0] as bigint, d.venueBToken0, t.tokenA, decA, decB);
      } else if (t.venueBType === 'aero_samm') {
        if (!d.venueBAmounts) { results.push({ target: t.name, status: 'GHOST_POOL', detail: 'venueB_amounts_missing' }); continue; }
        const amountIn = 10n ** BigInt(decA);
        venueBPrice = Number(d.venueBAmounts[1]) / Number(amountIn) * Math.pow(10, decA - decB);
      } else {
        if (!d.venueBReserves || !d.venueBToken0) { results.push({ target: t.name, status: 'GHOST_POOL', detail: 'venueB_reserves_missing' }); continue; }
        venueBPrice = calcAeroPrice(d.venueBReserves[0] as bigint, d.venueBReserves[1] as bigint, d.venueBToken0, t.tokenA, decA, decB);
      }
      if (t.name === 'WETH-USDC') ethPriceRef.value = (venueAPrice + venueBPrice) / 2;
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
      let action = 'HOLD'; let simulationResult: string | null = null; let executionHash: string | null = null; let executionError: string | null = null; let rejectReason: string | null = null;
      if (!isProfitable) rejectReason = `net_profit $${netProfit.toFixed(4)} < threshold $${min_profit_threshold_usd}`;
      if (isProfitable) {
        if (t.executable && BOT_PRIVATE_KEY) {
          const tokenBIsAaveOk = AAVE_FLASH_SUPPORTED.has(t.tokenB.toLowerCase()) && (DECIMALS[t.tokenB.toLowerCase()] ?? 18) > 6;
          const useTokenABorrow = !tokenBIsAaveOk && AAVE_FLASH_SUPPORTED.has(t.tokenA.toLowerCase());
          const effectiveBorrowToken = useTokenABorrow ? t.tokenA : t.tokenB;
          const decEffective = DECIMALS[effectiveBorrowToken.toLowerCase()] ?? 18;
          const effectivePriceUsd = useTokenABorrow ? ethPriceRef.value : tokenBPriceUsd;
          const effectiveTokenAmount = trade_size_usd / effectivePriceUsd;
          const amountInWei    = parseUnits(effectiveTokenAmount.toFixed(decEffective > 6 ? 8 : 6), decEffective);
          const minProfitEffective = (netProfit * 0.8) / effectivePriceUsd;
          const minProfitWei   = parseUnits(minProfitEffective > 0 ? minProfitEffective.toFixed(decEffective > 6 ? 8 : 6) : '0', decEffective);
          const txRef = `0x${crypto.randomUUID().replace(/-/g, '').padEnd(64, '0')}` as `0x${string}`;
          const minFinalAmount = amountInWei + minProfitWei;
          const path = buildTwoStepPath(t, direction, amountInWei, minFinalAmount, venueAPoolAddr, venueBPoolAddr, useTokenABorrow);
          const callArgs = { address: CONTRACT_ADDR, abi: WARDEN_ABI, functionName: 'executeArbitrage' as const, args: [effectiveBorrowToken as `0x${string}`, amountInWei, path] as const };
          try {
            await execRpcClient.simulateContract({ ...callArgs, account: (_smartWalletAddr ?? await getBundlerClient(publicClient).then(() => _smartWalletAddr!)) });
            simulationResult = 'SIMULATION_SUCCESS';
            if (DRY_RUN) {
              action = 'DRY_RUN_SUCCESS';
              await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: t.venueAName, source_b: t.venueBName, token_pair: t.name, spread_pct: spreadRaw*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit, direction: dirStr, status: 'DRY_RUN_SUCCESS', tx_hash: null });
            } else {
              action = 'EXECUTE';
              const { txHash } = await executeViaPaymaster(publicClient, CONTRACT_ADDR, WARDEN_ABI, 'executeArbitrage', callArgs.args);
              executionHash = txHash;
              await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: t.venueAName, source_b: t.venueBName, token_pair: t.name, spread_pct: spreadRaw*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit, direction: dirStr, status: 'EXECUTED', tx_hash: txHash });
            }
          } catch (simErr: any) {
            simulationResult = 'SIMULATION_FAILED'; const errMsg = simErr?.shortMessage ?? simErr?.message ?? String(simErr); executionError = errMsg; rejectReason = `sim_failed: ${errMsg}`; action = DRY_RUN ? 'DRY_RUN_SIM_FAILED' : 'SIMULATE_FAILED';
            await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: t.venueAName, source_b: t.venueBName, token_pair: t.name, spread_pct: spreadRaw*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit, direction: dirStr, status: 'SIMULATION_FAILED', tx_hash: null });
          }
        } else {
          action = 'OPPORTUNITY_DETECTED';
          await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: t.venueAName, source_b: t.venueBName, token_pair: t.name, spread_pct: spreadRaw*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostUsd, net_profit_usd: netProfit, direction: dirStr, status: 'OPPORTUNITY_DETECTED', tx_hash: null });
        }
      }
      results.push({ target: t.name, venueA: t.venueAName, venueB: t.venueBName, venueA_price: `$${venueAPrice.toFixed(6)}`, venueB_price: `$${venueBPrice.toFixed(6)}`, spread_gross: `${(spreadRaw*100).toFixed(4)}%`, total_fees: `${(totalFeePct*100).toFixed(4)}%`, net_spread: `${(netSpread*100).toFixed(4)}%`, direction: dirStr, net_profit: `$${netProfit.toFixed(4)}`, isProfitable, executable: t.executable, dry_run: DRY_RUN, action, ...(rejectReason && { reject_reason: rejectReason }), ...(simulationResult && { simulation: simulationResult }), ...(executionHash && { tx_hash: executionHash }), ...(executionError && { error: executionError }) });
    } catch (err: any) { results.push({ target: t.name, status: 'ERROR', error: String(err) }); }
  }
  return results;
}

async function getHopPool(publicClient: any, hop: TriHop): Promise<string> {
  if (hop.poolType === 'univ3') return await publicClient.readContract({ address: hop.factory, abi: UNI_FACTORY_ABI, functionName: 'getPool', args: [hop.tokenIn as `0x${string}`, hop.tokenOut as `0x${string}`, hop.param] }) as string;
  else if (hop.poolType === 'slipstream') return await publicClient.readContract({ address: hop.factory, abi: SLIPSTREAM_FACTORY_ABI, functionName: 'getPool', args: [hop.tokenIn as `0x${string}`, hop.tokenOut as `0x${string}`, hop.param] }) as string;
  else return await publicClient.readContract({ address: AERO_FACTORY, abi: AERO_FACTORY_ABI, functionName: 'getPool', args: [hop.tokenIn as `0x${string}`, hop.tokenOut as `0x${string}`, hop.poolType === 'aero_samm'] }) as string;
}

async function getHopRate(publicClient: any, hop: TriHop, poolAddr: string): Promise<number> {
  const decIn = DECIMALS[hop.tokenIn.toLowerCase()] ?? 18; const decOut = DECIMALS[hop.tokenOut.toLowerCase()] ?? 18;
  if (hop.poolType === 'univ3') {
    const [slot0, token0, liquidity] = await Promise.all([ publicClient.readContract({ address: poolAddr as `0x${string}`, abi: V3_POOL_ABI, functionName: 'slot0' }), publicClient.readContract({ address: poolAddr as `0x${string}`, abi: V3_POOL_ABI, functionName: 'token0' }), publicClient.readContract({ address: poolAddr as `0x${string}`, abi: V3_POOL_ABI, functionName: 'liquidity' }) ]);
    if (slot0[0] < MIN_SQRT_PRICE) return 0; if ((liquidity as bigint) === 0n) return 0;
    return calcV3Price(slot0[0], token0 as string, hop.tokenIn, decIn, decOut);
  } else if (hop.poolType === 'slipstream') {
    const [slot0, token0, liquidity] = await Promise.all([ publicClient.readContract({ address: poolAddr as `0x${string}`, abi: SLIPSTREAM_POOL_ABI, functionName: 'slot0' }), publicClient.readContract({ address: poolAddr as `0x${string}`, abi: SLIPSTREAM_POOL_ABI, functionName: 'token0' }), publicClient.readContract({ address: poolAddr as `0x${string}`, abi: SLIPSTREAM_POOL_ABI, functionName: 'liquidity' }) ]);
    if (slot0[0] < MIN_SQRT_PRICE) return 0; if ((liquidity as bigint) === 0n) return 0;
    return calcV3Price(slot0[0], token0 as string, hop.tokenIn, decIn, decOut);
  } else if (hop.poolType === 'aero_samm') {
    const amountIn = BigInt(10 ** decIn);
    const route = [{ from: hop.tokenIn as `0x${string}`, to: hop.tokenOut as `0x${string}`, stable: true, factory: AERO_FACTORY }];
    const amounts = await publicClient.readContract({ address: AERO_ROUTER, abi: AERO_ROUTER_ABI, functionName: 'getAmountsOut', args: [amountIn, route] }) as bigint[];
    return Number(amounts[1]) / Number(amountIn) * Math.pow(10, decIn - decOut);
  } else {
    const [reserves, token0] = await Promise.all([ publicClient.readContract({ address: poolAddr as `0x${string}`, abi: V2_POOL_ABI, functionName: 'getReserves' }), publicClient.readContract({ address: poolAddr as `0x${string}`, abi: V2_POOL_ABI, functionName: 'token0' }) ]);
    return calcAeroPrice(reserves[0], reserves[1], token0 as string, hop.tokenIn, decIn, decOut);
  }
}

async function quoteUniV3Hop(publicClient: any, tokenIn: string, tokenOut: string, fee: number, amountIn: bigint): Promise<bigint | null> {
  try {
    const result = await publicClient.readContract({ address: QUOTER_V2_ADDRESS, abi: QUOTER_V2_ABI, functionName: 'quoteExactInputSingle', args: [{ tokenIn: tokenIn as `0x${string}`, tokenOut: tokenOut as `0x${string}`, amountIn, fee, sqrtPriceLimitX96: 0n }] });
    return result[0] as bigint;
  } catch { return null; }
}

async function simulateTriAtSizes(publicClient: any, cycle: TriCycle, rates: [number, number, number], ethPriceUsd: number): Promise<any[]> {
  const TEST_SIZES_ETH = [0.1, 0.5, 1.0]; const results = [];
  for (const sizeEth of TEST_SIZES_ETH) {
    const decStart = DECIMALS[cycle.startToken.toLowerCase()] ?? 18;
    let currentAmount: bigint = parseUnits(sizeEth.toFixed(8), decStart); const amountInWei = currentAmount; let usedQuoter = false;
    for (let i = 0; i < 3; i++) {
      const hop = cycle.hops[i]; const decIn = DECIMALS[hop.tokenIn.toLowerCase()] ?? 18; const decOut = DECIMALS[hop.tokenOut.toLowerCase()] ?? 18;
      if (hop.poolType === 'univ3') { const quoted = await quoteUniV3Hop(publicClient, hop.tokenIn, hop.tokenOut, hop.param, currentAmount); if (quoted !== null) { currentAmount = quoted; usedQuoter = true; continue; } }
      const rate = rates[i] * (1 - hop.feePct); const newAmt = Number(currentAmount) * rate * Math.pow(10, decOut - decIn); currentAmount = BigInt(Math.floor(newAmt));
    }
    const profitWei = Number(currentAmount) - Number(amountInWei); const profitPct = (profitWei / Number(amountInWei)) * 100; const tradeUsd = sizeEth * ethPriceUsd; const profitUsd = tradeUsd * (profitPct / 100);
    results.push({ size_eth: sizeEth, trade_usd: `$${tradeUsd.toFixed(0)}`, profit_pct: `${profitPct.toFixed(4)}%`, profit_usd: `$${profitUsd.toFixed(2)}`, method: usedQuoter ? 'quoter_v2+price_math' : 'price_math_only', survives: profitPct > 0.05 });
  }
  return results;
}

async function batchedAll<T, R>(items: T[], fn: (item: T) => Promise<R>, batchSize = 10, delayMs = 100): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize); const batchResults = await Promise.all(batch.map(fn)); results.push(...batchResults);
    if (i + batchSize < items.length) await new Promise(r => setTimeout(r, delayMs));
  }
  return results;
}

async function scanTriCycle(cycle: TriCycle, publicClient: any, supabase: any, trade_size_usd: number, min_profit_threshold_usd: number, gasCostTriUsd: number, ethPriceUsd: number): Promise<any> {
  try {
    const [pool0Addr, pool1Addr, pool2Addr] = await Promise.all([ getHopPool(publicClient, cycle.hops[0]), getHopPool(publicClient, cycle.hops[1]), getHopPool(publicClient, cycle.hops[2]) ]);
    if ([pool0Addr, pool1Addr, pool2Addr].some(p => p === NULL_ADDR)) return { cycle: cycle.name, status: "POOL_NOT_FOUND" };
    const [rate0, rate1, rate2] = await Promise.all([ getHopRate(publicClient, cycle.hops[0], pool0Addr), getHopRate(publicClient, cycle.hops[1], pool1Addr), getHopRate(publicClient, cycle.hops[2], pool2Addr) ]);
    if ([rate0, rate1, rate2].some(r => r === 0)) return { cycle: cycle.name, status: "GHOST_POOL_IN_CYCLE" };
    const effectiveRate0 = rate0 * (1 - cycle.hops[0].feePct); const effectiveRate1 = rate1 * (1 - cycle.hops[1].feePct); const effectiveRate2 = rate2 * (1 - cycle.hops[2].feePct);
    const cycleReturn = effectiveRate0 * effectiveRate1 * effectiveRate2; const netCycleReturn = cycleReturn * (1 - AAVE_FLASH_FEE_PCT);
    const grossProfitPct = netCycleReturn - 1; const grossProfitUsd = grossProfitPct * trade_size_usd; const netProfitUsd = grossProfitUsd - gasCostTriUsd; const isProfitable = grossProfitPct > 0 && netProfitUsd > min_profit_threshold_usd;
    const hopSummary = cycle.hops.map((h, i) => ({ hop: i+1, path: `${h.tokenIn.slice(0,6)}->${h.tokenOut.slice(0,6)}`, pool: h.name, raw_rate: [rate0,rate1,rate2][i].toFixed(8), effective_rate: [effectiveRate0,effectiveRate1,effectiveRate2][i].toFixed(8), fee: `${(h.feePct*100).toFixed(3)}%` }));
    const result: any = { cycle: cycle.name, type: "TRIANGULAR", hops: hopSummary, cycle_return_price_ratio: cycleReturn.toFixed(8), net_cycle_return: netCycleReturn.toFixed(8), gross_profit_pct: `${(grossProfitPct*100).toFixed(4)}%`, gross_profit_usd: `$${grossProfitUsd.toFixed(4)}`, gas_cost_usd: `$${gasCostTriUsd.toFixed(4)}`, net_profit_usd: `$${netProfitUsd.toFixed(4)}`, isProfitable };
    if (grossProfitPct > 0.001) { result.amount_simulation = await simulateTriAtSizes(publicClient, cycle, [rate0, rate1, rate2], ethPriceUsd); const survivingCount = result.amount_simulation.filter((s: any) => s.survives).length; result.simulation_verdict = survivingCount === 3 ? 'REAL_OPPORTUNITY -- survives all 3 sizes' : survivingCount > 0 ? `PARTIAL -- survives ${survivingCount}/3 sizes` : 'PHANTOM -- price_ratio_artifact, collapses under real amounts'; }
    if (isProfitable) {
      result.action = "OPPORTUNITY_DETECTED";
      const startDec = DECIMALS[cycle.startToken.toLowerCase()] ?? 18; const amountInWei = parseUnits(String(trade_size_usd / ethPriceUsd), startDec); const minProfitWei = parseUnits(String(min_profit_threshold_usd / ethPriceUsd), startDec);
      const txRef = `0x${'0'.repeat(24)}${Date.now().toString(16).padStart(40, '0').slice(-40)}` as `0x${string}`;
      const pool1Type = TRI_POOL_TYPE_MAP[cycle.hops[0].poolType] ?? 0; const pool2Type = TRI_POOL_TYPE_MAP[cycle.hops[1].poolType] ?? 0; const pool3Type = TRI_POOL_TYPE_MAP[cycle.hops[2].poolType] ?? 0;
      const ZERO_ADDR = '0x0000000000000000000000000000000000000000' as `0x${string}`;
      const triPath = {
        steps: [
          { pool: (pool1Type === 7 ? pool0Addr : ZERO_ADDR) as `0x${string}`, tokenIn: cycle.hops[0].tokenIn as `0x${string}`, tokenOut: cycle.hops[0].tokenOut as `0x${string}`, fee: cycle.hops[0].param, minOut: 0n, dexType: pool1Type },
          { pool: (pool2Type === 7 ? pool1Addr : ZERO_ADDR) as `0x${string}`, tokenIn: cycle.hops[1].tokenIn as `0x${string}`, tokenOut: cycle.hops[1].tokenOut as `0x${string}`, fee: cycle.hops[1].param, minOut: 0n, dexType: pool2Type },
          { pool: (pool3Type === 7 ? pool2Addr : ZERO_ADDR) as `0x${string}`, tokenIn: cycle.hops[2].tokenIn as `0x${string}`, tokenOut: cycle.hops[2].tokenOut as `0x${string}`, fee: cycle.hops[2].param, minOut: 0n, dexType: pool3Type },
        ],
        borrowAmount: amountInWei,
        minFinalAmount: amountInWei + minProfitWei,
      };
      const triCallArgs = { address: CONTRACT_ADDR, abi: WARDEN_ABI, functionName: 'executeArbitrage' as const, args: [ cycle.startToken as `0x${string}`, amountInWei, triPath ] as const };
      let simulationResult = ""; let executionHash = ""; let executionError = "";
      try {
        await publicClient.simulateContract({ ...triCallArgs, account: (_smartWalletAddr ?? await getBundlerClient(publicClient).then(() => _smartWalletAddr!)) }); simulationResult = "SIMULATION_OK";
        if (DRY_RUN) { result.action = "DRY_RUN_TRI_SUCCESS"; await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: cycle.hops[0].name, source_b: `${cycle.hops[1].name}+${cycle.hops[2].name}`, token_pair: cycle.name, spread_pct: grossProfitPct*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostTriUsd, net_profit_usd: netProfitUsd, direction: `TRI: ${cycle.name}`, status: 'DRY_RUN_TRI_SUCCESS', tx_hash: null }); }
        else { const { txHash } = await executeViaPaymaster(publicClient, CONTRACT_ADDR, WARDEN_ABI, 'executeArbitrage', triCallArgs.args); executionHash = txHash; result.action = "TRI_EXECUTED"; result.tx_hash = txHash; await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: cycle.hops[0].name, source_b: `${cycle.hops[1].name}+${cycle.hops[2].name}`, token_pair: cycle.name, spread_pct: grossProfitPct*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostTriUsd, net_profit_usd: netProfitUsd, direction: `TRI: ${cycle.name}`, status: 'TRI_EXECUTED', tx_hash: txHash }); }
      } catch (simErr: any) { simulationResult = "SIMULATION_FAILED"; executionError = simErr?.shortMessage ?? simErr?.message ?? String(simErr); result.action = DRY_RUN ? "DRY_RUN_TRI_SIM_FAILED" : "TRI_SIMULATE_FAILED"; await supabase.from('arbitrage_logs').insert({ network: 'base', source_a: cycle.hops[0].name, source_b: `${cycle.hops[1].name}+${cycle.hops[2].name}`, token_pair: cycle.name, spread_pct: grossProfitPct*100, gross_profit_usd: grossProfitUsd, gas_cost_usd: gasCostTriUsd, net_profit_usd: netProfitUsd, direction: `TRI: ${cycle.name}`, status: result.action, tx_hash: null }); }
      if (simulationResult) result.tri_simulation = simulationResult; if (executionHash) result.tri_tx_hash = executionHash; if (executionError) result.tri_error = executionError;
    } else { result.action = cycleReturn < 1 ? "LOSING_CYCLE" : "BELOW_GAS_THRESHOLD"; }
    return result;
  } catch (err: any) { return { cycle: cycle.name, status: "ERROR", error: String(err) }; }
}

serve(async (_req) => {
  const t0 = Date.now();
  const publicClient  = createPublicClient({ chain: base, transport: http(ALCHEMY_RPC_URL) });
  const execRpcClient = createPublicClient({ chain: base, transport: http(ALCHEMY_RPC_URL) });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const [configRes, gasPrice] = await Promise.all([ supabase.from('arbitrage_config').select('*').eq('id', 1).single(), publicClient.getGasPrice() ]);
    const { trade_size_usd, min_profit_threshold_usd } = configRes.data;
    const estimatedGasUnits = 450000n;
    const gasCostEth = Number(formatUnits(gasPrice * estimatedGasUnits, 18));
    const ethPriceRef = { value: 2000 };
    const t1 = Date.now();
    const matrixResults = await batchScanAllTargets(publicClient, execRpcClient, supabase, Number(trade_size_usd), Number(min_profit_threshold_usd), gasPrice, ethPriceRef);
    const t2 = Date.now();
    const gasCostTriUsd = gasCostEth * ethPriceRef.value * 1.5;
    const triResults = await batchedAll(TRI_CYCLES, (cycle) => scanTriCycle(cycle, publicClient, supabase, Number(trade_size_usd), Number(min_profit_threshold_usd), gasCostTriUsd, ethPriceRef.value), 3, 250);
    const t3 = Date.now();
    const profitable2Pool = matrixResults.filter((r: any) => r.isProfitable);
    const feeKilled       = matrixResults.filter((r: any) => r.action === 'SKIPPED_FEES_EXCEED_SPREAD');
    const profitableTri   = triResults.filter((r: any) => r.isProfitable);
    const losingTri       = triResults.filter((r: any) => r.action === 'LOSING_CYCLE');
    const simulated       = triResults.filter((r: any) => r.amount_simulation);
    return new Response(safeJson({ version: "v74_live", network: "base", rpc: "alchemy_pending", quoter_v2: QUOTER_V2_ADDRESS, dry_run: DRY_RUN, contract: CONTRACT_ADDR, smart_wallet: _smartWalletAddr ?? "not_initialized", execution_mode: "coinbase_paymaster_4337", gas_padding: "+30%_callGasLimit", eth_price_usd: ethPriceRef.value.toFixed(2), gas_price_gwei: Number(formatUnits(gasPrice, 9)).toFixed(6), timing_ms: { init: t1 - t0, two_pool_scan: t2 - t1, tri_scan: t3 - t2, total: t3 - t0 }, summary: { two_pool: { total_pairs: TARGETS.length, fee_killed: feeKilled.length, profitable: profitable2Pool.length }, triangular: { total_cycles: TRI_CYCLES.length, losing_cycles: losingTri.length, profitable: profitableTri.length, simulated: simulated.length, execution_status: DRY_RUN ? "dry_run_with_paymaster" : "LIVE_PAYMASTER_EXECUTION" } }, two_pool_matrix: matrixResults, triangular_matrix: triResults }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) { return new Response(safeJson({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } }); }
});