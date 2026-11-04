import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { TestApplication } from "../test/objects.js";
import { Service } from "../services/service.js";
import { Session } from "../session/session.js";
import { useService } from "../core/hooks.js";
import { useApplication, useModel } from "../application/hooks.js";
import { registerOperation } from "../core/operations.js";
import { HttpServer } from "../services/httpserver.service.js";
import { OperationIdTransport } from "./operationstransport.service.js";

class ScopedService extends Service {
  last: any;
  async echo(id?: string, other?: string): Promise<any> {
    this.last = { id, other };
    return this.last;
  }

  async run(): Promise<void> {
    // intentionally empty
  }
}

@suite
class OperationsTransportTest extends WebdaApplicationTest {
  port: number;

  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        Scoped: { type: "ScopedService" },
        HttpServer: { type: "Webda/HttpServer" },
        Operations: { type: "Webda/OperationsTransport", cli: { version_range: ">=1.4.0" } },
        AuthStore: { type: "Webda/MemoryStore", models: ["Webda/RefreshToken", "Webda/RevokedAccess"] }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/ScopedService", ScopedService);
  }

  async beforeEach() {
    await super.beforeEach();
    for (const id of ["Scoped.Read", "Scoped.Write"]) {
      registerOperation(id, { service: "Scoped", method: "run", input: "void", output: "void" } as any);
    }
    useApplication<any>().getSchemas()["Scoped.Echo"] = {
      type: "object",
      properties: { id: { type: "string" }, other: { type: "string" } },
      additionalProperties: false
    };
    registerOperation("Scoped.Echo", {
      service: "Scoped",
      method: "echo",
      input: "Scoped.Echo",
      output: "void"
    } as any);
    registerOperation("Scoped.Hidden", { service: "Scoped", method: "run", hidden: true } as any);
    registerOperation("Scoped.ClientStream", {
      service: "Scoped",
      method: "run",
      streaming: "client"
    } as any);
    await useService<HttpServer>("HttpServer").start("127.0.0.1", 0);
    this.port = (<any>useService<HttpServer>("HttpServer").server.address()).port;
  }

  async afterEach() {
    await useService<HttpServer>("HttpServer").stop();
    await super.afterEach();
  }

  /**
   * Real HTTP request with a bearer token carrying the given scopes
   */
  async http(method: string, path: string, body: any, { bearerScopes }: { bearerScopes: string[] }) {
    const session = new Session();
    session.login("u1", "a@b.c:email", { provider: "email", amr: ["pwd"] });
    const token = (
      await useService("TokenService").issue(session, undefined, { scope: bearerScopes, clientId: "test" })
    ).accessToken;
    const res = await fetch(`http://127.0.0.1:${this.port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  }

  @test
  async listsOnlyCallableOperations() {
    const res = await this.http("GET", "/operations", undefined, { bearerScopes: ["Scoped.Read"] });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(Object.keys(res.body.operations), ["Scoped.Read"]);
    // The version identifies the listing: stable for the same operations, different for another listing
    assert.match(res.body.version, /^[0-9a-f]{16}$/);
    const again = await this.http("GET", "/operations", undefined, { bearerScopes: ["Scoped.Read"] });
    assert.strictEqual(again.body.version, res.body.version);
    const wider = await this.http("GET", "/operations", undefined, { bearerScopes: ["*"] });
    assert.notStrictEqual(wider.body.version, res.body.version);
    assert.strictEqual(res.body.operations["Scoped.Read"].id, "Scoped.Read");
    assert.deepStrictEqual(res.body.cli, { version_range: ">=1.4.0" });
  }

  @test
  async advertisesCliRequirements() {
    const params = useService<OperationIdTransport>("Operations").getParameters();
    const previous = params.cli;
    const original = await this.http("GET", "/operations", undefined, { bearerScopes: ["Scoped.Read"] });
    try {
      delete params.cli;
      const unspecified = await this.http("GET", "/operations", undefined, { bearerScopes: ["Scoped.Read"] });
      assert.strictEqual(unspecified.status, 200);
      assert.strictEqual(Object.hasOwn(unspecified.body, "cli"), false);
      assert.deepStrictEqual(unspecified.body.operations, original.body.operations);
      assert.strictEqual(unspecified.body.version, original.body.version);

      params.cli = { version_range: ">=1.5.0", download_url: "https://example.com/cli/releases" };
      const custom = await this.http("GET", "/operations", undefined, { bearerScopes: ["Scoped.Read"] });
      assert.deepStrictEqual(custom.body.cli, params.cli);
      assert.strictEqual(custom.body.version, original.body.version);
    } finally {
      params.cli = previous;
    }
  }

  @test
  async listsModelPluralAliases() {
    // Model operations are named after the singular (RefreshToken.Get) and the plural (RefreshTokens.Query)
    const model = useModel("Webda/RefreshToken");
    for (const id of ["RefreshToken.Get", "RefreshTokens.Query"]) {
      registerOperation(id, {
        service: "Scoped",
        method: "run",
        input: "void",
        output: "void",
        context: { model }
      } as any);
    }
    const all = await this.http("GET", "/operations", undefined, { bearerScopes: ["*"] });
    assert.deepStrictEqual(all.body.aliases, { RefreshTokens: "RefreshToken" });
    // Only the models of the listed operations are disclosed
    const scoped = await this.http("GET", "/operations", undefined, { bearerScopes: ["Scoped.Read"] });
    assert.strictEqual(scoped.body.aliases, undefined);
  }

  @test
  async callsOperation() {
    const res = await this.http("POST", "/operations/Scoped.Read", { id: "x" }, { bearerScopes: ["*"] });
    // The operation has a void output
    assert.strictEqual(res.status, 204);
  }

  @test
  async refusesWithInsufficientScope() {
    const res = await this.http("POST", "/operations/Scoped.Write", {}, { bearerScopes: ["Scoped.Read"] });
    assert.strictEqual(res.status, 403);
    assert.deepStrictEqual(res.body, { error: "insufficient_scope", operation: "Scoped.Write" });
    assert.match(res.headers.get("WWW-Authenticate"), /Bearer error="insufficient_scope", scope="Scoped.Write"/);
  }

  @test
  async unknownOperation() {
    const res = await this.http("POST", "/operations/Nope.Nope", {}, { bearerScopes: ["*"] });
    assert.strictEqual(res.status, 404);
  }

  @test
  async hiddenAndStreamedOperationsAreNotServed() {
    const all = await this.http("GET", "/operations", undefined, { bearerScopes: ["*"] });
    assert.ok(all.body.operations["Scoped.Read"]);
    assert.strictEqual(all.body.operations["Scoped.Hidden"], undefined);
    assert.strictEqual(all.body.operations["Scoped.ClientStream"], undefined);
    for (const id of ["Scoped.Hidden", "Scoped.ClientStream"]) {
      assert.strictEqual((await this.http("POST", `/operations/${id}`, {}, { bearerScopes: ["*"] })).status, 404);
    }
  }

  @test
  async prototypeKeysAreUnknown() {
    for (const id of ["constructor", "toString", "__proto__"]) {
      assert.strictEqual((await this.http("POST", `/operations/${id}`, {}, { bearerScopes: ["*"] })).status, 404);
    }
  }

  @test
  async routeIdIsNotAnInput() {
    const service = useService<any>("Scoped");
    const res = await this.http("POST", "/operations/Scoped.Echo", { other: "o" }, { bearerScopes: ["*"] });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(service.last, { id: undefined, other: "o" });
    await this.http("POST", "/operations/Scoped.Echo", { id: "mine" }, { bearerScopes: ["*"] });
    assert.deepStrictEqual(service.last, { id: "mine", other: undefined });
  }

  @test
  async honoursOperationsFilter() {
    const params = useService<any>("Operations").getParameters();
    const previous = params.operations;
    params.operations = ["Scoped.Read"];
    try {
      const list = await this.http("GET", "/operations", undefined, { bearerScopes: ["*"] });
      assert.deepStrictEqual(Object.keys(list.body.operations), ["Scoped.Read"]);
      assert.strictEqual(
        (await this.http("POST", "/operations/Scoped.Write", {}, { bearerScopes: ["*"] })).status,
        404
      );
    } finally {
      params.operations = previous;
    }
  }
}
