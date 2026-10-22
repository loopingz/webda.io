import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as k8s from "@kubernetes/client-node";
import * as WebdaQL from "@webda/ql";
import { checkAggregation, checkCreateWithoutPrimaryKey, WebdaApplicationTest } from "@webda/core/lib/test";
import {
  EventRepository,
  MemoryRepository,
  ServiceParameters,
  StoreNotFoundError,
  UpdateConditionFailError,
  useModel
} from "@webda/core";
import { FakeApiServer } from "../../test/apiserver.js";
import { getKubernetesApiClient } from "../utils/client.js";
import { KubernetesCrdExporter } from "../services/crdexporter.service.js";
import { KubernetesRepository, toLabelValue } from "./kubernetesrepository.js";
import { KubernetesStore, KubernetesStoreParameters } from "./kubernetesstore.service.js";
import { CustomResources, WriteTracker } from "./resources.js";

/** A model without metadata */
class Row {
  uuid: string;
  [key: string]: any;
  /**
   * @param data - initial data
   */
  constructor(data?: any) {
    Object.assign(this, data);
  }
}

/** Rows covering numbers, booleans, strings, missing fields, nulls and type mismatches (as the Postgres spec) */
const PARITY_ROWS = [
  { uuid: "r1", n: 1, s: "x", b: true, tags: ["x", 1] },
  { uuid: "r2", n: 5, s: "abc", b: false, tags: ["y"] },
  { uuid: "r3" },
  { uuid: "r4", n: "abc", s: 1, b: "true", tags: "x" },
  { uuid: "r5", s: null }
];
/** Queries whose results must be the same on every store */
const PARITY_QUERIES = [
  "n < 2",
  "n <= 1",
  "n = 1",
  "n != 1",
  "n > 1",
  "n >= 5",
  "n IN [1, 5]",
  "n = 'abc'",
  "b = TRUE",
  "b = FALSE",
  "b != TRUE",
  "s = 'x'",
  "s != 'x'",
  "s = 1",
  "s LIKE 'a%'",
  "s IS NULL",
  "n IS NOT NULL",
  "tags CONTAINS 'x'",
  "n < 2 OR b = TRUE"
];

/**
 * Simple model used to exercise the repository without the application metadata
 */
class Item {
  static Metadata = { Identifier: "Test/Item", Subclasses: [] as any[] };
  uuid: string;
  name?: string;
  count?: number;
  ready?: boolean;
  tags?: string[];
  items?: { id: string; value: number }[];
  /**
   * @param data - initial data
   */
  constructor(data?: any) {
    Object.assign(this, data);
  }
}

/**
 * Subclass to verify the class filter
 */
class SubItem extends Item {
  static Metadata = { Identifier: "Test/SubItem", Subclasses: [] as any[] };
}
Item.Metadata.Subclasses.push(SubItem);

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
 * Tests against an in-memory Kubernetes API server
 */
@suite
export class KubernetesStoreTest extends WebdaApplicationTest {
  declare api: FakeApiServer;
  declare config: any;
  declare store: KubernetesStore;
  declare repo: KubernetesRepository<any>;
  declare sub: KubernetesRepository<any>;

  async beforeEach() {
    await super.beforeEach();
    this.api = new FakeApiServer();
    this.config = await this.api.start();
    this.store = await this.registerService(
      new KubernetesStore(
        "k8s",
        this.parameters({ models: ["Webda/User"], statusFields: { "Webda/User": ["_mfaAttempts"] } })
      )
    )
      .resolve()
      .init();
    this.repo = this.repository(Item);
    this.sub = this.repository(SubItem);
  }

  async afterEach() {
    for (const name of ["cluster", "installer", "other"]) {
      delete this.webda.getServices()[name];
    }
    await this.api.stop();
  }

  /**
   * Store parameters on the fake API server
   * @param params - other parameters
   * @returns the parameters
   */
  parameters(params: any): KubernetesStoreParameters {
    return new KubernetesStoreParameters().load({ config: this.config, group: GROUP, ...params });
  }

  /**
   * A repository on the `items` resources
   * @param model - the model
   * @param options - fields mapping
   * @returns the repository
   */
  repository(model: any, options: any = {}): KubernetesRepository<any> {
    const resources = new CustomResources(getKubernetesApiClient({ config: this.config }, k8s.CustomObjectsApi), {
      group: GROUP,
      version: "v1",
      plural: "items",
      kind: "Item",
      namespace: "default"
    });
    return new KubernetesRepository(model, ["uuid"], resources, options).setTableRoot(Item as any);
  }

