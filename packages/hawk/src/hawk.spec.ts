"use strict";
var assert = require("assert");
import * as Hawk from "hawk";
import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "@webda/core/lib/test";
import { EventWebdaResult, HttpMethodType } from "@webda/core";
import { ApiKey } from "./apikey";
import { CacheService, HttpContext, Store, Context } from "@webda/core";
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
    this.context.getSession().userProfile = { login: "gabitbol" };
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
    return this.webda.checkRequest(ctx);
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
    this.context.getHttpContext().getHeaders()["host"] = "test.webda.io";
    this.context.getHttpContext().getHeaders()["authorization"] = header;
    assert.equal(
      await this.checkRequest(this.context),
      false,
      "Should refuse without errors as Authorization is using an unknown key"
    );
  }

  @test
  async wrongUrlWithSignature() {
    const { header, artifacts } = Hawk.client.header("http://test.webda.io/test", "GET", {
      credentials: this.key.toHawkCredentials()
    });
    this.context.getHttpContext().getHeaders()["host"] = "test.webda.io";
    this.context.getHttpContext().getHeaders()["authorization"] = header;
    assert.equal(
      await this.checkRequest(this.context),
      false,
      "Should refuse as signed URL is different from requested URL"
    );
  }

  @test
  async malformedAuthorizationHeader() {
    this.context.getHttpContext().getHeaders()["authorization"] = "notatrueheader";
    assert.equal(
      await this.checkRequest(this.context),
      false,
      "Should refuse without errors as Authorization is malformed"
    );
  }

  @test
  async missingHostHeader() {
    const { header, artifacts } = Hawk.client.header("http://test.webda.io/", "GET", {
      credentials: this.key.toHawkCredentials()
    });
    this.context.getHttpContext().getHeaders()["authorization"] = header;
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
    this.context.getHttpContext().getHeaders()["host"] = "test.webda.io";
    this.context.getHttpContext().getHeaders()["authorization"] = header;
    assert.equal(await this.checkRequest(this.context), true, "Should accept as signature valid");
    let body = JSON.stringify({ fake: "answer" });
    this.context.write(body);
    await this.webda.emitSync<EventWebdaResult>("Webda.Result", { context: this.context });
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
    await this.webda.emitSync<EventWebdaResult>("Webda.Result", { context: this.context });
  }

  async doValidRequest(url = "/", method: HttpMethodType = "GET", headers = {}) {
    const { header, artifacts } = Hawk.client.header(`http://test.webda.io${url}`, method, {
      credentials: this.key.toHawkCredentials()
    });
    this.context.setHttpContext(new HttpContext("test.webda.io", method, url));
    this.context.getHttpContext().getHeaders()["host"] = "test.webda.io";
    this.context.getHttpContext().getHeaders()["authorization"] = header;
    for (let k in headers) {
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
    assert.equal(await this.doValidRequest(), false, "Should refuse as permissions are set");
    assert.equal(await this.doValidRequest("/restricted/plop", "GET"), true);
    assert.equal(await this.doValidRequest("/restricted/plop", "PUT"), false);
    assert.equal(await this.doValidRequest("/restricted/plop", "PATCH"), false);
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
    this.key.origins = ["regexp://.*"];
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

  /*
  @test
  async getOptionsAuthorizedOrigins() {
    this.key.origins = ["https://remotehost:3000"];
    await this.key.save();

    let k = this.store.initModel({
      __secret: "secret",
      uuid: "uuidKey333",
      origins: ["regexp://https:\\/\\/.*soc\\.nuxeo\\.com"]
    });
    await k.save();

    // Reset cache
    CacheService.clearAllCache();
    let origins = await this.service.getOptionsAuthorizedOrigins();
    assert.deepEqual(origins, {
      origins: ["https://remotehost:3000", "https://beta.soc.nuxeo.com", "https://soc.nuxeo.com"],
      patterns: [/https:\/\/.*soc\.nuxeo\.com/, /https:\/\/[a-f\d]+\.dev\.soc\.nuxeo\.com/]
    });
  }
  */
}
