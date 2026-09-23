# ETN Pulse

Network monitoring core of a modular Web3 utility hub for the **Electroneum Smart Chain (ETN-SC)**,
split into two independently deployable applications plus a standalone Foundry project for its
on-chain utilities:

| Workspace | What it is | Stack |
| --- | --- | --- |
| `frontend/` | Interactive dashboard and the public `/api/pulse` telemetry endpoint | Next.js 15 (App Router), TypeScript, Tailwind CSS, viem, Recharts |
| `backend/` | Headless worker that polls the RPCs every 5s and logs history to Supabase | Node.js, TypeScript, viem, `@supabase/supabase-js`, tsx |
| `supabase/` | Shared SQL migrations (`schema.sql`) — kept at the root | PostgreSQL / Supabase |
| `contracts/` | Foundry project for `PulseMultiSender.sol`, the batch-sender contract | Solidity 0.8.24, Foundry, OpenZeppelin |

The two apps share no code on purpose: the worker keeps collecting history while the dashboard is
down or being redeployed, each can be scaled and restarted on its own schedule, and neither can
break the other's build.

## Repository layout

```
frontend/                 Next.js dashboard
  app/                    routes, layout, globals.css, /api/pulse, /api/analytics
  app/multi-sender/       batch-sender page
  components/             hero, KPI cards, leaderboard, uptime, gas heatmap, sparkline
  components/multi-sender/  recipient input, validation panel, summary cards, send panel, tx modal
  hooks/                  usePulse + useAnalytics polling loops, multi-sender wallet flow
  lib/                    ETN config, viem client factory, engine, store, analytics, formatting
  lib/multi-sender/       contract ABI, recipient parser, viem contract helpers
  next.config.mjs  postcss.config.mjs  tailwind.config.ts  tsconfig.json
  .env.example            optional Supabase read credentials
backend/                  headless monitoring worker
  src/index.ts            entry point: HTTP server + polling loop
  src/server.ts           node:http web service (/, /health)
  src/poller.ts           the polling loop itself
  src/rpc.ts              viem clients, latency ping, block reads
  src/wss.ts              newHeads subscription + stream-vs-poll head start
  src/drift.ts            pure drift/synchronisation validation
  src/supabase.ts         headless Supabase client + row mapping
  src/notify.ts           Discord webhook alerting
  src/config.ts  src/etn.ts  src/types.ts
  .env.example            Supabase + Discord credentials
supabase/schema.sql       database migration (run first)
supabase/02_analytics_views.sql  analytics views (run after schema.sql)
supabase/03_latency_series.sql   latency chart buckets (run after the views)
supabase/04_wss_latency.sql      adds pulse_samples.wss_latency (run last)
contracts/                Foundry project for the on-chain modules
  src/PulseMultiSender.sol        batch sender (native + ERC-20)
  script/DeployPulseMultiSender.s.sol  deployment script
  test/PulseMultiSender.t.sol     forge test suite
  foundry.toml  remappings.txt
render.yaml               Render Blueprint: the backend as a free-tier web service
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
- **Latency history** — Recharts chart bound to the selected endpoint (a single line, never two
  overlapping ones) with a `24h` / `7d` / `30d` timeframe toolbar, min/avg/max/current stats,
  amber markers on degraded buckets and gaps where nothing answered.
- **24h uptime** — trailing-window reliability per endpoint, next to the leaderboard: green at or
  above the 99% threshold, amber below it, with probe counts, average/p95 latency and the last
  failure.
- **Gas heatmap** — a 7x24 Tailwind grid of average gas price by UTC day and hour, shaded green
  (cheapest) through to red (dearest), with a hover tooltip carrying the exact Gwei average, min,
  max and sample count.

It polls `/api/pulse` every 5 seconds. Requests are bounded end to end: a 3 s timeout per RPC probe,
1.5 s for the follow-up block/gas read, a 5 s server deadline and an 8 s client timeout, so a poll
always resolves into a valid snapshot instead of hanging on "connecting".

The two analytics cards read `/api/analytics` through `useAnalytics`, on a 60 s cadence (15 s after
a failure). They are independent of the pulse: a missing view degrades only those cards, and each
falls back to an explanatory empty state rather than a spinner.

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
4. compares the `newHeads` stream against the HTTP probe (see below),
5. persists the sample to Supabase with a headless (service-role, no-session) client, and
6. posts a Discord alert when a node changes state.

```bash
cd backend
cp .env.example .env      # fill in Supabase credentials
npm run dev               # dev server + loop (tsx watch)
npm run build && npm start # production: node dist/index.js
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
| `WSS_ENABLED` | no | `false` turns the `newHeads` stream off entirely (default `true`) |
| `WSS_RPC_URL` | no | stream endpoint; defaults to `wss://rpc.electroneum.com` |
| `POLL_INTERVAL_MS`, `DRIFT_THRESHOLD`, `LATENCY_THRESHOLD_MS`, `RPC_REQUEST_TIMEOUT_MS` | no | tuning overrides |
| `PORT` | no | HTTP port; injected by the host, defaults to `10000` |

