// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  WardenExecutorV2 — Universal Multi-Pair Flash Loan Arbitrage
/// @notice Executes arbitrage between Uniswap V3 and Aerodrome (vAMM / sAMM / SlipStream) on Base.
///         Flash loans via Aave V3 Pool (same source as V1).
///         Supports all 20 monitored pairs — any ERC-20 combination.
/// @dev    V1 was hard-coded to WETH/USDC only. V2 accepts pool addresses and tokens as parameters.
///         Direct pool interaction for V3/SlipStream swaps (gas-efficient).
///         Router interaction for Aerodrome V2 (vAMM/sAMM) swaps.

// ── Interfaces ──────────────────────────────────────────────────────────────

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

/// @dev Aave V3 Pool — flashLoanSimple borrows a single asset with premium
interface IAavePool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

/// @dev Uniswap V3 / Aerodrome SlipStream pool — same swap() interface
interface IV3Pool {
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
    function token0() external view returns (address);
}

/// @dev Aerodrome V2 Router — handles vAMM and sAMM swaps
interface IAeroRouter {
    struct Route {
        address from;
        address to;
        bool stable;
        address factory;
    }
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

// ── Contract ────────────────────────────────────────────────────────────────

contract WardenExecutorV2 {

    // ── Immutables ──────────────────────────────────────────────────────────
    address public immutable owner;
    address public immutable aavePool;       // Aave V3 Pool on Base
    address public immutable aeroRouter;     // Aerodrome V2 Router
    address public immutable aeroFactory;    // Aerodrome V2 Pool Factory

    // ── Venue type constants ────────────────────────────────────────────────
    uint8 public constant SLIPSTREAM = 0;
    uint8 public constant AERO_VAMM  = 1;
    uint8 public constant AERO_SAMM  = 2;

    // ── V3 sqrt price limits (full range) ───────────────────────────────────
    uint160 internal constant MIN_SQRT_RATIO = 4295128739;
    uint160 internal constant MAX_SQRT_RATIO =
        1461446703485210103287273052203988822378723970342;

    // ── Callback state (set before V3/SlipStream swap, validated in callback)
    address private _cbPool;
    address private _cbTokenIn;
    uint256 private _cbAmountIn;

    // ── Reentrancy guard ────────────────────────────────────────────────────
    uint256 private _locked = 1;

    // ── Events ──────────────────────────────────────────────────────────────
    event ArbExecuted(
        bytes32 indexed txRef,
        address tokenA,
        address tokenB,
        uint8   direction,
        uint256 profit,
        uint256 amountIn
    );

    // ── Errors ──────────────────────────────────────────────────────────────
    error NotOwner();
    error Reentrancy();
    error NotAavePool();
    error NotInitiator();
    error NotCallbackPool();
    error InsufficientProfit(uint256 profit, uint256 minRequired);
    error TransferFailed();
    error ApproveFailed();
    error InvalidVenue();

    // ── Modifiers ───────────────────────────────────────────────────────────
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    // ── Constructor ─────────────────────────────────────────────────────────
    /// @param _aavePool    Aave V3 Pool Proxy on Base: 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5
    /// @param _aeroRouter  Aerodrome V2 Router:        0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43
    /// @param _aeroFactory Aerodrome V2 Pool Factory:  0x420DD381b31aEf6683db6B902084cB0FFECe40Da
    constructor(
        address _aavePool,
        address _aeroRouter,
        address _aeroFactory
    ) {
        owner       = msg.sender;
        aavePool    = _aavePool;
        aeroRouter  = _aeroRouter;
        aeroFactory = _aeroFactory;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ENTRY POINT
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Execute an arbitrage trade via Aave V3 flash loan
    /// @param tokenA      The "commodity" token (e.g., BNKR, BRETT, cbETH)
    /// @param tokenB      The "settlement" token flash-loaned (e.g., WETH, USDC)
    /// @param uniV3Pool   Uniswap V3 pool address for this pair (Venue A)
    /// @param venueBPool  Aerodrome/SlipStream pool address (Venue B)
    /// @param venueBType  0 = SlipStream, 1 = Aero vAMM, 2 = Aero sAMM
    /// @param amountIn    Flash loan amount in tokenB units
    /// @param direction   0 = buy on venueB / sell on Uni V3
    ///                    1 = buy on Uni V3 / sell on venueB
    /// @param minProfit   Minimum profit in tokenB after repaying flash loan
    /// @param txRef       Unique reference for logging
    function executeArb(
        address tokenA,
        address tokenB,
        address uniV3Pool,
        address venueBPool,
        uint8   venueBType,
        uint256 amountIn,
        uint8   direction,
        uint256 minProfit,
        bytes32 txRef
    ) external onlyOwner nonReentrant {
        IAavePool(aavePool).flashLoanSimple(
            address(this),
            tokenB,
            amountIn,
            abi.encode(
                tokenA, tokenB, uniV3Pool, venueBPool,
                venueBType, direction, minProfit, txRef
            ),
            0 // referralCode
        );
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  AAVE V3 FLASH LOAN CALLBACK
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Called by Aave V3 Pool after transferring the flash-loaned tokens
    /// @dev    Must approve aavePool to pull back (amount + premium) before returning true
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        if (msg.sender != aavePool) revert NotAavePool();
        if (initiator != address(this)) revert NotInitiator();

        (
            address tokenA,
            address tokenB,
            address uniV3Pool,
            address venueBPool,
            uint8   venueBType,
            uint8   direction,
            uint256 minProfit,
            bytes32 txRef
        ) = abi.decode(params, (
            address, address, address, address,
            uint8, uint8, uint256, bytes32
        ));

        // ── Execute the two-leg swap ────────────────────────────────────
        if (direction == 0) {
            // Venue B is cheaper → Buy tokenA on Venue B, sell on Uni V3
            uint256 tokenAReceived = _swapVenueB(
                tokenB, tokenA, amount, venueBPool, venueBType
            );
            _swapV3(tokenA, tokenB, tokenAReceived, uniV3Pool);
        } else {
            // Uni V3 is cheaper → Buy tokenA on Uni V3, sell on Venue B
            uint256 tokenAReceived = _swapV3(
                tokenB, tokenA, amount, uniV3Pool
            );
            _swapVenueB(tokenA, tokenB, tokenAReceived, venueBPool, venueBType);
        }

        // ── Profit check ────────────────────────────────────────────────
        uint256 repayAmount = amount + premium;
        uint256 balance     = IERC20(tokenB).balanceOf(address(this));
        uint256 profit      = balance >= repayAmount
            ? balance - repayAmount
            : 0;

        if (profit < minProfit) {
            revert InsufficientProfit(profit, minProfit);
        }

        // ── Repay: approve Aave to pull (amount + premium) ──────────────
        _safeApprove(asset, aavePool, repayAmount);

        emit ArbExecuted(txRef, tokenA, tokenB, direction, profit, amount);

        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  V3 / SLIPSTREAM SWAP (direct pool interaction)
    // ═══════════════════════════════════════════════════════════════════════

    /// @dev Swap via Uniswap V3 or Aerodrome SlipStream pool.
    ///      Both use the same swap() interface and uniswapV3SwapCallback.
    function _swapV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address pool
    ) internal returns (uint256 amountOut) {
        bool zeroForOne = (tokenIn == IV3Pool(pool).token0());

        // Store callback state so the callback knows what to pay
        _cbPool     = pool;
        _cbTokenIn  = tokenIn;
        _cbAmountIn = amountIn;

        (int256 amount0, int256 amount1) = IV3Pool(pool).swap(
            address(this),        // recipient
            zeroForOne,
            int256(amountIn),     // positive = exact input
            zeroForOne
                ? MIN_SQRT_RATIO + 1
                : MAX_SQRT_RATIO - 1,
            ""                    // no additional data needed
        );

        // The negative delta is what we received
        amountOut = uint256(-(zeroForOne ? amount1 : amount0));

        // Clear callback state
        _cbPool = address(0);
    }

    /// @notice Swap callback for both Uniswap V3 and Aerodrome SlipStream pools
    /// @dev    SlipStream (Velodrome fork) uses the same callback name as Uni V3
    function uniswapV3SwapCallback(
        int256, /* amount0Delta */
        int256, /* amount1Delta */
        bytes calldata /* data */
    ) external {
        if (msg.sender != _cbPool) revert NotCallbackPool();
        _safeTransfer(_cbTokenIn, msg.sender, _cbAmountIn);
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  AERODROME V2 SWAP (vAMM / sAMM via Router)
    // ═══════════════════════════════════════════════════════════════════════

    function _swapAeroV2(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        bool    stable
    ) internal returns (uint256 amountOut) {
        _safeApprove(tokenIn, aeroRouter, amountIn);

        IAeroRouter.Route[] memory routes = new IAeroRouter.Route[](1);
        routes[0] = IAeroRouter.Route({
            from:    tokenIn,
            to:      tokenOut,
            stable:  stable,
            factory: aeroFactory
        });

        uint256[] memory amounts = IAeroRouter(aeroRouter)
            .swapExactTokensForTokens(
                amountIn,
                0,               // no slippage protection here — profit check at end
                routes,
                address(this),
                block.timestamp
            );

        amountOut = amounts[amounts.length - 1];
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  VENUE B DISPATCHER
    // ═══════════════════════════════════════════════════════════════════════

    function _swapVenueB(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        address pool,
        uint8   venueType
    ) internal returns (uint256) {
        if (venueType == SLIPSTREAM) {
            return _swapV3(tokenIn, tokenOut, amountIn, pool);
        } else if (venueType == AERO_VAMM) {
            return _swapAeroV2(tokenIn, tokenOut, amountIn, false);
        } else if (venueType == AERO_SAMM) {
            return _swapAeroV2(tokenIn, tokenOut, amountIn, true);
        }
        revert InvalidVenue();
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  SAFE HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        if (!ok || (ret.length > 0 && !abi.decode(ret, (bool)))) {
            revert TransferFailed();
        }
    }

    function _safeApprove(address token, address spender, uint256 amount) internal {
        // Reset allowance first (required by some tokens like USDT)
        (bool ok, bytes memory ret) = token.call(
            abi.encodeWithSelector(IERC20.approve.selector, spender, 0)
        );
        if (!ok || (ret.length > 0 && !abi.decode(ret, (bool)))) {
            revert ApproveFailed();
        }

        if (amount > 0) {
            (ok, ret) = token.call(
                abi.encodeWithSelector(IERC20.approve.selector, spender, amount)
            );
            if (!ok || (ret.length > 0 && !abi.decode(ret, (bool)))) {
                revert ApproveFailed();
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Withdraw ERC-20 profit / rescue stuck tokens
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        _safeTransfer(token, owner, amount);
    }

    /// @notice Withdraw native ETH
    function withdrawETH() external onlyOwner {
        (bool ok, ) = owner.call{value: address(this).balance}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Accept native ETH (e.g., WETH unwrap scenarios)
    receive() external payable {}
}
