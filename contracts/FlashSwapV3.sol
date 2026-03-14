// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;
pragma abicoder v2;

/**
 * @title FlashSwapV3 - Multi-Source Flash Loan Arbitrage Contract
 * @notice Enhanced version of FlashSwapV2 with multi-source flash loan support and hybrid execution
 * @dev Supports: Aave V3, Balancer V2, dYdX Solo Margin, Uniswap V3/V4 flash swaps
 * 
 * Key Enhancements over V2:
 * - Multi-source flash loan selection (Balancer 0%, dYdX 0%, Aave 0.09%)
 * - Hybrid execution mode (Aave + Uniswap V4 for large opportunities)
 * - Universal path execution (1-5 hop arbitrage paths)
 * - Automatic source optimization based on token/amount/opportunity size
 * - Enhanced gas optimization with inline assembly
 * 
 * Version: 5.1.2 (FlashSwapV3 — fix: remove `deadline` from _swapUniswapV3 + _swapPancakeV3)
 * Network: Base, Ethereum, Arbitrum, Optimism
 * Tithe System: 70% US debt reduction, 30% operator share
 *
 * Changelog v5.1.0:
 * - DEX_TYPE_SUSHISWAP_V3 (7): direct Uniswap V3-compatible pool swap + uniswapV3SwapCallback
 * - DEX_TYPE_PANCAKESWAP_V3 (8): PancakeSwap V3 SwapRouter (0x1b81D678ffb9C0263b24A97847620C99d213eB14)
 * - DEX_TYPE_ALIENBASE_V2 (9): AlienBase V2 Router (0x8c1A3cF8f83074169FE5D7aD50B978e1cD6b37c7)
 * - Added _pendingCallbackPool guard for SushiSwap V3 swap callback security
 * - Constructor extended with _pancakeV3Router + _alienBaseV2Router
 */

// --- Core Imports ---
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// --- Uniswap Imports ---
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3FlashCallback.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";

// --- Local Imports ---
import "./libraries/PoolAddress.sol";
import "./libraries/CallbackValidation.sol";
import "./interfaces/IUniswapV2Router02.sol";
import "./interfaces/IDODOV1V2Pool.sol";
import "./interfaces/IBalancerVault.sol";
import "./interfaces/ISoloMargin.sol";

// --- Aave V3 Interfaces ---
interface IPool {
    function flashLoan(
        address receiverAddress,
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata interestRateModes,
        address onBehalfOf,
        bytes calldata params,
        uint16 referralCode
    ) external;
    
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

interface IFlashLoanReceiver {
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool);
    
    function addressesProvider() external view returns (address);
    function pool() external view returns (address);
}



// --- SwapRouter V3 No-Deadline Interface ---
// Uniswap V3 SwapRouter02 on Base (0x2626664c2603336e57b271c5c0b26f421741e481)
// and PancakeSwap V3 Router on Base (0x1b81D678ffb9C0263b24A97847620C99d213eB14)
// both use ExactInputSingleParams WITHOUT `deadline`.
interface ISwapRouterV3 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/**
 * @title FlashSwapV3
 * @notice Multi-source flash loan arbitrage with hybrid execution support
 */
