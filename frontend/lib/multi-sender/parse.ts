import { formatUnits, getAddress, isAddress, parseUnits } from "viem";

/**
 * Pasted-list parsing and validation for the batch sender.
 *
 * Pure and synchronous on purpose: the validation panel must react on every
 * keystroke and on a dropped file, so nothing here may touch the network or the
 * wallet. Everything downstream (balances, allowance, broadcast) is a separate
 * concern owned by the hook.
 */

/** Blocking problems: a row with an issue is excluded from the batch. */
export type RowIssue =
  | "invalid-address"
  | "invalid-checksum"
  | "missing-amount"
  | "invalid-amount"
  | "zero-amount"
  | "unexpected-columns";

/** Non-blocking observations: the row still ships, but it is worth seeing. */
export type RowWarning = "duplicate" | "self-transfer";

export interface RecipientRow {
  /** 1-based line number in the source text, so the panel can point at it. */
  line: number;
  /** Exactly what was pasted, before normalisation. */
  rawAddress: string;
  rawAmount: string;
  /** Checksummed address, or null when the row is invalid. */
  address: `0x${string}` | null;
  /** Base units, or null when the row is invalid. */
  amountWei: bigint | null;
  issue: RowIssue | null;
  warning: RowWarning | null;
}

export interface ParsedList {
  rows: RecipientRow[];
  valid: RecipientRow[];
  issueCount: number;
  /** Warning counts by kind, for the summary line. */
  duplicateCount: number;
  selfTransferCount: number;
  /** Sum of the valid rows only - the amount a batch of this list would move. */
  totalWei: bigint;
  /** Sum of every row that parsed, including ones later dropped. */
  grossWei: bigint;
}

export interface ParseOptions {
  /** Token decimals; 18 for ETN. */
  decimals: number;
  /** Connected wallet, used for the self-transfer warning. */
  selfAddress?: string | null;
}

const DELIMITER = /[,;\t]+/;
const SPACE_DELIMITER = /\s+/;
const ADDRESS_HEADER = new Set(["address", "addresses", "recipient", "recipients", "wallet", "to"]);
const AMOUNT_HEADER = new Set(["amount", "amounts", "value", "values", "quantity", "qty", "tokens", "etn"]);

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1).trim();
    }
  }
  return value;
}

/**
 * Splits one line into fields.
 *
 * Comma/semicolon/tab wins when present; otherwise runs of whitespace, because
 * both `0xabc...,1.5` and `0xabc... 1.5` are pasted in practice. A comma is
 * never treated as a decimal separator: doing so would silently turn `0xabc,1,5`
 * into a 1.5 ETN payment to someone who typed 1.
 */
function splitLine(line: string): string[] {
  const delimiter = DELIMITER.test(line) ? DELIMITER : SPACE_DELIMITER;
  return line.split(delimiter).map((field) => stripQuotes(field.trim())).filter((field) => field.length > 0);
}

function isHeaderRow(fields: string[]): boolean {
  const first = fields[0]?.toLowerCase() ?? "";
  const second = fields[1]?.toLowerCase() ?? "";
  return ADDRESS_HEADER.has(first) && (fields.length === 1 || AMOUNT_HEADER.has(second));
}

function parseAddress(raw: string): { address: `0x${string}` | null; issue: RowIssue | null } {
  // Non-strict first: it accepts any casing, so the checksum check below is
  // what catches a munged mixed-case address (a strong typo signal).
  if (!isAddress(raw, { strict: false })) return { address: null, issue: "invalid-address" };
  try {
    return { address: getAddress(raw), issue: null };
  } catch {
    return { address: null, issue: "invalid-checksum" };
  }
}

function parseAmount(raw: string, decimals: number): { amountWei: bigint | null; issue: RowIssue | null } {
  // Underscores and leading plus signs are spreadsheet artefacts; a leading
  // minus or a currency symbol is a mistake we want to surface, not strip.
  const cleaned = raw.replace(/[_+]/g, "").replace(/^[$€£]/, "");
  if (!/^\d*\.?\d+$|^\d+\.?$/.test(cleaned)) return { amountWei: null, issue: "invalid-amount" };

  try {
    const amountWei = parseUnits(cleaned, decimals);
    if (amountWei <= 0n) return { amountWei: null, issue: "zero-amount" };
    return { amountWei, issue: null };
  } catch {
    // viem throws on more fractional digits than the token has.
    return { amountWei: null, issue: "invalid-amount" };
  }
}

