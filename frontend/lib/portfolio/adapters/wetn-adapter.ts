import { erc20Abi, formatUnits } from "viem";

import { WETN_ADDRESS } from "@/lib/constants/electroswap";
import type { DefiAdapter, DefiAdapterContext } from "./types";
import type { DefiPosition } from "../types";

export const WetnAdapter: DefiAdapter = {
  id: "wrapped-electroneum-reserve",
  name: "Wrapped Electroneum (WETN)",
  protocol: "Wrapped Reserve",

  async getPositions(ctx: DefiAdapterContext): Promise<DefiPosition[]> {
    const { userAddress, client, etnUsdPrice, tokenHoldings } = ctx;

    // Check if WETN was already in tokenHoldings
    const foundInHoldings = tokenHoldings.find(
      (t) => t.address.toLowerCase() === WETN_ADDRESS.toLowerCase()
    );

    let wetnBalanceWei = foundInHoldings ? foundInHoldings.balanceRaw : 0n;

    // If not found in token list, query directly from contract
    if (!foundInHoldings) {
      try {
        wetnBalanceWei = await client.readContract({
          address: WETN_ADDRESS,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [userAddress],
        });
      } catch {
        wetnBalanceWei = 0n;
      }
    }

    if (wetnBalanceWei <= 0n) return [];

    const wetnAmount = Number(formatUnits(wetnBalanceWei, 18));
    const totalValueUsd = wetnAmount * etnUsdPrice;

    return [
      {
        id: `wetn-${WETN_ADDRESS}`,
        protocol: "Wrapped Reserve",
        category: "Wrapped Asset",
        name: "Wrapped Electroneum Reserve",
        pairAddress: WETN_ADDRESS,
        token0: {
          symbol: "WETN",
          address: WETN_ADDRESS,
          amount: formatUnits(wetnBalanceWei, 18),
          valueUsd: totalValueUsd,
        },
        lpBalanceFormatted: formatUnits(wetnBalanceWei, 18),
        poolSharePercent: 100,
        totalValueUsd,
        totalValueEtn: wetnAmount,
        actionUrl: "/swap?inputCurrency=0x0000000000000000000000000000000000000000&outputCurrency=" + WETN_ADDRESS,
      },
    ];
  },
};