contract FlashSwapV3 is 
    IUniswapV3FlashCallback, 
    IUniswapV3SwapCallback,
    IFlashLoanReceiver, 
    IFlashLoanRecipient,
    ICallee,
    ReentrancyGuard 
{
    using SafeERC20 for IERC20;

    // --- Flash Loan Source Types ---
    enum FlashLoanSource {
        BALANCER,       // 0% fee - preferred for standalone
        DYDX,           // 0% fee - preferred for ETH/USDC/DAI
        HYBRID_AAVE_V4, // 0.09% Aave + 0% V4 swaps - best for large arbs
        AAVE,           // 0.09% fee - fallback
        UNISWAP_V3      // 0.05-1% fee - pool-specific
    }

    // --- DEX Type Constants ---
    uint8 constant DEX_TYPE_UNISWAP_V3    = 0;
    uint8 constant DEX_TYPE_SUSHISWAP     = 1;  // SushiSwap V2 / V2-compatible
    uint8 constant DEX_TYPE_DODO          = 2;
    uint8 constant DEX_TYPE_AERODROME     = 3;
    uint8 constant DEX_TYPE_BALANCER      = 4;
    uint8 constant DEX_TYPE_CURVE         = 5;
    uint8 constant DEX_TYPE_UNISWAP_V4    = 6;
    uint8 constant DEX_TYPE_SUSHISWAP_V3  = 7;  // NEW: SushiSwap V3 (direct pool swap)
    uint8 constant DEX_TYPE_PANCAKESWAP_V3 = 8; // NEW: PancakeSwap V3 SwapRouter
    uint8 constant DEX_TYPE_ALIENBASE_V2  = 9;  // NEW: AlienBase V2 Router

    // --- Sqrt Price Limits for direct V3 pool swaps ---
    uint160 internal constant MIN_SQRT_RATIO = 4295128739;
    uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    // --- State Variables ---
    ISwapRouterV3      public immutable swapRouter;         // Uniswap V3 (SwapRouter02 — no deadline)
    IUniswapV2Router02 public immutable sushiRouter;        // SushiSwap V2
    IBalancerVault     public immutable balancerVault;
    ISoloMargin        public immutable dydxSoloMargin;
    IPool              public immutable aavePool;
    ISwapRouterV3      public immutable pancakeV3Router;    // PancakeSwap V3 (no deadline)
    IUniswapV2Router02 public immutable alienBaseV2Router;  // NEW: AlienBase V2

    address payable public immutable owner;
    address payable public immutable titheRecipient;
    uint16  public immutable titheBps;
    
    address public immutable v3Factory;
    address public immutable aaveAddressesProvider;

    // --- Callback Guard (SushiSwap V3 direct pool swap) ---
    // Set to the pool address just before calling pool.swap(), cleared in the callback.
    // Prevents unauthorized calls to uniswapV3SwapCallback.
    address internal _pendingCallbackPool;
    
    uint constant DEADLINE_OFFSET  = 60;
    uint16 constant MAX_TITHE_BPS  = 9000;
    
    // Hybrid mode threshold ($50M)
    uint256 constant HYBRID_MODE_THRESHOLD = 50_000_000e6; // 50M USDC

    // --- Structs ---
    struct SwapStep {
        address pool;       // Pool address — REQUIRED for DEX_TYPE_SUSHISWAP_V3 direct swaps
        address tokenIn;
        address tokenOut;
        uint24  fee;
        uint256 minOut;
        uint8   dexType;
    }

    struct UniversalSwapPath {
        SwapStep[] steps;
        uint256    borrowAmount;
        uint256    minFinalAmount;
    }

    struct FlashLoanParams {
        FlashLoanSource   source;
        address           borrowToken;
        uint256           borrowAmount;
        UniversalSwapPath path;
        address           initiator;
    }

    struct BalancerCallbackData {
        UniversalSwapPath path;
        address           initiator;
    }

    struct DydxCallbackData {
        UniversalSwapPath path;
        address           initiator;
        uint256           repayAmount;
    }

    // --- Events ---
    event FlashLoanInitiated(
        FlashLoanSource indexed source,
        address indexed token,
        uint256 amount,
        address indexed initiator
    );
    
    event FlashLoanExecuted(
        FlashLoanSource indexed source,
        address indexed token,
        uint256 amountBorrowed,
        uint256 feePaid,
        uint256 grossProfit,
        uint256 netProfit
    );
    
    event SwapExecuted(
        uint256 indexed stepIndex,
        uint8   dexType,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    
    event TitheDistributed(
        address indexed token,
        address indexed titheRecipient,
        uint256 titheAmount,
        address indexed owner,
        uint256 ownerAmount
    );
    
    event HybridModeActivated(
        address indexed token,
        uint256 borrowAmount,
        uint256 estimatedProfit
    );

    // --- Modifiers ---
    modifier onlyOwner() {
        require(msg.sender == owner, "FSV3:NA");
        _;
    }

    // --- Constructor ---
    constructor(
        address _initialOwner,          // Explicit owner — pass smart wallet address (avoids CREATE2 msg.sender issue)
        address _uniswapV3Router,
        address _sushiRouter,
        address _balancerVault,
        address _dydxSoloMargin,
        address _aavePoolAddress,
        address _aaveAddressesProvider,
        address _v3Factory,
        address payable _titheRecipient,
        uint16  _titheBps,
        address _pancakeV3Router,       // NEW: PancakeSwap V3 SwapRouter on Base: 0x1b81D678ffb9C0263b24A97847620C99d213eB14
        address _alienBaseV2Router      // NEW: AlienBase V2 Router on Base:       0x8c1A3cF8f83074169FE5D7aD50B978e1cD6b37c7
    ) {
        require(_initialOwner       != address(0), "FSV3:IOW");
        require(_uniswapV3Router    != address(0), "FSV3:IUR");
        require(_sushiRouter        != address(0), "FSV3:ISR");
        require(_balancerVault      != address(0), "FSV3:IBV");
        require(_aavePoolAddress    != address(0), "FSV3:IAP");
        require(_aaveAddressesProvider != address(0), "FSV3:IAAP");
        require(_v3Factory          != address(0), "FSV3:IVF");
        require(_pancakeV3Router    != address(0), "FSV3:IPR");
        require(_alienBaseV2Router  != address(0), "FSV3:IAB");
        require(_titheBps <= MAX_TITHE_BPS, "FSV3:TBT");
        
        if (_titheBps > 0) {
            require(_titheRecipient != address(0), "FSV3:ITR");
        }

        swapRouter       = ISwapRouterV3(_uniswapV3Router);
        sushiRouter      = IUniswapV2Router02(_sushiRouter);
        balancerVault    = IBalancerVault(_balancerVault);
        dydxSoloMargin   = ISoloMargin(_dydxSoloMargin);
        aavePool         = IPool(_aavePoolAddress);
        pancakeV3Router  = ISwapRouterV3(_pancakeV3Router);
        alienBaseV2Router = IUniswapV2Router02(_alienBaseV2Router);
        
        v3Factory            = _v3Factory;
        aaveAddressesProvider = _aaveAddressesProvider;
        owner            = payable(_initialOwner);
        titheRecipient   = _titheRecipient;
        titheBps         = _titheBps;
    }

    // --- Aave Interface Implementations ---
    function addressesProvider() external view override returns (address) {
        return aaveAddressesProvider;
    }

    function pool() external view override returns (address) {
        return address(aavePool);
    }

    // --- Main Entry Point ---
    /**
     * @notice Execute arbitrage with optimal flash loan source selection
     * @param borrowToken Token to borrow
     * @param borrowAmount Amount to borrow
     * @param path Swap path to execute
     */
    function executeArbitrage(
        address borrowToken,
        uint256 borrowAmount,
        UniversalSwapPath memory path
    ) external onlyOwner {
        FlashLoanSource source = selectOptimalSource(borrowToken, borrowAmount);

        emit FlashLoanInitiated(source, borrowToken, borrowAmount, msg.sender);

        if (source == FlashLoanSource.BALANCER) {
            _executeBalancerFlashLoan(borrowToken, borrowAmount, path);
        } else if (source == FlashLoanSource.DYDX) {
            _executeDydxFlashLoan(borrowToken, borrowAmount, path);
        } else if (source == FlashLoanSource.HYBRID_AAVE_V4) {
            emit HybridModeActivated(borrowToken, borrowAmount, 0);
            _executeHybridFlashLoan(borrowToken, borrowAmount, path);
        } else if (source == FlashLoanSource.AAVE) {
            _executeAaveFlashLoan(borrowToken, borrowAmount, path);
        } else {
            revert("FSV3:USO");
        }
    }

    // --- Source Selection Logic ---
    function selectOptimalSource(
        address token,
        uint256 amount
    ) public view returns (FlashLoanSource) {
        if (amount >= HYBRID_MODE_THRESHOLD) {
            return FlashLoanSource.HYBRID_AAVE_V4;
        }
        if (isBalancerSupported(token, amount)) {
            return FlashLoanSource.BALANCER;
        }
        if (isDydxSupported(token, amount)) {
            return FlashLoanSource.DYDX;
        }
        return FlashLoanSource.AAVE;
    }

    function isBalancerSupported(address, uint256) public pure returns (bool) {
        return true;
    }

    function isDydxSupported(address, uint256) public view returns (bool) {
        if (block.chainid != 1) return false;
        return false; // Disabled for Base deployment
    }

    // --- Balancer Flash Loan ---
    function _executeBalancerFlashLoan(
        address token,
        uint256 amount,
        UniversalSwapPath memory path
    ) internal {
        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(token);
        
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        
        bytes memory userData = abi.encode(BalancerCallbackData({
            path:      path,
            initiator: msg.sender
        }));
        
        balancerVault.flashLoan(
            IFlashLoanRecipient(address(this)),
            tokens,
            amounts,
            userData
        );
    }

    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external override nonReentrant {
        require(msg.sender == address(balancerVault), "FSV3:CBV");
        require(tokens.length == 1, "FSV3:MTK");
        
        BalancerCallbackData memory data = abi.decode(userData, (BalancerCallbackData));
        
        address tokenBorrowed = address(tokens[0]);
        uint256 amountBorrowed = amounts[0];
        uint256 feePaid = feeAmounts[0];
        
        uint256 finalAmount = _executeUniversalPath(data.path);
        
        uint256 totalRepay  = amountBorrowed + feePaid;
        require(finalAmount >= totalRepay, "FSV3:IFR");
        
        uint256 grossProfit = finalAmount > amountBorrowed ? finalAmount - amountBorrowed : 0;
        uint256 netProfit   = finalAmount > totalRepay     ? finalAmount - totalRepay     : 0;
        
        IERC20(tokenBorrowed).safeTransfer(address(balancerVault), totalRepay);
        
        emit FlashLoanExecuted(FlashLoanSource.BALANCER, tokenBorrowed, amountBorrowed, feePaid, grossProfit, netProfit);
        
        _distributeProfits(tokenBorrowed, netProfit);
    }

    // --- dYdX Flash Loan ---
    function _executeDydxFlashLoan(address, uint256, UniversalSwapPath memory) internal pure {
        revert("FSV3:DNI");
    }

    function callFunction(address, ISoloMargin.Account memory, bytes memory) external pure override {
        revert("FSV3:DNI");
    }

    // --- Aave Flash Loan ---
    function _executeAaveFlashLoan(
        address token,
        uint256 amount,
        UniversalSwapPath memory path
    ) internal {
        address[] memory assets  = new address[](1);
        assets[0] = token;
        
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        
        uint256[] memory modes = new uint256[](1);
        modes[0] = 0;
        
        bytes memory params = abi.encode(path, msg.sender);
        
        aavePool.flashLoan(address(this), assets, amounts, modes, address(this), params, 0);
    }

    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external override nonReentrant returns (bool) {
        require(msg.sender == address(aavePool), "FSV3:CBA");
        require(initiator  == address(this),     "FSV3:IFI");
        require(assets.length == 1,              "FSV3:MA");
        
        (UniversalSwapPath memory path, ) = abi.decode(params, (UniversalSwapPath, address));
        
        address tokenBorrowed = assets[0];
        uint256 amountBorrowed = amounts[0];
        uint256 feePaid        = premiums[0];
        
        uint256 finalAmount = _executeUniversalPath(path);
        
        uint256 totalRepay  = amountBorrowed + feePaid;
        require(finalAmount >= totalRepay, "FSV3:IFR");
        
        uint256 grossProfit = finalAmount > amountBorrowed ? finalAmount - amountBorrowed : 0;
        uint256 netProfit   = finalAmount > totalRepay     ? finalAmount - totalRepay     : 0;
        
        IERC20(tokenBorrowed).approve(address(aavePool), totalRepay);
        
        emit FlashLoanExecuted(FlashLoanSource.AAVE, tokenBorrowed, amountBorrowed, feePaid, grossProfit, netProfit);
        
        _distributeProfits(tokenBorrowed, netProfit);
        
        return true;
    }

    // --- Hybrid Mode (Aave + Uniswap V4) ---
    function _executeHybridFlashLoan(address token, uint256 amount, UniversalSwapPath memory path) internal {
        _executeAaveFlashLoan(token, amount, path);
    }

    // --- Universal Path Execution ---
    /**
     * @notice Execute a universal swap path (1-5 hops)
     * @param path Swap path with multiple steps
     * @return finalAmount Final amount received
     *
     * DEX type routing:
     *   0 = Uniswap V3         (uses swapRouter)
     *   1 = SushiSwap V2       (uses sushiRouter, IUniswapV2Router02)
     *   3 = Aerodrome (V2)     (uses sushiRouter-compatible interface)
     *   7 = SushiSwap V3       (direct pool.swap() — step.pool MUST be set)
     *   8 = PancakeSwap V3     (uses pancakeV3Router, ISwapRouter)
     *   9 = AlienBase V2       (uses alienBaseV2Router, IUniswapV2Router02)
     */
    function _executeUniversalPath(
        UniversalSwapPath memory path
    ) internal returns (uint256 finalAmount) {
        uint256 currentAmount = path.borrowAmount;
        
        for (uint i = 0; i < path.steps.length; i++) {
            SwapStep memory step = path.steps[i];
            
            if (step.dexType == DEX_TYPE_UNISWAP_V3) {
                currentAmount = _swapUniswapV3(step.tokenIn, step.tokenOut, currentAmount, step.minOut, step.fee);
            } else if (step.dexType == DEX_TYPE_SUSHISWAP) {
                currentAmount = _swapSushiSwap(step.tokenIn, step.tokenOut, currentAmount, step.minOut);
            } else if (step.dexType == DEX_TYPE_AERODROME) {
                currentAmount = _swapAerodrome(step.tokenIn, step.tokenOut, currentAmount, step.minOut);
            } else if (step.dexType == DEX_TYPE_SUSHISWAP_V3) {
                // step.pool MUST contain the SushiSwap V3 pool address
                currentAmount = _swapSushiV3(step.pool, step.tokenIn, step.tokenOut, currentAmount, step.minOut);
            } else if (step.dexType == DEX_TYPE_PANCAKESWAP_V3) {
                currentAmount = _swapPancakeV3(step.tokenIn, step.tokenOut, currentAmount, step.minOut, step.fee);
            } else if (step.dexType == DEX_TYPE_ALIENBASE_V2) {
                currentAmount = _swapAlienBaseV2(step.tokenIn, step.tokenOut, currentAmount, step.minOut);
            } else {
                revert("FSV3:UDT"); // Unsupported DEX type
            }
            
            require(currentAmount >= step.minOut, "FSV3:SLIP");
            
            emit SwapExecuted(i, step.dexType, step.tokenIn, step.tokenOut, path.borrowAmount, currentAmount);
        }
        
        require(currentAmount >= path.minFinalAmount, "FSV3:FIN");
        return currentAmount;
    }

    // =========================================================
    // DEX Swap Functions
    // =========================================================

    // --- Uniswap V3 ---
    function _swapUniswapV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint24  fee
    ) internal returns (uint256 amountOut) {
        IERC20(tokenIn).approve(address(swapRouter), amountIn);
        
        ISwapRouterV3.ExactInputSingleParams memory params = ISwapRouterV3.ExactInputSingleParams({
            tokenIn:           tokenIn,
            tokenOut:          tokenOut,
            fee:               fee,
            recipient:         address(this),
            amountIn:          amountIn,
            amountOutMinimum:  minAmountOut,
            sqrtPriceLimitX96: 0
        });
        
        return swapRouter.exactInputSingle(params);
    }

    // --- SushiSwap V2 ---
    function _swapSushiSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        IERC20(tokenIn).approve(address(sushiRouter), amountIn);
        
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        
        uint256[] memory amounts = sushiRouter.swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            path,
            address(this),
            block.timestamp + DEADLINE_OFFSET
        );
        
        return amounts[amounts.length - 1];
    }

    // --- Aerodrome (V2-compatible) ---
    function _swapAerodrome(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        return _swapSushiSwap(tokenIn, tokenOut, amountIn, minAmountOut);
    }

    // --- SushiSwap V3 (direct pool swap) ---
    /**
     * @notice Swap via a SushiSwap V3 pool directly (Uniswap V3-compatible pool interface).
     * @dev    step.pool must be set to the correct SushiSwap V3 pool address.
     *         Uses _pendingCallbackPool as a reentrancy-safe callback guard.
     *         SushiSwap V3 Factory (Base): 0xc35DADB65012eC5796536bD9864eD8773aBc74C4
     */
    function _swapSushiV3(
        address poolAddr,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        require(poolAddr != address(0), "FSV3:SUSHI3_POOL");
        
        bool zeroForOne = tokenIn < tokenOut;

        // Set callback guard before entering the pool
        _pendingCallbackPool = poolAddr;

        (int256 amount0, int256 amount1) = IUniswapV3Pool(poolAddr).swap(
            address(this),
            zeroForOne,
            int256(amountIn),
            zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1,
            abi.encode(tokenIn)
        );

        // Clear guard after callback has been processed
        _pendingCallbackPool = address(0);

        amountOut = uint256(zeroForOne ? -amount1 : -amount0);
        require(amountOut >= minAmountOut, "FSV3:SUSHI3_SLIP");
        return amountOut;
    }

    /**
     * @notice Uniswap V3 swap callback — also satisfies SushiSwap V3 (identical interface).
     * @dev    Only callable by the pool registered in _pendingCallbackPool.
     *         Pays the owed token (positive delta side) back to the pool.
     */
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external override {
        address pending = _pendingCallbackPool;
        require(msg.sender == pending && pending != address(0), "FSV3:SWCB_INVALID");

        address tokenIn = abi.decode(data, (address));

        // Exactly one delta is positive (what we owe), the other is negative (what we receive).
        int256 amountToPay = amount0Delta > 0 ? amount0Delta : amount1Delta;
        require(amountToPay > 0, "FSV3:SWCB_ZERO");

        IERC20(tokenIn).safeTransfer(msg.sender, uint256(amountToPay));
    }

    // --- PancakeSwap V3 ---
    /**
     * @notice Swap via PancakeSwap V3 SwapRouter.
     * @dev    PancakeSwap V3 SwapRouter (Base): 0x1b81D678ffb9C0263b24A97847620C99d213eB14
     *         Implements the standard Uniswap V3 ISwapRouter interface.
     */
    function _swapPancakeV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint24  fee
    ) internal returns (uint256 amountOut) {
        IERC20(tokenIn).approve(address(pancakeV3Router), amountIn);

        ISwapRouterV3.ExactInputSingleParams memory params = ISwapRouterV3.ExactInputSingleParams({
            tokenIn:           tokenIn,
            tokenOut:          tokenOut,
            fee:               fee,
            recipient:         address(this),
            amountIn:          amountIn,
            amountOutMinimum:  minAmountOut,
            sqrtPriceLimitX96: 0
        });

        return pancakeV3Router.exactInputSingle(params);
    }

    // --- AlienBase V2 ---
    /**
     * @notice Swap via AlienBase V2 Router.
     * @dev    AlienBase V2 Router (Base): 0x8c1A3cF8f83074169FE5D7aD50B978e1cD6b37c7
     *         Implements the standard Uniswap V2 IUniswapV2Router02 interface.
     */
    function _swapAlienBaseV2(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) internal returns (uint256 amountOut) {
        IERC20(tokenIn).approve(address(alienBaseV2Router), amountIn);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint256[] memory amounts = alienBaseV2Router.swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            path,
            address(this),
            block.timestamp + DEADLINE_OFFSET
        );

        return amounts[amounts.length - 1];
    }

    // --- Profit Distribution ---
    function _distributeProfits(address token, uint256 netProfit) internal {
        if (netProfit == 0) return;
        
        uint256 titheAmount = (netProfit * titheBps) / 10000;
        uint256 ownerAmount = netProfit - titheAmount;
        
        if (titheAmount > 0 && titheRecipient != address(0)) {
            IERC20(token).safeTransfer(titheRecipient, titheAmount);
        }
        
        if (ownerAmount > 0) {
            IERC20(token).safeTransfer(owner, ownerAmount);
        }
        
        emit TitheDistributed(token, titheRecipient, titheAmount, owner, ownerAmount);
    }

    // --- Uniswap V3 Flash Callback (legacy — disabled) ---
    function uniswapV3FlashCallback(
        uint256, /* fee0 */
        uint256, /* fee1 */
        bytes calldata /* data */
    ) external pure override {
        // Flash-via-V3-pool path not used; all flash loans go through Balancer/Aave.
        revert("FSV3:UFL");
    }

    // --- Emergency Functions ---
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner, amount);
    }

    receive() external payable {}
}
