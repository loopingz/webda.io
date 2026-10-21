import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { CoreModel, ServiceParameters, useModel } from "@webda/core";
import * as k8s from "@kubernetes/client-node";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KubernetesCrdExporter } from "../services/crdexporter.service.js";
import { FakeApiServer } from "../../test/apiserver.js";
import { KubernetesStore, KubernetesStoreParameters } from "../stores/kubernetesstore.service.js";
import { setCondition } from "./controller.js";
import { KubernetesOperator, KubernetesOperatorParameters } from "./operator.service.js";

/**
 * Reconciled model, its behavior set by the test
 */
class Tenant extends CoreModel {
  declare uuid: string;
  name?: string;
  ready?: boolean;
  /** reconcile calls: `<uuid>:<name>` */
  static calls: string[] = [];
  static finalized: string[] = [];
  static behavior: (tenant: Tenant) => Promise<any> = async () => {};

  async reconcile() {
    Tenant.calls.push(`${this.uuid}:${this.name}`);
    return Tenant.behavior(this);
  }

  async finalize() {
    Tenant.finalized.push(this.uuid);
  }
}

/**
 * Reconciled model not stored in a KubernetesStore
 */
class Orphan extends CoreModel {
  async reconcile() {}
}

/**
 * Stored model without reconcile
 */
class Plain extends CoreModel {
  declare uuid: string;
}

const GROUP = "test.webda.io";

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

/**
 * Wait a few event loop turns, for events that should not happen
 */
async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 50));
}

@suite
class KubernetesOperatorTest extends WebdaApplicationTest {
  declare api: FakeApiServer;
  declare config: any;
  declare store: KubernetesStore;
  operators: KubernetesOperator[] = [];

  async beforeEach() {
    await super.beforeEach();
    this.operators = [];
    Tenant.calls = [];
    Tenant.finalized = [];
    Tenant.behavior = async () => {};
    for (const [model, name] of [
      [Tenant, "Test/Tenant"],
      [Plain, "Test/Plain"],
      [Orphan, "Test/Orphan"]
    ] as const) {
      this.registerModel(model as any, name, {
        Identifier: name,
        Plural: `${name}s`,
        PrimaryKey: ["uuid"],
        Ancestors: [],
        Subclasses: [],
        Relations: {},
        Schemas: {
          Stored: {
            type: "object",
            properties: { uuid: { type: "string" }, name: { type: "string" }, ready: { type: "boolean" } }
          }
        }
      } as any);
    }
    this.api = new FakeApiServer();
    this.config = await this.api.start();
    this.store = await this.registerService(
      new KubernetesStore(
        "tenants",
        new KubernetesStoreParameters().load({
          config: this.config,
          group: GROUP,
          models: ["Test/Tenant", "Test/Plain"],
          statusFields: { "Test/Tenant": ["ready"] }
        })
      )
    )
      .resolve()
      .init();
  }

  async afterEach() {
    for (const operator of this.operators) await operator.stop();
    for (const name of ["tenants", ...this.operators.map(o => o.getName())]) {
      delete this.webda.getServices()[name];
    }
    await this.api.stop();
  }

  /**
   * An operator of the tenants
   * @param params - other parameters
   * @param name - the service name
   * @returns the operator, initialized
   */
  async operator(params: any = {}, name: string = "operator"): Promise<KubernetesOperator> {
    const operator = await this.registerService(
      new KubernetesOperator(
        name,
        new KubernetesOperatorParameters().load({
          config: this.config,
          models: ["Test/Tenant"],
          leaderElection: false,
          finalizer: `${GROUP}/finalizer`,
          ...params
        })
      )
    )
      .resolve()
      .init();
    this.operators.push(operator);
    return operator;
  }

  /**
   * @returns the tenants repository
   */
  get tenants(): any {
    return this.store.getRepository(useModel("Test/Tenant"));
  }

  /**
   * Stored resource of a tenant
   * @param uuid - the tenant key
   * @returns the resource
   */
  resource(uuid: string): any {
    return this.api.resources.get(`${GROUP}/tenants/default/${uuid}`);
  }

  /**
   * @param uuid - the tenant key
   * @returns the Ready condition of a tenant
   */
  ready(uuid: string): any {
    return this.resource(uuid)?.status?.conditions?.find((c: any) => c.type === "Ready");
  }