Without Supabase credentials the worker warns once and logs samples to stdout instead of failing to
start, so it can be run locally with zero configuration.

### WebSocket stream (`newHeads`)

Alongside the HTTP poll, the worker holds one `eth_subscribe`/`newHeads` subscription for the life
of the process (`backend/src/wss.ts`) and records how much earlier the pushed block arrived than the
HTTP read of the same height:

```text
[pulse] #412 block=15925999 gas=1.000000007 Gwei in 216ms | Official 142ms healthy block=15925999 drift=+0 | Ankr 45ms healthy block=15925999 drift=+0
[wss] block 15925999 - stream 1180ms ahead of the HTTP probe
```

Both sides are *first sightings of the same height* — the subscription's own record, and the
earliest probe that reported it — so the difference is a transport comparison rather than a
block-time one. A gap wider than one poll interval is reported as unmeasurable (`null`) instead of
quoted: past that distance the number says more about when the chain produced the block than about
which transport is faster. A negative value means the HTTP read won, which is normal for a cycle or
two after a reconnect.

The stream is an enhancement, never a dependency:

- it is started once and shared across cycles, and skipping it (`WSS_ENABLED=false`, `npm run once`)
  costs only the `wss_latency` column;
- every failure is contained — a bad URL, a refused socket or a malformed head degrades to
  `wssLatency: null` and the HTTP cycle is unaffected;
- viem reconnects a dropped socket and replays the subscription on its own, but its retry budget
  (5 attempts, 2 s apart) can be spent, after which the subscription dies silently. The loop
  therefore checks the stream each cycle and re-subscribes after `WSS_STALE_AFTER_MS` (30 s) of
  silence, which also rate-limits a failed attempt to one per stall window;
- the 30 s constant is set from ETN's ~5 s block time (six missed blocks) and lives in
  `backend/src/etn.ts`.

`/health` reports the stream beside the HTTP probes, which is what makes "the stream is down"
distinguishable from "the network is down":

```json
{ "wssHeadStartMs": 1180,
  "wss": { "url": "wss://rpc.electroneum.com", "connected": true, "lastBlockNumber": 15925999,
           "lastBlockAt": "2026-09-22T16:45:53.371Z", "blocksSeen": 8640, "restarts": 0,
           "lastError": null } }
```

### Running as a web service (Render, Koyeb and friends)

The worker also serves HTTP, because PaaS platforms deploy a *web* service and health-check the
port they inject. `src/index.ts` binds `process.env.PORT ?? 10000` on `0.0.0.0` **before** starting
the loop, so a health check arriving during the first (slow, cold) RPC cycle cannot fail a healthy
deploy. The two run in the same process: the loop is I/O bound and the server is a few kilobytes of
routing, so a second instance would buy nothing.

