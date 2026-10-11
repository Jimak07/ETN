import { parseAbi, type Address } from "viem";

/**
 * ElectroSwap DEX Constants on the Electroneum Smart Chain (ETN-SC).
 *
 * Electroneum Mainnet: Chain ID 52014 (0xcb2e).
 */

/**
 * Mainnet ElectroSwap SwapRouter02 (as specified in prompt).
 * Handles multicall, exactInput, and V2 swapExactTokensForTokens.
 */
export const ELECTROSWAP_ROUTER_ADDRESS: Address = "0x5A3AB7e9f405250B36e7e0a4654c1052EADC1F07";

/**
 * Mainnet ElectroSwap UniswapV2Router02.
 * Verified contract holding standard V2 methods:
 * getAmountsOut, swapExactETHForTokens, swapExactTokensForETH, swapExactTokensForTokens.
 */
export const ELECTROSWAP_V2_ROUTER_ADDRESS: Address = "0x072D4706f9A383D5608BD14B09b41683cb95fFd7";

/** Primary router address used for V2 swaps and quotes. */
export const V2_ROUTER_ADDRESS: Address = ELECTROSWAP_V2_ROUTER_ADDRESS;

/**
 * ElectroSwap V2 Factory address.
 * Holds all pair registries on ETN-SC (getPair, allPairs, etc.).
 */
export const ELECTROSWAP_V2_FACTORY_ADDRESS: Address = "0x203D550ed6fA9dAB8A4190720CF9F65138abd15B";

/**
 * WETN (Wrapped Electroneum) contract on Electroneum Mainnet.
 */
export const WETN_ADDRESS: Address = "0x138DAFbDA0CCB3d8E39C19edb0510Fc31b7C1c77";

/**
 * Native ETN pseudo-address placeholder used in UI state.
 */
export const NATIVE_ETN_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/**
 * Standard Uniswap V2 Router ABI for Electroneum Smart Chain.
 */
export const UNISWAP_V2_ROUTER_ABI = parseAbi([
  "function factory() external view returns (address)",
  "function WETH() external view returns (address)",
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
  "function getAmountsIn(uint256 amountOut, address[] calldata path) external view returns (uint256[] memory amounts)",
  "function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) external pure returns (uint256 amountB)",
  "function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable",
  "function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external",
]);

/**
 * Standard Uniswap V2 Factory ABI.
 */
export const UNISWAP_V2_FACTORY_ABI = parseAbi([
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
  "function allPairs(uint256 index) external view returns (address pair)",
  "function allPairsLength() external view returns (uint256)",
]);

/**
 * Standard Uniswap V2 Pair ABI.
 */
export const UNISWAP_V2_PAIR_ABI = parseAbi([
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
]);

/**
 * WETN ABI for wrapping and unwrapping native ETN.
 */
export const WETN_ABI = parseAbi([
  "function deposit() external payable",
  "function withdraw(uint256 wad) external",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function transfer(address to, uint256 value) external returns (bool)",
  "function transferFrom(address from, address to, uint256 value) external returns (bool)",
]);

/**
 * Canonical Token representation in the Swap UI.
 */
export interface TokenInfo {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  isNative?: boolean;
  iconUrl?: string | null;
  isCustom?: boolean;
}

/**
 * Native Electroneum (ETN) token representation.
 */
export const NATIVE_ETN_TOKEN: TokenInfo = {
  address: NATIVE_ETN_ADDRESS,
  symbol: "ETN",
  name: "Electroneum",
  decimals: 18,
  isNative: true,
};

/**
 * Wrapped Electroneum (WETN) token representation.
 */
export const WETN_TOKEN: TokenInfo = {
  address: WETN_ADDRESS,
  symbol: "WETN",
  name: "Wrapped Electroneum",
  decimals: 18,
};

/**
 * Curated baseline tokens on the Electroneum Smart Chain.
 * Displayed even before or alongside the Blockscout dynamic fetch.
 */
export const DEFAULT_ECOSYSTEM_TOKENS: readonly TokenInfo[] = [
  NATIVE_ETN_TOKEN,
  WETN_TOKEN,
  {
    address: "0x043fAa1b5C5FC9a7dc35171f290c29ECDE0cCff1",
    symbol: "BOLT",
    name: "ElectroSwap",
    decimals: 18,
  },
  {
    address: "0xc20d02538368D8F7deBeAeB99D9a8b4d4D1DDC1C",
    symbol: "PDY",
    name: "Pandy",
    decimals: 18,
  },
  {
    address: "0x38B54f147303887BD2E932373432FfCBD11Ff6a5",
    symbol: "BUDDY",
    name: "ETN BUDDY",
    decimals: 18,
  },
] as const;

/**
 * Preset slippage options.
 */
export const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0] as const;

/**
 * Default slippage tolerance percentage (0.5%).
 */
export const DEFAULT_SLIPPAGE = 0.5;

/**
 * Default transaction deadline in minutes (20 minutes).
 */
export const DEFAULT_DEADLINE_MINUTES = 20;
