import * as assert from "assert";
import { suite, test, testOverload } from "@testdeck/mocha";
import { WebdaTest } from "../test";
import { OAuthService } from "./oauth";
import { HttpContext, Ident, Store } from "../";
import * as sinon from "sinon";

class FakeOAuthService extends OAuthService {
  getDefaultUrl() {
    return "/fake";
  }

  generateAuthUrl() {
    return "/fakeredirect";
  }

  async handleToken() {
    return {
      identId: "i1",
      profile: {}
    };
  }

  async handleCallback() {
    return this.handleToken();
  }

  getName() {
    return "fake";
  }

  getCallbackReferer(): RegExp[] {
    return [/bouzouf\d?\.com$/];
  }
}

@suite
class OAuthServiceTest extends WebdaTest {
  service: OAuthService;

  async before() {
    await super.before();
    this.service = new FakeOAuthService(this.webda, "oauth", {
      authorized_uris: ["https://redirect.me/plop"]
    });
    this.registerService("oauth", this.service);
  }

  @test
  async testCheckRequest() {
    let ctx = await this.newContext();
    ctx.setHttpContext(new HttpContext("bouzouf.com", "GET", "/fake", "https", 80, null, { referer: "bouzouf.com" }));
    assert.strictEqual(await this.service.checkRequest(ctx), true, "should allow bouzouf.com referer");
    ctx.setHttpContext(new HttpContext("bouzouf.com", "GET", "/fake", "https", 80, null, { referer: "bouzouf2.com" }));
    assert.strictEqual(await this.service.checkRequest(ctx), true, "should allow bouzouf2.com referer");

    ctx.setHttpContext(new HttpContext("bouzouf.com", "GET", "/fake", "https", 80, null, { referer: "bouzouf12.com" }));
    assert.strictEqual(await this.service.checkRequest(ctx), false, "should not allow bouzouf12.com referer");

    ctx.setHttpContext(new HttpContext("bouzouf.com", "GET", "/plop", "https", 80, null, { referer: "bouzouf.com" }));
    assert.strictEqual(await this.service.checkRequest(ctx), false, "should allow bouzouf.com only on its own url");

    ctx.setHttpContext(new HttpContext("bouzouf.com", "GET", "/fake", "https", 80, null, {}));
    assert.strictEqual(await this.service.checkRequest(ctx), false, "should not allow without referer");

    this.service.getParameters().no_referer = true;

    ctx.setHttpContext(new HttpContext("bouzouf.com", "GET", "/fake", "https", 80, null, {}));
    assert.strictEqual(await this.service.checkRequest(ctx), true, "should allow without referer");
  }

  @test
  async misc() {
    this.service.resolve();
    assert.notStrictEqual(this.service._authenticationService, undefined, "Should get default Authentication service");
    // Test the 403 on handleReturn
    assert.rejects(() => this.service.handleReturn(undefined, undefined, undefined), /403/);
    let ctx = await this.newContext();
    await this.webda.getService<Store<Ident>>("Idents").__clean();
    // Register with oauth
    await this.service.handleReturn(ctx, "plop", { email: "rcattiau@gmail.com" }, undefined);
    // We should have two idents existing now
    assert.strictEqual(await this.webda.getService<Store<Ident>>("Idents").exists("plop_fake"), true);
    assert.strictEqual(await this.webda.getService<Store<Ident>>("Idents").exists("rcattiau@gmail.com_email"), true);
    ctx.newSession();
    // Log with known ident / email
    assert.strictEqual(ctx.getSession().getIdentUsed(), undefined);
    await this.service.handleReturn(ctx, "plop", { email: "rcattiau@gmail.com" }, undefined);
    assert.strictEqual(ctx.getSession().getIdentUsed(), "plop_fake");
    let userId = ctx.getCurrentUserId();
    ctx.newSession();
    // Log with new ident / known email
    await this.service.handleReturn(ctx, "plop2", { email: "rcattiau@gmail.com" }, undefined);
    assert.strictEqual(ctx.getSession().getIdentUsed(), "plop2_fake");
    assert.strictEqual(ctx.getCurrentUserId(), userId);
    await this.service.handleReturn(ctx, "plop3", { email: "rcattiau@gmail.com" }, undefined);
    // Default to false for token
    assert.rejects(() => this.getExecutor(ctx, "webda.io", "GET", "/fake/scope").execute(ctx), /404/);
    assert.rejects(() => this.getExecutor(ctx, "webda.io", "POST", "/fake/token").execute(ctx), /404/);
    // @ts-ignore
    this.service.parameters = this.service.loadParameters({
      authenticationService: "Authentication2",
      exposeScope: true,
      scope: ["email", "image"],
      url: "/bouzouf",
      authorized_uris: ["google.com"]
    });
    this.service.hasToken = () => true;
    this.service.resolve();
    assert.strictEqual(this.service._authenticationService, undefined, "Should not get any Authentication service");
    await this.getExecutor(ctx, "webda.io", "GET", "/bouzouf/scope").execute(ctx);
    assert.deepStrictEqual(JSON.parse(ctx.getResponseBody()), ["email", "image"]);
    let event = 0;
    this.service.addListener("OAuth.Token", () => {
      event++;
    });
    await this.getExecutor(ctx, "webda.io", "POST", "/bouzouf/token").execute(ctx);
    assert.strictEqual(event, 1);
    this.service.removeAllListeners();
    this.service.addListener("OAuth.Callback", () => {
      event++;
    });
    ctx.getSession().redirect = "bouzouf.com";
    await this.getExecutor(ctx, "webda.io", "GET", "/bouzouf/callback").execute(ctx);
    assert.strictEqual(event, 2);
    assert.strictEqual(ctx.getSession().redirect, "bouzouf.com");

    // @ts-ignore
    this.service.parameters = this.service.loadParameters({
      authenticationService: "Authentication2",
      exposeScope: true,
      scope: ["email", "image"],
      url: "/bouzouf"
    });
    ctx.getHttpContext().getHeaders().referer = "http://myownwebsite.com";
    this.service._redirect(ctx);
    assert.strictEqual(ctx.getSession().redirect, "http://myownwebsite.com");
  }

  @test
  async redirect() {
    this.service = new FakeOAuthService(this.webda, "oauth", {
      authorized_uris: ["https://redirect.me/plop"]
    });
    this.registerService("oauth", this.service);
    let ctx = await this.newContext();
    ctx.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/fake", "https", 443, undefined, {
        referer: "https://redirect.me/plop"
      })
    );
    await this.service._redirect(ctx);
    assert.notStrictEqual(ctx.getSession().state, undefined);
    assert.strictEqual(ctx.getSession().redirect, "https://redirect.me/plop");
    assert.strictEqual(ctx.getResponseHeaders().Location, "/fakeredirect");
    ctx.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/fake", "https", 443, undefined, {
        referer: "https://redirect.me/plop2"
      })
    );
    assert.throws(() => this.service._redirect(ctx), /401/);
    // Test w/o referer
    ctx.setHttpContext(new HttpContext("test.webda.io", "GET", "/fake"));
    assert.throws(() => this.service._redirect(ctx), /401/);
    // Enable the no_referer
    this.service.getParameters().no_referer = true;
    this.service._redirect(ctx);
    assert.strictEqual(ctx.getSession().redirect, undefined);
    assert.strictEqual(ctx.getResponseHeaders().Location, "/fakeredirect");
  }
}
