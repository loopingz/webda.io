import { SecretString } from "@webda/core";
import { useLog } from "@webda/workout";
import pg, { PoolConfig } from "pg";

/**
 * Stable JSON serializer that sorts object keys so two configs with the
 * same content but different key order hash to the same registry key.
 *
 * Functions and classes (e.g. `pg.Pool` custom types) are dropped — pools
 * configured with non-serializable hooks must be created directly.
 *
 * @param value - any JSON-serializable value
 * @returns a stable string representation
 */
function stableStringify(value: any): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return (
    "{" +
    keys
      .map(k => {
        const v = (value as any)[k];
        if (typeof v === "function") return undefined;
        return JSON.stringify(k) + ":" + stableStringify(v);
      })
      .filter(s => s !== undefined)
      .join(",") +
    "}"
  );
}

/**
 * Pool entry interface
 */
interface PoolEntry {
  /**
   * Pool
   */
  pool: pg.Pool;
  /**
   * Ref count
   */
  refCount: number;
}

const registry = new Map<string, PoolEntry>();

/**
 * Build the registry key for a config. Exposed for tests.
 *
 * {@link SecretString} values (encrypted configuration) are unwrapped first so
 * two configs differing only by an encrypted password do not share a pool.
 *
 * @param config - the pg pool config (may be undefined — pg falls back to PG* env)
 * @returns the registry key
 */
export function poolKey(config: PoolConfig | undefined): string {
  return stableStringify(SecretString.unwrap(config ?? {}));
}

/**
 * Acquire a shared `pg.Pool` for the given config. Pools are cached by
 * stable config-hash; callers that pass the same config (regardless of
 * key order) get the same pool back. Each `acquirePool` increments a
 * refcount; the pool is `end()`ed when the last consumer calls
 * {@link releasePool}.
 *
 * Use this for stateless workloads (queries, queue receive, pub/sub
 * publish). LISTEN must use a dedicated `pg.Client` because the
 * subscription is bound to a single connection — pooled connections
 * rotate and would silently drop the subscription.
 *
 * {@link SecretString} values in the config are replaced by their plain value
 * before being handed to `pg`.
 *
 * @param config - the pg pool config
 * @returns the shared pool
 */
export function acquirePool(config: PoolConfig | undefined): pg.Pool {
  const key = poolKey(config);
  const entry = registry.get(key);
  if (entry) {
    entry.refCount++;
    return entry.pool;
  }
  const pool = createPool(config);
  registry.set(key, { pool, refCount: 1 });
  return pool;
}

/**
 * Create a `pg.Pool` that survives the loss of its connections.
 *
 * `pg.Pool` emits `error` when one of its idle connections dies (server restart, failover, terminated backend):
 * without a listener, the event crashes the process. The pool already drops the dead connection and opens a new one
 * on next use, so logging is enough.
 *
 * {@link SecretString} values in the config are replaced by their plain value.
 *
 * @param config - the pg pool config
 * @returns the pool, not registered
 */
export function createPool(config: PoolConfig | undefined): pg.Pool {
  const pool = new pg.Pool(SecretString.unwrap(config));
  pool.on("error", err => useLog("WARN", `PostgreSQL idle connection lost, reconnecting on next use: ${err.message}`));
  return pool;
}

/**
 * Open a private pool of one connection: the `usePool: false` mode of the stores and queues.
 *
 * A bare `pg.Client` cannot come back once its connection is lost; a pool of one keeps the single connection
 * semantics (one statement at a time, one session) while reconnecting on next use. The connection is kept open while
 * idle, like a client, unless `idleTimeoutMillis` is configured, and is checked once so a wrong configuration or an
 * unreachable server fails right away.
 *
 * @param config - the pg config, `max` is forced to 1
 * @returns the connected pool, ended by its owner
 */
export async function connectSingleConnectionPool(config: PoolConfig | undefined): Promise<pg.Pool> {
  const pool = createPool({ idleTimeoutMillis: 0, ...config, max: 1 });
  try {
    (await pool.connect()).release();
  } catch (err) {
    await pool.end().catch(() => {
      /* never connected */
    });
    throw err;
  }
  return pool;
}

/**
 * Release a previously-acquired pool. When the refcount reaches zero,
 * the pool is `end()`ed and removed from the registry. Releasing a
 * config that was never acquired (or already drained) is a no-op so
 * `stop()` paths can call this unconditionally.
 *
 * @param config - the same config that was passed to {@link acquirePool}
 * @returns a promise that resolves once the pool has been ended (or immediately if still in use / unknown)
 */
export async function releasePool(config: PoolConfig | undefined): Promise<void> {
  const key = poolKey(config);
  const entry = registry.get(key);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount > 0) return;
  registry.delete(key);
  await entry.pool.end().catch(() => {
    /* already ended */
  });
}

/**
 * Test-only: drain and forget every shared pool. Used between specs to
 * keep the registry from leaking handles across files.
 */
export async function __resetPools(): Promise<void> {
  const entries = [...registry.values()];
  registry.clear();
  await Promise.all(
    entries.map(e =>
      e.pool.end().catch(() => {
        /* already ended */
      })
    )
  );
}
