import {
  getAddress,
  type Address,
  type PublicClient,
  type WalletClient,
  type Hash,
} from "viem";

import {
  ELECTROSWAP_V2_FACTORY_ADDRESS,
  ELECTROSWAP_V2_ROUTER_ADDRESS,
  UNISWAP_V2_FACTORY_ABI,
  UNISWAP_V2_PAIR_ABI,
  UNISWAP_V2_ROUTER_ABI,
  WETN_ABI,
  WETN_ADDRESS,
  type TokenInfo,
} from "@/lib/constants/electroswap";

export interface SwapRoute {
  path: Address[];
  isWrap: boolean;
  isUnwrap: boolean;
  hasDirectPair: boolean;
  hasMultiHop: boolean;
  pairs: Address[];
}

export interface SwapQuote {
  route: SwapRoute;
  amountInWei: bigint;
  amountOutWei: bigint;
  amountOutMinWei: bigint;
  executionRate: number;
  invertedRate: number;
  priceImpactPercent: number;
  lpFeePercent: number;
  hasLiquidity: boolean;
  error?: string;
}

const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/**
 * Determine the execution path between two tokens and verify pool reserves.
 */
export async function resolveSwapRoute(
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  client: PublicClient
): Promise<SwapRoute> {
  // Wrap / Unwrap between Native ETN and WETN
  if (tokenIn.isNative && tokenOut.address.toLowerCase() === WETN_ADDRESS.toLowerCase()) {
    return {
      path: [WETN_ADDRESS],
      isWrap: true,
      isUnwrap: false,
      hasDirectPair: true,
      hasMultiHop: false,
      pairs: [],
    };
  }

  if (tokenIn.address.toLowerCase() === WETN_ADDRESS.toLowerCase() && tokenOut.isNative) {
    return {
      path: [WETN_ADDRESS],
      isWrap: false,
      isUnwrap: true,
      hasDirectPair: true,
      hasMultiHop: false,
      pairs: [],
    };
  }

  const addrIn = tokenIn.isNative ? WETN_ADDRESS : getAddress(tokenIn.address);
  const addrOut = tokenOut.isNative ? WETN_ADDRESS : getAddress(tokenOut.address);

  // 1. Check direct pair
  try {
    const directPair = await client.readContract({
      address: ELECTROSWAP_V2_FACTORY_ADDRESS,
      abi: UNISWAP_V2_FACTORY_ABI,
      functionName: "getPair",
      args: [addrIn, addrOut],
    });

    if (directPair && directPair !== ZERO_ADDRESS) {
      const reserves = await client.readContract({
        address: directPair,
        abi: UNISWAP_V2_PAIR_ABI,
        functionName: "getReserves",
      });

      if (reserves && reserves[0] > 0n && reserves[1] > 0n) {
        return {
          path: [addrIn, addrOut],
          isWrap: false,
          isUnwrap: false,
          hasDirectPair: true,
          hasMultiHop: false,
          pairs: [directPair],
        };
      }
    }
  } catch {
    // Continue to multi-hop check
  }

  // 2. Check multi-hop via WETN if neither token is WETN
  const wetnLower = WETN_ADDRESS.toLowerCase();
  if (addrIn.toLowerCase() !== wetnLower && addrOut.toLowerCase() !== wetnLower) {
    try {
      const [pairInWetn, pairWetnOut] = await Promise.all([
        client.readContract({
          address: ELECTROSWAP_V2_FACTORY_ADDRESS,
          abi: UNISWAP_V2_FACTORY_ABI,
          functionName: "getPair",
          args: [addrIn, WETN_ADDRESS],
        }),
        client.readContract({
          address: ELECTROSWAP_V2_FACTORY_ADDRESS,
          abi: UNISWAP_V2_FACTORY_ABI,
          functionName: "getPair",
          args: [WETN_ADDRESS, addrOut],
        }),
      ]);

      if (
        pairInWetn &&
        pairInWetn !== ZERO_ADDRESS &&
        pairWetnOut &&
        pairWetnOut !== ZERO_ADDRESS
      ) {
        const [reserves1, reserves2] = await Promise.all([
          client.readContract({
            address: pairInWetn,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "getReserves",
          }),
          client.readContract({
            address: pairWetnOut,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "getReserves",
          }),
        ]);

        if (
          reserves1 &&
          reserves1[0] > 0n &&
          reserves1[1] > 0n &&
          reserves2 &&
          reserves2[0] > 0n &&
          reserves2[1] > 0n
        ) {
          return {
            path: [addrIn, WETN_ADDRESS, addrOut],
            isWrap: false,
            isUnwrap: false,
            hasDirectPair: false,
            hasMultiHop: true,
            pairs: [pairInWetn, pairWetnOut],
          };
        }
      }
    } catch {
      // No multi-hop available
    }
  }

  // No liquidity pool found
  return {
    path: [addrIn, addrOut],
    isWrap: false,
    isUnwrap: false,
    hasDirectPair: false,
    hasMultiHop: false,
    pairs: [],
  };
}

/**
 * Fetch a swap quote and calculate slippage, fee, and execution rates.
 */