  /**
   * Stored resource of an item
   * @param name - the resource name
   * @returns the resource
   */
  stored(name: string): any {
    return this.api.resources.get(`${GROUP}/items/default/${name}`);
  }

  @test
  params() {
    assert.throws(() => new KubernetesStoreParameters().load({}), /A group is required/);
    const params = new KubernetesStoreParameters().load({ group: GROUP });
    assert.strictEqual(params.version, "v1");
    assert.strictEqual(params.namespace, "default");
    assert.strictEqual(params.scope, "Namespaced");
    assert.strictEqual(params.timeout, 10000);
    assert.strictEqual(params.installCrds, false);
    assert.strictEqual(toLabelValue("a.b-c_d"), "a.b-c_d");
    assert.strictEqual(toLabelValue(12), "12");
    assert.strictEqual(toLabelValue(true), "true");
    assert.strictEqual(toLabelValue("a b"), undefined);
    assert.strictEqual(toLabelValue("-a"), undefined);
    assert.strictEqual(toLabelValue("a".repeat(64)), undefined);
    assert.strictEqual(toLabelValue({}), undefined);
    // Tracked writes are consumed once and expire
    const tracker = new WriteTracker(10);
    tracker.record("a", "1");
    tracker.record("a", undefined);
    assert.strictEqual(tracker.consume("a", "1"), true);
    assert.strictEqual(tracker.consume("a", "1"), false);
    assert.strictEqual(tracker.consume("a", undefined), false);
    tracker.record("b", "2");
    const now = Date.now();
    while (Date.now() < now + 15);
    tracker.record("c", "3");
    assert.strictEqual(tracker.consume("b", "2"), false, "expired");
    assert.strictEqual(tracker.consume("c", "3"), true);
  }

  @test
  async aggregationConformance() {
    await checkAggregation(this.repository(Item) as any, { native: false });
  }

  @test
  async crud() {
    const item = await this.repo.create({ uuid: "i1", name: "first", count: 1 });
    assert.ok(item instanceof Item);
    await assert.rejects(() => this.repo.create({ uuid: "i1" }), /Already exists: i1/);
    // create without save does not persist
    await this.repo.create({ uuid: "i2" }, false);
    assert.strictEqual(await this.repo.exists("i2"), false);
    assert.strictEqual(await this.repo.exists("i1"), true);
    // The key is the name, the model in an annotation and a label
    assert.deepStrictEqual(this.stored("i1").spec, { name: "first", count: 1 });
    assert.strictEqual(this.stored("i1").metadata.annotations["webda.io/model"], "Test/Item");
    assert.strictEqual(this.stored("i1").metadata.labels["webda.io/model"], "Test.Item");
    await assert.rejects(() => this.repo.create({ uuid: "Not_A_Name" }), /Invalid key 'Not_A_Name'/);

    const got = await this.repo.get("i1");
    assert.ok(got instanceof Item);
    assert.strictEqual(got.name, "first");
    assert.strictEqual(got.uuid, "i1");
    assert.strictEqual(got.__type, "Test/Item");
    assert.ok(!Object.keys(got).includes("__type"));
    await assert.rejects(() => this.repo.get("unknown"), /Not found: unknown/);

    await this.repo.update({ uuid: "i1", name: "second", count: 1 }, "name", "first");
    assert.strictEqual((await this.repo.get("i1")).name, "second");
    await assert.rejects(
      () => this.repo.update({ uuid: "i1", name: "third" }, "name", "first"),
      UpdateConditionFailError
    );
    await assert.rejects(() => this.repo.update({ uuid: "unknown", name: "third" }), UpdateConditionFailError);

    await this.repo.patch("i1", { count: 5 } as any);
    await this.repo.patch("i1", { name: "patched" }, "count", 5);
    let current = await this.repo.get("i1");
    assert.strictEqual(current.count, 5);
    assert.strictEqual(current.name, "patched");
    await assert.rejects(() => this.repo.patch("i1", { name: "no" }, "count", 3), UpdateConditionFailError);

    await this.repo.removeAttribute("i1", "name");
    assert.strictEqual((await this.repo.get("i1")).name, undefined);
    await assert.rejects(() => this.repo.removeAttribute("i1", "count", "count", 1), UpdateConditionFailError);
    await assert.rejects(() => this.repo.removeAttribute("unknown", "count"), StoreNotFoundError);

    await this.repo.incrementAttributes("i1", ["count", { property: "count", value: 2 }] as any);
    assert.strictEqual((await this.repo.get("i1")).count, 8);
    await this.repo.incrementAttributes("i1", { count: -3 } as any);
    current = await this.repo.get("i1");
    assert.strictEqual(current.count, 5);
    await assert.rejects(() => this.repo.incrementAttributes("unknown", ["count"] as any), StoreNotFoundError);
    await assert.rejects(
      () => this.repo.incrementAttributes("i1", ["count"] as any, "count", 0),
      UpdateConditionFailError
    );

    await assert.rejects(() => this.repo.delete("i1", "count", 0), UpdateConditionFailError);
    await this.repo.delete("i1", "count", 5);
    assert.strictEqual(await this.repo.exists("i1"), false);
    await assert.rejects(() => this.repo.delete("i1", "count", 5), UpdateConditionFailError);
    // Deleting an unknown item without condition is silent
    await this.repo.delete("i1");
  }

