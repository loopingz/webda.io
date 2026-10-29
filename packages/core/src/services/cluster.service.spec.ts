import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { WebdaApplicationTest } from "../test/application.js";
import { useCore } from "../core/hooks.js";
import { ClusterService, ClusterServiceParameters, useCluster, whenLeader } from "./cluster.service.js";

/**
 * Cluster whose lease is driven by the test
 */
class FakeCluster extends ClusterService {
  /** Result of the next attempts, an Error is thrown */
  result: boolean | Error = false;
  /** Number of attempts */
  attempts = 0;
  /** Number of releases */
  releases = 0;

  /** @override */
  protected async acquireOrRenew(): Promise<boolean> {
    this.attempts++;
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }

  /** @override */
  protected async release(): Promise<void> {
    this.releases++;
  }
}

/**
 * @param params - raw parameters
 * @returns a fake cluster, not initialized
 */
function fakeCluster(params: any = {}): FakeCluster {
  return new FakeCluster(
    "cluster",
    new ClusterServiceParameters().load({ leaseDuration: 3000, renewInterval: 1000, instanceId: "me", ...params })
  );
}

/**
 * @returns a callback recording its calls
 */
function recorder() {
  const calls: string[] = [];
  return {
    calls,
    fn: () => {
      calls.push("fn");
    },
    deregistered: () => {
      calls.push("deregistered");
    }
  };
}

@suite
class ClusterServiceTest extends WebdaApplicationTest {
  /**
   * Run a test with fake timers
   * @param callback - the test
   */
  async withFakeTimers(callback: () => Promise<void>) {
    vi.useFakeTimers();
    try {
      await callback();
    } finally {
      vi.useRealTimers();
    }
  }

  @test
  async localClusterIsLeader() {
    const cluster = useCluster();
    assert.strictEqual(cluster.isLeader(), true);
    assert.strictEqual(cluster.getInstanceId(), "local");
    const rec = recorder();
    const unregister = whenLeader(rec.fn, rec.deregistered);
    await vi.waitFor(() => assert.deepStrictEqual(rec.calls, ["fn"]));
    unregister();
    await vi.waitFor(() => assert.deepStrictEqual(rec.calls, ["fn", "deregistered"]));
  }

  @test
  async useClusterFindsService() {
    const cluster = fakeCluster();
    this.registerService(cluster, "testCluster");
    try {
      assert.strictEqual(useCluster(), cluster);
    } finally {
      delete useCore().getServices()["testCluster"];
    }
  }

  @test
  async gainRunsFnAndLossRunsDeregistered() {
    await this.withFakeTimers(async () => {
      const cluster = fakeCluster();
      const rec = recorder();
      cluster.whenLeader(rec.fn, rec.deregistered);
      await cluster.init();
      assert.strictEqual(cluster.isLeader(), false);
      assert.deepStrictEqual(rec.calls, []);
      cluster.result = true;
      await vi.advanceTimersByTimeAsync(1000);
      assert.strictEqual(cluster.isLeader(), true);
      assert.deepStrictEqual(rec.calls, ["fn"]);
      // Renewing keeps the leadership without calling fn again
      await vi.advanceTimersByTimeAsync(1000);
      assert.deepStrictEqual(rec.calls, ["fn"]);
      cluster.result = false;
      await vi.advanceTimersByTimeAsync(1000);
      assert.strictEqual(cluster.isLeader(), false);
      assert.deepStrictEqual(rec.calls, ["fn", "deregistered"]);
      await cluster.stop();
      assert.strictEqual(cluster.releases, 0);
    });
  }

  @test
  async registerWhileLeaderRunsNow() {
    await this.withFakeTimers(async () => {
      const cluster = fakeCluster();
      cluster.result = true;
      await cluster.init();
      const rec = recorder();
      cluster.whenLeader(rec.fn, rec.deregistered);
      await vi.advanceTimersByTimeAsync(0);
      assert.deepStrictEqual(rec.calls, ["fn"]);
      await cluster.stop();
    });
  }

  @test
  async unregisterCallsDeregisteredWhenRan() {
    await this.withFakeTimers(async () => {
      const cluster = fakeCluster();
      cluster.result = true;
      await cluster.init();
      const rec = recorder();
      const unregister = cluster.whenLeader(rec.fn, rec.deregistered);
      await vi.advanceTimersByTimeAsync(0);
      unregister();
      await vi.advanceTimersByTimeAsync(0);
      assert.deepStrictEqual(rec.calls, ["fn", "deregistered"]);
      // Unregistered: neither a later loss nor a second unregister call it again
      unregister();
      cluster.result = false;
      await vi.advanceTimersByTimeAsync(1000);
      assert.deepStrictEqual(rec.calls, ["fn", "deregistered"]);
      await cluster.stop();
    });
  }