export function parseRecipientList(text: string, options: ParseOptions): ParsedList {
  const { decimals, selfAddress } = options;
  const self = selfAddress && isAddress(selfAddress, { strict: false }) ? getAddress(selfAddress).toLowerCase() : null;

  const rows: RecipientRow[] = [];
  const seen = new Set<string>();
  let totalWei = 0n;
  let grossWei = 0n;
  let duplicateCount = 0;
  let selfTransferCount = 0;
  let headerSkipped = false;

  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? "").trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    const fields = splitLine(line);
    if (fields.length === 0) continue;

    if (!headerSkipped) {
      headerSkipped = true;
      if (isHeaderRow(fields)) continue;
    }

    const row: RecipientRow = {
      line: index + 1,
      rawAddress: fields[0] ?? "",
      rawAmount: fields[1] ?? "",
      address: null,
      amountWei: null,
      issue: null,
      warning: null,
    };

    if (fields.length > 2) {
      row.issue = "unexpected-columns";
      rows.push(row);
      continue;
    }

    const addressResult = parseAddress(row.rawAddress);
    row.address = addressResult.address;
    row.issue = addressResult.issue;

    if (row.issue === null && fields.length < 2) {
      row.issue = "missing-amount";
    } else if (row.issue === null) {
      const amountResult = parseAmount(row.rawAmount, decimals);
      row.amountWei = amountResult.amountWei;
      row.issue = amountResult.issue;
    }

    if (row.amountWei !== null) grossWei += row.amountWei;

    if (row.issue === null && row.address !== null) {
      const key = row.address.toLowerCase();
      if (seen.has(key)) {
        row.warning = "duplicate";
        duplicateCount += 1;
      } else if (self !== null && key === self) {
        row.warning = "self-transfer";
        selfTransferCount += 1;
      }
      seen.add(key);
      if (row.amountWei !== null) totalWei += row.amountWei;
    }

    rows.push(row);
  }

  const valid = rows.filter((row) => row.issue === null && row.address !== null && row.amountWei !== null);

  return {
    rows,
    valid,
    issueCount: rows.length - valid.length,
    duplicateCount,
    selfTransferCount,
    totalWei,
    grossWei,
  };
}

export interface RecipientBatch {
  /** 1-based position in the send sequence. */
  index: number;
  recipients: `0x${string}`[];
  amounts: bigint[];
  totalWei: bigint;
}

/**
 * Splits a validated list into contract-sized batches.
 *
 * The ceiling is the contract's `MAX_BATCH_SIZE`: exceeding it reverts the whole
 * call, so lists longer than one batch are sent as sequential transactions and
 * the modal tracks the run. Order is preserved, so a partially-sent run can be
 * resumed by filtering out the rows that already landed.
 */
export function planBatches(rows: readonly RecipientRow[], maxBatchSize: number): RecipientBatch[] {
  const limit = Math.max(1, Math.floor(maxBatchSize));
  const batches: RecipientBatch[] = [];

  for (let start = 0; start < rows.length; start += limit) {
    const slice = rows.slice(start, start + limit);
    const recipients: `0x${string}`[] = [];
    const amounts: bigint[] = [];
    let totalWei = 0n;

    for (const row of slice) {
      if (row.address === null || row.amountWei === null) continue;
      recipients.push(row.address);
      amounts.push(row.amountWei);
      totalWei += row.amountWei;
    }

    if (recipients.length > 0) {
      batches.push({ index: batches.length + 1, recipients, amounts, totalWei });
    }
  }

  return batches;
}

/** Human-readable amount for a wei value, trimmed of trailing zeros. */
export function formatTokenAmount(value: bigint | null, decimals: number, maxFractionDigits = 6): string {
  if (value === null) return "—";

  const raw = formatUnits(value, decimals);
  if (!raw.includes(".")) return raw;

  const [whole, fraction = ""] = raw.split(".");
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
}

export const ROW_ISSUE_COPY: Record<RowIssue, string> = {
  "invalid-address": "Not a valid address",
  "invalid-checksum": "Checksum mismatch - likely a typo",
  "missing-amount": "No amount on this line",
  "invalid-amount": "Not a valid amount",
  "zero-amount": "Amount must be greater than zero",
  "unexpected-columns": "Expected exactly two columns (address, amount)",
};

export const ROW_WARNING_COPY: Record<RowWarning, string> = {
  duplicate: "Duplicate of an earlier row",
  "self-transfer": "This is your own wallet",
};