  @test
  async collections() {
    await this.repo.create({ uuid: "c1" });
    await this.repo.upsertItemToCollection("c1", "items", { id: "a", value: 1 });
    await this.repo.upsertItemToCollection("c1", "items", { id: "b", value: 2 });
    await this.repo.upsertItemToCollection("c1", "items", { id: "b2", value: 3 }, 1, "id", "b");
    assert.deepStrictEqual((await this.repo.get("c1")).items, [
      { id: "a", value: 1 },
      { id: "b2", value: 3 }
    ]);
    await this.repo.upsertItemToCollection("c1", "items", { id: "a2", value: 4 }, 0);
    await assert.rejects(
      () => this.repo.upsertItemToCollection("c1", "items", { id: "x", value: 0 }, 1, "id", "b"),
      UpdateConditionFailError
    );
    await assert.rejects(
      () => this.repo.upsertItemToCollection("unknown", "items", { id: "x", value: 0 }),
      StoreNotFoundError
    );

    await assert.rejects(
      () => this.repo.deleteItemFromCollection("c1", "items", 0, "id", "a"),
      UpdateConditionFailError
    );
    await this.repo.deleteItemFromCollection("c1", "items", 0, "id", "a2");
    assert.deepStrictEqual((await this.repo.get("c1")).items, [{ id: "b2", value: 3 }]);
    await this.repo.deleteItemFromCollection("c1", "items", 0);
    assert.deepStrictEqual((await this.repo.get("c1")).items, []);
    await assert.rejects(() => this.repo.deleteItemFromCollection("unknown", "items", 0), StoreNotFoundError);
  }

  @test
  async statusAndLabels() {
    const repo = this.repository(Item, { statusFields: ["ready", "count"], labelFields: ["name", "ready"] });
    await repo.create({ uuid: "s1", name: "web", count: 1, ready: true });
    await repo.create({ uuid: "s2", name: "db", ready: false });
    let resource = this.stored("s1");
    assert.deepStrictEqual(resource.spec, { name: "web" });
    assert.deepStrictEqual(resource.status, { count: 1, ready: true });
    assert.strictEqual(resource.metadata.labels.name, "web");
    assert.strictEqual(resource.metadata.labels.ready, "true");
    const item = await repo.get("s1");
    assert.strictEqual(item.count, 1);
    assert.strictEqual(item.ready, true);

    // A status change only writes the status
    const generation = resource.metadata.generation;
    this.api.requests = [];
    await repo.incrementAttributes("s1", ["count"] as any);
    assert.deepStrictEqual(
      this.api.requests.map(r => `${r.method} ${r.path.split("/").slice(-2).join("/")}`),
      ["GET items/s1", "PUT s1/status"]
    );
    resource = this.stored("s1");
    assert.strictEqual(resource.status.count, 2);
    assert.strictEqual(resource.metadata.generation, generation);

    // The status keys the model does not own are kept, and not loaded
    this.stored("s1").status.observedGeneration = 7;
    await repo.incrementAttributes("s1", ["count"] as any);
    assert.deepStrictEqual(this.stored("s1").status, { count: 3, ready: true, observedGeneration: 7 });
    assert.strictEqual((await repo.get("s1")).observedGeneration, undefined);

    // A spec change bumps the generation and updates the labels
    await repo.patch("s1", { name: "front" });
    resource = this.stored("s1");
    assert.strictEqual(resource.metadata.generation, generation + 1);
    assert.strictEqual(resource.metadata.labels.name, "front");
    await repo.removeAttribute("s1", "name");
    assert.strictEqual(this.stored("s1").metadata.labels.name, undefined);
    await assert.rejects(() => repo.patch("s1", { name: "not a label" }), /Invalid value of the label field 'name'/);

    // Equality on label fields is filtered by the API server
    this.api.requests = [];
    let res = await repo.query("ready = FALSE AND name IN ['db', 'web']");
    assert.deepStrictEqual(
      res.results.map(r => r.uuid),
      ["s2"]
    );
    assert.strictEqual(this.api.requests[0].query.get("labelSelector"), "ready=false,name in (db,web)");
    // Other conditions are evaluated in memory
    this.api.requests = [];
    res = await repo.query("ready = FALSE OR count > 1");
    assert.deepStrictEqual(res.results.map(r => r.uuid).sort(), ["s1", "s2"]);
    assert.strictEqual(this.api.requests[0].query.get("labelSelector"), null);
  }

