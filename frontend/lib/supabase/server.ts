import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface VerseUser {
  wallet_address: string;
  first_seen_at: string;
  last_active_at: string;
  total_points: number;
  swap_count: number;
  swap_volume_etn: number;
  drop_batch_count: number;
  drop_recipients_total: number;
  revoke_count: number;
  active_days_streak: number;
  is_premium: boolean;
}

export interface VerseActivity {
  id: string;
  wallet_address: string;
  action_type:
    | "PULSEDROP_BATCH"
    | "PULSESWAP_TRADE"
    | "REVOKE_APPROVAL"
    | "PORTFOLIO_SCAN"
    | "DAILY_CHECKIN";
  tx_hash: string | null;
  points_awarded: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface VerseWatchlistEntry {
  wallet_address: string;
  watched_address: string;
  label: string;
  created_at: string;
}

export interface SupabaseConfig {
  url: string;
  key: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return { url, key };
}

let cachedClient: SupabaseClient | null = null;

/**
 * Returns the server-side Supabase client using the service role key or anon key.
 * Returns null if Supabase is not configured.
 */
export function getSupabaseServerClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config) return null;

  if (cachedClient) return cachedClient;

  cachedClient = createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        "x-application-name": "etnverse-suite",
      },
    },
  });

  return cachedClient;
}

/**
 * Check whether Supabase is configured in the environment.
 */
export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

// ----------------------------------------------------------------------------
// In-Memory Fallback Store (Used when Supabase credentials are not configured)
// Guarantees zero crashing in dev/offline mode.
// ----------------------------------------------------------------------------

class InMemoryVerseStore {
  private users = new Map<string, VerseUser>();
  private activities: VerseActivity[] = [];
  private watchlists = new Map<string, VerseWatchlistEntry[]>(); // keyed by wallet_address
  private txHashes = new Set<string>();

  getUser(wallet: string): VerseUser | null {
    return this.users.get(wallet.toLowerCase()) ?? null;
  }

  getOrCreateUser(wallet: string): VerseUser {
    const key = wallet.toLowerCase();
    const existing = this.users.get(key);
    if (existing) return existing;

    const now = new Date().toISOString();
    const newUser: VerseUser = {
      wallet_address: key,
      first_seen_at: now,
      last_active_at: now,
      total_points: 0,
      swap_count: 0,
      swap_volume_etn: 0,
      drop_batch_count: 0,
      drop_recipients_total: 0,
      revoke_count: 0,
      active_days_streak: 1,
      is_premium: false,
    };
    this.users.set(key, newUser);
    return newUser;
  }

  hasTxHash(txHash: string): boolean {
    return this.txHashes.has(txHash.toLowerCase());
  }

  recordActivity(
    wallet: string,
    actionType: VerseActivity["action_type"],
    points: number,
    txHash: string | null,
    metadata: Record<string, unknown>
  ): { user: VerseUser; activity: VerseActivity } {
    const key = wallet.toLowerCase();
    const user = this.getOrCreateUser(key);
    const now = new Date().toISOString();

    if (txHash) {
      this.txHashes.add(txHash.toLowerCase());
    }

    user.total_points += points;
    user.last_active_at = now;

    if (actionType === "PULSESWAP_TRADE") {
      user.swap_count += 1;
      const vol = Number(metadata.volumeEtn) || 0;
      user.swap_volume_etn += vol;
    } else if (actionType === "PULSEDROP_BATCH") {
      user.drop_batch_count += 1;
      const recipients = Number(metadata.recipientCount) || 1;
      user.drop_recipients_total += recipients;
    } else if (actionType === "REVOKE_APPROVAL") {
      user.revoke_count += 1;
    } else if (actionType === "DAILY_CHECKIN") {
      user.active_days_streak += 1;
    }

    const activity: VerseActivity = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      wallet_address: key,
      action_type: actionType,
      tx_hash: txHash ? txHash.toLowerCase() : null,
      points_awarded: points,
      metadata,
      created_at: now,
    };

    this.activities.unshift(activity);
    return { user, activity };
  }

  getLastCheckin(wallet: string): VerseActivity | null {
    const key = wallet.toLowerCase();
    return (
      this.activities.find(
        (a) => a.wallet_address === key && a.action_type === "DAILY_CHECKIN"
      ) ?? null
    );
  }

  getLeaderboard(limit = 50): VerseUser[] {
    return Array.from(this.users.values())
      .sort((a, b) => b.total_points - a.total_points)
      .slice(0, limit);
  }

  getWatchlist(wallet: string): VerseWatchlistEntry[] {
    return this.watchlists.get(wallet.toLowerCase()) ?? [];
  }

  syncWatchlist(
    wallet: string,
    items: Array<{ address: string; label: string }>
  ): VerseWatchlistEntry[] {
    const key = wallet.toLowerCase();
    const now = new Date().toISOString();
    const entries: VerseWatchlistEntry[] = items.map((i) => ({
      wallet_address: key,
      watched_address: i.address.toLowerCase(),
      label: i.label.slice(0, 32),
      created_at: now,
    }));
    this.watchlists.set(key, entries);
    return entries;
  }
}

export const inMemoryVerseStore = new InMemoryVerseStore();
