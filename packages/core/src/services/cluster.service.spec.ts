import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { WebdaApplicationTest } from "../test/application.js";
import { TestApplication } from "../test/objects.js";
import { Service } from "./service.js";
import { ServiceParameters } from "./serviceparameters.js";
import { useCore } from "../core/hooks.js";
import { ClusterService, ClusterServiceParameters, useCluster, whenLeader } from "./cluster.service.js";
import { StoreClusterService, StoreClusterServiceParameters } from "./storecluster.service.js";
import { useRegistry } from "../models/registry.model.js";

/**
 * Cluster whose lease is driven by the test
 */
class FakeCluster extends ClusterService {
  /** Result of the next attempts, an Error is thrown, a function is called for the attempt result */
  result: boolean | Error | (() => Promise<boolean>) = false;
  /** Number of attempts */
  attempts = 0;
  /** Number of releases */
  releases = 0;

  /** @override */
  protected async acquireOrRenew(): Promise<boolean> {
    this.attempts++;
    if (this.result instanceof Error) throw this.result;
    if (typeof this.result === "function") return this.result();
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
  async hangingRenewStepsDownBeforeExpiry() {
    await this.withFakeTimers(async () => {
      // Deadline: attempt start + (leaseDuration + renewInterval) / 2 = 1750, attempt timeout 2500
      const cluster = fakeCluster({ renewInterval: 500 });
      cluster.result = true;
      const rec = recorder();
      cluster.whenLeader(rec.fn, rec.deregistered);
      await cluster.init();
      await vi.advanceTimersByTimeAsync(0);
      assert.deepStrictEqual(rec.calls, ["fn"]);
      // The renew started at 500 never answers
      cluster.result = () => new Promise<boolean>(() => {});
      await vi.advanceTimersByTimeAsync(1749);
      assert.strictEqual(cluster.isLeader(), true);
      await vi.advanceTimersByTimeAsync(1);
      // Stepped down 1750ms after the start of the last successful attempt, before its lease expires (3000)
      assert.strictEqual(cluster.isLeader(), false);
      assert.deepStrictEqual(rec.calls, ["fn", "deregistered"]);
      // The hanging attempt times out at 3000 and the election goes on
      cluster.result = true;
      await vi.advanceTimersByTimeAsync(1750);
      assert.strictEqual(cluster.isLeader(), true);
      assert.deepStrictEqual(rec.calls, ["fn", "deregistered", "fn"]);
      await cluster.stop();
    });
  }

  @test
  async slowAcquireAfterDeadlineIsNotLeading() {
    await this.withFakeTimers(async () => {
      const cluster = fakeCluster({ renewInterval: 500 });
      // Answers within the attempt timeout (2500) but after the deadline (1750)
      cluster.result = () => new Promise<boolean>(resolve => setTimeout(() => resolve(true), 2000));
      const rec = recorder();
      cluster.whenLeader(rec.fn, rec.deregistered);
      const init = cluster.init();
      await vi.advanceTimersByTimeAsync(2000);
      await init;
      assert.strictEqual(cluster.isLeader(), false);
      assert.deepStrictEqual(rec.calls, []);
      await cluster.stop();
    });
  }

  @test
  async slowRenewAfterDeadlineStepsDown() {
    await this.withFakeTimers(async () => {
      const cluster = fakeCluster({ renewInterval: 500 });
      cluster.result = true;
      const rec = recorder();
      cluster.whenLeader(rec.fn, rec.deregistered);
      await cluster.init();
      await vi.advanceTimersByTimeAsync(0);
      // The renew started at 500 answers at 2500: after its own deadline (2250)
      cluster.result = () => new Promise<boolean>(resolve => setTimeout(() => resolve(true), 2000));
      await vi.advanceTimersByTimeAsync(2500);
      assert.strictEqual(cluster.isLeader(), false);
      assert.deepStrictEqual(rec.calls, ["fn", "deregistered"]);
      await cluster.stop();
    });
  }

  @test
  defaultInstanceIdsDiffer() {
    const a = new ClusterServiceParameters().load({}).instanceId;
    const b = new ClusterServiceParameters().load({}).instanceId;
    assert.notStrictEqual(a, b);
    assert.ok(a.includes(`-${process.pid}-`), a);
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

@suite
class StoreClusterServiceTest extends WebdaApplicationTest {
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

  /**
   * @param leaseName - lease shared by the instances
   * @param count - number of instances
   * @returns instances of one cluster, not initialized
   */
  instances(leaseName: string, count: number): StoreClusterService[] {
    return Array.from(
      { length: count },
      (_, i) =>
        new StoreClusterService(
          `cluster${i}`,
          new StoreClusterServiceParameters().load({
            leaseDuration: 3000,
            renewInterval: 1000,
            instanceId: `instance${i}`,
            leaseName
          })
        )
    );
  }

  /**
   * Simulate a crash: the loop stops without releasing the lease
   * @param cluster - the instance
   */
  crash(cluster: StoreClusterService) {
    (cluster as any).running = false;
    clearTimeout((cluster as any).timer);
  }

  @test
  async threeInstancesOneLeader() {
    await this.withFakeTimers(async () => {
      const clusters = this.instances("threeInstances", 3);
      const fns = clusters.map(c => {
        const rec = recorder();
        c.whenLeader(rec.fn, rec.deregistered);
        return rec;
      });
      for (const c of clusters) await c.init();
      await vi.advanceTimersByTimeAsync(5000);
      assert.strictEqual(clusters.filter(c => c.isLeader()).length, 1);
      assert.strictEqual(fns.filter(r => r.calls.includes("fn")).length, 1);
      const entry: any = await useRegistry().get("cluster:threeInstances");
      assert.strictEqual(entry.owner, clusters.find(c => c.isLeader()).getInstanceId());
      for (const c of clusters) await c.stop();
    });
  }

  @test
  async leaderKilledFailsOver() {
    await this.withFakeTimers(async () => {
      const clusters = this.instances("killed", 3);
      const recs = clusters.map(c => {
        const rec = recorder();
        c.whenLeader(rec.fn, rec.deregistered);
        return rec;
      });
      for (const c of clusters) await c.init();
      const leader = clusters.find(c => c.isLeader());
      this.crash(leader);
      const others = clusters.filter(c => c !== leader);
      // Nobody takes over a valid lease
      await vi.advanceTimersByTimeAsync(2000);
      assert.strictEqual(others.filter(c => c.isLeader()).length, 0);
      // Within one lease duration, another instance leads and runs fn
      await vi.advanceTimersByTimeAsync(1000);
      const next = others.filter(c => c.isLeader());
      assert.strictEqual(next.length, 1);
      assert.deepStrictEqual(recs[clusters.indexOf(next[0])].calls, ["fn"]);
      for (const c of others) await c.stop();
    });
  }

  @test
  async cleanStopHandsOverFast() {
    await this.withFakeTimers(async () => {
      const clusters = this.instances("cleanStop", 2);
      for (const c of clusters) await c.init();
      const leader = clusters.find(c => c.isLeader());
      const other = clusters.find(c => c !== leader);
      await leader.stop();
      assert.strictEqual(leader.isLeader(), false);
      await vi.advanceTimersByTimeAsync(1000);
      assert.strictEqual(other.isLeader(), true);
      await other.stop();
    });
  }

  @test
  async raceOnFreeLease() {
    const clusters = this.instances("race", 2);
    const results = await Promise.all(clusters.map(c => (c as any).acquireOrRenew()));
    assert.deepStrictEqual(results.sort(), [false, true]);
    // The winner renews, the loser stays out
    const winner = clusters[results.indexOf(true)];
    assert.strictEqual(await (winner as any).acquireOrRenew(), true);
  }

  @test
  async registryDownStepsDown() {
    await this.withFakeTimers(async () => {
      const [cluster] = this.instances("registryDown", 1);
      const rec = recorder();
      cluster.whenLeader(rec.fn, rec.deregistered);
      await cluster.init();
      await vi.advanceTimersByTimeAsync(0);
      assert.deepStrictEqual(rec.calls, ["fn"]);
      const spy = vi.spyOn(useRegistry(), "patch").mockRejectedValue(new Error("Registry unavailable"));
      try {
        await vi.advanceTimersByTimeAsync(1000);
        assert.strictEqual(cluster.isLeader(), false);
        assert.deepStrictEqual(rec.calls, ["fn", "deregistered"]);
      } finally {
        spy.mockRestore();
      }
      await cluster.stop();
    });
  }

  @test
  async lostLeaseStepsDown() {
    await this.withFakeTimers(async () => {
      const [cluster] = this.instances("lostLease", 1);
      const rec = recorder();
      cluster.whenLeader(rec.fn, rec.deregistered);
      await cluster.init();
      await vi.advanceTimersByTimeAsync(0);
      assert.strictEqual(cluster.isLeader(), true);
      await useRegistry().put("cluster:lostLease", { owner: "intruder", leaseUntil: Date.now() + 60000 });
      await vi.advanceTimersByTimeAsync(1000);
      assert.strictEqual(cluster.isLeader(), false);
      assert.deepStrictEqual(rec.calls, ["fn", "deregistered"]);
      // Its release does not clear the lease of the new owner
      await cluster.stop();
      const entry: any = await useRegistry().get("cluster:lostLease");
      assert.strictEqual(entry.owner, "intruder");
    });
  }
}

/**
 * Service registering with the free whenLeader() in resolve(), before the cluster service is created
 */
class EarlyService extends Service {
  static createConfiguration = (params: any) => new ServiceParameters().load(params);
  calls: string[] = [];

  /** @override */
  resolve(): this {
    super.resolve();
    whenLeader(
      () => void this.calls.push("fn"),
      () => void this.calls.push("deregistered")
    );
    return this;
  }
}

/**
 * Fake cluster usable as a configured service
 */
class ConfiguredFakeCluster extends FakeCluster {
  static createConfiguration = (params: any) => new ClusterServiceParameters().load(params);
}

@suite
class EarlyWhenLeaderTest extends WebdaApplicationTest {
  /** @override */
  getTestConfiguration(): any {
    return {
      parameters: { ignoreBeans: true },
      services: {
        Early: { type: "WebdaTest/EarlyService" },
        Cluster: {
          type: "WebdaTest/FakeCluster",
          leaseDuration: 3000,
          renewInterval: 1000,
          instanceId: "me"
        }
      }
    };
  }

  /** @override */
  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    app.addModda("WebdaTest/EarlyService", EarlyService);
    app.addModda("WebdaTest/FakeCluster", ConfiguredFakeCluster);
  }

  @test
  async registeredBeforeTheClusterExists() {
    const early = useCore().getService<EarlyService>("Early");
    const cluster = useCore().getService<ConfiguredFakeCluster>("Cluster");
    // Not the leader: the local cluster must not have run fn
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(cluster.isLeader(), false);
    assert.deepStrictEqual(early.calls, []);
    cluster.result = true;
    await (cluster as any).attempt();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepStrictEqual(early.calls, ["fn"]);
    await cluster.stop();
    assert.deepStrictEqual(early.calls, ["fn", "deregistered"]);
  }
}