  @test
  async conflicts() {
    const repo = this.repository(Item, { maxRetries: 50 });
    await repo.create({ uuid: "x", count: 0 });
    // Concurrent read-modify-writes conflict and retry: no increment is lost
    await Promise.all(Array.from({ length: 10 }, () => repo.incrementAttributes("x", ["count"] as any)));
    assert.strictEqual((await repo.get("x")).count, 10);
    // Retries are bounded
    const limited = this.repository(Item, { maxRetries: 2 });
    this.api.failures = [
      { method: "PUT", code: 409 },
      { method: "PUT", code: 409 }
    ];
    await assert.rejects(
      () => limited.patch("x", { name: "a" }),
      (err: any) => err.code === 409
    );
    this.api.failures = [{ method: "PUT", code: 409 }];
    await limited.patch("x", { name: "b" });
    assert.strictEqual((await repo.get("x")).name, "b");
    // A delete with a condition retries when the object changed in between
    this.api.failures = [{ method: "DELETE", code: 409 }];
    await repo.delete("x", "count", 10);
    assert.strictEqual(await repo.exists("x"), false);
    // Other errors are not retried
    this.api.failures = [500];
    await assert.rejects(
      () => repo.get("x"),
      (err: any) => err.code === 500
    );
  }

  @test
  async queryIsNull() {
    for (const [uuid, extra] of [
      ["null", { name: null }],
      ["missing", {}],
      ["set", { name: "set" }]
    ] as const) {
      await this.repo.create({ uuid, ...extra });
    }
    const uuids = async (query: string) => (await this.repo.query(query)).results.map(r => r.uuid).sort();
    assert.deepStrictEqual(await uuids("name IS NULL"), ["missing", "null"]);
    assert.deepStrictEqual(await uuids("name IS NOT NULL"), ["set"]);
    assert.deepStrictEqual(await uuids("name IS NULL AND uuid = 'null'"), ["null"]);
  }