  @test
  params() {
    assert.throws(() => new KubernetesOperatorParameters().load({}), /needs the models to reconcile/);
    const params = new KubernetesOperatorParameters().load({ models: ["A/B"] });
    assert.strictEqual(params.concurrency, 1);
    assert.strictEqual(params.resyncPeriod, 300000);
    assert.strictEqual(params.leaderElection, true);
    assert.strictEqual(params.autoStart, false);
  }

  @test
  async invalidModels() {
    await assert.rejects(async () => (await this.operator({ models: ["Test/Plain"] })).start(), /has no reconcile/);
    this.operators = [];
    await assert.rejects(
      async () => (await this.operator({ models: ["Test/Orphan"] }, "other")).start(),
      /is not stored in a KubernetesStore/
    );
    this.operators = [];
  }

  @test
  crdHasTheOperatorStatus() {
    const crd = this.store.getCrd(useModel("Test/Tenant"));
    const status = crd.spec.versions[0].schema.openAPIV3Schema.properties!.status;
    assert.deepStrictEqual(Object.keys(status.properties!), ["ready", "observedGeneration", "conditions"]);
    // A model without reconcile has no status
    assert.strictEqual(
      this.store.getCrd(useModel("Test/Plain")).spec.versions[0].schema.openAPIV3Schema.properties!.status,
      undefined
    );
  }

  @test
  async reconcilesOncePerGeneration() {
    await this.tenants.create({ uuid: "acme", name: "Acme" });
    await this.operator({ autoStart: true });
    await until(() => this.ready("acme")?.status === "True");
    let resource = this.resource("acme");
    assert.strictEqual(resource.status.observedGeneration, 1);
    assert.deepStrictEqual(resource.metadata.finalizers, [`${GROUP}/finalizer`]);
    assert.strictEqual(this.ready("acme").reason, "Reconciled");
    // Its own status writes and the finalizer do not trigger a reconcile
    await settle();
    assert.deepStrictEqual(Tenant.calls, ["acme:Acme"]);

    // A spec change is reconciled
    await this.tenants.patch("acme", { name: "Acme Corp" });
    await until(() => this.resource("acme").status.observedGeneration === 2);
    assert.deepStrictEqual(Tenant.calls, ["acme:Acme", "acme:Acme Corp"]);
    // A status change is not
    await this.tenants.patch("acme", { ready: true });
    await settle();
    assert.strictEqual(Tenant.calls.length, 2);
    resource = this.resource("acme");
    assert.strictEqual(resource.status.ready, true);
    assert.strictEqual(resource.status.observedGeneration, 2, "the store keeps the operator status");

    // A reconcile writing the status of its object does not loop
    Tenant.behavior = async tenant => tenant.patch({ ready: false });
    await this.tenants.patch("acme", { name: "Acme Inc" });
    await until(() => this.resource("acme").status.ready === false);
    await settle();
    assert.strictEqual(Tenant.calls.length, 3);
    // Resync reconciles every object again
    (this.operators[0] as any).controllers[0].resync();
    await until(() => Tenant.calls.length === 4);
  }

  @test
  async failuresAreRetried() {
    let failures = 2;
    Tenant.behavior = async () => {
      if (failures-- > 0) throw new Error(`Provisioning failed ${failures}`);
    };
    await this.tenants.create({ uuid: "acme", name: "Acme" });
    const operator = await this.operator({ maxBackoff: 20 });
    // The metrics are global: count from now
    const count = async (result: string) =>
      (await (operator as any).metrics.reconcile_total.get()).values.find(
        (v: any) => v.labels.model === "Test/Tenant" && v.labels.result === result
      )?.value ?? 0;
    const before = { error: await count("error"), success: await count("success") };
    await operator.start();
    await until(() => this.ready("acme")?.status === "False");
    assert.match(this.ready("acme").message, /Provisioning failed/);
    assert.strictEqual(this.ready("acme").reason, "ReconcileError");
    await until(() => this.ready("acme")?.status === "True");
    assert.strictEqual(Tenant.calls.length, 3);
    assert.strictEqual((await count("error")) - before.error, 2);
    assert.strictEqual((await count("success")) - before.success, 1);
  }

  @test
  async requeueAfter() {
    Tenant.behavior = async () => (Tenant.calls.length < 3 ? { requeueAfter: 10 } : undefined);
    await this.tenants.create({ uuid: "acme", name: "Acme" });
    await this.operator({ autoStart: true });
    await until(() => Tenant.calls.length === 3);
    await settle();
    assert.strictEqual(Tenant.calls.length, 3);
  }

