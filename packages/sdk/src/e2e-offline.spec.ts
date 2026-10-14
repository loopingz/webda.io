import { useService } from "@webda/core";
import { HttpServer } from "@webda/core/lib/services/httpserver.service.js";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import { MemoryStorage } from "@webda/offline/client";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { Member, Note, SyncTest, Tag } from "../../offline/test/fixture.js";
import { writeSdk } from "../test/compile.js";
import { SdkGenerator } from "./sdkgenerator.service.js";
import { SdkError } from "./client/errors.js";
import { offline, OfflineBackend, splitQuery } from "./client/offline/index.js";
import { RemoteBackend } from "./client/model-client.js";

/** A model the SyncService does not sync: it keeps going through the transports */
const TAG_SCHEMA = {
  type: "object",
  properties: { uuid: { type: "string" }, name: { type: "string" }, _rev: { type: "number" } },
  required: ["name"]
};

/** A synced model with a composite primary key */
const MEMBER_SCHEMA = {
  type: "object",
  properties: {
    org: { type: "string" },
    user: { type: "string" },
    role: { type: "string" },
    _rev: { type: "number" }
  },
  required: ["org", "user"]
};

/**
 * The generated SDK with `offline()`: `Test/Note` (synced by the SyncService of the `@webda/offline` fixture) is
 * served from a local replica, `Test/Tag` through REST; the server is "down" when the fetch says so
 */
@suite
class SdkOfflineE2ETest extends SyncTest {
  static dir: string;
  static sdk: any;
  static baseUrl: string;
  static down = false;
  static requests: string[] = [];

  getTestConfiguration(): any {
    return {
      version: 3,
      parameters: {},
      services: {
        SyncStore: {
          type: "Webda/MemoryStore",
          models: ["Webda/SyncChange", "Test/Note", "Test/Tag", "Test/Member"]
        },
        sync: { type: "Webda/SyncService", models: ["Test/Note", "Test/Member"], overlap: "0ms" },
        DomainService: { type: "Webda/DomainService" },
        RESTService: { type: "Webda/RESTOperationsTransport" },
        HttpServer: { type: "Webda/HttpServer", port: 0 },
        SdkGenerator: { type: "Webda/SdkGenerator" }
      }
    };
  }