  @test
  async bulkStatements() {
    for (let i = 0; i < 6; i++) {
      await this.repo.create({ uuid: `b${i}`, name: i % 2 ? "odd" : "even", count: i });
    }
    await this.sub.create({ uuid: "s1", name: "odd", count: 100 });
    const events = new EventRepository(Item as any, ["uuid"], this.repo as any);
    const seen: string[] = [];
    for (const name of ["Delete", "Deleted", "Patch", "Patched", "Update", "Updated", "PartialUpdated"]) {
      events.on(name as any, () => seen.push(name));
    }
    // query / iterate are SELECT only
    for (const statement of ["DELETE", "UPDATE SET name = 'x'", "SELECT name"]) {
      await assert.rejects(() => this.repo.query(statement), WebdaQL.WebdaQLError, statement);
    }
    // UPDATE: several fields, dotted target, bound parameters; the WHERE field changes
    assert.strictEqual(
      await events.updateMany("UPDATE SET name = :n, profile.level = :l WHERE name = 'odd' AND count < :max", {
        n: "even",
        l: 3,
        max: 10
      }),
      3
    );
    const b1: any = await this.repo.get("b1");
    assert.strictEqual(b1.name, "even");
    assert.deepStrictEqual(b1.profile, { level: 3 });
    assert.strictEqual(((await this.sub.get("s1")) as any).name, "odd");
    // LIMIT
    assert.strictEqual(await events.updateMany("UPDATE SET count = 0 WHERE count > 0 AND count < 3 LIMIT 5"), 2);
    assert.strictEqual(await events.updateMany("UPDATE SET name = 'limited' WHERE count < 100 LIMIT 1"), 1);
    assert.strictEqual((await this.repo.query("name = 'limited'")).results.length, 1);
    assert.strictEqual((await this.repo.query("count = 0")).results.length, 3);
    await assert.rejects(() => events.updateMany("UPDATE SET uuid = 'x'"), /primary key/);
    await assert.rejects(() => events.updateMany("UPDATE SET __type = 'x'"), /private field/);
    // DELETE with LIMIT, with WHERE, without WHERE (the subclass repository only sees its own rows)
    assert.strictEqual(await events.deleteMany("DELETE WHERE count = ? LIMIT 2", [0]), 2);
    assert.strictEqual(await events.deleteMany("DELETE WHERE count >= 3 AND count < 100"), 3);
    assert.strictEqual(await this.sub.deleteMany("DELETE"), 1);
    assert.strictEqual((await this.repo.query("")).results.length, 1);
    assert.strictEqual(await events.deleteMany("DELETE LIMIT 0"), 0);
    assert.deepStrictEqual(seen, [], "bulk statements emit no per-object event");
  }

  @test
  async queryParityWithMemory() {
    const repo = this.repository(Row);
    const memory = new MemoryRepository<any>(Row as any, ["uuid"]);
    for (const row of PARITY_ROWS) {
      await repo.create({ ...row });
      await memory.create(new Row({ ...row }));
    }
    const uuids = async (r: any, q: string) => (await r.query(q)).results.map((o: any) => o.uuid).sort();
    for (const query of PARITY_QUERIES) {
      assert.deepStrictEqual(await uuids(repo, query), await uuids(memory, query), query);
    }
  }

  @test
  async parentWritesKeepTheChildType() {
    await this.sub.create({ uuid: "s1", name: "a" });
    await this.sub.create({ uuid: "s2", name: "b" });
    await this.sub.create({ uuid: "s3", name: "c" });
    // Plain data (ModelRef.update), with a forged `__type` key, and an instance read through the parent
    await this.repo.update({ uuid: "s1", name: "plain" });
    await this.repo.update({ uuid: "s2", name: "forged", __type: "Test/Item" });
    await this.repo.update(await this.repo.get("s3"));
    assert.deepStrictEqual((await this.sub.query("")).results.map((r: any) => r.uuid).sort(), ["s1", "s2", "s3"]);
    assert.strictEqual(((await this.sub.get("s1")) as any).name, "plain");
    assert.deepStrictEqual(
      ["s1", "s2", "s3"].map(name => this.stored(name).metadata.annotations["webda.io/model"]),
      ["Test/SubItem", "Test/SubItem", "Test/SubItem"]
    );
    // An instance of a class writes its own type
    await this.repo.update(new Item({ uuid: "s1" }));
    assert.deepStrictEqual((await this.sub.query("")).results.map((r: any) => r.uuid).sort(), ["s2", "s3"]);
  }

