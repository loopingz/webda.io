import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { TestApplication } from "../test/objects.js";
import { Service } from "../services/service.js";
import { Session } from "../session/session.js";
import { useService } from "../core/hooks.js";
import { registerOperation } from "../core/operations.js";
import { HttpServer } from "../services/httpserver.service.js";

class ScopedService extends Service {
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
        Operations: { type: "Webda/OperationsTransport" },
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
    assert.strictEqual(res.body.operations["Scoped.Read"].id, "Scoped.Read");
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
}