| Route | Response |
| --- | --- |
| `GET /` | `200 {"status":"ETN Pulse Backend Active"}` — the liveness payload |
| `GET /health` | `200` plus uptime, cycle count, last cycle duration/error, tip block, gas price, the last probe per endpoint and the `newHeads` stream state |
| anything else | `404`; non-`GET`/`HEAD` returns `405` |

`HEAD` is supported on both routes. On `SIGTERM` the loop stops after the cycle in flight and the
server stops accepting connections, so a platform redeploy does not leave a half-serving process.

No port or host configuration is needed — `PORT` comes from the platform, and `.env` values are set
as service secrets/environment variables.

#### Render

`render.yaml` at the repository root is a Blueprint for the free instance type: connect the repo and
Render creates the service, with the secrets prompted for on the first deploy. Equivalently, by hand:

| Setting | Value |
| --- | --- |
| Service type | Web Service (a *background worker* is not available on the free instance type) |
| Root Directory | `backend` — without it Render builds the repo root, which only delegates to the workspaces |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` (`/` also works) |
| Environment | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optionally `DISCORD_WEBHOOK_URL` |

**Free-tier caveat:** Render spins a free web service down after a period without inbound traffic
(around 15 minutes) and wakes it on the next request, so the 5 s loop pauses while it sleeps and the
Supabase history has gaps for those windows. Nothing is lost on the restart — every sample already
written is in Postgres — and the usual mitigation is an external uptime check pointed at `/health`
every 5-10 minutes to keep the instance awake. The startup log prints the public URL
(`RENDER_EXTERNAL_URL`, injected by Render) as the address to point that check at.

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

Run `supabase/02_analytics_views.sql` after `schema.sql`. It adds two read-only aggregate views over
`pulse_samples`, both created with `security_invoker = on` so they honour the caller's row level
security rather than silently bypassing it:

- `pulse_uptime_24h` — per-RPC uptime over the trailing 24 hours. A probe counts as successful when
  it reported a latency (`latencies->>id`) and as failed when it timed out or went offline. Also
  exposes average / p95 / min / max latency, the degraded-probe count and the last failure time.
- `pulse_gas_heatmap` — average, min, max and standard deviation of `gas_price_gwei` per
  (day of week, hour) bucket, for finding the cheapest windows to transact.

RPC ids are discovered from the JSONB keys, so a third endpoint appears in both views automatically.
Buckets are UTC; changing the timezone in the SQL also means updating the `timezone` field the
analytics route reports.

Run `supabase/04_wss_latency.sql` last. It adds one nullable column, `wss_latency`, holding the
stream's head start in milliseconds for that sample (`httpObservedAt - wssObservedAt` for the same
height). It is `NULL` whenever the comparison is not available: the stream is disabled or down, the
HTTP nodes never reported the height the stream saw, or the two sightings are more than one poll
interval apart.

Run `supabase/03_latency_series.sql` after the views. It adds
`pulse_latency_series(range_key text default '24h')`, the downsampling function behind
`GET /api/analytics?range=`. The dashboard asks for a *window*, never a row count, so the bucket
width is chosen in Postgres instead of fetching 5 s rows and thinning them in the browser:

| `range` | Window | Bucket | Points per RPC |
| --- | --- | --- | --- |
| `24h` (default) | 24 hours | 5 minutes | 288 |
| `7d` | 7 days | 1 hour | 168 |
| `30d` | 30 days | 4 hours | 180 |

Buckets are epoch-aligned, so the 5 min / 1 h / 4 h widths all land on `:00` boundaries. Averages
ignore failed probes (a timeout stores `null`, not `0`), so a bucket with no successful probe
aggregates to `null` and the chart draws a gap rather than a misleading dip to zero. A malformed
latency value counts as a failed probe instead of breaking the series, and an unrecognised `range`
falls back to 24h.

### Analytics contract

`GET /api/analytics?range=24h|7d|30d` reads both views plus the latency series with the anon key and
returns them in one envelope. The three queries run independently, so one broken view degrades the
payload into `errors` instead of blanking it, and each query is bounded by an 8 s timeout. `range`
only affects `latencyHistory` — the uptime and heatmap views are window-independent.

```json
{
  "ok": true,
  "configured": true,
  "checkedAt": "2026-09-19T11:00:40.630Z",
  "chainId": 52014,
  "timezone": "UTC",
  "uptime": [
    { "rpcId": "official", "uptimePct": 99.83, "totalSamples": 17280, "successfulSamples": 17250,
      "failedSamples": 30, "p95LatencyMs": 310, "degradedSamples": 42,
      "lastFailureAt": "2026-09-19T10:12:00.000Z" }
  ],
  "gasHeatmap": [
    { "dayOfWeek": 1, "dayName": "Monday", "hourOfDay": 14, "label": "Monday 14:00",
      "sampleCount": 720, "avgGasPriceGwei": "0.0012" }
  ],
  "latencyHistory": {
    "range": "24h",
    "bucketSeconds": 300,
    "points": [
      { "t": 1787000400000,
        "values": { "official": { "avgMs": 122.4, "minMs": 98, "maxMs": 210, "samples": 60,
                                  "successfulSamples": 59, "degradedSamples": 0 } } }
    ]
  },
  "extremes": { "cheapest": null, "priciest": null },
  "errors": []
}
```

`200` when every query succeeds, `503` when a query fails (the missing object is named in `errors`
with a pointer to the migration that creates it — `supabase/02_analytics_views.sql` for the views,
`supabase/03_latency_series.sql` for the series function), and `200` with `"configured": false` when
no Supabase credentials are set at all. A failed read keeps the last good payload, so the chart
falls back to the previous window instead of going blank.

The chart is bound to `selectedEndpoint`: `official` or `ankr` plot that node's own bucket averages,
`fastest` plots the lowest bucket average across the nodes that answered (naming the winner in the
tooltip). Switching endpoints re-renders from data already in memory — no refetch — while switching
timeframe re-polls and covers the chart area alone with a skeleton, leaving the uptime and heatmap
panels interactive.

## Multi-Sender module

`/multi-sender` is the hub's first write-path module: a batch sender in the spirit of CoinTool and
Multisender.app. It pairs a Foundry contract at `contracts/src/PulseMultiSender.sol` with a
browser-side validation dashboard, so a malformed list never reaches the network.

### Networks

The module is multi-chain. Both Electroneum networks are described in `frontend/lib/etn.ts` and
projected into viem chains in `frontend/lib/etn-chain.ts`:

| Network | Chain id | Native | Explorer |
| --- | --- | --- | --- |
| Electroneum Mainnet | `52014` (`0xcb2e`) | ETN | https://blockexplorer.electroneum.com |
| Electroneum Testnet | `5201420` (`0x4f5e0c`) | ETN | https://testnet-blockexplorer.electroneum.com |

The deployment address is resolved from the connected wallet's chain rather than from one global
constant, because an address is only meaningful on the chain it was deployed to:

```bash
NEXT_PUBLIC_MULTISENDER_MAINNET=0x...    # used when chainId === 52014
NEXT_PUBLIC_MULTISENDER_TESTNET=0x...    # used when chainId === 5201420
```

`NEXT_PUBLIC_MULTISENDER_ADDRESS` is still read as the mainnet value, so deployments made before
testnet support keep working. A network with no address configured still parses and validates lists
and reports the expected totals - it just cannot send, and says why. On Vercel both variables are
build-time: set them in the project's environment settings and redeploy, or the page ships with
sending disabled.

Reads are chain-scoped too. Balances, token metadata and allowances come from the connected chain's
RPC, and an unsupported chain yields no client at all rather than quietly falling back to mainnet -
a mainnet balance shown beside a testnet wallet is the kind of stale number that gets a batch sent.

Connecting never moves the wallet. On an unsupported network the Send button is replaced by one
*Switch to ...* button per supported network, because the app cannot know whether a given batch is a
real airdrop or a rehearsal and guessing wrong means sending real ETN. For the same reason the active
network appears in the header badge and in the send panel, a testnet run raises an amber banner, and
transaction links follow the chain the batch was signed on. The testnet RPC defaults to
`https://rpc-testnet.electroneum.com`; override it with `NEXT_PUBLIC_ETN_TESTNET_RPC` if it moves.

