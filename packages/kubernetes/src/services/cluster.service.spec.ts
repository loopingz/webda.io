import { suite, test } from "@webda/test";
import * as assert from "assert";
import { FakeApiServer } from "../../test/apiserver.js";
import { KubernetesClusterService, KubernetesClusterServiceParameters } from "./cluster.service.js";

@suite
class KubernetesClusterServiceTest {
  declare api: FakeApiServer;
  declare config: any;
  services: KubernetesClusterService[] = [];

  async beforeEach() {
    this.api = new FakeApiServer();
    this.config = await this.api.start();
    this.services = [];
  }

  async afterEach() {
    for (const service of this.services) await service.stop();
    await this.api.stop();
  }

  /**
   * @param instanceId - identity of the instance
   * @returns an instance of the cluster, not initialized
   */
  instance(instanceId: string): KubernetesClusterService {
    const service = new KubernetesClusterService(
      instanceId,
      new KubernetesClusterServiceParameters().load({
        config: this.config,
        namespace: "default",
        leaseName: "webda-leader",
        instanceId
      })
    );
    this.services.push(service);
    return service;
  }

  /**
   * @returns the stored lease
   */
  lease(): any {
    return this.api.resources.get("coordination.k8s.io/leases/default/webda-leader");
  }

  @test
  async acquiresFreeLease() {
    const a = this.instance("a");
    const calls: string[] = [];
    a.whenLeader(() => void calls.push("fn"));
    await a.init();
    assert.strictEqual(a.isLeader(), true);
    assert.strictEqual(this.lease().spec.holderIdentity, "a");
    assert.strictEqual(this.lease().spec.leaseDurationSeconds, 15);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepStrictEqual(calls, ["fn"]);
  }

  @test
  async otherHolderNotExpired() {
    const a = this.instance("a");
    const b = this.instance("b");
    await a.init();
    await b.init();
    assert.strictEqual(a.isLeader(), true);
    assert.strictEqual(b.isLeader(), false);
  }

  @test
  async stopClearsHolder() {
    const a = this.instance("a");
    const b = this.instance("b");
    await a.init();
    await b.init();
    await a.stop();
    assert.strictEqual(a.isLeader(), false);
    assert.strictEqual(this.lease().spec.holderIdentity, undefined);
    // The other instance takes over without waiting for the expiry
    assert.strictEqual(await (b as any).acquireOrRenew(), true);
  }

  @test
  namespaceFromEnv() {
    const previous = process.env.POD_NAMESPACE;
    process.env.POD_NAMESPACE = "webda-system";
    try {
      assert.strictEqual(new KubernetesClusterServiceParameters().load({}).namespace, "webda-system");
      assert.strictEqual(new KubernetesClusterServiceParameters().load({ namespace: "mine" }).namespace, "mine");
    } finally {
      if (previous === undefined) delete process.env.POD_NAMESPACE;
      else process.env.POD_NAMESPACE = previous;
    }
  }
}
