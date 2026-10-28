import type { Address } from "viem";

export type Timeframe = "24H" | "7D" | "30D";

export interface WalletTokenBreakdown {
  address: Address;
  label?: string;
  balanceFormatted: string;
  balanceNumber: number;
  valueUsd?: number;
}

export interface TokenHolding {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  balanceRaw: bigint;
  balanceFormatted: string;
  balanceNumber: number;
  isNative: boolean;
  iconUrl: string | null;
  priceInEtn: number;
  priceInUsd: number;
  totalValueEtn: number;
  totalValueUsd: number;
  allocationPercent: number; // 0 to 100
  isVerified?: boolean;
  // Phase 2 Pro: PnL & Cost Basis Engine
  costBasisEtn?: number;
  costBasisUsd?: number;
  unrealizedPnLUsd?: number;
  unrealizedPnLPercent?: number;
  // Phase 2 Pro: Multi-Wallet Bundled Breakdown
  walletBreakdown?: WalletTokenBreakdown[];
}

export interface DefiPosition {
  id: string;
  protocol: "ElectroSwap V2" | "Wrapped Reserve" | "Electroneum Staking" | "Custom";
  category: "Liquidity Pool" | "Wrapped Asset" | "Staked" | "Vault";
  name: string;
  pairAddress: Address;
  token0: {
    symbol: string;
    address: Address;
    amount: string;
    valueUsd: number;
  };
  token1?: {
    symbol: string;
    address: Address;
    amount: string;
    valueUsd: number;
  };
  lpBalanceFormatted: string;
  poolSharePercent: number;
  totalValueUsd: number;
  totalValueEtn: number;
  actionUrl?: string;
  walletAddress?: Address;
  // Phase 2 Pro: Impermanent Loss & Yield Analytics
  impermanentLossPercent?: number;
  hodlValueUsd?: number;
  earnedFeesUsd?: number;
  netLpReturnPercent?: number;
}

export interface NftHolding {
  id: string; // Token ID
  collectionAddress: Address;
  collectionName: string;
  collectionSymbol: string;
  standard: "ERC-721" | "ERC-1155";
  name: string;
  description: string | null;
  imageUrl: string | null;
  attributes: Array<{ trait_type: string; value: string }>;
  explorerUrl: string;
  walletAddress?: Address;
}

export interface WalletTransaction {
  hash: string;
  block: number | null;
  timestamp: string | null;
  from: Address;
  to: Address | null;
  valueWei: bigint;
  valueFormatted: string;
  feeWei: bigint;
  feeFormatted: string;
  isError?: boolean;
  method?: string | null;
}

export interface TokenApprovalItem {
  tokenAddress: Address;
  tokenSymbol: string;
  spenderAddress: Address;
  spenderName: string;
  allowanceRaw: bigint;
  isUnlimited: boolean;
  allowanceFormatted: string;
  riskLevel: "safe" | "caution" | "warning";
  ownerAddress?: Address;
}

export interface WalletIntelligence {
  totalTransactions: number;
  tokenTransfersCount: number;
  cumulativeGasSpentEtn: number;
  cumulativeGasSpentUsd: number;
  walletAgeDays: number;
  firstTxDate: string | null;
  approvals: TokenApprovalItem[];
  recentTransactions?: WalletTransaction[];
}

export interface PortfolioHistoryPoint {
  timestamp: number;
  dateStr: string;
  valueUsd: number;
  valueEtn: number;
}

export interface PortfolioSummary {
  address: Address;
  ensOrDomain: string | null;
  isContract: boolean;
  nativeBalanceWei: bigint;
  nativeBalanceEtn: number;
  etnUsdPrice: number;
  totalNetWorthUsd: number;
  totalNetWorthEtn: number;
  change24hUsd: number;
  change24hPercent: number;
  tokens: TokenHolding[];
  defiPositions: DefiPosition[];
  nfts: NftHolding[];
  intelligence: WalletIntelligence;
  history: PortfolioHistoryPoint[];
  lastUpdated: number;
  // Phase 2 Pro: Multi-Wallet Bundle
  isBundle?: boolean;
  bundledAddresses?: Address[];
  // Phase 2 Pro: Best/Worst Performers
  bestPerformer?: { symbol: string; pnlPercent: number; pnlUsd: number } | null;
  worstPerformer?: { symbol: string; pnlPercent: number; pnlUsd: number } | null;
}

export interface WatchlistItem {
  address: Address;
  label: string;
  category?: string;
  addedAt: number;
}

// Phase 2 Pro: Smart Money & Whale Radar
export interface SmartMoneyWallet {
  address: Address;
  label: string;
  category: "Whale" | "Top LP" | "DEX Arbitrageur" | "Protocol Treasury";
  tag: string;
  winRatePercent: number;
  holdingValueUsd: number;
  topAsset: string;
  description: string;
}

export interface WhaleSwapEvent {
  id: string;
  txHash: string;
  timestamp: string;
  timeAgo: string;
  walletAddress: Address;
  walletLabel?: string;
  action: "BUY" | "SELL";
  tokenIn: { symbol: string; amount: string };
  tokenOut: { symbol: string; amount: string };
  valueEtn: number;
  valueUsd: number;
  pairAddress: Address;
  isLargeWhale: boolean;
}
