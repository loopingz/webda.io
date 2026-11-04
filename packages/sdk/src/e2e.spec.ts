import { useModel, useService } from "@webda/core";
import { HttpServer } from "@webda/core/lib/services/httpserver.service.js";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { SampleAppTest } from "../test/sample-app.js";
import { writeSdk } from "../test/compile.js";
import { registerSdkFixture, SdkFixtureService } from "../test/sdk-fixture.js";
import { SdkError } from "./client/errors.js";
import { Link, Related, SdkModel } from "./client/model.js";
import type { SdkGenerator } from "./sdkgenerator.service.js";

/**
 * The generated SDK, driven through the real HTTP server of `sample-app`
 */
@suite
class SdkRestE2ETest extends SampleAppTest {
  static dir: string;
  static sdk: any;
  static baseUrl: string;
  static requests: string[] = [];
  extraServices = {
    HttpServer: { type: "Webda/HttpServer", port: 0 },
    MainStore: {
      type: "Webda/MemoryStore",
      models: [
        "WebdaDemo/Company",
        "WebdaDemo/Project",
        "WebdaDemo/SubProject",
        "WebdaDemo/AnotherSubProject",
        "WebdaDemo/SubSubProject",
        "WebdaDemo/User"
      ]
    },
    SdkFixture: { type: "WebdaDemo/SdkFixtureService" }
  };

