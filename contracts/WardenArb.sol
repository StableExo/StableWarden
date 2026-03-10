// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title WardenArb
 * @notice Lean 2-pool arbitrage contract for StableWarden
 * @dev Aave V3 flash loans → UniswapV3/Slipstream ↔ Aerodrome vAMM/sAMM
 * @custom:network Base mainnet
 * @custom:scanner warden-executor v36+
 *
 * executeArb signature matches warden-executor v36 exactly:
 *   executeArb(tokenA, tokenB, uniV3Pool, venueBPool, venueBType, amountIn, direction, minProfit, txRef)
 *
 * venueBType:
 *   0 = Slipstream (UniV3-style CL)
 *   1 = Aerodrome vAMM (volatile, V2-style)
 *   2 = Aerodrome sAMM (stable, V2-style)
 *
 * direction:
 *   0 = venueA price >= venueB → buy tokenA cheap on venueB, sell on UniV3
 *   1 = venueB price > venueA → buy tokenA cheap on UniV3, sell on venueB
 *
 * amountIn: always denominated in tokenB
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

    // Sqrt price limits for UniV3 swaps (use boundary values to accept any price)
    uint160 constant MIN_SQRT = 4295128740;
    uint160 constant MAX_SQRT = 1461446703485210103287273052203988822378723970341;

    // Venue B type constants (must match warden-executor VENUE_B_TYPE_MAP)
    uint8 constant VENUE_SLIPSTREAM = 0;
    uint8 constant VENUE_AERO_VAMM  = 1;
    uint8 constant VENUE_AERO_SAMM  = 2;

    address public immutable owner;

    /// @dev Tracks which pool is currently mid-swap, used to auth UniV3 callbacks
    address private _activeUniPool;

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

    modifier onlyOwner() {
        require(msg.sender == owner, "!owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ── External Entry Point (called by warden-executor) ──────────────────────

    /**
     * @notice Execute a 2-pool arbitrage via Aave V3 flash loan
     * @param tokenA  First token in the pair
     * @param tokenB  Second token in the pair (flash borrowed, profit returned in this token)
     * @param uniV3Pool   UniswapV3 or Slipstream pool address (venue A)
     * @param venueBPool  Aerodrome or Slipstream pool address (venue B)
     * @param venueBType  0=Slipstream, 1=Aerodrome_vAMM, 2=Aerodrome_sAMM
     * @param amountIn    Borrow amount, denominated in tokenB
     * @param direction   0=buy on venueB sell on UniV3, 1=buy on UniV3 sell on venueB
     * @param minProfit   Minimum profit required (in tokenB), reverts if not met
     * @param txRef       Scanner-generated reference ID (logged, not used in execution)
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
            ArbParams(tokenA, tokenB, uniV3Pool, venueBPool, venueBType, amountIn, direction, minProfit)
        );
        // Flash borrow tokenB — profit returned in tokenB
        AAVE.flashLoanSimple(address(this), tokenB, amountIn, params, 0);
    }

    // ── Aave V3 Flash Loan Callback ───────────────────────────────────────────

    /**
     * @notice Called by Aave after transferring flash loan funds to this contract
     * @dev Must approve Aave to pull back (amount + premium) before returning true
     */
    function executeOperation(
        address asset,       // tokenB
        uint256 amount,      // amountIn
        uint256 premium,     // Aave fee (0.05%)
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        require(msg.sender == address(AAVE), "!aave");
        require(initiator == address(this), "!initiator");

        ArbParams memory p = abi.decode(params, (ArbParams));
        uint256 repay = amount + premium;

        uint256 tokenAReceived;
        uint256 tokenBReceived;

        if (p.direction == 0) {
            // Buy tokenA cheap on venueB (pay tokenB), sell tokenA on UniV3 (get tokenB)
            tokenAReceived = _swapVenueB(p.venueBPool, p.venueBType, asset, p.tokenA, amount);
            tokenBReceived = _swapUniV3(p.uniV3Pool, p.tokenA, asset, tokenAReceived);
        } else {
            // Buy tokenA cheap on UniV3 (pay tokenB), sell tokenA on venueB (get tokenB)
            tokenAReceived = _swapUniV3(p.uniV3Pool, asset, p.tokenA, amount);
            tokenBReceived = _swapVenueB(p.venueBPool, p.venueBType, p.tokenA, asset, tokenAReceived);
        }

        require(tokenBReceived >= repay + p.minProfit, "!profit");

        // Approve Aave to pull repayment
        require(IERC20(asset).approve(address(AAVE), repay), "!approve");

        // Send profit to owner
        uint256 profit = tokenBReceived - repay;
        require(IERC20(asset).transfer(owner, profit), "!transfer");

        return true;
    }

    // ── UniswapV3 / Slipstream Swap ───────────────────────────────────────────

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

    // ── Aerodrome vAMM / sAMM Swap ────────────────────────────────────────────

    function _swapVenueB(
        address pool,
        uint8   venueType,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal returns (uint256 amountOut) {
        if (venueType == VENUE_SLIPSTREAM) {
            // Slipstream is a CL pool — use UniV3-style path
            return _swapUniV3(pool, tokenIn, tokenOut, amountIn);
        }

        // Aerodrome vAMM or sAMM — transfer-first (V2-style)
        amountOut = IAeroPool(pool).getAmountOut(amountIn, tokenIn);
        require(amountOut > 0, "!aero_out");

        require(IERC20(tokenIn).transfer(pool, amountIn), "!aero_transfer");

        address tok0 = IAeroPool(pool).token0();
        (uint256 out0, uint256 out1) = tokenOut == tok0
            ? (amountOut, uint256(0))
            : (uint256(0), amountOut);

        IAeroPool(pool).swap(out0, out1, address(this), "");
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

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
