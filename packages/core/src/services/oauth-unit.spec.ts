import { suite, test } from "@webda/test";
import * as assert from "assert";
import { getMetadata } from "@webda/decorators";
import { OAuthService, OAuthServiceParameters } from "./oauth.js";
import { WebContext } from "../contexts/webcontext.js";
import { OperationContext } from "../contexts/operationcontext.js";

/**
 * Minimal concrete subclass — enough to instantiate and inspect metadata.
 */
class FakeOAuth extends OAuthService {
  getDefaultUrl(): string {
    return "/fake";
  }
  getCallbackReferer(): RegExp[] {
    return [/example\.com$/];
  }
  getName(): string {
    return "Fake";
  }
  generateAuthUrl(_redirect_uri: string, _state: string, _ctx: WebContext) {
    return "/authorize";
  }
  async handleToken(_ctx: OperationContext) {
    return { identId: "i1", profile: {} };
  }
  async handleCallback(_ctx: WebContext) {
    return { identId: "i1", profile: {} };
  }
}

@suite
class OAuthUnitTest {
  @test
  getOpenApiReplacementsIncludesProviderName() {
    const svc = new FakeOAuth("Fake", new OAuthServiceParameters().load({}));
    const replacements = svc.getOpenApiReplacements();
    assert.strictEqual(replacements.name, "Fake");
  }

  @test
  redirectRouteIsRegisteredViaDecorator() {
    const routes: Record<string, any[]> = getMetadata(FakeOAuth as any)?.["webda.route"] || {};
    const redirectRoute = routes[".{?redirect?}"];
    assert.ok(redirectRoute, "Expected @Route(\".{?redirect?}\") on _redirect");
    assert.deepStrictEqual(redirectRoute[0].methods, ["GET"]);
    assert.strictEqual(redirectRoute[0].executor, "_redirect");
    assert.strictEqual(redirectRoute[0].openapi.get.description, "Log with a ${name} account");
  }
}

export { OAuthUnitTest };