  @test
  async finalizer() {
    await this.tenants.create({ uuid: "acme", name: "Acme" });
    await this.operator({ autoStart: true });
    await until(() => this.ready("acme")?.status === "True");
    // The API server only marks it for deletion while the finalizer is there
    await this.tenants.delete("acme");
    await until(() => this.resource("acme") === undefined);
    assert.deepStrictEqual(Tenant.finalized, ["acme"]);
    assert.strictEqual(Tenant.calls.length, 1);
  }

  @test
  async restartSkipsReconciledObjects() {
    await this.tenants.create({ uuid: "done", name: "Done" });
    await this.tenants.create({ uuid: "failed", name: "Failed" });
    const conditions = (status: "True" | "False") => setCondition(undefined, { type: "Ready", status });
    for (const [uuid, status] of [
      ["done", "True"],
      ["failed", "False"]
    ] as const) {
      const resource = this.resource(uuid);
      resource.status = { observedGeneration: resource.metadata.generation, conditions: conditions(status) };
    }
    await this.operator({ autoStart: true });
    await until(() => Tenant.calls.length === 1);
    await settle();
    assert.deepStrictEqual(Tenant.calls, ["failed:Failed"]);
  }

  @test
  async leaderElection() {
    await this.tenants.create({ uuid: "acme", name: "Acme" });
    const params = { leaderElection: true, leaseDuration: 1000, leaseRetryPeriod: 20, leaseName: "tenants" };
    const first = await this.operator(params, "first");
    const second = await this.operator(params, "second");
    await first.start();
    await second.start();
    await until(() => Tenant.calls.length === 1);
    assert.strictEqual(
      this.api.resources.get("coordination.k8s.io/leases/default/tenants")?.spec.holderIdentity !== undefined,
      true
    );
    // Only the leader reconciles
    await this.tenants.patch("acme", { name: "Acme 2" });
    await until(() => Tenant.calls.length === 2);
    await settle();
    assert.strictEqual(Tenant.calls.length, 2);
    // The other one takes over when the leader stops
    await first.stop();
    await until(() => (second as any).elector.leading);
    await this.tenants.patch("acme", { name: "Acme 3" });
    await until(() => Tenant.calls.length === 3);
  }

  @test
  async rbacExport() {
    await this.operator({ leaderElection: true, leaseNamespace: "ops" });
    const target = mkdtempSync(join(tmpdir(), "webda-rbac-"));
    try {
      const exporter = new KubernetesCrdExporter("exporter", new ServiceParameters().load({}));
      await exporter.rbacExport(join(target, "rbac.yaml"), "api", "apps", "tenants");
      const manifests = JSON.parse(
        JSON.stringify(k8s.loadAllYaml(readFileSync(join(target, "rbac.yaml"), "utf8")))
      ) as any[];
      assert.deepStrictEqual(
        manifests.map(m => `${m.kind}/${m.metadata.namespace}`),
        ["Role/default", "RoleBinding/default", "Role/ops", "RoleBinding/ops"]
      );
      assert.deepStrictEqual(
        manifests[0].rules.map((r: any) => `${r.apiGroups}:${r.resources}:${r.verbs}`),
        [
          `${GROUP}:tenants,plains:get,list,watch,create,update,delete`,
          `${GROUP}:tenants/status,plains/status:get,update`
        ]
      );
      assert.deepStrictEqual(manifests[2].rules[0].resources, ["leases"]);
      assert.deepStrictEqual(manifests[1].subjects[0], { kind: "ServiceAccount", name: "api", namespace: "apps" });
      // installCrds needs the definitions, cluster wide
      (this.store.getParameters() as any).installCrds = true;
      await exporter.rbacExport(join(target, "rbac.yaml"));
      const withCrds = k8s.loadAllYaml(readFileSync(join(target, "rbac.yaml"), "utf8")) as any[];
      assert.strictEqual(withCrds[0].kind, "ClusterRole");
      assert.deepStrictEqual(withCrds[0].rules[0].resources, ["customresourcedefinitions"]);
      assert.strictEqual(withCrds[0].metadata.name, "webda");
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  }

  @test
  async command() {
    await this.tenants.create({ uuid: "acme", name: "Acme" });
    const operator = await this.operator();
    const running = operator.operator();
    await until(() => Tenant.calls.length === 1);
    // A cancelled command rejects with "Cancelled"
    const cancelled = assert.rejects(running, /Cancelled/);
    await running.cancel();
    await cancelled;
    await this.tenants.patch("acme", { name: "Stopped" });
    await settle();
    assert.strictEqual(Tenant.calls.length, 1);
  }
}