  /**
   * @param app - the test application
   */
  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    app.addModda("WebdaDemo/SdkFixtureService", SdkFixtureService);
    app.addModda("Webda/HttpServer", HttpServer);
  }

  async beforeAll(): Promise<void> {
    await super.beforeAll();
    registerSdkFixture();
    const http: any = useService("HttpServer" as any);
    await http.start("127.0.0.1", 0);
    for (let i = 0; i < 100 && !http.server?.listening; i++) await new Promise(r => setTimeout(r, 10));
    SdkRestE2ETest.baseUrl = `http://127.0.0.1:${http.server.address().port}`;
    // Generate the SDK of the running application and load it from the sources of the runtime
    SdkRestE2ETest.dir = writeSdk(await useService<SdkGenerator>("SdkGenerator" as any).files());
    SdkRestE2ETest.sdk = await import(join(SdkRestE2ETest.dir, "index.ts"));
  }

  async afterAll(): Promise<void> {
    if (SdkRestE2ETest.dir) rmSync(SdkRestE2ETest.dir, { recursive: true, force: true });
    await super.afterAll();
  }

  /**
   * @param options - client options
   * @returns a client counting its requests
   */
  client(options: any = {}) {
    const requests = SdkRestE2ETest.requests;
    requests.length = 0;
    return SdkRestE2ETest.sdk.createClient({
      baseUrl: SdkRestE2ETest.baseUrl,
      cache: { ttl: 60_000 },
      fetch: (url: any, init: any) => {
        requests.push(`${init?.method ?? "GET"} ${new URL(String(url)).pathname}`);
        return fetch(url, init);
      },
      ...options
    });
  }

  @test
  async crudWithCacheHitsAndInvalidation() {
    const api = this.client();
    const events: any[] = [];
    api.Company.on("change", (event: any) => events.push(event));
    const created = await api.Company.create({ name: "Acme", permissions: ["PRODUCT_1"] });
    assert.ok(created instanceof SdkModel);
    assert.strictEqual(created.name, "Acme");
    assert.ok(created.uuid);
    // The entity is cached by the create: the get is served from the cache, the second too
    const [a, b] = await Promise.all([api.Company.get(created.uuid), api.Company.get(created.uuid)]);
    assert.strictEqual(a.name, "Acme");
    assert.strictEqual(b.name, "Acme");
    assert.deepStrictEqual(SdkRestE2ETest.requests, ["POST /companies"]);
    // A query goes to the server, then is cached
    const page = await api.Company.query(`name = 'Acme'`);
    assert.strictEqual(page.results.length, 1);
    assert.strictEqual(page.results[0].uuid, created.uuid);
    await api.Company.query(`name = 'Acme'`);
    assert.deepStrictEqual(SdkRestE2ETest.requests, ["POST /companies", "PUT /companies"]);
    // count is sent to the server; Company has no complete permission query, so no total comes back
    const counted = await api.Company.query(`name = 'Acme'`, { count: true, cache: "no-store" });
    assert.strictEqual(counted.results.length, 1);
    assert.strictEqual(counted.total, undefined);
    SdkRestE2ETest.requests.pop();
    // Patch: the entity is merged, the queries invalidated, change emitted
    const patched = await api.Company.patch(created.uuid, { name: "Acme Inc" });
    assert.strictEqual(patched.name, "Acme Inc");
    assert.strictEqual((await api.Company.get(created.uuid)).name, "Acme Inc");
    assert.ok(events.some(event => event.type === "invalidate"));
    assert.ok(events.some(event => event.type === "set" && event.uid === created.uuid));
    assert.strictEqual(api.cache.getQuery("WebdaDemo/Company", "name = 'Acme'"), undefined);
    assert.strictEqual(SdkRestE2ETest.requests.at(-1), `PATCH /companies/${created.uuid}`);
    // Reload bypasses the cache
    const reloaded = await api.Company.get(created.uuid, { cache: "reload" });
    assert.strictEqual(reloaded.name, "Acme Inc");
    assert.strictEqual(SdkRestE2ETest.requests.at(-1), `GET /companies/${created.uuid}`);
    // @Shared method, running in the generated class
    assert.strictEqual(reloaded.hasPermission("PRODUCT_1"), true);
    assert.strictEqual(reloaded.hasPermission("PRODUCT_2"), false);
    // Save (PUT) and delete through the instance
    reloaded.name = "Acme Corp";
    await reloaded.save();
    assert.strictEqual(SdkRestE2ETest.requests.at(-1), `PUT /companies/${created.uuid}`);
    assert.strictEqual((await api.Company.get(created.uuid, { cache: "reload" })).name, "Acme Corp");
    await reloaded.delete();
    assert.strictEqual(api.cache.getEntity("WebdaDemo/Company", created.uuid), undefined);
    const error: SdkError = await api.Company.get(created.uuid).catch((e: SdkError) => e);
    assert.ok(error instanceof SdkError, `${error}`);
    assert.strictEqual(error.status, 404);
  }

  @test
  async nestedModelsRelationsAndActions() {
    const api = this.client();
    const company = await api.Company.create({ name: "Nested" });
    // Create a child through the SDK: the parent id of the route comes from the data
    const user = await api.User.create({ company: company.uuid, name: "Bob" });
    assert.strictEqual(SdkRestE2ETest.requests.at(-1), `POST /companies/${company.uuid}/users`);
    assert.ok(user.company instanceof Link);
    assert.strictEqual(String(user.company), company.uuid);
    // Link.get() is served from the cache
    let requests = SdkRestE2ETest.requests.length;
    const parent = await user.company.get();
    assert.strictEqual(parent.name, "Nested");
    assert.strictEqual(SdkRestE2ETest.requests.length, requests);
    // get on the nested model: the parent is resolved from the cached entity
    await api.User.get(user.uuid, { cache: "reload" });
    assert.strictEqual(SdkRestE2ETest.requests.at(-1), `GET /companies/${company.uuid}/users/${user.uuid}`);
    // The sample Project models generate no uuid and refuse a client one: seed them on the server
    const SubSubProject = useModel<any>("WebdaDemo/SubSubProject");
    const seed = async (name: string, attribute1: string) =>
      (
        await SubSubProject.create({
          uuid: randomUUID(),
          company: company.uuid,
          name,
          type: "sub",
          attribute1,
          n: 1,
          test2: "t",
          acls: []
        })
      ).getUUID();
    const zeta = await seed("Zeta", "a");
    const alpha = await seed("Alpha", "b");
    // Explicit parents when nothing is cached
    const project = await api.SubSubProject.get(zeta, { parents: [company.uuid] });
    assert.strictEqual(SdkRestE2ETest.requests.at(-1), `GET /companies/${company.uuid}/subSubProjects/${zeta}`);
    assert.strictEqual(project.attribute1, "a");
    assert.ok(project.company instanceof Link);
    // Patch on the nested route, the parent resolved from the cache
    const patched = await api.SubSubProject.patch(zeta, { attribute1: "patched" });
    assert.strictEqual(SdkRestE2ETest.requests.at(-1), `PATCH /companies/${company.uuid}/subSubProjects/${zeta}`);
    assert.strictEqual(patched.attribute1, "patched");
    assert.strictEqual((await SubSubProject.ref(zeta).get()).attribute1, "patched");
    // @Shared instance and static methods, inherited from Project, run identically to the server's
    const server = await SubSubProject.ref(zeta).get();
    assert.strictEqual(project.displayName(), server.displayName());
    assert.strictEqual(project.displayName(), "Zeta (sub)");
    const SdkProject = SdkRestE2ETest.sdk.SubSubProject;
    assert.deepStrictEqual(
      SdkProject.sortByName([{ name: "b" }, { name: "a" }]),
      SubSubProject.sortByName([{ name: "b" }, { name: "a" }])
    );
    // Related: the company's users through the nested query route, the parent id taken from the relation
    assert.ok(parent.users instanceof Related);
    assert.ok(parent._projects instanceof Related);
    await api.User.create({ company: company.uuid, name: "Alice" });
    const related = await parent.users.query("ORDER BY name");
    assert.deepStrictEqual(
      related.results.map((u: any) => u.name),
      ["Alice", "Bob"]
    );
    assert.strictEqual(SdkRestE2ETest.requests.at(-1), `PUT /companies/${company.uuid}/users`);
    const names: string[] = [];
    for await (const u of parent.users.iterate("name = 'Alice'")) names.push(u.name);
    assert.deepStrictEqual(names, ["Alice"]);
    for (const u of related.results) if (u.name === "Alice") await u.delete();
    // Custom action with its typed body, the uuid in the path
    requests = SdkRestE2ETest.requests.length;
    await api.SubSubProject.actionAction(zeta, { param: "x" });
    assert.strictEqual(SdkRestE2ETest.requests.length, requests + 1);
    assert.strictEqual(SdkRestE2ETest.requests.at(-1), `PUT /companies/${company.uuid}/subSubProjects/${zeta}/action`);
    // Typed operation call and keys
    const got = await api.call("Company.Get", { uuid: company.uuid });
    assert.strictEqual(got.name, "Nested");
    assert.deepStrictEqual(api.Company.keys.get(company.uuid), ["WebdaDemo/Company", "get", company.uuid]);
    // Delete on the nested route
    await api.SubSubProject.delete(alpha, { parents: [company.uuid] });
    assert.strictEqual(SdkRestE2ETest.requests.at(-1), `DELETE /companies/${company.uuid}/subSubProjects/${alpha}`);
    assert.strictEqual(
      (await SubSubProject.query("")).results.some((p: any) => p.getUUID() === alpha),
      false
    );
    await SubSubProject.ref(zeta).delete();
    await api.User.delete(user.uuid);
    await api.Company.delete(company.uuid);
  }

  @test
  async serverStreamingOverNdjsonAndSse() {
    const api = this.client();
    const chunks: unknown[] = [];
    for await (const chunk of api.stream("SdkFixture.Tail", { since: 10 })) chunks.push(chunk);
    assert.deepStrictEqual(chunks, [{ n: 11 }, "scalar", { n: 13 }]);
    const sse: unknown[] = [];
    for await (const chunk of api.stream(
      "SdkFixture.Tail",
      { since: 0 },
      { headers: { Accept: "text/event-stream" } }
    )) {
      sse.push(chunk);
    }
    assert.deepStrictEqual(sse, [{ n: 1 }, "scalar", { n: 3 }]);
    const got: unknown[] = [];
    const run = async () => {
      for await (const chunk of api.stream("SdkFixture.Fail")) got.push(chunk);
    };
    const error: SdkError = await run().catch((e: SdkError) => e);
    assert.ok(error instanceof SdkError);
    assert.strictEqual(error.status, 400);
    assert.strictEqual(error.message, "Bad frame");
    assert.deepStrictEqual(got, [{ n: 1 }]);
  }

  @test
  async staleWhileRevalidateAndManualInvalidation() {
    const api = this.client({ cache: { ttl: 1, staleWhileRevalidate: true } });
    const company = await api.Company.create({ name: "Stale" });
    await new Promise(resolve => setTimeout(resolve, 5));
    await api.Company.patch(company.uuid, { name: "Fresh" }, { cache: "no-store" });
    api.cache.setEntity("WebdaDemo/Company", company.uuid, { ...company.toJSON(), name: "Stale" });
    // Past the ttl: the stale entry is served and refreshed in the background
    await new Promise(resolve => setTimeout(resolve, 5));
    const served = await api.Company.get(company.uuid);
    assert.strictEqual(served.name, "Stale");
    for (let i = 0; i < 50 && api.cache.getEntity("WebdaDemo/Company", company.uuid)?.data.name !== "Fresh"; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.strictEqual(api.cache.getEntity("WebdaDemo/Company", company.uuid)?.data.name, "Fresh");
    api.cache.invalidate("WebdaDemo/Company");
    await api.Company.delete(company.uuid);
  }
}
