# ETN Pulse

Network monitoring core of a modular Web3 utility hub for the **Electroneum Smart Chain (ETN-SC)**,
split into two independently deployable applications:

| Workspace | What it is | Stack |
| --- | --- | --- |
| `frontend/` | Interactive dashboard and the public `/api/pulse` telemetry endpoint | Next.js 15 (App Router), TypeScript, Tailwind CSS, viem, Recharts |
| `backend/` | Headless worker that polls the RPCs every 5s and logs history to Supabase | Node.js, TypeScript, viem, `@supabase/supabase-js`, tsx |
| `supabase/` | Shared SQL migrations (`schema.sql`) — kept at the root | PostgreSQL / Supabase |

The two apps share no code on purpose: the worker keeps collecting history while the dashboard is
down or being redeployed, each can be scaled and restarted on its own schedule, and neither can
break the other's build.

## Repository layout

```
frontend/                 Next.js dashboard
  app/                    routes, layout, globals.css, /api/pulse
  components/             hero, KPI cards, leaderboard, sparkline, glass primitives
  hooks/                  usePulse polling loop, animated numbers, relative time
  lib/                    ETN config, viem client factory, engine, store, formatting
  next.config.mjs  postcss.config.mjs  tailwind.config.ts  tsconfig.json
  .env.example            optional Supabase read credentials
backend/                  headless monitoring worker
  src/poller.ts           entry point: the polling loop
  src/rpc.ts              viem clients, latency ping, block reads
  src/drift.ts            pure drift/synchronisation validation
  src/supabase.ts         headless Supabase client + row mapping
  src/notify.ts           Discord webhook alerting
  src/config.ts  src/etn.ts  src/types.ts
  .env.example            Supabase + Discord credentials
supabase/schema.sql       database migration (run once)
package.json              convenience scripts that delegate to both workspaces
```

## Quick start

```bash
npm run install:all        # installs frontend/ and backend/ dependencies

npm run dev:frontend       # http://localhost:3000
npm run dev:backend        # worker, reloads on change (tsx watch)
```

Each workspace also works standalone:

```bash
cd frontend && npm run dev      # or: build, start, typecheck
cd backend  && npm run dev      # or: build, start, once, typecheck
```

Root scripts are thin `--prefix` delegates, so they always operate on the workspace you expect:

| Script | Effect |
| --- | --- |
| `npm run install:all` | installs both workspaces |
| `npm run dev:frontend` / `build:frontend` / `start:frontend` | dashboard |
| `npm run dev:backend` / `build:backend` / `start:backend` | worker |
| `npm run once:backend` | a single polling cycle, then exit (cron / smoke test) |
| `npm run typecheck` | type-checks both workspaces |

## Network configuration

| Item | Value |
| --- | --- |
| Chain ID | `52014` (`0xcb2e`) |
| Native currency | `ETN`, 18 decimals |
| Explorer | https://blockexplorer.electroneum.com |
| Explorer API | https://blockexplorer.electroneum.com/api |
| Monitored RPCs | `https://rpc.electroneum.com` (Official), `https://rpc.ankr.com/electroneum` (Ankr) |

The constants are mirrored in `frontend/lib/etn.ts` and `backend/src/etn.ts` (the viem
`defineChain` definitions live in `frontend/lib/etn-chain.ts` and `backend/src/rpc.ts`).

## Frontend dashboard

- **Hero** — animated liveness pulse plus an *Add ETN to Wallet* button (EIP-3085
  `wallet_addEthereumChain`).
- **KPI cards** — latest block, current gas fee (Gwei) and fastest RPC latency, with skeleton
  loaders until the first response lands.
- **RPC leaderboard** — status, latency, block height and drift for each endpoint.
- **Sparkline** — Recharts latency history for the selected RPC.

It polls `/api/pulse` every 5 seconds. Requests are bounded end to end: a 3 s timeout per RPC probe,
1.5 s for the follow-up block/gas read, a 5 s server deadline and an 8 s client timeout, so a poll
always resolves into a valid snapshot instead of hanging on "connecting".

### API contract

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

Status mapping: `healthy` < 500 ms, `degraded` >= 500 ms, `offline` = transport error or timeout.
`latencyMs` / `blockNumber` / `drift` are `null` for offline nodes.

Every number that originates as a `bigint` is converted before it reaches the wire: block heights
through a safe-integer guard and Gwei amounts through viem's `formatGwei`, which is why
`gasPriceGwei` is a precision-safe decimal string (`"1.000000007"`) rather than a float.

