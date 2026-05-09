import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { __resetPools, acquirePool, poolKey, releasePool } from "./pgpool.js";

const cfg = {
  host: "localhost",
  user: "webda.io",
  database: "webda.io",
  password: "webda.io",
  statement_timeout: 60000,
  max: 1
};

@suite
class PgPoolTest {
  async afterEach() {
    await __resetPools();
  }

  @test
  async sameConfigReturnsSamePool() {
    const a = acquirePool(cfg);
    const b = acquirePool(cfg);
    assert.strictEqual(a, b, "same config must return the same pool instance");
    await releasePool(cfg);
    await releasePool(cfg);
  }

  @test
  async keyIsOrderInsensitive() {
    const k1 = poolKey({ host: "h", user: "u", database: "d" });
    const k2 = poolKey({ database: "d", host: "h", user: "u" });
    assert.strictEqual(k1, k2, "key order should not affect the registry hash");
  }

  @test
  async differentConfigReturnsDifferentPool() {
    const a = acquirePool(cfg);
    const b = acquirePool({ ...cfg, database: "other" });
    assert.notStrictEqual(a, b, "different configs must produce distinct pools");
    await releasePool(cfg);
    await releasePool({ ...cfg, database: "other" });
  }

  @test
  async refcountKeepsPoolAliveUntilLastRelease() {
    const a = acquirePool(cfg);
    acquirePool(cfg); // refcount = 2

    await releasePool(cfg); // refcount = 1, pool still alive
    // Re-acquiring after partial release returns the same pool.
    const c = acquirePool(cfg);
    assert.strictEqual(a, c, "pool should still be alive while refcount > 0");

    await releasePool(cfg); // refcount = 1
    await releasePool(cfg); // refcount = 0, pool ends

    // After full release, a fresh acquisition produces a new pool.
    const d = acquirePool(cfg);
    assert.notStrictEqual(a, d, "after final release a new pool must be created");
    await releasePool(cfg);
  }

  @test
  async releasingUnknownConfigIsNoop() {
    // Should not throw — `stop()` paths call this unconditionally.
    await releasePool({ host: "never-acquired", database: "x" });
  }
}
