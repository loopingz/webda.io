import { suite, test } from "@testdeck/mocha";
import { WebContext } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { ApiKey } from "./apikey";
const KEY = {
  __secret: "the-secret",
  algorithm: "sha256",
  permissions: { GET: ["^path$"], PUT: ["/path/to/the/valhalla"] },
  origins: ["http://localhost:18080/", "(http|https)://test.webda.io/"],
  uuid: "the-uuid"
};

@suite
class ApiKeyTest extends WebdaTest {
  context: WebContext;
  apikey: ApiKey;

  async before() {
    await super.before();
    this.context = <WebContext>await this.newContext();
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
    assert.ok(!this.apikey.canRequest(this.context.getHttpContext()), "localhost https should be refused");
  }

  @test
  checkWhitelist() {
    this.apikey.load(<any>{ ...KEY, whitelist: ["127.0.0.1", "10.0.0.0/16"], origins: undefined }, true);

    this.getExecutor(this.context, "test.webda.io", "PUT", "/path/to/the/valhalla");
    assert.ok(
      this.apikey.canRequest(this.context.getHttpContext().setClientIp("127.0.0.1")),
      "remotehost should be granted"
    );
    assert.ok(
      !this.apikey.canRequest(this.context.getHttpContext().setClientIp("127.0.0.2")),
      "127.0.0.2 should not be granted"
    );
    assert.ok(
      this.apikey.canRequest(this.context.getHttpContext().setClientIp("10.0.0.1")),
      "10.0.0.1 should be granted"
    );
    assert.ok(
      !this.apikey.canRequest(this.context.getHttpContext().setClientIp("10.1.0.1")),
      "10.1.0.1 should not be granted"
    );
  }

  @test
  canRequestNoOrigin() {
    this.apikey.load(<any>{ ...KEY, origins: undefined }, true);

    this.getExecutor(this.context, "test.webda.io", "POST", "/path");
    assert.ok(!this.apikey.canRequest(this.context.getHttpContext()), "POST should be false");

    this.getExecutor(this.context, "test.webda.io", "PATCH", "/path/to/inferno");
    assert.ok(!this.apikey.canRequest(this.context.getHttpContext()), "inferno should be false");

    this.getExecutor(this.context, "test.webda.io", "GET", "/path/to/the/valhalla");
    assert.ok(!this.apikey.canRequest(this.context.getHttpContext()), "valhalla GET should be false");

    this.getExecutor(this.context, "test.webda.io", "PUT", "/path/to/the/valhalla");
    assert.ok(this.apikey.canRequest(this.context.getHttpContext()), "valhalla PUT should be granted");
  }

  @test
  canRequestNoPermissions() {
    this.apikey.load({ ...KEY, origins: undefined, permissions: undefined }, true);

    this.getExecutor(this.context, "test.webda.io", "GET", "/path/to/the/valhalla");
    assert.ok(this.apikey.canRequest(this.context.getHttpContext()), "no permissions should be true");
  }

  @test
  async canAct() {
    let key = new ApiKey();
    key.uuid = "origins";
    await assert.rejects(() => key.canAct(this.context, "get"), /403/);
    // By default key should be on a owner model
    key.uuid = "other";
    this.context.getSession().userId = "me";
    await assert.rejects(() => key.canAct(this.context, "get"), /403/);
    key.setOwner("me");
    assert.strictEqual(await key.canAct(this.context, "get"), key);
  }
}
