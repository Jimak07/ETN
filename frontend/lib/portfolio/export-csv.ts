import type { PortfolioSummary, WalletTransaction } from "./types";
import { ETN_EXPLORER_URL } from "@/lib/etn";

/**
 * Formula Injection Defense:
 * If a cell string starts with '=', '+', '-', or '@', prepend a single quote
 * so Excel/Google Sheets treats it strictly as literal text, never an executable formula.
 */
function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  // Escape double quotes
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Export Mode 1: Portfolio Snapshot CSV
 * Columns: Timestamp, Wallet Address, Asset Type, Asset Symbol, Contract Address, Balance, Price (ETN), Price (USD), Total Value (USD), Unrealized PnL ($), Unrealized PnL (%)
 */
export function exportPortfolioSnapshotCsv(summary: PortfolioSummary): void {
  const timestamp = new Date().toISOString();
  const address = summary.isBundle && summary.bundledAddresses
    ? `Bundle (${summary.bundledAddresses.length} wallets)`
    : summary.address;

  const headers = [
    "Timestamp",
    "Wallet Address",
    "Asset Category",
    "Asset Name",
    "Symbol",
    "Contract Address",
    "Balance",
    "Price (ETN)",
    "Price (USD)",
    "Total Value (USD)",
    "Unrealized PnL ($)",
    "Unrealized PnL (%)",
  ];

  const rows: unknown[][] = [];

  // 1. Tokens (Native + ERC-20)
  for (const token of summary.tokens) {
    rows.push([
      timestamp,
      address,
      token.isNative ? "Native Coin" : "ERC-20 Token",
      token.name,
      token.symbol,
      token.address,
      token.balanceFormatted,
      token.priceInEtn.toFixed(6),
      token.priceInUsd.toFixed(6),
      token.totalValueUsd.toFixed(2),
      token.unrealizedPnLUsd ? token.unrealizedPnLUsd.toFixed(2) : "0.00",
      token.unrealizedPnLPercent ? `${token.unrealizedPnLPercent.toFixed(2)}%` : "0.00%",
    ]);
  }

  // 2. DeFi Positions
  for (const pos of summary.defiPositions) {
    rows.push([
      timestamp,
      address,
      `DeFi (${pos.category})`,
      pos.name,
      pos.token0.symbol + (pos.token1 ? `/${pos.token1.symbol}` : ""),
      pos.pairAddress,
      pos.lpBalanceFormatted,
      pos.totalValueEtn.toFixed(4),
      summary.etnUsdPrice.toFixed(6),
      pos.totalValueUsd.toFixed(2),
      pos.earnedFeesUsd ? pos.earnedFeesUsd.toFixed(2) : "0.00",
      pos.netLpReturnPercent ? `${pos.netLpReturnPercent.toFixed(2)}%` : "0.00%",
    ]);
  }

  // 3. NFTs
  for (const nft of summary.nfts) {
    rows.push([
      timestamp,
      address,
      `NFT (${nft.standard})`,
      nft.name,
      nft.collectionSymbol,
      nft.collectionAddress,
      `1 (Token #${nft.id})`,
      "—",
      "—",
      "—",
      "—",
      "—",
    ]);
  }

  triggerDownload(headers, rows, `myverse-portfolio-snapshot-${Date.now()}.csv`);
}

/**
 * Export Mode 2: Transaction & Tax Ledger CSV
 * Columns: Tx Hash, Timestamp, Block, Direction, Asset, Amount, Gas Fee (ETN), Counterparty Address, Explorer URL
 */
export function exportTaxLedgerCsv(
  summary: PortfolioSummary,
  transactions: WalletTransaction[] = []
): void {
  const headers = [
    "Tx Hash",
    "Timestamp (UTC)",
    "Block",
    "Direction",
    "Method / Type",
    "Asset",
    "Amount",
    "Gas Fee (ETN)",
    "From Address",
    "To Address",
    "Explorer URL",
  ];

  const userLower = summary.address.toLowerCase();

  const rows: unknown[][] = transactions.map((tx) => {
    const isSender = tx.from.toLowerCase() === userLower;
    const direction = isSender ? "OUT" : "IN";
    const explorerUrl = `${ETN_EXPLORER_URL}/tx/${tx.hash}`;

    return [
      tx.hash,
      tx.timestamp ?? "Unknown",
      tx.block ?? "—",
      direction,
      tx.method ?? (isSender ? "Transfer Out" : "Transfer In"),
      "ETN",
      tx.valueFormatted,
      tx.feeFormatted,
      tx.from,
      tx.to ?? "Contract Creation",
      explorerUrl,
    ];
  });

  triggerDownload(headers, rows, `myverse-tax-ledger-${Date.now()}.csv`);
}

function triggerDownload(headers: string[], rows: unknown[][], filename: string): void {
  const csvContent = [
    headers.map(sanitizeCsvCell).join(","),
    ...rows.map((row) => row.map(sanitizeCsvCell).join(",")),
  ].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