  @test
  async query() {
    for (let i = 0; i < 10; i++) {
      await this.repo.create({ uuid: `q${i}`, name: `name${i}`, count: i, tags: i % 2 ? ["odd"] : ["even"] });
    }
    await this.sub.create({ uuid: "s1", name: "sub", count: 100 });
    // A resource created with kubectl (no model annotation) belongs to the root model
    this.api.resources.set(`${GROUP}/items/default/legacy`, {
      apiVersion: `${GROUP}/v1`,
      kind: "Item",
      metadata: { name: "legacy", namespace: "default", resourceVersion: "1" },
      spec: { count: 200 }
    });

    let res = await this.repo.query("count >= 5 AND count < 8");
    assert.deepStrictEqual(res.results.map(r => r.uuid).sort(), ["q5", "q6", "q7"]);
    res = await this.repo.query("tags CONTAINS 'odd' ORDER BY count DESC LIMIT 2");
    assert.deepStrictEqual(
      res.results.map(r => r.uuid),
      ["q9", "q7"]
    );
    assert.strictEqual(res.continuationToken, "2");
    res = await this.repo.query(`tags CONTAINS 'odd' ORDER BY count DESC LIMIT 2 OFFSET '${res.continuationToken}'`);
    assert.deepStrictEqual(
      res.results.map(r => r.uuid),
      ["q5", "q3"]
    );
    res = await this.repo.query("name LIKE 'name1%'");
    assert.deepStrictEqual(
      res.results.map(r => r.uuid),
      ["q1"]
    );
    res = await this.repo.query("FALSE");
    assert.strictEqual(res.results.length, 0);
    // Parent sees subclasses and resources without model
    res = await this.repo.query("count >= 100");
    assert.deepStrictEqual(res.results.map(r => r.uuid).sort(), ["legacy", "s1"]);
    assert.ok(res.results.find(r => r.uuid === "s1") instanceof SubItem);
    // Subclass only sees its own resources
    res = await this.sub.query("");
    assert.deepStrictEqual(
      res.results.map(r => r.uuid),
      ["s1"]
    );

    // Iterate goes through all pages
    const all = [];
    for await (const item of this.repo.iterate("count < 10 LIMIT 3")) {
      all.push(item.uuid);
    }
    assert.strictEqual(all.length, 10);
    // The list is paginated
    this.api.requests = [];
    await (this.repo as any).resources.listAll(undefined, 4);
    assert.deepStrictEqual(
      this.api.requests.map(r => r.query.get("continue")),
      [null, "4", "8"]
    );
  }

  @test
  async storeIntegration() {
    const User = useModel("Webda/User");
    const repo = this.store.getRepository(User);
    assert.ok(repo instanceof EventRepository);
    assert.strictEqual(this.store.getRepository(User), repo, "repository should be cached");
    const user = await repo.create(<any>{ uuid: "u1", email: "u1@webda.io", _mfaAttempts: 2 });
    assert.strictEqual((await repo.get("u1" as any)).email, "u1@webda.io");
    assert.strictEqual(user.uuid, "u1");
    const res = await repo.query("email = 'u1@webda.io'");
    assert.strictEqual(res.results.length, 1);
    const resource = this.api.resources.get(`${GROUP}/users/default/u1`)!;
    assert.strictEqual(resource.kind, "User");
    assert.strictEqual(resource.spec.email, "u1@webda.io");
    assert.deepStrictEqual(resource.status, { _mfaAttempts: 2 });
    assert.deepStrictEqual(
      this.store.getCrds().map(crd => crd.metadata.name),
      ["users.test.webda.io"]
    );
    assert.throws(() => this.store.getRootModel(useModel("Webda/Ident")), /not handled by the store k8s/);
    await this.store.__clean();
    assert.strictEqual(this.api.list(GROUP, "users").length, 0);
  }

  @test
  async createWithoutPrimaryKeyPersistsGeneratedUuid() {
    const User = useModel("Webda/User");
    await checkCreateWithoutPrimaryKey([this.store.getRepository(User)], {
      data: i => ({ email: `gen${i}@webda.io` }),
      readStored: async key => {
        const resource = this.api.resources.get(`${GROUP}/users/default/${key}`);
        return resource ? { ...resource.spec, uuid: resource.metadata.name } : undefined;
      }
    });
  }

  @test
  async clusterScope() {
    const store = await this.registerService(
      new KubernetesStore("cluster", this.parameters({ models: ["Webda/User"], scope: "Cluster", version: "v2" }))
    )
      .resolve()
      .init();
    const repo = store.getRepository(useModel("Webda/User"));
    await repo.create(<any>{ uuid: "c1", email: "c1@webda.io" });
    assert.ok(this.api.resources.has(`${GROUP}/users//c1`));
    assert.strictEqual((await repo.get("c1" as any)).email, "c1@webda.io");
    assert.strictEqual(this.api.requests.at(-1)!.path, `/apis/${GROUP}/v2/users/c1`);
    assert.strictEqual(store.getCrds()[0].spec.scope, "Cluster");
    await repo.delete("c1" as any);
    assert.strictEqual(await repo.exists("c1" as any), false);
  }

