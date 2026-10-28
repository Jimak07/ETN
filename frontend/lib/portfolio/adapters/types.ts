import type { Address, PublicClient } from "viem";
import type { DefiPosition } from "../types";

export interface RawTokenHoldingInput {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  balanceRaw: bigint;
  balanceFormatted: string;
}

export interface DefiAdapterContext {
  userAddress: Address;
  client: PublicClient;
  tokenHoldings: RawTokenHoldingInput[];
  etnUsdPrice: number;
}

export interface DefiAdapter {
  id: string;
  name: string;
  protocol: "ElectroSwap V2" | "Wrapped Reserve" | "Electroneum Staking" | "Custom";
  getPositions(ctx: DefiAdapterContext): Promise<DefiPosition[]>;
}
