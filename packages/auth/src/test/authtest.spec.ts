import { suite, test } from "@webda/test";
import { registerOperation, Service, useContext, WebdaError } from "@webda/core";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import * as assert from "assert";
import { AuthTest } from "./authtest.js";

/**
 * Trivial service exposing operations to prove the AuthTest helpers
 */
class EchoService extends Service {
  /**
   * @param input - request body
   * @returns the input
   */
  async echo(input: any) {
    return { echo: input };
  }

  /**
   * Count calls in the session
   * @returns the counter
   */
  async count() {
    const session: any = useContext().getSession();
    session.count = (session.count || 0) + 1;
    return { count: session.count };
  }

  /**
   * Always fails
   */
  async fail() {
    throw new WebdaError.BadRequest("nope");
  }
}

@suite
class AuthTestHelperTest extends AuthTest {
  /** @override */
  getTestConfiguration() {
    return {
      version: 3,
      parameters: { ignoreBeans: true },
      services: {
        AuthStore: { type: "Webda/MemoryStore", models: ["Webda/User", "Webda/Ident", "Webda/RefreshToken"] },
        DefinedMailer: { type: "WebdaTest/Mailer" },
        EchoService: { type: "EchoService" }
      }
    };
  }

  /** @override */
  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    app.addModda("Webda/EchoService", EchoService);
  }

  @test
  async opPassesInputAndKeepsSession() {
    registerOperation("Echo.Echo", { service: "EchoService", method: "echo" });
    registerOperation("Echo.Count", { service: "EchoService", method: "count" });
    registerOperation("Echo.Fail", { service: "EchoService", method: "fail" });
    assert.ok(this.mailer);
    assert.deepStrictEqual(await this.op("Echo.Echo", { a: 1 }), { echo: { a: 1 } });
    assert.deepStrictEqual(await this.op("Echo.Echo", { b: 2 }), { echo: { b: 2 } });
    const ctx = await this.ctx();
    assert.strictEqual((await this.op("Echo.Count", {}, ctx)).count, 1);
    assert.strictEqual((await this.op("Echo.Count", {}, ctx)).count, 2);
    assert.strictEqual((await this.op("Echo.Count")).count, 1);
    assert.strictEqual(await this.inContext(ctx, async () => 42), 42);
    await assert.rejects(() => this.op("Echo.Fail"), /nope/);
  }
}
