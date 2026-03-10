// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title WardenArb
 * @notice Lean 2-pool + 3-hop triangular arbitrage contract for StableWarden
 * @dev Aave V3 flash loans -> UniswapV3/Slipstream <-> Aerodrome vAMM/sAMM
 * @custom:network Base mainnet
 * @custom:scanner warden-executor v37+
 *
 * Two execution modes:
 *
 * MODE 0 — 2-Pool Arb (executeArb):
 *   Flash borrow tokenB, swap through 2 venues, profit in tokenB
 *
 * MODE 1 — 3-Hop Triangular (executeTriArb):
 *   Flash borrow startToken, swap through 3 pools in a cycle, profit in startToken
 *   e.g. WETH -> weETH -> USDC -> WETH
 *
 * Pool types (shared across both modes):
 *   0 = UniV3 / Slipstream (concentrated liquidity)
 *   1 = Aerodrome vAMM (volatile, V2-style)
 *   2 = Aerodrome sAMM (stable, V2-style)
 */

// ── Minimal Interfaces ────────────────────────────────────────────────────────

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @dev Aave V3 Pool on Base: 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
interface IAavePool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

/// @dev UniswapV3 / Slipstream concentrated-liquidity pool
interface IUniV3Pool {
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);

    function token0() external view returns (address);
}

/// @dev Aerodrome vAMM / sAMM (V2-style)
interface IAeroPool {
    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external;

    function getAmountOut(uint256 amountIn, address tokenIn) external view returns (uint256);
    function token0() external view returns (address);
}

// ── Contract ──────────────────────────────────────────────────────────────────

