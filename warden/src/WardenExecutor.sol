// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ─────────────────────────────────────────────────────────────────────────────
//  WARDEN EXECUTOR v1  —  Flash-loan arbitrage on Base
//  Strategy: Uniswap V3 WETH/USDC 0.05%  ↔  Aerodrome vAMM WETH/USDC
//
//  Direction 0  (UniV3 price > Aero):   USDC→WETH on Aerodrome, WETH→USDC on UniV3
//  Direction 1  (Aero price > UniV3):   USDC→WETH on UniV3,     WETH→USDC on Aerodrome
// ─────────────────────────────────────────────────────────────────────────────

// ──────────────────────────── Interfaces ─────────────────────────────────────

interface IPool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

interface IFlashLoanSimpleReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

interface IAerodromeRouter {
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

interface ISwapRouterV3 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params)
        external returns (uint256 amountOut);
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

// ──────────────────────────── Contract ───────────────────────────────────────

contract WardenExecutor is IFlashLoanSimpleReceiver {

    // ── Immutables ───────────────────────────────────────────────────────────
    address public immutable owner;

    // Aave V3 on Base
    IPool private constant AAVE_POOL =
        IPool(0xA238Dd80C259a72e81d7e4664a9801593F98d1c5);

    // Routers
    ISwapRouterV3 private constant UNI_ROUTER =
        ISwapRouterV3(0x2626664c2603336E57B271c5C0b26F421741e481);
    IAerodromeRouter private constant AERO_ROUTER =
        IAerodromeRouter(0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43);

    // Tokens on Base
    address private constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address private constant WETH = 0x4200000000000000000000000000000000000006;

    // Aerodrome vAMM factory
    address private constant AERO_FACTORY = 0x420DD381b31aEf6683db6B902084cB0FFECe40Da;

    // Uniswap V3 pool fee (0.05%)
    uint24  private constant UNI_FEE = 500;

    // ── Events ───────────────────────────────────────────────────────────────
    event ArbExecuted(
        uint8   direction,
        uint256 loanAmount,
        uint256 profit,
        uint256 gasCost,
        bytes32 indexed txRef
    );
    event ArbFailed(string reason);

    // ── Modifiers ────────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier onlyAave() {
        require(msg.sender == address(AAVE_POOL), "NOT_AAVE");
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────────
    constructor() {
        owner = msg.sender;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PUBLIC ENTRY POINT
    //  Called by the Searcher (Edge Function / bot wallet)
    //
    //  @param usdcAmount   USDC to borrow (6 decimals, e.g. 1_000_000_000 = $1,000)
    //  @param direction    0 = buy Aerodrome sell UniV3 | 1 = buy UniV3 sell Aerodrome
    //  @param minProfit    Minimum net profit in USDC (reverts if not met — safety check)
    //  @param txRef        Off-chain reference ID for logging correlation
    // ─────────────────────────────────────────────────────────────────────────
    function executeArb(
        uint256 usdcAmount,
        uint8   direction,
        uint256 minProfit,
        bytes32 txRef
    ) external onlyOwner {
        bytes memory params = abi.encode(direction, minProfit, txRef);
        AAVE_POOL.flashLoanSimple(
            address(this),
            USDC,
            usdcAmount,
            params,
            0  // referral code
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  AAVE CALLBACK  —  This is where the money is made
    //  Aave has just sent us `amount` USDC. We must repay amount + premium.
    // ─────────────────────────────────────────────────────────────────────────
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override onlyAave returns (bool) {
        require(initiator == address(this), "BAD_INITIATOR");
        require(asset == USDC, "WRONG_ASSET");

        (uint8 direction, uint256 minProfit, bytes32 txRef) =
            abi.decode(params, (uint8, uint256, bytes32));

        uint256 usdcBefore = IERC20(USDC).balanceOf(address(this));

        if (direction == 0) {
            // ── Path: Aerodrome (USDC→WETH) then UniV3 (WETH→USDC) ──────────
            uint256 wethReceived = _swapUSDCtoWETH_Aerodrome(amount);
            _swapWETHtoUSDC_UniV3(wethReceived);
        } else {
            // ── Path: UniV3 (USDC→WETH) then Aerodrome (WETH→USDC) ──────────
            uint256 wethReceived = _swapUSDCtoWETH_UniV3(amount);
            _swapWETHtoUSDC_Aerodrome(wethReceived);
        }

        uint256 usdcAfter  = IERC20(USDC).balanceOf(address(this));
        uint256 amountOwed = amount + premium;

        // ── Safety: ensure we can repay ──────────────────────────────────────
        require(usdcAfter >= amountOwed, "CANNOT_REPAY");

        uint256 profit = usdcAfter - amountOwed;

        // ── Enforce minimum profit (reverts entire tx if not met) ─────────────
        require(profit >= minProfit, "INSUFFICIENT_PROFIT");

        // ── Repay Aave ────────────────────────────────────────────────────────
        IERC20(USDC).approve(address(AAVE_POOL), amountOwed);

        // ── Send profit to owner ──────────────────────────────────────────────
        if (profit > 0) {
            IERC20(USDC).transfer(owner, profit);
        }

        emit ArbExecuted(direction, amount, profit, premium, txRef);
        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  INTERNAL SWAPS
    // ─────────────────────────────────────────────────────────────────────────

    function _swapUSDCtoWETH_Aerodrome(uint256 amountIn)
        internal returns (uint256 wethOut)
    {
        IERC20(USDC).approve(address(AERO_ROUTER), amountIn);

        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from:    USDC,
            to:      WETH,
            stable:  false,   // vAMM (volatile) pool
            factory: AERO_FACTORY
        });

        uint256[] memory amounts = AERO_ROUTER.swapExactTokensForTokens(
            amountIn,
            1,              // amountOutMin: 1 wei (slippage enforced by minProfit check)
            routes,
            address(this),
            block.timestamp + 60
        );

        wethOut = amounts[amounts.length - 1];
    }

    function _swapWETHtoUSDC_UniV3(uint256 amountIn)
        internal returns (uint256 usdcOut)
    {
        IERC20(WETH).approve(address(UNI_ROUTER), amountIn);

        usdcOut = UNI_ROUTER.exactInputSingle(
            ISwapRouterV3.ExactInputSingleParams({
                tokenIn:           WETH,
                tokenOut:          USDC,
                fee:               UNI_FEE,
                recipient:         address(this),
                amountIn:          amountIn,
                amountOutMinimum:  1,
                sqrtPriceLimitX96: 0
            })
        );
    }

    function _swapUSDCtoWETH_UniV3(uint256 amountIn)
        internal returns (uint256 wethOut)
    {
        IERC20(USDC).approve(address(UNI_ROUTER), amountIn);

        wethOut = UNI_ROUTER.exactInputSingle(
            ISwapRouterV3.ExactInputSingleParams({
                tokenIn:           USDC,
                tokenOut:          WETH,
                fee:               UNI_FEE,
                recipient:         address(this),
                amountIn:          amountIn,
                amountOutMinimum:  1,
                sqrtPriceLimitX96: 0
            })
        );
    }

    function _swapWETHtoUSDC_Aerodrome(uint256 amountIn)
        internal returns (uint256 usdcOut)
    {
        IERC20(WETH).approve(address(AERO_ROUTER), amountIn);

        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from:    WETH,
            to:      USDC,
            stable:  false,
            factory: AERO_FACTORY
        });

        uint256[] memory amounts = AERO_ROUTER.swapExactTokensForTokens(
            amountIn,
            1,
            routes,
            address(this),
            block.timestamp + 60
        );

        usdcOut = amounts[amounts.length - 1];
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  ADMIN
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Emergency drain — recover any stuck tokens
    function rescueTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }

    /// @notice Accept ETH (needed if WETH unwrap ever leaves raw ETH)
    receive() external payable {}
}