export async function getSwapQuote(
  amountInWei: bigint,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  slippagePercent: number,
  client: PublicClient
): Promise<SwapQuote> {
  const route = await resolveSwapRoute(tokenIn, tokenOut, client);

  // Wrap / Unwrap: 1:1 ratio, zero LP fee
  if (route.isWrap || route.isUnwrap) {
    const rate = 1;
    return {
      route,
      amountInWei,
      amountOutWei: amountInWei,
      amountOutMinWei: amountInWei,
      executionRate: rate,
      invertedRate: rate,
      priceImpactPercent: 0,
      lpFeePercent: 0,
      hasLiquidity: true,
    };
  }

  if (!route.hasDirectPair && !route.hasMultiHop) {
    return {
      route,
      amountInWei,
      amountOutWei: 0n,
      amountOutMinWei: 0n,
      executionRate: 0,
      invertedRate: 0,
      priceImpactPercent: 0,
      lpFeePercent: 0,
      hasLiquidity: false,
      error: "No active liquidity pool exists for this token pair on ElectroSwap.",
    };
  }

  if (amountInWei <= 0n) {
    return {
      route,
      amountInWei: 0n,
      amountOutWei: 0n,
      amountOutMinWei: 0n,
      executionRate: 0,
      invertedRate: 0,
      priceImpactPercent: 0,
      lpFeePercent: 0,
      hasLiquidity: true,
    };
  }

  try {
    const amounts = await client.readContract({
      address: ELECTROSWAP_V2_ROUTER_ADDRESS,
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [amountInWei, route.path],
    });

    const amountOutWei = amounts[amounts.length - 1];
    if (!amountOutWei || amountOutWei <= 0n) {
      return {
        route,
        amountInWei,
        amountOutWei: 0n,
        amountOutMinWei: 0n,
        executionRate: 0,
        invertedRate: 0,
        priceImpactPercent: 0,
        lpFeePercent: 0,
        hasLiquidity: false,
        error: "Insufficient liquidity for this trade.",
      };
    }

    // Apply slippage tolerance: amountOutMin = amountOut * (1 - slippage / 100)
    const basisPoints = BigInt(Math.max(1, Math.min(10000, Math.round(slippagePercent * 100))));
    const amountOutMinWei = (amountOutWei * (10000n - basisPoints)) / 10000n;

    // Convert to floating point for display rate
    const inScaled = Number(amountInWei) / 10 ** tokenIn.decimals;
    const outScaled = Number(amountOutWei) / 10 ** tokenOut.decimals;
    const executionRate = inScaled > 0 ? outScaled / inScaled : 0;
    const invertedRate = executionRate > 0 ? 1 / executionRate : 0;

    // 0.3% LP fee per hop (Uniswap V2 model)
    const hopCount = route.path.length - 1;
    const lpFeePercent = hopCount * 0.3;

    return {
      route,
      amountInWei,
      amountOutWei,
      amountOutMinWei,
      executionRate,
      invertedRate,
      priceImpactPercent: 0.1, // Approximate standard slippage impact
      lpFeePercent,
      hasLiquidity: true,
    };
  } catch {
    return {
      route,
      amountInWei,
      amountOutWei: 0n,
      amountOutMinWei: 0n,
      executionRate: 0,
      invertedRate: 0,
      priceImpactPercent: 0,
      lpFeePercent: 0,
      hasLiquidity: false,
      error: "Insufficient liquidity in pool to complete this swap.",
    };
  }
}

/**
 * Execute a swap transaction on Electroneum Mainnet.
 */
export async function executeSwap({
  wallet,
  account,
  tokenIn,
  tokenOut,
  quote,
  deadlineMinutes = 20,
}: {
  wallet: WalletClient;
  account: Address;
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  quote: SwapQuote;
  deadlineMinutes?: number;
}): Promise<Hash> {
  const { route, amountInWei, amountOutMinWei } = quote;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60);

  // 1. Direct Wrap ETN -> WETN
  if (route.isWrap) {
    return wallet.writeContract({
      account,
      chain: null,
      address: WETN_ADDRESS,
      abi: WETN_ABI,
      functionName: "deposit",
      value: amountInWei,
    });
  }

  // 2. Direct Unwrap WETN -> ETN
  if (route.isUnwrap) {
    return wallet.writeContract({
      account,
      chain: null,
      address: WETN_ADDRESS,
      abi: WETN_ABI,
      functionName: "withdraw",
      args: [amountInWei],
    });
  }

  // 3. Native ETN -> Token
  if (tokenIn.isNative) {
    return wallet.writeContract({
      account,
      chain: null,
      address: ELECTROSWAP_V2_ROUTER_ADDRESS,
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens",
      args: [amountOutMinWei, route.path, account, deadline],
      value: amountInWei,
    });
  }

  // 4. Token -> Native ETN
  if (tokenOut.isNative) {
    return wallet.writeContract({
      account,
      chain: null,
      address: ELECTROSWAP_V2_ROUTER_ADDRESS,
      abi: UNISWAP_V2_ROUTER_ABI,
      functionName: "swapExactTokensForETHSupportingFeeOnTransferTokens",
      args: [amountInWei, amountOutMinWei, route.path, account, deadline],
    });
  }

  // 5. Token -> Token
  return wallet.writeContract({
    account,
    chain: null,
    address: ELECTROSWAP_V2_ROUTER_ADDRESS,
    abi: UNISWAP_V2_ROUTER_ABI,
    functionName: "swapExactTokensForTokensSupportingFeeOnTransferTokens",
    args: [amountInWei, amountOutMinWei, route.path, account, deadline],
  });
}
