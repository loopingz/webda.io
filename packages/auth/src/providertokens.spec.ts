import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Ident, useService } from "@webda/core";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import { AuthTest } from "./test/authtest.js";
import { addStubProviders, stubProvidersConfig } from "./test/stubprovider.js";
import { Authentication } from "./authentication.service.js";

const TOKENS = { access_token: "secret-access-value", refresh_token: "secret-refresh-value" };

const google = (uid: string, tokens: any = TOKENS) => ({
  provider: "google",
  providerUid: uid,
  email: `${uid}@x.com`,
  emailVerified: true,
  amr: ["oauth"],
  profile: { name: "G" },
  tokens
});

@suite
class ProviderTokensTest extends AuthTest {
  auth: Authentication;

  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        AuthStore: { type: "Webda/MemoryStore", models: ["Webda/User", "Webda/Ident", "Webda/RefreshToken"] },
        Authentication: { type: "Webda/Authentication" },
        ...stubProvidersConfig("google")
      }
    };
  }

  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    addStubProviders(app, "google");
  }

  async beforeEach() {
    await super.beforeEach();
    this.auth = useService("Authentication" as any);
    delete (this.auth as any).mfaMethods;
  }

  /**
   * @returns every raw record of the memory store
   */
  rawRecords(): string {
    const repository: any = Ident.getRepository();
    return [...((repository.repository ?? repository).storage as Map<string, string>).values()].join("\n");
  }

  @test
  async tokensAreEncryptedOnCreationAndLogin() {
    const ctx = await this.ctx();
    await this.inContext(ctx, () => this.auth.complete(google("t1")));
    let ident = await Ident.ref(Ident.key("t1", "google")).get();
    assert.deepStrictEqual(await ident.tokens.get(), TOKENS);
    assert.ok(!this.rawRecords().includes("secret-"), "no plaintext token at rest");
    // A later login replaces them, still encrypted
    const next = { access_token: "secret-access-2" };
    await this.inContext(await this.ctx(), () => this.auth.complete(google("t1", next)));
    ident = await Ident.ref(Ident.key("t1", "google")).get();
    assert.deepStrictEqual(await ident.tokens.get(), next);
    assert.ok(!this.rawRecords().includes("secret-"));
    // A login without tokens keeps the stored ones
    await this.inContext(await this.ctx(), () => this.auth.complete(google("t1", null)));
    ident = await Ident.ref(Ident.key("t1", "google")).get();
    assert.deepStrictEqual(await ident.tokens.get(), next);
  }

  @test
  async legacyPlaintextTokensAreDropped() {
    await this.inContext(await this.ctx(), () => this.auth.complete(google("t2", null)));
    // A record written by an earlier v4 beta, with plaintext tokens
    await Ident.ref(Ident.key("t2", "google")).patch({ __tokens: { access: "secret-legacy" } } as any);
    assert.ok(this.rawRecords().includes("secret-legacy"));
    await this.inContext(await this.ctx(), () => this.auth.complete(google("t2")));
    assert.ok(!this.rawRecords().includes("secret-"));
  }

  @test
  async eventsCarryNoProviderTokens() {
    const events: any[] = [];
    for (const name of ["Authentication.Login", "Authentication.Register"]) {
      this.auth.on(name as any, (evt: any) => {
        events.push({ name, evt });
      });
    }
    await this.inContext(await this.ctx(), () => this.auth.complete(google("t3")));
    assert.deepStrictEqual(
      events.map(e => e.name),
      ["Authentication.Register", "Authentication.Login"]
    );
    for (const { name, evt } of events) {
      assert.ok(evt.identity, name);
      assert.strictEqual(evt.identity.tokens, undefined, name);
      assert.ok(!JSON.stringify(evt.identity).includes("secret-"), name);
    }
  }

  @test
  async tokensPersistedWhenMfaIsPending() {
    // First login registers the user
    await this.inContext(await this.ctx(), () => this.auth.complete(google("t4", null)));
    (this.auth as any).mfaMethods = () => ["totp"];
    const ctx = await this.ctx();
    const res: any = await this.inContext(ctx, () => this.auth.complete(google("t4")));
    assert.strictEqual(res.status, "mfa_required");
    const ident = await Ident.ref(Ident.key("t4", "google")).get();
    assert.deepStrictEqual(await ident.tokens.get(), TOKENS);
  }
}