contract WardenArb {

    // Aave V3 Pool — Base mainnet
    IAavePool constant AAVE = IAavePool(0xA238Dd80C259a72e81d7e4664a9801593F98d1c5);

    // Sqrt price limits for UniV3 swaps (boundary values to accept any price)
    uint160 constant MIN_SQRT = 4295128740;
    uint160 constant MAX_SQRT = 1461446703485210103287273052203988822378723970341;

    // Pool type constants (must match warden-executor)
    uint8 constant POOL_UNIV3       = 0;  // UniV3 or Slipstream CL
    uint8 constant POOL_AERO_VAMM   = 1;  // Aerodrome volatile AMM
    uint8 constant POOL_AERO_SAMM   = 2;  // Aerodrome stable AMM

    // Mode constants (encoded in flash loan params)
    uint8 constant MODE_TWO_POOL = 0;
    uint8 constant MODE_TRI_HOP  = 1;

    address public immutable owner;

    /// @dev Tracks which pool is currently mid-swap, used to auth UniV3 callbacks
    address private _activeUniPool;

    // ── Structs ──────────────────────────────────────────────────────────────

    struct ArbParams {
        address tokenA;
        address tokenB;
        address uniV3Pool;
        address venueBPool;
        uint8   venueBType;
        uint256 amountIn;
        uint8   direction;
        uint256 minProfit;
    }

    struct TriArbParams {
        address startToken;  // Flash borrowed, profit returned here
        address midToken1;   // First intermediate (e.g., weETH)
        address midToken2;   // Second intermediate (e.g., USDC)
        address pool1;       // startToken -> midToken1
        address pool2;       // midToken1 -> midToken2
        address pool3;       // midToken2 -> startToken
        uint8   pool1Type;   // 0=UniV3/Slipstream, 1=vAMM, 2=sAMM
        uint8   pool2Type;
        uint8   pool3Type;
        uint256 amountIn;
        uint256 minProfit;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "!owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ── 2-Pool Entry Point (called by warden-executor) ──────────────────────

    /**
     * @notice Execute a 2-pool arbitrage via Aave V3 flash loan
     */
    function executeArb(
        address tokenA,
        address tokenB,
        address uniV3Pool,
        address venueBPool,
        uint8   venueBType,
        uint256 amountIn,
        uint8   direction,
        uint256 minProfit,
        bytes32 /* txRef */
    ) external onlyOwner {
        bytes memory params = abi.encode(
            MODE_TWO_POOL,
            abi.encode(ArbParams(tokenA, tokenB, uniV3Pool, venueBPool, venueBType, amountIn, direction, minProfit))
        );
        AAVE.flashLoanSimple(address(this), tokenB, amountIn, params, 0);
    }

    // ── 3-Hop Triangular Entry Point ────────────────────────────────────────

    /**
     * @notice Execute a 3-hop triangular arbitrage via Aave V3 flash loan
     * @dev Cycle: startToken -> midToken1 -> midToken2 -> startToken
     * @param startToken  Token to flash borrow (profit returned here)
     * @param midToken1   First intermediate token
     * @param midToken2   Second intermediate token
     * @param pool1       Pool for startToken -> midToken1
     * @param pool2       Pool for midToken1 -> midToken2
     * @param pool3       Pool for midToken2 -> startToken
     * @param pool1Type   0=UniV3/Slipstream, 1=vAMM, 2=sAMM
     * @param pool2Type   Pool type for hop 2
     * @param pool3Type   Pool type for hop 3
     * @param amountIn    Flash borrow amount in startToken
     * @param minProfit   Minimum profit in startToken
     */
    function executeTriArb(
        address startToken,
        address midToken1,
        address midToken2,
        address pool1,
        address pool2,
        address pool3,
        uint8   pool1Type,
        uint8   pool2Type,
        uint8   pool3Type,
        uint256 amountIn,
        uint256 minProfit,
        bytes32 /* txRef */
    ) external onlyOwner {
        bytes memory params = abi.encode(
            MODE_TRI_HOP,
            abi.encode(TriArbParams(
                startToken, midToken1, midToken2,
                pool1, pool2, pool3,
                pool1Type, pool2Type, pool3Type,
                amountIn, minProfit
            ))
        );
        AAVE.flashLoanSimple(address(this), startToken, amountIn, params, 0);
    }

    // ── Aave V3 Flash Loan Callback ─────────────────────────────────────────

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        require(msg.sender == address(AAVE), "!aave");
        require(initiator == address(this), "!initiator");

        (uint8 mode, bytes memory innerParams) = abi.decode(params, (uint8, bytes));
        uint256 repay = amount + premium;

        if (mode == MODE_TWO_POOL) {
            _executeTwoPool(asset, amount, repay, innerParams);
        } else if (mode == MODE_TRI_HOP) {
            _executeTriHop(asset, amount, repay, innerParams);
        } else {
            revert("!mode");
        }

        return true;
    }

    // ── 2-Pool Execution Logic ──────────────────────────────────────────────

    function _executeTwoPool(
        address asset,
        uint256 amount,
        uint256 repay,
        bytes memory innerParams
    ) internal {
        ArbParams memory p = abi.decode(innerParams, (ArbParams));

        uint256 tokenAReceived;
        uint256 tokenBReceived;

        if (p.direction == 0) {
            // Buy tokenA cheap on venueB, sell on UniV3
            tokenAReceived = _swapOnPool(p.venueBPool, p.venueBType, asset, p.tokenA, amount);
            tokenBReceived = _swapOnPool(p.uniV3Pool, POOL_UNIV3, p.tokenA, asset, tokenAReceived);
        } else {
            // Buy tokenA cheap on UniV3, sell on venueB
            tokenAReceived = _swapOnPool(p.uniV3Pool, POOL_UNIV3, asset, p.tokenA, amount);
            tokenBReceived = _swapOnPool(p.venueBPool, p.venueBType, p.tokenA, asset, tokenAReceived);
        }

        require(tokenBReceived >= repay + p.minProfit, "!profit");

        // Approve Aave to pull repayment
        require(IERC20(asset).approve(address(AAVE), repay), "!approve");

        // Send profit to owner
        uint256 profit = tokenBReceived - repay;
        require(IERC20(asset).transfer(owner, profit), "!transfer");
    }

    // ── 3-Hop Triangular Execution Logic ────────────────────────────────────

    function _executeTriHop(
        address asset,
        uint256 amount,
        uint256 repay,
        bytes memory innerParams
    ) internal {
        TriArbParams memory p = abi.decode(innerParams, (TriArbParams));

        // Hop 1: startToken -> midToken1
        uint256 hop1Out = _swapOnPool(p.pool1, p.pool1Type, p.startToken, p.midToken1, amount);

        // Hop 2: midToken1 -> midToken2
        uint256 hop2Out = _swapOnPool(p.pool2, p.pool2Type, p.midToken1, p.midToken2, hop1Out);

        // Hop 3: midToken2 -> startToken (back to flash borrowed token)
        uint256 hop3Out = _swapOnPool(p.pool3, p.pool3Type, p.midToken2, p.startToken, hop2Out);

        require(hop3Out >= repay + p.minProfit, "!profit");

        // Approve Aave to pull repayment
        require(IERC20(asset).approve(address(AAVE), repay), "!approve");

        // Send profit to owner
        uint256 profit = hop3Out - repay;
        require(IERC20(asset).transfer(owner, profit), "!transfer");
    }

    // ── Unified Pool Swap Router ────────────────────────────────────────────

    /**
     * @notice Swap on any supported pool type
     * @param pool     Pool address
     * @param poolType 0=UniV3/Slipstream, 1=Aero vAMM, 2=Aero sAMM
     * @param tokenIn  Input token
     * @param tokenOut Output token
     * @param amountIn Amount to swap
     * @return amountOut Amount received
     */
    function _swapOnPool(
        address pool,
        uint8   poolType,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        if (poolType == POOL_UNIV3) {
            return _swapUniV3(pool, tokenIn, tokenOut, amountIn);
        } else {
            return _swapAero(pool, tokenIn, tokenOut, amountIn);
        }
    }

    // ── UniswapV3 / Slipstream Swap ─────────────────────────────────────────

    function _swapUniV3(
        address pool,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        bool zeroForOne = tokenIn == IUniV3Pool(pool).token0();
        _activeUniPool = pool;

        (int256 delta0, int256 delta1) = IUniV3Pool(pool).swap(
            address(this),
            zeroForOne,
            int256(amountIn),
            zeroForOne ? MIN_SQRT : MAX_SQRT,
            abi.encode(tokenIn)
        );

        _activeUniPool = address(0);
        amountOut = uint256(zeroForOne ? -delta1 : -delta0);
    }

    /// @notice UniV3 / Slipstream swap callback — pays the pool the tokens owed
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external {
        require(msg.sender == _activeUniPool, "!callback");
        address tokenIn = abi.decode(data, (address));
        uint256 owed = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);
        require(IERC20(tokenIn).transfer(msg.sender, owed), "!cb_transfer");
    }

    // ── Aerodrome vAMM / sAMM Swap ─────────────────────────────────────────

    function _swapAero(
        address pool,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        amountOut = IAeroPool(pool).getAmountOut(amountIn, tokenIn);
        require(amountOut > 0, "!aero_out");

        require(IERC20(tokenIn).transfer(pool, amountIn), "!aero_transfer");

        address tok0 = IAeroPool(pool).token0();
        (uint256 out0, uint256 out1) = tokenOut == tok0
            ? (amountOut, uint256(0))
            : (uint256(0), amountOut);

        IAeroPool(pool).swap(out0, out1, address(this), "");
    }

    // ── Admin ───────────────────────────────────────────────────────────────

    /// @notice Rescue stuck tokens or ETH (owner only)
    function rescue(address token) external onlyOwner {
        if (token == address(0)) {
            payable(owner).transfer(address(this).balance);
            return;
        }
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(IERC20(token).transfer(owner, bal), "!rescue");
    }

    receive() external payable {}
}
