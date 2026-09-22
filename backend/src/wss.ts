import { createPublicClient, webSocket } from "viem";

import { WSS_STALE_AFTER_MS } from "./etn.js";
import { describeError, electroneum, toSafeNumber } from "./rpc.js";

/**
 * `newHeads` stream client for the Electroneum Smart Chain.
 *
 * The HTTP poll in `rpc.ts` is the source of truth for latency and drift. This
 * module answers the one question a 5-second poll cannot: how much earlier does
 * a push subscription deliver a block than the next `eth_blockNumber` read?
 *
 * It is kept separate from the probes on purpose. Folding the stream into
 * `probeRpc` would blend two transports into a single number and make the
 * latency column mean something different depending on which one answered.
 *
 * Nothing here may throw into the polling loop: the stream is an enhancement,
 * so an unreachable or silent WebSocket degrades to `wssLatency: null` and the
 * HTTP cycle carries on unchanged.
 */

/** A block height as the stream reported it. */
export interface WssObservation {
  blockNumber: number;
  /** Epoch ms this process first saw that height on the stream. */
  observedAt: number;
}

/** Snapshot of stream health, surfaced by `/health` and the cycle log. */
export interface WssMonitorState {
  url: string;
  /** True once the current subscription has delivered a block. */
  connected: boolean;
  lastBlockNumber: number | null;
  /** Epoch ms of the newest block delivered on the stream. */
  lastBlockAt: number | null;
  /** Blocks delivered since start, repeats included. */
  blocksSeen: number;
  /** How many times a silent stream was torn down and re-subscribed. */
  restarts: number;
  lastError: string | null;
}

export interface WssMonitor {
  state(): WssMonitorState;
  /** Newest height seen on the stream, or null before the first head. */
  latest(): WssObservation | null;
  /** First sighting of a height on the stream, or null if it never saw it. */
  firstSeenAt(blockNumber: number): number | null;
  /**
   * Re-subscribes a stream that has gone quiet. Cheap enough to call every
   * cycle: it is a clock comparison unless the stream is actually stale.
   */
  ensureFresh(): void;
  stop(): Promise<void>;
}

/** Heights kept for first-sighting lookups; roughly 20 minutes of ETN blocks. */
const TRACKED_BLOCKS = 256;

