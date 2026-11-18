import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { getAddress } from "viem";

/**
 * PulseDrop Airdrop Snapshot Generator
 *
 * Reads user loyalty points (VersePoints) from the Supabase `verse_users` table,
 * calculates pro-rata token distributions for a given pool size, and exports
 * a ready-to-upload `address,amount` CSV file formatted specifically for PulseDrop.
 *
 * Usage:
 *   npx tsx scripts/export-airdrop-csv.ts [poolSize] [outputPath] [minPoints]
 *
 * Example:
 *   npx tsx scripts/export-airdrop-csv.ts 100000 airdrop_distribution.csv 10
 */

// Simple .env.local loader if not loaded by runner
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

async function main() {
  loadEnvLocal();

  const args = process.argv.slice(2);
  const poolSize = Number(args[0]) || 100_000;
  const outputPath = args[1] || path.resolve(process.cwd(), `pulsedrop_snapshot_${Date.now()}.csv`);
  const minPoints = Number(args[2]) || 1;

  console.log("==========================================================");
  console.log("⚡ ETNVerse — PulseDrop Airdrop Snapshot Generator");
  console.log("==========================================================");
  console.log(`• Airdrop Pool Size: ${poolSize.toLocaleString()} Tokens`);
  console.log(`• Minimum Points Threshold: ${minPoints}`);
  console.log(`• Target Output File: ${outputPath}`);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    console.log("Please define them in .env.local or your environment.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  console.log("Connecting to Supabase...");
  const { data, error } = await supabase
    .from("verse_users")
    .select("wallet_address, total_points, swap_count, drop_batch_count, active_days_streak")
    .gte("total_points", minPoints)
    .order("total_points", { ascending: false });

  if (error) {
    console.error("❌ Database query failed:", error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log("⚠️ No eligible users found matching the points criteria.");
    process.exit(0);
  }

  console.log(`✓ Fetched ${data.length} eligible participants.`);

  const totalPointsSum = data.reduce(
    (acc, row) => acc + (Number(row.total_points) || 0),
    0
  );

  console.log(`• Cumulative VersePoints: ${totalPointsSum.toLocaleString()}`);

  const lines = ["address,amount"];
  let totalDistributed = 0;

  for (const user of data) {
    const pts = Number(user.total_points) || 0;
    const share = totalPointsSum > 0 ? (pts / totalPointsSum) * poolSize : 0;
    const roundedAmount = Number(share.toFixed(4));
    totalDistributed += roundedAmount;

    let validAddress = user.wallet_address;
    try {
      validAddress = getAddress(user.wallet_address);
    } catch {
      // Keep original
    }

    lines.push(`${validAddress},${roundedAmount}`);
  }

  fs.writeFileSync(outputPath, lines.join("\n"), "utf-8");

  console.log("==========================================================");
  console.log(`✅ Snapshot successfully created: ${outputPath}`);
  console.log(`• Total Recipients: ${data.length}`);
  console.log(`• Total Tokens Allocated: ${totalDistributed.toFixed(4)}`);
  console.log(`• Top Recipient Share: ${lines[1].split(",")[1]} Tokens`);
  console.log("==========================================================");
  console.log("🚀 Next step: Drag and drop this CSV directly into PulseDrop (/multi-sender)");
  console.log("to disburse the batch airdrop in a single on-chain transaction!");
}

main().catch((err) => {
  console.error("Fatal export error:", err);
  process.exit(1);
});