  /**
   * @param app - the test application
   */
  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    // The fixture models live in the `Test` namespace: make it the application's, so they are its final models
    app.getNamespace = () => "Test";
    app.addModda("Webda/HttpServer", HttpServer);
    app.addModda("Webda/SdkGenerator", SdkGenerator);
    app.getSchemas()["Test/Tag"] = <any>TAG_SCHEMA;
    app.addModel("Test/Tag", Tag, {
      ...app.getModel("Test/Tag").Metadata,
      Schemas: { Input: <any>TAG_SCHEMA }
    } as any);
    app.getSchemas()["Test/Member"] = <any>MEMBER_SCHEMA;
    app.addModel("Test/Member", Member, {
      ...app.getModel("Test/Member").Metadata,
      Schemas: { Input: <any>MEMBER_SCHEMA }
    } as any);
  }

  async beforeAll(): Promise<void> {
    await super.beforeAll();
    const rest: any = useService("RESTService" as any);
    // The SyncService operations are registered after the transport init: expose them, as the offline e2e does
    rest.exposeServiceOperations(
      Object.fromEntries(Object.entries((rest as any).getOperations()).filter(([id]) => id.startsWith("Sync.")))
    );
    const http: any = useService("HttpServer" as any);
    await http.start("127.0.0.1", 0);
    for (let i = 0; i < 100 && !http.server?.listening; i++) await new Promise(r => setTimeout(r, 10));
    SdkOfflineE2ETest.baseUrl = `http://127.0.0.1:${http.server.address().port}`;
    SdkOfflineE2ETest.dir = writeSdk(await useService<SdkGenerator>("SdkGenerator" as any).files());
    SdkOfflineE2ETest.sdk = await import(join(SdkOfflineE2ETest.dir, "index.ts"));
  }

  async afterAll(): Promise<void> {
    if (SdkOfflineE2ETest.dir) rmSync(SdkOfflineE2ETest.dir, { recursive: true, force: true });
    await super.afterAll();
  }

  /**
   * @param options - extra offline options
   * @returns a client whose fetch fails while `down`
   */
  client(options: any = {}) {
    SdkOfflineE2ETest.down = false;
    SdkOfflineE2ETest.requests.length = 0;
    return SdkOfflineE2ETest.sdk.createClient({
      baseUrl: SdkOfflineE2ETest.baseUrl,
      cache: { ttl: 60_000 },
      fetch: (url: any, init: any) => {
        if (SdkOfflineE2ETest.down) return Promise.reject(new TypeError("fetch failed"));
        SdkOfflineE2ETest.requests.push(`${init?.method ?? "GET"} ${new URL(String(url)).pathname}`);
        return fetch(url, init);
      },
      offline: offline({ storage: new MemoryStorage(), syncInterval: 0, start: false, ...options })
    });
  }

  @test
  async describesTheSyncServiceAndPicksTheBackends() {
    const api = this.client();
    assert.deepStrictEqual(SdkOfflineE2ETest.sdk.SERVER.offline, {
      models: ["Test/Note", "Test/Member"],
      operations: { pull: "Sync.Pull", push: "Sync.Push", snapshot: "Sync.Snapshot", watch: "Sync.Watch" }
    });
    assert.ok(api.Note.backend instanceof OfflineBackend);
    assert.ok(api.Tag.backend instanceof RemoteBackend);
    assert.deepStrictEqual(api.offline.models, ["Test/Note", "Test/Member"]);
    // Without offline(): every model goes through the transports
    const online = SdkOfflineE2ETest.sdk.createClient({ baseUrl: SdkOfflineE2ETest.baseUrl });
    assert.ok(online.Note.backend instanceof RemoteBackend);
    assert.strictEqual(online.offline, undefined);
  }

  @test
  async writesOfflineArePushedOnReconnect() {
    const seed: any = await Note.create({ title: "seed", status: "open" } as any);
    const api = this.client();
    const requests = SdkOfflineE2ETest.requests;
    await api.offline.sync();
    assert.ok(requests.includes("POST /sync/pull"), requests.join());
    // Served by the replica: no request
    requests.length = 0;
    const local = await api.Note.get(seed.uuid);
    assert.strictEqual(local.title, "seed");
    assert.deepStrictEqual(requests, []);
    assert.deepStrictEqual(
      (await api.Note.query("status = 'open' ORDER BY title DESC LIMIT 5")).results.map((n: any) => n.title),
      ["seed"]
    );

    // The server goes down: writes still succeed, locally
    SdkOfflineE2ETest.down = true;
    const events: any[] = [];
    api.Note.on("change", (event: any) => events.push(event));
    const patched = await api.Note.patch(seed.uuid, { title: "offline edit" });
    assert.strictEqual(patched.title, "offline edit");
    assert.ok(events.some(event => event.type === "set" && event.uid === seed.uuid));
    const created = await api.Note.create({ title: "created offline", status: "open" });
    assert.ok(created.uuid);
    assert.strictEqual((await api.Note.get(created.uuid)).title, "created offline");
    // The sync fails as offline
    const error: SdkError = await api.offline.sync().catch((e: SdkError) => e);
    assert.ok(error instanceof SdkError, `${error}`);
    assert.strictEqual(error.isOffline(), true);
    assert.strictEqual((await Note.ref(seed.uuid).get()).title, "seed");
    // A model not synced still needs the server
    const tagError: SdkError = await api.Tag.create({ name: "t" }).catch((e: SdkError) => e);
    assert.ok(tagError instanceof SdkError);
    assert.strictEqual(tagError.isOffline(), true);

    // Reconnect: the writes are pushed
    SdkOfflineE2ETest.down = false;
    requests.length = 0;
    await api.offline.sync();
    assert.ok(requests.includes("POST /sync/push"), requests.join());
    assert.strictEqual((await Note.ref(seed.uuid).get()).title, "offline edit");
    assert.strictEqual((await Note.ref(created.uuid).get()).title, "created offline");
    assert.deepStrictEqual(await api.offline.conflicts(), []);

    // A change made on the server is pulled, and fires `change`
    events.length = 0;
    const server: any = await Note.ref(seed.uuid).get();
    await server.patch({ body: "from the server" });
    await api.offline.sync();
    assert.strictEqual((await api.Note.get(seed.uuid)).body, "from the server");
    assert.ok(events.some(event => event.type === "set" && event.uid === seed.uuid));

    // Delete offline, pushed on reconnect
    SdkOfflineE2ETest.down = true;
    await api.Note.delete(created.uuid);
    const deleted: SdkError = await api.Note.get(created.uuid).catch((e: SdkError) => e);
    assert.strictEqual(deleted.status, 404);
    SdkOfflineE2ETest.down = false;
    await api.offline.sync();
    assert.strictEqual(await Note.ref(created.uuid).exists(), false);
  }

  @test
  async conflictsAreSurfaced() {
    const seed: any = await Note.create({ title: "seed", status: "open" } as any);
    const api = this.client();
    await api.offline.sync();
    const surfaced: any[] = [];
    api.offline.on("conflict", (info: any) => surfaced.push(info));
    // Both sides change the title
    SdkOfflineE2ETest.down = true;
    await api.Note.patch(seed.uuid, { title: "mine" });
    SdkOfflineE2ETest.down = false;
    const server: any = await Note.ref(seed.uuid).get();
    await server.patch({ title: "theirs" });
    await api.offline.sync();
    const conflicts = await api.offline.conflicts();
    assert.strictEqual(conflicts.length, 1);
    assert.deepStrictEqual(conflicts[0].ref, { model: "Test/Note", key: seed.uuid });
    assert.strictEqual(conflicts[0].ours.title, "mine");
    assert.strictEqual(conflicts[0].theirs.title, "theirs");
    assert.strictEqual(surfaced.length, 1);
    // The object cannot be written until the conflict is settled
    const error: SdkError = await api.Note.patch(seed.uuid, { title: "again" }).catch((e: SdkError) => e);
    assert.ok(error instanceof SdkError);
    assert.strictEqual(error.status, 409);
    // Keep the server version
    await api.offline.discard(conflicts[0].ref);
    assert.strictEqual((await api.Note.get(seed.uuid)).title, "theirs");
    assert.deepStrictEqual(await api.offline.conflicts(), []);
  }

  @test
  async modelsNotSyncedGoThroughTheTransport() {
    const api = this.client();
    const requests = SdkOfflineE2ETest.requests;
    const tag = await api.Tag.create({ name: "online" });
    assert.strictEqual(requests.at(-1), "POST /tags");
    assert.strictEqual((await Tag.ref(tag.uuid).get()).name, "online");
    assert.strictEqual((await api.Tag.get(tag.uuid, { cache: "reload" })).name, "online");
    assert.strictEqual(requests.at(-1), `GET /tags/${tag.uuid}`);
    await api.Tag.delete(tag.uuid);
  }

  @test
  async startsTheSyncLoopByDefault() {
    const seed: any = await Note.create({ title: "looped", status: "open" } as any);
    const api = this.client({ start: undefined, retry: { base: 50, max: 200 } });
    const statuses: string[] = [];
    api.offline.on("status", (status: string) => statuses.push(status));
    // Already started by the client: start() resolves once the first sync is over
    await api.offline.start();
    assert.strictEqual(api.offline.status, "idle");
    assert.deepStrictEqual(statuses.slice(-1), ["idle"]);
    assert.strictEqual((await api.Note.get(seed.uuid)).title, "looped");
    api.offline.stop();
  }

  @test
  async compositeKeys() {
    const api = this.client();
    const events: any[] = [];
    api.Member.on("change", (event: any) => events.push(event));
    await api.offline.sync();
    SdkOfflineE2ETest.down = true;
    const member = await api.Member.create({ org: "acme", user: "bob", role: "dev" });
    // The SDK uid joins the key with the separator, @webda/offline serializes it as a JSON array
    assert.strictEqual(member.getUUID(), "acme_bob");
    assert.ok(events.some(event => event.uid === "acme_bob"));
    assert.strictEqual((await api.Member.patch({ org: "acme", user: "bob" }, { role: "lead" })).role, "lead");
    assert.strictEqual((await api.Member.get("acme_bob")).role, "lead");
    SdkOfflineE2ETest.down = false;
    await api.offline.sync();
    assert.strictEqual((await Member.ref({ org: "acme", user: "bob" } as any).get()).role, "lead");
    await api.Member.delete("acme_bob");
    await api.offline.sync();
    assert.strictEqual(await Member.ref({ org: "acme", user: "bob" } as any).exists(), false);
  }

  @test
  splitsTheTrailingClauses() {
    assert.deepStrictEqual(splitQuery(`status = 'open' ORDER BY title DESC, due LIMIT 10 OFFSET "20"`), {
      filter: "status = 'open'",
      orderBy: [
        { field: "title", direction: "DESC" },
        { field: "due", direction: "ASC" }
      ],
      limit: 10,
      offset: "20"
    });
    assert.deepStrictEqual(splitQuery(""), { filter: "", orderBy: [], limit: undefined, offset: undefined });
  }
}
