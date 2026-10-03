import { suite, test } from "@webda/test";
import { WebContext, WebdaError } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import * as assert from "assert";
import { ApiKey } from "./apikey.model.js";
const KEY = {
  __secret: "the-secret",
  algorithm: "sha256",
  permissions: { GET: ["^path$"], PUT: ["/path/to/the/valhalla"] },
  origins: ["http://localhost:18080/", "(http|https)://test.webda.io/"],
  uuid: "the-uuid"
};

@suite
class ApiKeyTest extends WebdaApplicationTest {
  context: WebContext;
  apikey: ApiKey;

  /**
   * Register the hawk model from sources
   * @param app - the test application
   */
  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    // Use the sources class with the compiled metadata
    app.addModel("Webda/ApiKey", ApiKey, app.getModel("Webda/ApiKey").Metadata);
    ApiKey.registerSerializer(true, "Webda/ApiKey");
  }

  async beforeEach() {
    await super.beforeEach();
    this.context = <WebContext>await this.newContext();
    await this.context.newSession();
    this.apikey = new ApiKey();
  }

  @test
  toHawkCredentials() {
    this.apikey.load({ __secret: "bouzouf", uuid: "plop" }, true);
    const credentials = this.apikey.toHawkCredentials();
    assert.strictEqual(credentials.algorithm, "sha256", "Should default to sha256 algorithm");
    assert.strictEqual(credentials.key, "bouzouf", "Key should equal to hidden value __secret");
  }

  @test
  toHawkCredentialsWithAlgorithm() {
    this.apikey.load({ __secret: "bouzouf", uuid: "plop", algorithm: "md5" }, true);
    const credentials = this.apikey.toHawkCredentials();
    assert.strictEqual(credentials.algorithm, "md5", "Should use specified algorithm");
    assert.strictEqual(credentials.key, "bouzouf", "Key should equal to hidden value __secret");
  }

  @test
  checkOrigin() {
    this.apikey.load(<any>KEY, true);

    this.getExecutor(this.context, "test.webda.io", "PUT", "/origins", {}, { origin: "https://test.webda.io/" });
    assert.ok(this.apikey.checkOrigin(this.context.getHttpContext()), "remotehost should be granted");

    this.getExecutor(this.context, "test.webda.io", "PUT", "/origins", {}, { origin: "http://localhost:18080/" });
    assert.ok(this.apikey.checkOrigin(this.context.getHttpContext()), "localhost should be granted");

    this.getExecutor(this.context, "test.webda.io", "PUT", "/origins", {}, { origin: "https://localhost:18080/" });
    assert.ok(!this.apikey.canRequest(this.context), "localhost https should be refused");
  }

  @test
  checkWhitelist() {
    this.apikey.load(
      <any>{
        ...KEY,
        whitelist: ["127.0.0.1", "10.0.0.0/16"],
        origins: undefined
      },
      true
    );

    this.getExecutor(this.context, "test.webda.io", "PUT", "/path/to/the/valhalla");
    this.context.getHttpContext().setClientIp("127.0.0.1");
    assert.ok(this.apikey.canRequest(this.context), "remotehost should be granted");
    this.context.getHttpContext().setClientIp("127.0.0.2");
    assert.ok(!this.apikey.canRequest(this.context), "127.0.0.2 should not be granted");
    this.context.getHttpContext().setClientIp("10.0.0.1");
    assert.ok(this.apikey.canRequest(this.context), "10.0.0.1 should be granted");
    this.context.getHttpContext().setClientIp("10.1.0.1");
    assert.ok(!this.apikey.canRequest(this.context), "10.1.0.1 should not be granted");
  }

  @test
  canRequestNoOrigin() {
    this.apikey.load(<any>{ ...KEY, origins: undefined }, true);

    this.getExecutor(this.context, "test.webda.io", "POST", "/path");
    assert.ok(!this.apikey.canRequest(this.context), "POST should be false");

    this.getExecutor(this.context, "test.webda.io", "PATCH", "/path/to/inferno");
    assert.ok(!this.apikey.canRequest(this.context), "inferno should be false");

    this.getExecutor(this.context, "test.webda.io", "GET", "/path/to/the/valhalla");
    assert.ok(!this.apikey.canRequest(this.context), "valhalla GET should be false");

    this.getExecutor(this.context, "test.webda.io", "PUT", "/path/to/the/valhalla");
    assert.ok(this.apikey.canRequest(this.context), "valhalla PUT should be granted");
  }

  @test
  canRequestNoPermissions() {
    this.apikey.load({ ...KEY, origins: undefined, permissions: undefined }, true);

    this.getExecutor(this.context, "test.webda.io", "GET", "/path/to/the/valhalla");
    assert.ok(this.apikey.canRequest(this.context), "no permissions should be true");
  }

  @test
  async canAct() {
    const key = new ApiKey();
    key.uuid = "origins";
    assert.strictEqual(typeof (await key.canAct(this.context, "get")), "string");
    // By default key should be on a owner model
    key.uuid = "other";
    this.context.getSession().login("me", "test");
    assert.strictEqual(typeof (await key.canAct(this.context, "get")), "string");
    key.setOwner("me");
    assert.strictEqual(await key.canAct(this.context, "get"), true);
    await key.canAct(this.context, "create");
    assert.notStrictEqual(key["__secret"], undefined);
    key["__secret"] = "";
    key["secret"] = "test";
    await assert.rejects(() => key.canAct(this.context, "create"), WebdaError.BadRequest);
  }
}
