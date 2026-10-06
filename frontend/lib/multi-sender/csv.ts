import Papa from "papaparse";
import { getAddress, isAddress } from "viem";
import { sanitizeInput } from "./parse";

export interface CsvImportedRow {
  rawAddress: string;
  rawAmount: string;
  isValidAddress: boolean;
  addressError: string | null;
}

export interface CsvParseResult {
  rows: CsvImportedRow[];
  totalRows: number;
  validAddressCount: number;
  invalidAddressCount: number;
}

const ADDRESS_HEADER_NAMES = new Set([
  "address",
  "addresses",
  "wallet",
  "wallets",
  "recipient",
  "recipients",
  "to",
  "account",
  "destination",
]);

const AMOUNT_HEADER_NAMES = new Set([
  "amount",
  "amounts",
  "value",
  "values",
  "quantity",
  "qty",
  "token_id",
  "tokenid",
  "tokens",
  "id",
  "etn",
  "count",
]);

function isHeader(fields: string[]): boolean {
  if (fields.length === 0) return false;
  const first = fields[0]?.toLowerCase().trim() ?? "";
  const second = fields[1]?.toLowerCase().trim() ?? "";
  return (
    ADDRESS_HEADER_NAMES.has(first) ||
    (fields.length >= 2 && AMOUNT_HEADER_NAMES.has(second))
  );
}

/**
 * Parses CSV content into validated recipient rows using PapaParse.
 * Extracts addresses and amounts, skipping headers and comments.
 * Strictly checks each address using viem's isAddress and getAddress.
 * Malformed addresses are flagged but preserved for inline correction.
 */
export function parseRecipientCsv(csvText: string): CsvParseResult {
  const parsed = Papa.parse<string[]>(csvText, {
    skipEmptyLines: "greedy",
  });

  const rawRows: string[][] = parsed.data;
  const results: CsvImportedRow[] = [];
  let headerSkipped = false;

  for (let i = 0; i < rawRows.length; i++) {
    const rawCols = rawRows[i];
    if (!rawCols || rawCols.length === 0) continue;

    // Filter columns and strip whitespace/quotes
    const cols = rawCols.map((c) => (typeof c === "string" ? c.trim() : "")).filter(Boolean);
    if (cols.length === 0) continue;

    // Skip comment lines
    if (cols[0]?.startsWith("#") || cols[0]?.startsWith("//")) continue;

    if (!headerSkipped) {
      headerSkipped = true;
      if (isHeader(cols)) continue;
    }

    const rawAddress = cols[0] ?? "";
    const rawAmount = cols[1] ?? "";

    // Ignore lines that have neither an address-like string nor an amount
    if (rawAddress.length === 0 && rawAmount.length === 0) continue;

    const cleanedAddress = sanitizeInput(rawAddress);
    let isValidAddress = false;
    let addressError: string | null = null;

    if (!isAddress(cleanedAddress, { strict: false })) {
      isValidAddress = false;
      addressError = "Invalid EVM wallet address format";
    } else {
      try {
        getAddress(cleanedAddress);
        isValidAddress = true;
      } catch {
        isValidAddress = false;
        addressError = "Checksum mismatch - check capitalization";
      }
    }

    results.push({
      rawAddress,
      rawAmount,
      isValidAddress,
      addressError,
    });
  }

  const validAddressCount = results.filter((r) => r.isValidAddress).length;
  const invalidAddressCount = results.length - validAddressCount;

  return {
    rows: results,
    totalRows: results.length,
    validAddressCount,
    invalidAddressCount,
  };
}