### Contract

`PulseMultiSender` exposes two entry points:

| Function | Purpose |
| --- | --- |
| `batchSendNative(address[] recipients, uint256[] amounts) payable` | sends ETN to every recipient |
| `batchSendERC20(address token, address[] recipients, uint256[] amounts) payable` | pushes an ERC-20 with `SafeERC20` |

Design notes:

- `ReentrancyGuard` on both paths and `SafeERC20.safeTransferFrom` for tokens, so a malicious or
  non-standard token can neither re-enter nor silently return `false`.
- A batch is validated before any value moves: equal array lengths, non-empty, at most
  `MAX_BATCH_SIZE` (200) recipients, no zero address and no zero amount. One bad row reverts the
  whole batch, so a partial send is impossible by construction.
- `batchSendNative` sums into a running total and then requires `msg.value` to match it exactly, so
  stray wei is rejected rather than trapped in the contract.
- Both functions emit one event per batch (`NativeBatchSent` / `TokenBatchSent`) instead of one per
  recipient — cheaper to emit, and every recipient is already in calldata for indexers.

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2
forge install foundry-rs/forge-std
forge test -vv                        # 10 tests
forge script script/DeployPulseMultiSender.s.sol --rpc-url electroneum --broadcast
forge script script/DeployPulseMultiSender.s.sol --rpc-url electroneum-testnet --broadcast
```

The script reads `PRIVATE_KEY` from `contracts/.env` and prints the deployed address; set that as the
matching `NEXT_PUBLIC_MULTISENDER_MAINNET` / `NEXT_PUBLIC_MULTISENDER_TESTNET` (see
`frontend/.env.example`). Both networks are listed under `[rpc_endpoints]` in `contracts/foundry.toml`,
so neither URL has to be remembered.

### Frontend

- **Input** — drag-and-drop CSV upload (2MB cap) or a paste area, both feeding one parser. A sample
  list with a deliberately invalid row is one click away.
- **Validation dashboard** — every row is parsed in the browser and problems surface immediately.
  Malformed or bad-checksum addresses are red; missing, zero or over-precise amounts are red;
  duplicate recipients and self-transfers are amber warnings that do not block a send.
- **Summary cards** — total addresses, total to send and the connected wallet's balance, with a
  shortfall hint when the batch exceeds it. ERC-20 mode is driven by the token address, and an
  allowance below the batch total triggers an exact-amount approval first.
- **Send flow** — viem `writeContract` behind a status modal walking through *Approving* (tokens
  only), *Awaiting signature*, *Broadcasting* and *Confirmed*, then a confetti burst and a
  block-explorer link. Batches beyond `MAX_BATCH_SIZE` are chunked client-side, and the modal names
  the chunk in flight.

The parser is deliberately strict about ambiguity: a bare number is an amount, `1,5` is two columns
rather than a decimal comma, and an ERC-20's own `decimals()` caps the accepted precision.

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
Bridge, Portfolio); **Multi-Sender** is the first to ship. Each new module can reuse the same glass
shell, polling hook and `/api/*` conventions, the worker can grow additional pollers alongside
`src/poller.ts`, and `contracts/` is where future on-chain modules go — the Foundry project is
already configured for the ETN RPCs and the Blockscout verifier.