  @test
  async unregisterSkipsDeregisteredWhenFnNeverRan() {
    await this.withFakeTimers(async () => {
      const cluster = fakeCluster();
      await cluster.init();
      const rec = recorder();
      const unregister = cluster.whenLeader(rec.fn, rec.deregistered);
      unregister();
      cluster.result = true;
      await vi.advanceTimersByTimeAsync(1000);
      assert.strictEqual(cluster.isLeader(), true);
      assert.deepStrictEqual(rec.calls, []);
      await cluster.stop();
    });
  }

  @test
  async renewErrorStepsDown() {
    await this.withFakeTimers(async () => {
      const cluster = fakeCluster();
      cluster.result = true;
      const rec = recorder();
      cluster.whenLeader(rec.fn, rec.deregistered);
      await cluster.init();
      await vi.advanceTimersByTimeAsync(0);
      assert.deepStrictEqual(rec.calls, ["fn"]);
      cluster.result = new Error("store down");
      const attempts = cluster.attempts;
      await vi.advanceTimersByTimeAsync(1000);
      // Stepped down on that very attempt, long before the lease duration
      assert.strictEqual(cluster.attempts, attempts + 1);
      assert.strictEqual(cluster.isLeader(), false);
      assert.deepStrictEqual(rec.calls, ["fn", "deregistered"]);
      // The election goes on
      cluster.result = true;
      await vi.advanceTimersByTimeAsync(1000);
      assert.deepStrictEqual(rec.calls, ["fn", "deregistered", "fn"]);
      await cluster.stop();
    });
  }

  @test
  async registeredBeforeInit() {
    await this.withFakeTimers(async () => {
      const cluster = fakeCluster();
      cluster.result = true;
      const rec = recorder();
      cluster.whenLeader(rec.fn, rec.deregistered);
      await vi.advanceTimersByTimeAsync(5000);
      assert.deepStrictEqual(rec.calls, []);
      await cluster.init();
      await vi.advanceTimersByTimeAsync(0);
      assert.deepStrictEqual(rec.calls, ["fn"]);
      await cluster.stop();
    });
  }

  @test
  async noOverlap() {
    await this.withFakeTimers(async () => {
      const cluster = fakeCluster();
      cluster.result = true;
      const calls: string[] = [];
      let finish: () => void = () => {};
      cluster.whenLeader(
        () =>
          new Promise<void>(resolve => {
            calls.push("fn:start");
            finish = () => {
              calls.push("fn:end");
              resolve();
            };
          }),
        () => {
          calls.push("deregistered");
        }
      );
      await cluster.init();
      await vi.advanceTimersByTimeAsync(0);
      cluster.result = false;
      await vi.advanceTimersByTimeAsync(1000);
      assert.strictEqual(cluster.isLeader(), false);
      // fn is still pending: deregisteredFn waits for it
      assert.deepStrictEqual(calls, ["fn:start"]);
      finish();
      await vi.advanceTimersByTimeAsync(0);
      assert.deepStrictEqual(calls, ["fn:start", "fn:end", "deregistered"]);
      await cluster.stop();
    });
  }

  @test
  async fnErrorKeepsElection() {
    await this.withFakeTimers(async () => {
      const cluster = fakeCluster();
      cluster.result = true;
      const errors: any[] = [];
      const log = vi.spyOn(cluster as any, "log").mockImplementation((level: any, ...args: any[]) => {
        if (level === "ERROR") errors.push(args);
      });
      cluster.whenLeader(() => {
        throw new Error("fn failed");
      });
      await cluster.init();
      await vi.advanceTimersByTimeAsync(0);
      assert.strictEqual(errors.length, 1);
      const attempts = cluster.attempts;
      await vi.advanceTimersByTimeAsync(1000);
      assert.strictEqual(cluster.attempts, attempts + 1);
      assert.strictEqual(cluster.isLeader(), true);
      await cluster.stop();
      log.mockRestore();
    });
  }

  @test
  async stopReleases() {
    await this.withFakeTimers(async () => {
      const cluster = fakeCluster();
      cluster.result = true;
      const rec = recorder();
      cluster.whenLeader(rec.fn, rec.deregistered);
      await cluster.init();
      await vi.advanceTimersByTimeAsync(0);
      await cluster.stop();
      assert.strictEqual(cluster.releases, 1);
      assert.strictEqual(cluster.isLeader(), false);
      assert.deepStrictEqual(rec.calls, ["fn", "deregistered"]);
      // The loop is stopped
      const attempts = cluster.attempts;
      await vi.advanceTimersByTimeAsync(5000);
      assert.strictEqual(cluster.attempts, attempts);
    });
  }

  @test
  invalidIntervals() {
    assert.throws(
      () => new ClusterServiceParameters().load({ leaseDuration: 1000, renewInterval: 1000 }),
      /renewInterval/
    );
    const params = new ClusterServiceParameters().load({});
    assert.strictEqual(params.leaseDuration, 15000);
    assert.strictEqual(params.renewInterval, 5000);
    assert.strictEqual(params.leaseName, "leader");
    assert.ok(params.instanceId);
  }
}
