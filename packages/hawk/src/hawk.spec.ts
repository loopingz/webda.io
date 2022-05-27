// organize-imports-ignore
var assert = require("assert");
import { suite, test } from "@testdeck/mocha";
import { CacheService, Context, HttpContext, HttpMethodType, Store, UnknownSession } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import * as Hawk from "hawk";
import { ApiKey } from "./apikey";
import { HawkService } from "./hawk";

@suite
class HawkServiceTest extends WebdaTest {
  store: Store<ApiKey>;
  service: HawkService;
  context: Context;
  key: ApiKey;
  fakeCredentials: any;

  async before() {
    await super.before();
    this.service = this.getService<HawkService>("HawkService");
    this.store = this.getService<Store<ApiKey>>("apikeys");
    await this.store.save({ uuid: "origins" });
    assert.notStrictEqual(this.service, undefined);
    assert.notStrictEqual(this.store, undefined);
    this.context = <Context>await this.newContext();
    this.context.getSession<UnknownSession>().userProfile = { login: "gabitbol" };
    this.key = this.store.initModel({ __secret: "randomSecret", uuid: "mykey" });
    await this.key.save();
    this.fakeCredentials = {
      id: "dh37fgj492je",
      key: "werxhqb98rpaxn39848xrunpaw3489ruxnpa98w4rxn",
      algorithm: "sha256"
    };
  }

  /**
   * Bypass the protected attribute of webda for testing purpose
   */
  async checkRequest(ctx) {
    // @ts-ignore
    return this.webda.checkCORSRequest(ctx);
  }

  @test
  async noSignature() {
    // Check no API
    assert.equal(await this.checkRequest(this.context), false, "Should refuse without CSRF token nor Authorization");
  }

  @test
  async otherAuthorizationSignature() {
    let logs = [];
    this.service.getWebda().log = (...args) => {
      logs.push(args);
    };
    // @ts-ignore
    this.context.getHttpContext().getHeaders()["authorization"] = "This is mine";
    // Check no API
    assert.equal(await this.checkRequest(this.context), false, "Should refuse without unknown Authorization header");
    // Should not contains any logs
    assert.equal(logs.length, 0, "Should be silently ignored");
  }

  @test
  async unknownApiKey() {
    const { header, artifacts } = Hawk.client.header("http://test.webda.io/", "GET", {
      payload: JSON.stringify({}),
      credentials: this.fakeCredentials
    });
    // @ts-ignore
    this.context.getHttpContext().getHeaders()["host"] = "test.webda.io";
    // @ts-ignore
    this.context.getHttpContext().getHeaders()["authorization"] = header;
    await assert.rejects(
      () => this.checkRequest(this.context),
      /403/,
      "Should refuse with error as Authorization is using an unknown key"
    );
  }

  @test
  async wrongUrlWithSignature() {
    const { header, artifacts } = Hawk.client.header("http://test.webda.io/test", "GET", {
      credentials: this.key.toHawkCredentials()
    });
    // @ts-ignore
    this.context.getHttpContext().getHeaders()["host"] = "test.webda.io";
    // @ts-ignore
    this.context.getHttpContext().getHeaders()["authorization"] = header;
    await assert.rejects(
      () => this.checkRequest(this.context),
      /403/,
      "Should refuse as signed URL is different from requested URL"
    );
  }

  @test
  async malformedAuthorizationHeader() {
    // @ts-ignore
    this.context.getHttpContext().getHeaders()["authorization"] = "notatrueheader";
    assert.equal(
      await this.checkRequest(this.context),
      false,
      "Should refuse without errors as Authorization is malformed"
    );
  }

  @test
  async validSignature() {
    const { header, artifacts } = Hawk.client.header("http://test.webda.io/", "GET", {
      credentials: this.key.toHawkCredentials()
    });
    // @ts-ignore
    this.context.getHttpContext().getHeaders()["host"] = "test.webda.io";
    // @ts-ignore
    this.context.getHttpContext().getHeaders()["authorization"] = header;
    assert.equal(await this.checkRequest(this.context), true, "Should accept as signature valid");
    let body = JSON.stringify({ fake: "answer" });
    this.context.write(body);
    await this.webda.emitSync("Webda.Result", { context: this.context });
    assert.equal(
      this.context.getResponseHeaders()["Server-Authorization"] !== null,
      true,
      "Server-Authorization should be set"
    );
    // Verify the server signature
    let isValid = Hawk.client.authenticate(
      {
        headers: {
          "server-authorization": this.context.getResponseHeaders()["Server-Authorization"],
          "content-type": "application/json"
        }
      },
      this.key.toHawkCredentials(),
      artifacts,
      {
        payload: this.context.getResponseBody(),
        contentType: "application/json",
        required: true
      }
    );
    assert.equal(isValid !== undefined, true, "Server-Authorization should be sent and correct");
    // Verify that modified answers would generate an invalid signature
    assert.throws(
      Hawk.client.authenticate.bind(
        Hawk.client.authenticate,
        {
          headers: {
            "server-authorization": this.context.getResponseHeaders()["Server-Authorization"],
            "content-type": "application/json"
          }
        },
        this.key.toHawkCredentials(),
        artifacts,
        {
          payload: this.context.getResponseBody() + "n",
          contentType: "application/json",
          required: true
        }
      ),
      /^Error: Bad response payload mac$/
    );
    // Test for 100% code coverage - empty hawk context to generate failure in the server-authorization
    this.context.setExtension("hawk", { artifacts: {}, credentials: {} });
    await this.webda.emitSync("Webda.Result", { context: this.context });
    this.context.setExtension("hawk", undefined);
    await this.webda.emitSync("Webda.Result", { context: this.context });
  }