### Block drift detection

1. All endpoints are probed in parallel with `Promise.allSettled`, so one dead node never rejects the
   batch or hangs the request.
2. `highestNetworkBlock` is the maximum `blockNumber` across the nodes that answered.
3. Each node's `drift = highestNetworkBlock - blockNumber` (`null` while offline).
4. `drift > DRIFT_THRESHOLD` (3) forcefully overrides the node's status to `degraded` and sets
   `error: "Out of sync by N blocks"` — even if its latency is well under 500 ms. Lagging ids are
   also listed in `outOfSyncRpcIds`.

## Backend worker

An independent loop that runs every `POLL_INTERVAL_MS` (default 5 s):

1. probes both RPCs concurrently (latency ping + `eth_blockNumber`) with `Promise.allSettled`,
2. validates sync drift against the highest observed block,
3. reads the gas price from the healthiest node,
4. persists the sample to Supabase with a headless (service-role, no-session) client, and
5. posts a Discord alert when a node changes state.

```bash
cd backend
cp .env.example .env      # fill in Supabase credentials
npm run dev               # or: npm run build && npm start
npm run once              # one cycle, then exit
```

Example cycle log:

```text
[pulse] #1 block=15925999 gas=1.000000007 Gwei in 2164ms | Official 1745ms degraded block=15925999 drift=+0 | Ankr 1144ms degraded block=15925999 drift=+0
```

Secrets (`backend/.env`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | yes | project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | insert access — server-side only, never expose it to the browser |
| `SUPABASE_PULSE_TABLE` | no | defaults to `pulse_samples` |
| `DISCORD_WEBHOOK_URL` | no | transition alerts; omitting it disables alerting |
| `POLL_INTERVAL_MS`, `DRIFT_THRESHOLD`, `LATENCY_THRESHOLD_MS`, `RPC_REQUEST_TIMEOUT_MS` | no | tuning overrides |

Without Supabase credentials the worker warns once and logs samples to stdout instead of failing to
start, so it can be run locally with zero configuration.

Alerts fire on **transitions only** — a node going offline, starting to drift, answering slowly, or
recovering — so a prolonged outage does not page every 5 seconds. A failed cycle is logged and
retried; the loop never exits on a transient error, and `SIGINT`/`SIGTERM` finish the current cycle
before shutting down.

## Database

`supabase/schema.sql` creates `public.pulse_samples` (keyed on `t`, epoch milliseconds, so replayed
samples dedupe) with `highest_network_block`, `gas_price_gwei`, and the `latencies` / `statuses` /
`drifts` JSONB maps. Run it once in the Supabase SQL editor, then set the backend credentials.

The worker writes with `upsert(onConflict: "t", ignoreDuplicates: true)`, which makes a replayed
cycle idempotent instead of raising a primary-key conflict.

The frontend only needs credentials if it should read history directly from Supabase; without them
it keeps the last `HISTORY_LIMIT` samples in memory, so the dashboard works with zero configuration.

## Troubleshooting

**The page renders unstyled.** Tailwind is wired up (`frontend/app/layout.tsx` imports
`./globals.css`, which declares the three `@tailwind` directives, and `frontend/tailwind.config.ts`
scans `app/`, `components/`, `hooks/` and `lib/`). An unstyled page usually means the browser is
talking to a *different* server than the one you started — classically a leftover `next start` still
holding the port, whose hashed CSS asset was deleted when a `next dev` run rewrote `.next`. Stop the
stray process, run `npm run clean --prefix frontend`, and open the URL the dev server prints.

**The dashboard sits on "Contacting the monitoring engine".** That banner appears only until the
first response lands and shows elapsed seconds plus a *Retry now* button. In dev the first
`/api/pulse` request also compiles the route (viem is a large dependency), which can take several
seconds. If it persists, read the `error` message the banner shows — a machine with no outbound
access will report both endpoints as `offline`, which is the engine degrading correctly rather than
hanging.

**Dev requests are slow and the console logs constant recompiles.** The project sits inside a
OneDrive-synced `Documents` folder, so filesystem events keep invalidating the dev watcher. `.next`
is excluded from watching in `frontend/next.config.mjs`; for best results move the project outside
OneDrive.

## Roadmap

`frontend/components/module-hub.tsx` reserves the slots for the next hub modules (Swap, Stake,
Bridge, Portfolio). Each new module can reuse the same glass shell, polling hook and `/api/*`
conventions, and the worker can grow additional pollers alongside `src/poller.ts`.
