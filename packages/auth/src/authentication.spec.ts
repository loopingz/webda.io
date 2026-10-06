import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Service, useService, WebdaError } from "@webda/core";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import { AuthTest } from "./test/authtest.js";
import { Authentication } from "./authentication.service.js";

class FakeProvider extends Service {
  readonly providerName = "fake";
  getPublicInfo() {
    return { name: "fake", type: "oauth" as const, startUrl: "/auth/fake" };
  }
}

@suite
class AuthenticationSkeletonTest extends AuthTest {
  auth: Authentication;

  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        AuthStore: { type: "Webda/MemoryStore", models: ["Webda/User", "Webda/Ident", "Webda/RefreshToken"] },
        Authentication: { type: "Webda/Authentication" },
        fake: { type: "WebdaTest/FakeProvider" }
      }
    };
  }

  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    app.addModda("WebdaTest/FakeProvider", FakeProvider);
  }

  async beforeEach() {
    await super.beforeEach();
    this.auth = useService("Authentication" as any);
  }

  @test
  async listsProviders() {
    assert.deepStrictEqual(this.auth.getProviders(), [{ name: "fake", type: "oauth", startUrl: "/auth/fake" }]);
    assert.deepStrictEqual(await this.op("Auth.Providers"), [{ name: "fake", type: "oauth", startUrl: "/auth/fake" }]);
  }

  @test
  async meRequiresLogin() {
    await assert.rejects(() => this.op("Auth.Me"), WebdaError.NotFound);
    const user = await this.auth.getUserModel().create({ displayName: "Bob", __hidden: 1 } as any);
    const ctx = await this.ctx();
    ctx.getSession().login(user.getUUID(), "bob:fake");
    const me = await this.op("Auth.Me", undefined, ctx);
    assert.strictEqual(me.displayName, "Bob");
    assert.strictEqual(me.__hidden, undefined);
  }

  @test
  async duplicateProviderNames() {
    const dup = new FakeProvider("fake2", {} as any);
    this.registerService(dup, "fake2");
    assert.throws(() => this.auth.resolve(), /Duplicate auth provider 'fake'/);
  }
}
