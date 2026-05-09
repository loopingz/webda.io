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

interface PoolEntry {
  pool: pg.Pool;
  refCount: number;
}

const registry = new Map<string, PoolEntry>();

/**
 * Build the registry key for a config. Exposed for tests.
 *
 * @param config - the pg pool config (may be undefined — pg falls back to PG* env)
 * @returns the registry key
 */
export function poolKey(config: PoolConfig | undefined): string {
  return stableStringify(config ?? {});
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
  const pool = new pg.Pool(config);
  registry.set(key, { pool, refCount: 1 });
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
