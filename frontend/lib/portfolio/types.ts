import type { Address } from "viem";

export type Timeframe = "24H" | "7D" | "30D";

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
}

export interface WalletIntelligence {
  totalTransactions: number;
  tokenTransfersCount: number;
  cumulativeGasSpentEtn: number;
  cumulativeGasSpentUsd: number;
  walletAgeDays: number;
  firstTxDate: string | null;
  approvals: TokenApprovalItem[];
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
}

export interface WatchlistItem {
  address: Address;
  label: string;
  category?: string;
  addedAt: number;
}
