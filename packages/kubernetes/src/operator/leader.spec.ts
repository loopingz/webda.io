import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as k8s from "@kubernetes/client-node";
import { FakeApiServer } from "../../test/apiserver.js";
import { getKubernetesApiClient } from "../utils/client.js";
import { LeaderElector } from "./leader.js";

/**
 * Wait until the condition holds
 * @param condition - checked every 5ms
 */
async function until(condition: () => boolean): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 5000) throw new Error("Timeout waiting for condition");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

@suite
class LeaderElectorTest {
  declare api: FakeApiServer;
  declare client: k8s.CoordinationV1Api;
  electors: LeaderElector[] = [];

  async beforeEach() {
    this.api = new FakeApiServer();
    this.client = getKubernetesApiClient({ config: await this.api.start() }, k8s.CoordinationV1Api);
    this.electors = [];
  }

  async afterEach() {
    for (const elector of this.electors) await elector.stop();
    await this.api.stop();
  }

  /**
   * A candidate recording its leadership changes
   * @param identity - the candidate identity
   * @param leaseDuration - milliseconds
   * @returns the elector and its events
   */
  candidate(identity: string, leaseDuration = 15000): { elector: LeaderElector; events: string[] } {
    const events: string[] = [];
    const elector = new LeaderElector(
      this.client,
      { name: "operator", namespace: "default", identity, leaseDuration, retryPeriod: 20 },
      {
        onStartedLeading: () => void events.push("started"),
        onStoppedLeading: () => void events.push("stopped"),
        onError: err => events.push(`error:${(err as any).code}`)
      }
    );
    this.electors.push(elector);
    return { elector, events };
  }

  /**
   * @returns the stored lease
   */
  lease(): any {
    return this.api.resources.get("coordination.k8s.io/leases/default/operator");
  }

  @test
  async oneLeaderThenTakeOverOnRelease() {
    const a = this.candidate("a");
    const b = this.candidate("b");
    await a.elector.start();
    await b.elector.start();
    assert.strictEqual(a.elector.leading, true);
    assert.strictEqual(b.elector.leading, false);
    assert.strictEqual(this.lease().spec.holderIdentity, "a");
    // MicroTime: six fractional digits, as the API server expects
    assert.match(this.lease().spec.renewTime, /\.\d{6}Z$/);
    // The leader renews
    const renewed = this.lease().spec.renewTime;
    await until(() => this.lease().spec.renewTime !== renewed);
    assert.strictEqual(b.elector.leading, false);
    // Released on stop: the other candidate takes over without waiting for the expiry
    await a.elector.stop();
    assert.deepStrictEqual(a.events, ["started", "stopped"]);
    await until(() => b.elector.leading);
    assert.strictEqual(this.lease().spec.holderIdentity, "b");
    assert.strictEqual(this.lease().spec.leaseTransitions, 1);
  }

  @test
  async takeOverAnExpiredLease() {
    const a = this.candidate("a", 1000);
    await a.elector.start();
    // The leader stops renewing (crashed)
    clearTimeout((a.elector as any).timer);
    (a.elector as any).running = false;
    const b = this.candidate("b", 1000);
    await b.elector.start();
    assert.strictEqual(b.elector.leading, false);
    // Expired after one second
    this.lease().spec.renewTime = new Date(Date.now() - 2000).toISOString();
    await until(() => b.elector.leading);
    assert.strictEqual(this.lease().spec.holderIdentity, "b");
  }

  @test
  async stopLeadingWhenRenewalFails() {
    const a = this.candidate("a");
    await a.elector.start();
    assert.strictEqual(a.elector.leading, true);
    // Another candidate wrote the lease since read
    this.api.failures = [{ method: "PUT", code: 409 }];
    await until(() => !a.elector.leading);
    assert.deepStrictEqual(a.events, ["started", "stopped"]);
    // It becomes leader again on the next renewal
    await until(() => a.elector.leading);
    // An API error is reported and stops leading too
    this.api.failures = [500];
    await until(() => !a.elector.leading);
    assert.ok(a.events.includes("error:500"));
  }

  @test
  async concurrentCreation() {
    const candidates = ["a", "b", "c"].map(id => this.candidate(id));
    await Promise.all(candidates.map(c => c.elector.start()));
    assert.strictEqual(candidates.filter(c => c.elector.leading).length, 1);
  }
}
