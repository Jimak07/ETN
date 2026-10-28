import { erc20Abi, formatUnits, parseAbi, type Address } from "viem";

import {
  ELECTROSWAP_V2_FACTORY_ADDRESS,
  UNISWAP_V2_FACTORY_ABI,
  UNISWAP_V2_PAIR_ABI,
  WETN_ADDRESS,
} from "@/lib/constants/electroswap";
import { fetchTokenPriceInEtn } from "../pricing";
import type { DefiAdapter, DefiAdapterContext } from "./types";
import type { DefiPosition } from "../types";

const ERC20_EXTENDED_ABI = parseAbi([
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)",
]);

// Known verified ecosystem token pairs to probe proactively if not in token list
const PRIORITY_TOKENS: Address[] = [
  "0x043fAa1b5C5FC9a7dc35171f290c29ECDE0cCff1", // BOLT
  "0xc20d02538368D8F7deBeAeB99D9a8b4d4D1DDC1C", // Pandy (PDY)
  "0x38B54f147303887BD2E932373432FfCBD11Ff6a5", // BUDDY
  "0xC9FC4AB00911793D99b5c7Bd01f01203C21D4131", // CLUB
];

export const ElectroSwapLpAdapter: DefiAdapter = {
  id: "electroswap-v2-lp",
  name: "ElectroSwap V2 Liquidity Pools",
  protocol: "ElectroSwap V2",

  async getPositions(ctx: DefiAdapterContext): Promise<DefiPosition[]> {
    const { userAddress, client, tokenHoldings, etnUsdPrice } = ctx;
    const positions: DefiPosition[] = [];

    // 1. Identify LP tokens from existing token holdings
    const candidateLpTokens = tokenHoldings.filter((t) => {
      const sym = t.symbol.toUpperCase();
      const nm = t.name.toUpperCase();
      return (
        sym.includes("LP") ||
        sym.includes("UNI-V2") ||
        nm.includes("LIQUIDITY") ||
        nm.includes("PAIR") ||
        nm.includes("ELECTROSWAP")
      );
    });

    const examinedPairs = new Set<string>();

    for (const lpToken of candidateLpTokens) {
      if (lpToken.balanceRaw <= 0n) continue;
      const pairAddress = lpToken.address;
      examinedPairs.add(pairAddress.toLowerCase());

      try {
        const [token0Addr, token1Addr, reserves, totalSupply] = await Promise.all([
          client.readContract({
            address: pairAddress,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "token0",
          }),
          client.readContract({
            address: pairAddress,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "token1",
          }),
          client.readContract({
            address: pairAddress,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "getReserves",
          }),
          client.readContract({
            address: pairAddress,
            abi: ERC20_EXTENDED_ABI,
            functionName: "totalSupply",
          }),
        ]);

        if (totalSupply <= 0n) continue;

        const [t0Symbol, t0Decimals, t1Symbol, t1Decimals] = await Promise.all([
          client.readContract({ address: token0Addr, abi: ERC20_EXTENDED_ABI, functionName: "symbol" }).catch(() => "TOKEN0"),
          client.readContract({ address: token0Addr, abi: ERC20_EXTENDED_ABI, functionName: "decimals" }).catch(() => 18),
          client.readContract({ address: token1Addr, abi: ERC20_EXTENDED_ABI, functionName: "symbol" }).catch(() => "TOKEN1"),
          client.readContract({ address: token1Addr, abi: ERC20_EXTENDED_ABI, functionName: "decimals" }).catch(() => 18),
        ]);

        const shareRatio = Number(lpToken.balanceRaw) / Number(totalSupply);
        const poolSharePercent = Number((shareRatio * 100).toFixed(4));

        const userT0Wei = (reserves[0] * lpToken.balanceRaw) / totalSupply;
        const userT1Wei = (reserves[1] * lpToken.balanceRaw) / totalSupply;

        const t0AmountFormatted = formatUnits(userT0Wei, t0Decimals);
        const t1AmountFormatted = formatUnits(userT1Wei, t1Decimals);

        // Derive price for each token in ETN
        const [t0PriceEtn, t1PriceEtn] = await Promise.all([
          fetchTokenPriceInEtn(token0Addr, t0Decimals, client),
          fetchTokenPriceInEtn(token1Addr, t1Decimals, client),
        ]);

        const t0ValueEtn = Number(t0AmountFormatted) * t0PriceEtn;
        const t1ValueEtn = Number(t1AmountFormatted) * t1PriceEtn;
        const totalValueEtn = t0ValueEtn + t1ValueEtn;
        const totalValueUsd = totalValueEtn * etnUsdPrice;

        positions.push({
          id: `lp-${pairAddress}`,
          protocol: "ElectroSwap V2",
          category: "Liquidity Pool",
          name: `${t0Symbol}/${t1Symbol} LP Pool`,
          pairAddress,
          token0: {
            symbol: t0Symbol,
            address: token0Addr,
            amount: t0AmountFormatted,
            valueUsd: t0ValueEtn * etnUsdPrice,
          },
          token1: {
            symbol: t1Symbol,
            address: token1Addr,
            amount: t1AmountFormatted,
            valueUsd: t1ValueEtn * etnUsdPrice,
          },
          lpBalanceFormatted: formatUnits(lpToken.balanceRaw, lpToken.decimals),
          poolSharePercent,
          totalValueUsd,
          totalValueEtn,
          actionUrl: `/swap?inputCurrency=${token0Addr}&outputCurrency=${token1Addr}`,
        });
      } catch {
        // Not a standard pair or failed to read, continue
      }
    }

    // 2. Also check common priority token pairs against WETN
    for (const tokenAddr of PRIORITY_TOKENS) {
      try {
        const pair = await client.readContract({
          address: ELECTROSWAP_V2_FACTORY_ADDRESS,
          abi: UNISWAP_V2_FACTORY_ABI,
          functionName: "getPair",
          args: [tokenAddr, WETN_ADDRESS],
        });

        if (
          !pair ||
          pair === "0x0000000000000000000000000000000000000000" ||
          examinedPairs.has(pair.toLowerCase())
        ) {
          continue;
        }

        examinedPairs.add(pair.toLowerCase());

        // Check if user has balance in this pair
        const balance = await client.readContract({
          address: pair,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [userAddress],
        });

        if (balance <= 0n) continue;

        const [token0Addr, token1Addr, reserves, totalSupply] = await Promise.all([
          client.readContract({ address: pair, abi: UNISWAP_V2_PAIR_ABI, functionName: "token0" }),
          client.readContract({ address: pair, abi: UNISWAP_V2_PAIR_ABI, functionName: "token1" }),
          client.readContract({ address: pair, abi: UNISWAP_V2_PAIR_ABI, functionName: "getReserves" }),
          client.readContract({ address: pair, abi: ERC20_EXTENDED_ABI, functionName: "totalSupply" }),
        ]);

        if (totalSupply <= 0n) continue;

        const [t0Symbol, t0Decimals, t1Symbol, t1Decimals] = await Promise.all([
          client.readContract({ address: token0Addr, abi: ERC20_EXTENDED_ABI, functionName: "symbol" }).catch(() => "TOKEN0"),
          client.readContract({ address: token0Addr, abi: ERC20_EXTENDED_ABI, functionName: "decimals" }).catch(() => 18),
          client.readContract({ address: token1Addr, abi: ERC20_EXTENDED_ABI, functionName: "symbol" }).catch(() => "TOKEN1"),
          client.readContract({ address: token1Addr, abi: ERC20_EXTENDED_ABI, functionName: "decimals" }).catch(() => 18),
        ]);

        const shareRatio = Number(balance) / Number(totalSupply);
        const poolSharePercent = Number((shareRatio * 100).toFixed(4));

        const userT0Wei = (reserves[0] * balance) / totalSupply;
        const userT1Wei = (reserves[1] * balance) / totalSupply;

        const t0AmountFormatted = formatUnits(userT0Wei, t0Decimals);
        const t1AmountFormatted = formatUnits(userT1Wei, t1Decimals);

        const [t0PriceEtn, t1PriceEtn] = await Promise.all([
          fetchTokenPriceInEtn(token0Addr, t0Decimals, client),
          fetchTokenPriceInEtn(token1Addr, t1Decimals, client),
        ]);

        const t0ValueEtn = Number(t0AmountFormatted) * t0PriceEtn;
        const t1ValueEtn = Number(t1AmountFormatted) * t1PriceEtn;
        const totalValueEtn = t0ValueEtn + t1ValueEtn;
        const totalValueUsd = totalValueEtn * etnUsdPrice;

        positions.push({
          id: `lp-${pair}`,
          protocol: "ElectroSwap V2",
          category: "Liquidity Pool",
          name: `${t0Symbol}/${t1Symbol} LP Pool`,
          pairAddress: pair,
          token0: {
            symbol: t0Symbol,
            address: token0Addr,
            amount: t0AmountFormatted,
            valueUsd: t0ValueEtn * etnUsdPrice,
          },
          token1: {
            symbol: t1Symbol,
            address: token1Addr,
            amount: t1AmountFormatted,
            valueUsd: t1ValueEtn * etnUsdPrice,
          },
          lpBalanceFormatted: formatUnits(balance, 18),
          poolSharePercent,
          totalValueUsd,
          totalValueEtn,
          actionUrl: `/swap?inputCurrency=${token0Addr}&outputCurrency=${token1Addr}`,
        });
      } catch {
        // Continue
      }
    }

    return positions;
  },
};
