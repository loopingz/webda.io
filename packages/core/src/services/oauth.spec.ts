import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { HttpContext, Ident, Store } from "../";
import { WebdaTest } from "../test";
import { OAuthService, OAuthSession } from "./oauth";

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
    this.service = new FakeOAuthService(this.webda, "fake", {
      authorized_uris: ["https://redirect.me/plop"]
    });
    this.registerService(this.service);
  }

  @test
  async testCheckRequest() {
    let ctx = await this.newContext();
    ctx.setHttpContext(new HttpContext("bouzouf.com", "GET", "/fake", "https", 80, { referer: "bouzouf.com" }));
    assert.strictEqual(await this.service.checkRequest(ctx), true, "should allow bouzouf.com referer");
    ctx.setHttpContext(new HttpContext("bouzouf.com", "GET", "/fake", "https", 80, { referer: "bouzouf2.com" }));
    assert.strictEqual(await this.service.checkRequest(ctx), true, "should allow bouzouf2.com referer");

    ctx.setHttpContext(new HttpContext("bouzouf.com", "GET", "/fake", "https", 80, { referer: "bouzouf12.com" }));
    assert.strictEqual(await this.service.checkRequest(ctx), false, "should not allow bouzouf12.com referer");

    ctx.setHttpContext(new HttpContext("bouzouf.com", "GET", "/plop", "https", 80, { referer: "bouzouf.com" }));
    assert.strictEqual(await this.service.checkRequest(ctx), false, "should allow bouzouf.com only on its own url");

    ctx.setHttpContext(new HttpContext("bouzouf.com", "GET", "/fake", "https", 80, {}));
    assert.strictEqual(await this.service.checkRequest(ctx), false, "should not allow without referer");

    this.service.getParameters().no_referer = true;

    ctx.setHttpContext(new HttpContext("bouzouf.com", "GET", "/fake", "https", 80, {}));
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
    assert.strictEqual(ctx.getSession().identUsed, undefined);
    await this.service.handleReturn(ctx, "plop", { email: "rcattiau@gmail.com" }, undefined);
    assert.strictEqual(ctx.getSession().identUsed, "plop_fake");
    let userId = ctx.getCurrentUserId();
    ctx.newSession();
    // Log with new ident / known email
    await this.service.handleReturn(ctx, "plop2", { email: "rcattiau@gmail.com" }, undefined);
    assert.strictEqual(ctx.getSession().identUsed, "plop2_fake");
    assert.strictEqual(ctx.getCurrentUserId(), userId);
    await this.service.handleReturn(ctx, "plop3", { email: "rcattiau@gmail.com" }, undefined);
    // Default to false for token
    assert.rejects(() => this.execute(ctx, "webda.io", "GET", "/fake/scope"), /404/);
    assert.rejects(() => this.execute(ctx, "webda.io", "POST", "/fake/token"), /404/);
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
    this.registerService(this.service);
    assert.strictEqual(this.service._authenticationService, undefined, "Should not get any Authentication service");
    await this.execute(ctx, "webda.io", "GET", "/bouzouf/scope");
    assert.deepStrictEqual(JSON.parse(<string> ctx.getResponseBody()), ["email", "image"]);
    let event = 0;
    this.service.on("OAuth.Callback", evt => {
      if (evt.type === "token") {
        event++;
      }
    });
    await this.execute(ctx, "webda.io", "POST", "/bouzouf/token");
    assert.strictEqual(event, 1);
    this.service.removeAllListeners();
    this.service.on("OAuth.Callback", evt => {
      if (evt.type === "callback") {
        event++;
      }
    });
    ctx.getSession<OAuthSession>().oauth.redirect = "bouzouf.com";
    await this.getExecutor(ctx, "webda.io", "GET", "/bouzouf/callback").execute(ctx);
    assert.strictEqual(event, 2);
    assert.strictEqual(ctx.getResponseHeaders()["Location"], "bouzouf.com");
    assert.strictEqual(ctx.getSession<OAuthSession>().oauth.redirect, undefined);
    assert.strictEqual(ctx.getSession<OAuthSession>().oauth.state, undefined);

    // @ts-ignore
    this.service.parameters = this.service.loadParameters({
      authenticationService: "Authentication2",
      exposeScope: true,
      scope: ["email", "image"],
      url: "/bouzouf"
    });
    // @ts-ignore readonly
    ctx.getHttpContext().getHeaders().referer = "http://myownwebsite.com";
    this.service._redirect(ctx);
    assert.strictEqual(ctx.getSession<OAuthSession>().oauth.redirect, "http://myownwebsite.com");
  }

  @test
  async redirect() {
    let ctx = await this.newContext();
    ctx.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/fake", "https", 443, {
        referer: "https://redirect.me/plop"
      })
    );
    await this.service._redirect(ctx);
    assert.notStrictEqual(ctx.getSession<OAuthSession>().oauth.state, undefined);
    assert.strictEqual(ctx.getSession<OAuthSession>().oauth.redirect, "https://redirect.me/plop");
    assert.strictEqual(ctx.getResponseHeaders().Location, "/fakeredirect");
    ctx.setHttpContext(
      new HttpContext("test.webda.io", "GET", "/fake", "https", 443, {
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
    assert.strictEqual(ctx.getSession<OAuthSession>().oauth.redirect, undefined);
    assert.strictEqual(ctx.getResponseHeaders().Location, "/fakeredirect");
  }
}
