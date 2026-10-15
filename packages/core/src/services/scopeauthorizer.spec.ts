import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { TestApplication } from "../test/objects.js";
import { Service } from "./service.js";
import { Session } from "../session/session.js";
import { useService } from "../core/hooks.js";
import { callOperation, canCallOperation, registerOperation } from "../core/operations.js";
import { InsufficientScope } from "./scopeauthorizer.js";

class ScopedService extends Service {
  async run(): Promise<void> {
    // intentionally empty
  }
}

@suite
class ScopeAuthorizerTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        Scoped: { type: "ScopedService" },
        AuthStore: { type: "Webda/MemoryStore", models: ["Webda/RefreshToken"] }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/ScopedService", ScopedService);
  }

  async beforeEach() {
    await super.beforeEach();
    for (const id of ["Scoped.Read", "Scoped.Write", "Scoped.Admin"]) {
      registerOperation(id, {
        service: "Scoped",
        method: "run",
        input: "void",
        output: "void",
        ...(id === "Scoped.Admin" ? { permission: "roles CONTAINS 'admin'" } : {})
      } as any);
    }
  }

  async session(scopes?: string[]) {
    const ctx = await this.newContext();
    const session = new Session();
    session.login("u1", "i1");
    if (scopes) session.scopes = scopes;
    ctx.setSession(session);
    return ctx;
  }

  @test
  async refusesOutOfScope() {
    const ctx = await this.session(["Scoped.Read"]);
    assert.strictEqual(await canCallOperation(ctx, "Scoped.Read"), true);
    assert.strictEqual(await canCallOperation(ctx, "Scoped.Write"), false);
    await assert.rejects(
      () => callOperation(ctx, "Scoped.Write"),
      (err: any) => {
        assert.ok(err instanceof InsufficientScope);
        assert.strictEqual(err.getResponseCode(), 403);
        assert.strictEqual(err.code, "insufficient_scope");
        assert.deepStrictEqual(err.details, { error: "insufficient_scope", operation: "Scoped.Write" });
        return true;
      }
    );
    await callOperation(ctx, "Scoped.Read");
  }

  @test
  async globsAndWildcard() {
    const ctx = await this.session(["Scoped.*"]);
    assert.strictEqual(await canCallOperation(ctx, "Scoped.Write"), true);
    (await this.session(["Other.*"])).getSession();
    assert.strictEqual(await canCallOperation(await this.session(["Other.*"]), "Scoped.Write"), false);
    assert.strictEqual(await canCallOperation(await this.session(["*"]), "Scoped.Write"), true);
  }

  @test
  async unrestrictedWithoutScopes() {
    const ctx = await this.session();
    assert.strictEqual(ctx.getSession().scopes, undefined);
    assert.strictEqual(await canCallOperation(ctx, "Scoped.Write"), true);
  }

  @test
  async neverExceedsUserPermission() {
    const ctx = await this.session(["*"]);
    assert.strictEqual(await canCallOperation(ctx, "Scoped.Admin"), false);
  }

  @test
  async cookieSessionNeverScoped() {
    // Even if scopes end up stored with a cookie session, loading it must drop them
    const session = new Session();
    session.login("u1", "i1");
    session.scopes = ["Scoped.Read"];
    session.clientId = "cli";
    const manager = useService("SessionManager");
    const first = await this.newContext();
    await manager.save(first, session);
    await new Promise(resolve => setTimeout(resolve, 20));
    const ctx = await this.newContext();
    const sent: any = first.getResponseCookies();
    ctx.getHttpContext().cookies = {};
    for (const name of Object.keys(sent)) ctx.getHttpContext().cookies[name] = sent[name].value;
    const reloaded = await manager.load(ctx);
    assert.ok(reloaded.isLogged());
    assert.strictEqual(reloaded.scopes, undefined);
    assert.strictEqual(reloaded.clientId, undefined);
  }

  @test
  async bearerSessionCarriesScopes() {
    const s = new Session();
    s.login("u1", "a@b.c:email", { provider: "email", amr: ["pwd"] });
    const token = (await useService("TokenService").issue(s, undefined, { scope: ["Scoped.Read"] })).accessToken;
    const ctx = await this.newContext();
    ctx.getHttpContext().headers["authorization"] = `Bearer ${token}`;
    const loaded = await useService("SessionManager").load(ctx);
    assert.deepStrictEqual(loaded.scopes, ["Scoped.Read"]);
  }
}
