// organize-imports-ignore
import { suite, test } from "@webda/test";
import {
  HttpContext,
  HttpMethodType,
  InstanceCache,
  useCrypto,
  useDynamicService,
  useRouter,
  WebContext,
  WebdaError
} from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import * as assert from "assert";
import * as Hawk from "hawk";
import { ApiKey } from "./apikey.model.js";
import { HawkService, HawkServiceParameters } from "./hawk.service.js";

@suite
class HawkServiceTest extends WebdaApplicationTest {
  service: HawkService;
  context: WebContext;
  key: ApiKey;
  fakeCredentials: any;

  /**
   * Register the hawk model and service from sources
   * @param app - the test application
   */
  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    // Use the sources class with the compiled metadata
    app.addModel("Webda/ApiKey", ApiKey, app.getModel("Webda/ApiKey").Metadata);
    ApiKey.registerSerializer(true, "Webda/ApiKey");
    app.addModda("Webda/Hawk", HawkService);
  }

  async beforeEach() {
    await super.beforeEach();
    this.service = useDynamicService<HawkService>("HawkService");
    assert.notStrictEqual(this.service, undefined);
    this.clearCache();
    this.context = <WebContext>await this.newContext();
    await this.context.newSession();
    if (await ApiKey.ref("mykey").exists()) {
      await ApiKey.ref("mykey").delete();
    }
    this.key = await ApiKey.ref("mykey").create({
      __secret: "randomSecret"
    } as any);
    this.fakeCredentials = {
      id: "dh37fgj492je",
      key: "werxhqb98rpaxn39848xrunpaw3489ruxnpa98w4rxn",
      algorithm: "sha256"
    };
  }

  /**
   * Reset the hawk service caches
   */
  clearCache() {
    InstanceCache.clearAll(this.service);
  }

  /**
   * Bypass the protected attribute of the router for testing purpose
   * @param ctx - the context
   * @returns the CORS result
   */
  async checkRequest(ctx) {
    // @ts-ignore
    return useRouter().checkCORSRequest(ctx);
  }

  @test
  async noSignature() {
    // Check no API
    assert.strictEqual(
      await this.checkRequest(this.context),
      false,
      "Should refuse without CSRF token nor Authorization"
    );
  }

  @test
  async otherAuthorizationSignature() {
    const logs = [];
    this.service.log = (...args) => {
      logs.push(args);
    };
    // @ts-ignore
    this.context.getHttpContext().getHeaders()["authorization"] = "This is mine";
    // Check no API
    assert.strictEqual(
      await this.checkRequest(this.context),
      false,
      "Should refuse without unknown Authorization header"
    );
    // Should not contains any logs
    assert.strictEqual(logs.length, 0, "Should be silently ignored");
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
      WebdaError.Forbidden,
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
      WebdaError.Forbidden
      //"Should refuse as signed URL is different from requested URL"
    );
  }

  @test
  async malformedAuthorizationHeader() {
    // @ts-ignore
    this.context.getHttpContext().getHeaders()["authorization"] = "notatrueheader";
    assert.strictEqual(
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
    assert.strictEqual(await this.checkRequest(this.context), true, "Should accept as signature valid");
    const body = JSON.stringify({ fake: "answer" });
    this.context.write(body);
    this.service.signResponse(this.context);
    assert.strictEqual(
      this.context.getResponseHeaders()["Server-Authorization"] !== null,
      true,
      "Server-Authorization should be set"
    );
    // Verify the server signature
    const isValid = Hawk.client.authenticate(
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
    assert.strictEqual(isValid !== undefined, true, "Server-Authorization should be sent and correct");
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
    this.service.signResponse(this.context);
    this.context.setExtension("hawk", undefined);
    this.service.signResponse(this.context);
    this.context.hasFlushedHeaders = () => true;
    this.service.signResponse(this.context);
  }

  async doValidRequest(url = "/", method: HttpMethodType = "GET", headers = {}) {
    this.context = await this.newContext();
    await this.context.newSession();
    const { header, artifacts } = Hawk.client.header(`http://test.webda.io${url}`, method, {
      credentials: this.key.toHawkCredentials()
    });
    this.context.setHttpContext(
      new HttpContext("test.webda.io", method, url, "http", 80, {
        host: "test.webda.io",
        authorization: header
      })
    );
    for (const k in headers) {
      // @ts-ignore
      this.context.getHttpContext().getHeaders()[k] = headers[k];
    }
    return await this.checkRequest(this.context);
  }

  @test
  async validSignatureWithPermissions() {
    assert.strictEqual(await this.doValidRequest(), true, "Should accept as signature valid");
    this.key.permissions = {
      GET: ["/restricted/.*"],
      POST: [".*"],
      PUT: ["/test"],
      DELETE: ["/bouzouf"]
    };
    await this.key.save();
    // Reset cache
    this.clearCache();
    await assert.rejects(() => this.doValidRequest(), WebdaError.Forbidden, "Should refuse as permissions are set");
    assert.strictEqual(await this.doValidRequest("/restricted/plop", "GET"), true);
    await assert.rejects(() => this.doValidRequest("/restricted/plop", "PUT"), WebdaError.Forbidden);
    await assert.rejects(() => this.doValidRequest("/restricted/plop", "PATCH"), WebdaError.Forbidden);
    assert.strictEqual(await this.doValidRequest("/restricted/plop", "POST"), true);
    assert.strictEqual(await this.doValidRequest("/any", "POST"), true);
    assert.strictEqual(await this.doValidRequest("/test", "PUT"), true);
    assert.strictEqual(await this.doValidRequest("/test", "PATCH"), true);
    assert.strictEqual(await this.doValidRequest("/bouzouf", "DELETE"), true);
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
    this.clearCache();
    assert.ok(await this.doValidRequest("/restricted/plop", "OPTIONS"), "should match this regexp");
  }

  @test
  async validOriginOptionsString() {
    const origin = "https://remotehost:3000";
    this.key.origins = [origin];
    await this.key.save();
    // Reset cache
    this.clearCache();
    assert.ok(await this.doValidRequest("/path/to/winners", "OPTIONS", { origin }), "should match this string origin");
  }

  @test
  async validOriginNoMatch() {
    const origin = "https://localhost:3000";
    this.key.origins = [origin];
    await this.key.save();
    // Reset cache
    this.clearCache();
    assert.ok(
      !(await this.doValidRequest("/path/to/winners", "OPTIONS", {
        origin: "https://nomatchhost:3000"
      })),
      "should not match options origin"
    );
  }

  @test
  async cov() {
    // Pure cov
    await assert.rejects(
      () => this.addService(HawkService, new HawkServiceParameters().load({ keyModel: "bouzouf" }), "cov"),
      /bouzouf/
    );
    await assert.rejects(
      () => this.addService(HawkService, new HawkServiceParameters().load({}), "cov"),
      /Model must exists or dynamic session key must be defined/
    );
    const test = await this.addService(
      HawkService,
      new HawkServiceParameters().load({
        dynamicSessionKey: "bouzouf",
        redirectUrl: "/redirect"
      }),
      "cov"
    );
    await test.stop();
  }

  @test
  async redirect() {
    const test = await this.addService(
      HawkService,
      new HawkServiceParameters().load({
        dynamicSessionKey: "bouzouf",
        redirectUrl: "/redirect"
      }),
      "redirect"
    );
    const ctx = await this.newContext();
    await ctx.newSession();
    ctx.getParameters().url = "http://test.webda.io";
    await assert.rejects(() => test._redirect(ctx), WebdaError.Forbidden);
    test.getParameters().redirectUris.push("http://test.webda.io");
    await test._redirect(ctx);
    const location = new URL(<string>ctx.getResponseHeaders().Location);
    assert.notStrictEqual(location.searchParams.get("csrf"), undefined);
    await test.stop();
  }

  @test
  async session() {
    const test = await this.addService(
      HawkService,
      new HawkServiceParameters().load({ dynamicSessionKey: "myCSRF" }),
      "session"
    );
    const key = useCrypto().current;
    const url = "/plop";
    const sessionKey = "whatever";
    const { header, artifacts } = Hawk.client.header(`http://test.webda.io${url}`, "GET", {
      credentials: {
        id: "session",
        key: await useCrypto().hmac(sessionKey, key),
        algorithm: "sha256"
      }
    });
    this.context.getSession()["myCSRF"] = `${key}.${sessionKey}`;
    this.context.setHttpContext(
      new HttpContext("test.webda.io", "GET", url, "http", 80, {
        host: "test.webda.io",
        authorization: header
      })
    );
    // It should be ok
    assert.strictEqual(await test.checkRequest(this.context), true);
    this.context.getSession()["myCSRF"] = `${key}.anotherone`;
    this.context.setExtension("HawkReviewed", false);
    await assert.rejects(() => test.checkRequest(this.context), WebdaError.Forbidden);
    delete this.context.getSession()["myCSRF"];
    this.context.setExtension("HawkReviewed", false);
    await assert.rejects(() => test.checkRequest(this.context), WebdaError.Forbidden);
    // Simulate pre-reviewed
    this.context.setExtension("HawkReviewed", true);
    await test.checkRequest(this.context);
    await test.stop();
  }
}
