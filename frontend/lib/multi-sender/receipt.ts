import { explorerTxUrl } from "./contract";
import { formatTokenAmount, type RecipientRow } from "./parse";
import type { AssetKind, NftStandard } from "@/hooks/use-multi-sender";

export interface ReceiptOptions {
  recipients: readonly RecipientRow[];
  symbol: string;
  decimals: number;
  txHash: string;
  chainId: number | null;
  asset: AssetKind;
  nftStandard?: NftStandard;
}

/**
 * Generates and downloads a CSV distribution receipt following confirmed batch transactions.
 * Columns: Recipient Address, Amount / Token ID, Status (Success), TxHash, Explorer URL.
 */
export function exportDistributionReceiptCsv({
  recipients,
  symbol,
  decimals,
  txHash,
  chainId,
  asset,
  nftStandard,
}: ReceiptOptions): void {
  const url = explorerTxUrl(chainId, txHash);
  const isErc721 = asset === "nft" && nftStandard === "erc721";

  const headers = [
    "Recipient Address",
    isErc721 ? "Token ID" : `Amount (${symbol})`,
    "Status",
    "TxHash",
    "Explorer URL",
  ];

  const rows = recipients.map((r) => {
    const addr = r.address ?? r.rawAddress;
    const amt = isErc721 ? r.rawAmount : formatTokenAmount(r.amountWei, decimals, 6);
    return [addr, amt, "Success", txHash, url];
  });

  const csvRows = [
    headers.map((h) => `"${h}"`).join(","),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
  ];

  const content = csvRows.join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", downloadUrl);
  link.setAttribute("download", `distribution-receipt-${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(downloadUrl);
}
