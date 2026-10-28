import { ElectroSwapLpAdapter } from "./electroswap-lp";
import { WetnAdapter } from "./wetn-adapter";
import type { DefiAdapter, DefiAdapterContext } from "./types";
import type { DefiPosition } from "../types";

/**
 * Registered list of active DeFi protocol adapters on the Electroneum Smart Chain.
 * Additional adapters (e.g. validator staking, vaults, token lockers) can be plugged in here.
 */
export const REGISTERED_DEFI_ADAPTERS: readonly DefiAdapter[] = [
  ElectroSwapLpAdapter,
  WetnAdapter,
];

/**
 * Scan all registered protocol adapters concurrently for the given wallet address.
 */
export async function getAllDefiPositions(ctx: DefiAdapterContext): Promise<DefiPosition[]> {
  const settled = await Promise.allSettled(
    REGISTERED_DEFI_ADAPTERS.map((adapter) => adapter.getPositions(ctx))
  );

  const results: DefiPosition[] = [];
  for (const item of settled) {
    if (item.status === "fulfilled") {
      results.push(...item.value);
    }
  }

  // Deduplicate by ID
  const seen = new Set<string>();
  return results.filter((pos) => {
    if (seen.has(pos.id)) return false;
    seen.add(pos.id);
    return true;
  });
}
