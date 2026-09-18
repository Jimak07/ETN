# ETN Pulse

Network monitoring core of a modular Web3 utility hub for the **Electroneum Smart Chain (ETN-SC)**.
Built with Next.js (App Router), TypeScript, Tailwind CSS, viem and Recharts.

## What ships in this foundation

- **Monitoring engine** (`app/api/pulse/route.ts`) — probes every monitored RPC concurrently with
  `Promise.allSettled` (latency ping + real `eth_blockNumber` round trip), computes the highest block
  on the network, validates each node's sync drift, reads gas price through viem, records the sample
  and returns a rolling history window.
- **Dashboard** (`app/page.tsx`) — hero with animated liveness pulse and an *Add ETN to Wallet*
  button (EIP-3085 `wallet_addEthereumChain`), KPI cards with skeleton loaders, an RPC leaderboard
  and a Recharts latency sparkline. Polls `/api/pulse` every 5 seconds.
- **Persistence boundary** (`lib/pulse-store.ts`) — a `PulseStore` interface with an in-memory ring
  buffer implementation and a Supabase (PostgREST) implementation selected by env vars.

## Network configuration

| Item | Value |
| --- | --- |
| Chain ID | `52014` (`0xcb2e`) |
| Native currency | `ETN`, 18 decimals |
| Explorer | https://blockexplorer.electroneum.com |
| Explorer API | https://blockexplorer.electroneum.com/api |
| Monitored RPCs | `https://rpc.electroneum.com` (Official), `https://rpc.ankr.com/electroneum` (Ankr) |

Source of truth: `lib/etn.ts` (dependency-free constants) and `lib/etn-chain.ts` (viem `defineChain`).

Requests are bounded end to end: a 3 s timeout per RPC probe, 1.5 s for the follow-up block/gas read,
a 5 s server deadline and an 8 s client timeout, so `GET /api/pulse` always answers with a valid
snapshot shape instead of hanging.

### Troubleshooting

**The page renders unstyled.** Tailwind compiles correctly in both dev and prod. An unstyled page
usually means the browser is talking to a *different* server than the one you started — classically a
leftover `next start` still holding port 3000, whose hashed CSS asset was deleted when a `next dev`
run rewrote `.next`. Stop the stray process, run `npm run clean`, and open the URL the dev server
actually prints.

**The dashboard sits on "Contacting the monitoring engine".** That banner appears only until the
first response lands and shows the elapsed seconds plus a *Retry now* button. In dev the first
`/api/pulse` request also compiles the route (viem is a large dependency), which can take several
seconds; afterwards polls are fast. If it persists, check the `error` message the banner shows.

**Dev requests are slow and the console logs constant recompiles.** The project sits inside a
OneDrive-synced `Documents` folder, so filesystem events keep invalidating the dev watcher. `.next`
is excluded from watching in `next.config.mjs`; for best results move the project outside OneDrive.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run typecheck
npm run build
npm run clean    # delete .next when switching between dev and prod builds
```

Optional historical logging — copy `.env.example` to `.env.local`, fill in Supabase credentials and
run `supabase/schema.sql`:

```bash
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_PULSE_TABLE=pulse_samples
```

Without those variables the engine keeps the last `HISTORY_LIMIT` samples in memory, so the
dashboard works with zero configuration.

## API contract

`GET /api/pulse` → `200`

```json
{
  "ok": true,
  "checkedAt": "2026-09-18T10:00:00.000Z",
  "durationMs": 184,
  "highestNetworkBlock": 15806500,
  "gasPriceGwei": "0.001",
  "baseFeeGwei": "0.001",
  "blockTimestamp": 1787000000,
  "driftThreshold": 3,
  "fastestRpcId": "official",
  "outOfSyncRpcIds": [],
  "rpcs": [
    {
      "id": "official",
      "name": "Official",
      "displayName": "Electroneum Official",
      "operator": "Electroneum",
      "role": "official",
      "url": "https://rpc.electroneum.com",
      "latencyMs": 142,
      "blockNumber": 15806500,
      "drift": 0,
      "status": "healthy"
    },
    {
      "id": "ankr",
      "name": "Ankr",
      "displayName": "Ankr Public",
      "operator": "Ankr",
      "role": "public",
      "url": "https://rpc.ankr.com/electroneum",
      "latencyMs": 45,
      "blockNumber": 15806490,
      "drift": 10,
      "status": "degraded",
      "error": "Out of sync by 10 blocks"
    }
  ],
  "history": [{ "t": 1787000000000, "highestNetworkBlock": 15806500, "gasPriceGwei": "0.001", "latencies": { "official": 142, "ankr": 45 }, "statuses": { "official": "healthy", "ankr": "degraded" }, "drifts": { "official": 0, "ankr": 10 } }]
}
```

The endpoint is `no-store`, CORS-open (read-only public telemetry) and always answers with the same
envelope: a `503` carries `{ ok: false, error, detail }` when the engine itself fails, while a fully
unreachable RPC set still returns `200` with `ok: false` and per-endpoint `status: "offline"`.

Status mapping (`lib/etn.ts`): `healthy` < 500 ms, `degraded` >= 500 ms, `offline` = transport error
or timeout. `latencyMs` / `blockNumber` / `drift` are `null` for offline nodes.

Every number that originates as a `bigint` is converted before it reaches the wire: block heights
through `toSafeNumber()` (safe-integer guard) and Gwei amounts through `toGweiString()`, which is why
`gasPriceGwei` is a precision-safe decimal string (`"0.001"`) rather than a float.

### Block drift detection

1. All endpoints are probed in parallel with `Promise.allSettled`, so one dead node never rejects the
   batch or hangs the request.
2. `highestNetworkBlock` is the maximum `blockNumber` across the nodes that answered.
3. Each node's `drift = highestNetworkBlock - blockNumber` (`null` while offline).
4. `drift > DRIFT_THRESHOLD` (3) forcefully overrides the node's status to `degraded` and sets
   `error: "Out of sync by N blocks"` — even if its latency is well under 500 ms. Lagging ids are
   also listed in `outOfSyncRpcIds`.

## Project layout

```
app/
  api/pulse/route.ts   monitoring engine endpoint
  layout.tsx           shell, ambient background, metadata
  page.tsx             dashboard (client component)
components/            hero, KPI cards, leaderboard, sparkline, glass primitives
hooks/                 usePulse polling loop, animated numbers, relative time
lib/                   etn config, viem client factory, engine, store, formatting
supabase/schema.sql    historical logging table
```

## Roadmap

`components/module-hub.tsx` reserves the slots for the next hub modules (Swap, Stake, Bridge,
Portfolio). Each new module can reuse the same glass shell, polling hook and `/api/*` conventions.
