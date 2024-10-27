import { suite, test } from "@webda/test";
import * as assert from "assert";
import { HttpContext, Ident, Store, UnpackedConfiguration, WebdaError } from "../";

import { OAuthService, OAuthSession } from "./oauth";
import { WebdaApplicationTest } from "../test/test";
import { TestApplication } from "../test/objects";

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
class OAuthServiceTest extends WebdaApplicationTest {
  service: OAuthService;

  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      parameters: {
        ignoreBeans: true
      },
      services: {
        fake: {
          type: "Webda/FakeOAuthService",
          authorized_uris: ["https://redirect.me/plop"]
        },
        Authentication: {
          type: "Authentication"
        },
        Idents: {
          type: "MemoryStore",
          model: "Webda/Ident"
        },
        Users: {
          type: "MemoryStore",
          model: "Webda/User"
        }
      }
    };
  }

  static async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    app.addService("Webda/FakeOAuthService", FakeOAuthService);
  }

  @test
  async testCheckRequest() {
    this.service = this.getService("fake");
    const ctx = await this.newContext();
    ctx.setHttpContext(
      new HttpContext("bouzouf.com", "GET", "/fake", "https", 80, {
        referer: "bouzouf.com"
      })
    );
    assert.strictEqual(await this.service.checkRequest(ctx), true, "should allow bouzouf.com referer");
    ctx.setHttpContext(
      new HttpContext("bouzouf.com", "GET", "/fake", "https", 80, {
        referer: "bouzouf2.com"
      })
    );
    assert.strictEqual(await this.service.checkRequest(ctx), true, "should allow bouzouf2.com referer");

    ctx.setHttpContext(
      new HttpContext("bouzouf.com", "GET", "/fake", "https", 80, {
        referer: "bouzouf12.com"
      })
    );
    assert.strictEqual(await this.service.checkRequest(ctx), false, "should not allow bouzouf12.com referer");

    ctx.setHttpContext(
      new HttpContext("bouzouf.com", "GET", "/plop", "https", 80, {
        referer: "bouzouf.com"
      })
    );
    assert.strictEqual(await this.service.checkRequest(ctx), false, "should allow bouzouf.com only on its own url");

    ctx.setHttpContext(new HttpContext("bouzouf.com", "GET", "/fake", "https", 80, {}));
    assert.strictEqual(await this.service.checkRequest(ctx), false, "should not allow without referer");

    this.service.getParameters().no_referer = true;

    ctx.setHttpContext(new HttpContext("bouzouf.com", "GET", "/fake", "https", 80, {}));
    assert.strictEqual(await this.service.checkRequest(ctx), true, "should allow without referer");
  }

  @test
  async testRoute() {
    this.service = this.getService("fake");
    const ctx = await this.newContext();
    await this.getExecutor(
      ctx,
      "test.webda.io",
      "GET",
      "/fake/callback?state=qwYG5RI3RVm_LCt-psrYAg&code=4%2F0AVHEtk5UIL1IFer3juJuFYawc9oJnaTzThLqW0dNKJHPD41vbp7T5XROjdPYsaSWOzsKlA&scope=email+profile+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.labels.readonly+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.metadata.readonly+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fadmin.directory.group.readonly+openid+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.readonly&authuser=0&hd=webda.io&prompt=none"
    );
    assert.strictEqual(ctx._executor, this.service);
  }

  @test
  async misc() {
    this.service = this.getService("fake");
    assert.notStrictEqual(this.service._authenticationService, undefined, "Should get default Authentication service");
    // Test the 403 on handleReturn
    assert.rejects(
      () => this.service.handleReturn(undefined, undefined, undefined, undefined),
      (err: WebdaError.HttpError) => err.getResponseCode() === 403
    );
    const ctx = await this.newContext();
    await this.webda.getService<Store>("Idents").__clean();
    // Register with oauth
    await this.service.handleReturn(ctx, "plop", { email: "rcattiau@gmail.com" }, undefined);
    // We should have two idents existing now
    assert.ok(await this.service._authenticationService.getIdentModel().ref("plop_fake").exists());
    assert.ok(await this.service._authenticationService.getIdentModel().ref("rcattiau@gmail.com_email").exists());
    await ctx.newSession();
    // Log with known ident / email
    assert.strictEqual(ctx.getSession().identUsed, undefined);
    await this.service.handleReturn(ctx, "plop", { email: "rcattiau@gmail.com" }, undefined);
    assert.strictEqual(ctx.getSession().identUsed, "plop_fake");
    const userId = ctx.getCurrentUserId();
    await ctx.newSession();
    // Log with new ident / known email
    await this.service.handleReturn(ctx, "plop2", { email: "rcattiau@gmail.com" }, undefined);
    assert.strictEqual(ctx.getSession().identUsed, "plop2_fake");
    assert.strictEqual(ctx.getCurrentUserId(), userId);
    await this.service.handleReturn(ctx, "plop3", { email: "rcattiau@gmail.com" }, undefined);
    // Default to false for token
    assert.rejects(
      () => this.execute(ctx, "webda.io", "GET", "/fake/scope"),
      (err: WebdaError.HttpError) => err.getResponseCode() === 404
    );
    assert.rejects(
      () => this.execute(ctx, "webda.io", "POST", "/fake/token"),
      (err: WebdaError.HttpError) => err.getResponseCode() === 404
    );
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
    assert.deepStrictEqual(JSON.parse(<string>ctx.getResponseBody()), ["email", "image"]);
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
    await this.execute(ctx, "webda.io", "GET", "/bouzouf/callback?code=123&scope=plop&state=123");
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
    this.service.getParameters().authorized_uris = undefined;
    this.service._redirect(ctx);
    assert.strictEqual(ctx.getSession<OAuthSession>().oauth.redirect, "http://myownwebsite.com");
  }

  @test
  async redirect() {
    this.service = this.getService("fake");
    const ctx = await this.newContext();
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
    assert.throws(() => this.service._redirect(ctx), WebdaError.Unauthorized);
    // Test w/o referer
    ctx.setHttpContext(new HttpContext("test.webda.io", "GET", "/fake"));
    assert.throws(() => this.service._redirect(ctx), WebdaError.Unauthorized);
    // Enable the no_referer
    this.service.getParameters().no_referer = true;
    this.service._redirect(ctx);
    assert.strictEqual(ctx.getSession<OAuthSession>().oauth.redirect, undefined);
    assert.strictEqual(ctx.getResponseHeaders().Location, "/fakeredirect");
  }
}