  @test
  async installCrds() {
    const store = this.registerService(
      new KubernetesStore(
        "installer",
        this.parameters({ models: ["Webda/User"], installCrds: true, labelFields: { "Webda/User": ["email"] } })
      )
    ).resolve();
    await store.init();
    const crd = this.api.resources.get("apiextensions.k8s.io/customresourcedefinitions//users.test.webda.io")!;
    assert.ok(crd, "the CRD is created");
    const schema = crd.spec.versions[0].schema.openAPIV3Schema;
    // The typed client kept the x-kubernetes keys
    assert.strictEqual(schema.properties.spec["x-kubernetes-preserve-unknown-fields"], true);
    assert.strictEqual(crd.spec.versions[0].additionalPrinterColumns[0].jsonPath, ".spec.email");
    // A second install replaces it
    await store.installCrds();
    assert.ok(this.api.requests.some(r => r.method === "PUT" && r.path.endsWith("/users.test.webda.io")));
  }

  @test
  async watch() {
    const external = new CustomResources(getKubernetesApiClient({ config: this.config }, k8s.CustomObjectsApi), {
      group: GROUP,
      version: "v1",
      plural: "users",
      kind: "User",
      namespace: "default"
    });
    const resource = (name: string, spec: any) => ({
      apiVersion: `${GROUP}/v1`,
      kind: "User",
      metadata: { name, annotations: { "webda.io/model": "Webda/User" } },
      spec
    });
    // Known before the watch starts: no event
    await external.create(resource("before", { email: "before@webda.io" }));
    const store = await this.registerService(
      new KubernetesStore(
        "watcher",
        this.parameters({ models: ["Webda/User"], watch: true, statusFields: { "Webda/User": ["_mfaAttempts"] } })
      )
    )
      .resolve()
      .init();
    const repo = store.getRepository(useModel("Webda/User"));
    const events: string[] = [];
    for (const name of ["Created", "Updated", "Deleted"]) {
      repo.on(name as any, (evt: any) =>
        events.push(
          `${name}:${evt.object_id}${evt.object ? `:${evt.object.email}:${evt.object.constructor.name}` : ""}`
        )
      );
    }
    // Writes of the application: no event from the watch (the repository emits its own)
    events.length = 0;
    await repo.create(<any>{ uuid: "own", email: "own@webda.io" });
    await repo.patch("own" as any, <any>{ email: "own2@webda.io", _mfaAttempts: 1 });
    await repo.delete("own" as any);
    const ownEvents = [...events];
    // Changes made by others
    const created = await external.create(resource("ext", { email: "ext@webda.io" }));
    await until(() => events.length > ownEvents.length);
    const replaced = await external.replace({ ...created, spec: { email: "ext2@webda.io" } });
    await until(() => events.length > ownEvents.length + 1);
    // Metadata and foreign status changes are not changes of the object
    const labeled = await external.replace({ ...replaced, metadata: { ...replaced.metadata, labels: { a: "b" } } });
    await external.replaceStatus({ ...labeled, status: { conditions: [] } });
    await external.delete("ext");
    await until(() => events.length > ownEvents.length + 2);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepStrictEqual(events.slice(ownEvents.length), [
      "Created:ext:ext@webda.io:User",
      "Updated:ext:ext2@webda.io:User",
      "Deleted:ext"
    ]);
    // The application's own writes emitted their usual events only once
    assert.deepStrictEqual(
      ownEvents.filter(e => e.startsWith("Created") || e.startsWith("Deleted")),
      ["Created:own:own@webda.io:User", "Deleted:own"]
    );
    await store.stop();
    // Stopped: no more event
    await external.create(resource("after", { email: "after@webda.io" }));
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.strictEqual(events.at(-1), "Deleted:ext");
    delete this.webda.getServices()["watcher"];
  }

  @test
  async crdExport() {
    const target = mkdtempSync(join(tmpdir(), "webda-crds-"));
    try {
      const exporter = new KubernetesCrdExporter("exporter", new ServiceParameters().load({}));
      await exporter.crdExport(target);
      assert.deepStrictEqual(readdirSync(target), ["users.test.webda.io.yaml"]);
      const content = readFileSync(join(target, "users.test.webda.io.yaml"), "utf8");
      assert.match(content, /kind: CustomResourceDefinition/);
      assert.match(content, /x-kubernetes-preserve-unknown-fields: true/);
      assert.match(content, /subresources:\n\s+status: \{\}/);
      // Two stores defining the same resources differently
      this.registerService(new KubernetesStore("other", this.parameters({ models: ["Webda/User"] }))).resolve();
      await assert.rejects(() => exporter.crdExport(target), /The stores k8s and other define users.test.webda.io/);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  }
}