  async doValidRequest(url = "/", method: HttpMethodType = "GET", headers = {}) {
    this.context = await this.newContext();
    const { header, artifacts } = Hawk.client.header(`http://test.webda.io${url}`, method, {
      credentials: this.key.toHawkCredentials()
    });
    this.context.setHttpContext(
      new HttpContext("test.webda.io", method, url, "http", 80, {
        host: "test.webda.io",
        authorization: header
      })
    );
    for (let k in headers) {
      // @ts-ignore
      this.context.getHttpContext().getHeaders()[k] = headers[k];
    }
    return await this.checkRequest(this.context);
  }

  @test
  async validSignatureWithPermissions() {
    assert.equal(await this.doValidRequest(), true, "Should accept as signature valid");
    this.key.permissions = {
      GET: ["/restricted/.*"],
      POST: [".*"],
      PUT: ["/test"],
      DELETE: ["/bouzouf"]
    };
    await this.key.save();
    // Reset cache
    CacheService.clearAllCache();
    await assert.rejects(() => this.doValidRequest(), /403/, "Should refuse as permissions are set");
    assert.equal(await this.doValidRequest("/restricted/plop", "GET"), true);
    await assert.rejects(() => this.doValidRequest("/restricted/plop", "PUT"), /403/);
    await assert.rejects(() => this.doValidRequest("/restricted/plop", "PATCH"), /403/);
    assert.equal(await this.doValidRequest("/restricted/plop", "POST"), true);
    assert.equal(await this.doValidRequest("/any", "POST"), true);
    assert.equal(await this.doValidRequest("/test", "PUT"), true);
    assert.equal(await this.doValidRequest("/test", "PATCH"), true);
    assert.equal(await this.doValidRequest("/bouzouf", "DELETE"), true);
  }

  @test
  async validOriginOptionsRegExp() {
    this.key.permissions = {
      GET: ["/restricted/.*"],
      POST: [".*"],
      PUT: ["/test"],
      DELETE: ["/bouzouf"]
    };
    this.key.origins = ["regexp://none.*", "regexp://.*"];
    await this.key.save();
    // Reset cache
    CacheService.clearAllCache();
    assert.ok(await this.doValidRequest("/restricted/plop", "OPTIONS"), "should match this regexp");
  }

  @test
  async validOriginOptionsString() {
    let origin = "https://remotehost:3000";
    this.key.origins = [origin];
    await this.key.save();
    // Reset cache
    CacheService.clearAllCache();
    assert.ok(await this.doValidRequest("/path/to/winners", "OPTIONS", { origin }), "should match this string origin");
  }

  @test
  async validOriginNoMatch() {
    let origin = "https://localhost:3000";
    this.key.origins = [origin];
    await this.key.save();
    // Reset cache
    CacheService.clearAllCache();
    assert.ok(
      !(await this.doValidRequest("/path/to/winners", "OPTIONS", { origin: "https://nomatchhost:3000" })),
      "should not match options origin"
    );
  }

  @test
  async cov() {
    // Pure cov
    let test = new HawkService(this.webda, "cov", { keysStore: "bouzouf" });
    assert.strictEqual(test.getParameters().keysStore, "bouzouf");
    assert.rejects(() => test.init(), /Store must exist/);
    test = new HawkService(this.webda, "cov", { dynamicSessionKey: "bouzouf", redirectUrl: "/redirect" });
    await test.init();
  }

  @test
  async redirect() {
    let test = new HawkService(this.webda, "cov", { dynamicSessionKey: "bouzouf", redirectUrl: "/redirect" });
    await test.init();
    let ctx = await this.newContext();
    ctx.getParameters().url = "http://test.webda.io";
    await assert.rejects(() => test._redirect(ctx), /403/);
    test.getParameters().redirectUris.push("http://test.webda.io");
    await test._redirect(ctx);
    let location = new URL(ctx.getResponseHeaders().Location);
    assert.notStrictEqual(location.searchParams.get("csrf"), undefined);
  }

  @test
  async session() {
    let test = new HawkService(this.webda, "cov", { dynamicSessionKey: "myCSRF" });
    const url = "/plop";
    const sessionKey = "whatever";
    const { header, artifacts } = Hawk.client.header(`http://test.webda.io${url}`, "GET", {
      credentials: {
        id: "session",
        key: await test.getWebda().getCrypto().hmac(sessionKey),
        algorithm: "sha256"
      }
    });
    this.context.getSession()["myCSRF"] = sessionKey;
    this.context.setHttpContext(
      new HttpContext("test.webda.io", "GET", url, "http", 80, {
        host: "test.webda.io",
        authorization: header
      })
    );
    // It should be ok
    assert.strictEqual(await test.checkRequest(this.context), true);
    this.context.getSession()["myCSRF"] = "anotherone";
    this.context.setExtension("HawkReviewed", false);
    await assert.rejects(() => test.checkRequest(this.context), /403/);
    // Simulate pre-reviewed
    this.context.setExtension("HawkReviewed", true);
    await test.checkRequest(this.context);
  }
}