/** How long shutdown waits for the socket to close before giving up on it. */
const SOCKET_CLOSE_TIMEOUT_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function startWssMonitor(url: string): WssMonitor {
  const client = createPublicClient({
    chain: electroneum,
    transport: webSocket(url, { keepAlive: true, reconnect: true }),
  });

  /** block height -> epoch ms of the first time the stream delivered it. */
  const observations = new Map<number, number>();

  let unwatch: (() => void) | null = null;
  let startedAt = Date.now();
  let stopped = false;
  let restarting = false;
  let connected = false;
  let blocksSeen = 0;
  let restarts = 0;
  let lastError: string | null = null;

  function remember(height: number): void {
    if (observations.has(height)) return;
    observations.set(height, Date.now());

    // Map preserves insertion order and heights arrive in ascending order, so
    // the first key is always the oldest height.
    while (observations.size > TRACKED_BLOCKS) {
      const oldest = observations.keys().next();
      if (oldest.done === true) return;
      observations.delete(oldest.value);
    }
  }

  function subscribe(): void {
    startedAt = Date.now();
    connected = false;
    console.log(`[wss] subscribing to newHeads on ${url}`);

    unwatch = client.watchBlockNumber({
      // `poll` is left unset on purpose. viem picks the eth_subscribe path from
      // `client.transport.type`, which is "webSocket" here, so the subscription
      // is what runs. Spelling it out as `poll: false` is the obvious form, but
      // in viem 2.x the decorator's parameter type does not carry the WebSocket
      // transport generic, so only the polling overload is accepted and the
      // explicit flag does not typecheck.
      onBlockNumber(blockNumber) {
        try {
          const height = toSafeNumber(blockNumber, "stream block number");
          remember(height);
          blocksSeen += 1;
          lastError = null;
          if (!connected) {
            connected = true;
            console.log(`[wss] stream live - block ${height}`);
          }
        } catch (error) {
          // A malformed head must not escape into the socket's message handler.
          lastError = describeError(error);
        }
      },
      onError(error) {
        connected = false;
        lastError = describeError(error);
        // The URL is in the line because a socket error often arrives as a bare
        // event with no message, leaving the endpoint as the only useful clue.
        console.warn(`[wss] stream error on ${url}: ${lastError}`);
      },
    });
  }

  async function teardown(): Promise<void> {
    const stopWatching = unwatch;
    unwatch = null;
    try {
      stopWatching?.();
    } catch (error) {
      lastError = describeError(error);
    }

    // viem caches the socket in a module-level map keyed by url + options, so
    // closing through the transport is the only way to drop a dead connection.
    // `close()` also evicts that cache entry, which is what makes the next
    // subscribe open a fresh socket instead of reusing the corpse.
    await client.transport.getRpcClient().then((socketClient) => socketClient.close());
  }

  /**
   * Tears down and re-subscribes in the background.
   *
   * Deliberately not awaited by `ensureFresh`: closing waits on the network, and
   * a connect that is neither refused nor opened must not delay the cycle's
   * HTTP probes. The `restarting` flag keeps at most one attempt in flight.
   */
  function restart(): void {
    if (restarting || stopped) return;
    restarting = true;
    restarts += 1;

    void (async () => {
      try {
        await teardown();
        if (!stopped) subscribe();
      } catch (error) {
        lastError = describeError(error);
        // Push the stall window forward. A teardown that fails (typically a
        // socket that cannot be reached at all) would otherwise retry on every
        // cycle, which is a log line every five seconds for no gain.
        startedAt = Date.now();
        console.warn(`[wss] re-subscribe failed: ${lastError}`);
      } finally {
        restarting = false;
      }
    })();
  }

  function latest(): WssObservation | null {
    let newest: WssObservation | null = null;
    for (const [blockNumber, observedAt] of observations) {
      if (newest === null || blockNumber > newest.blockNumber) {
        newest = { blockNumber, observedAt };
      }
    }
    return newest;
  }

  function ensureFresh(): void {
    if (stopped || restarting) return;

    // Silence is measured from the newest head, or from (re)subscribe time
    // before the first one. Because a restart resets both, attempts are
    // naturally rate-limited to one per stall window.
    const silentForMs = Date.now() - (latest()?.observedAt ?? startedAt);
    if (silentForMs <= WSS_STALE_AFTER_MS) return;

    console.warn(
      `[wss] no block for ${Math.round(silentForMs / 1000)}s - re-subscribing to ${url}`,
    );
    restart();
  }

  async function stop(): Promise<void> {
    if (stopped) return;
    stopped = true;

    // A bounded wait: shutdown can afford a moment for the socket, but not an
    // unbounded one, or a stalled connect would hold the process open until the
    // platform escalates its stop signal.
    await Promise.race([teardown().catch(() => undefined), sleep(SOCKET_CLOSE_TIMEOUT_MS)]);
    console.log(`[wss] stopped after ${blocksSeen} block(s)`);
  }

  subscribe();

  return {
    state: () => {
      const newest = latest();
      return {
        url,
        connected,
        lastBlockNumber: newest?.blockNumber ?? null,
        lastBlockAt: newest?.observedAt ?? null,
        blocksSeen,
        restarts,
        lastError,
      };
    },
    latest,
    firstSeenAt: (blockNumber) => observations.get(blockNumber) ?? null,
    ensureFresh,
    stop,
  };
}

/**
 * Head start of the stream over the HTTP poll for one block height, in ms.
 *
 * Positive means the subscription saw the block first, which is the normal
 * case; negative means the HTTP read did, which is expected for a cycle or two
 * after a reconnect. `maxDeltaMs` keeps the number honest: the HTTP side is a
 * 5-second snapshot, so a wider gap says more about when the chain produced the
 * block than about which transport is faster, and is reported as unmeasurable.
 */
export function streamHeadStartMs(
  streamSeenAt: number | null,
  httpSeenAt: number | null,
  maxDeltaMs: number,
): number | null {
  if (streamSeenAt === null || httpSeenAt === null) return null;

  const headStartMs = httpSeenAt - streamSeenAt;
  return Math.abs(headStartMs) > maxDeltaMs ? null : headStartMs;
}
