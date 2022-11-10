import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as fs from "fs";
import { WebdaTest } from "../test";
import ResourceService, { ResourceServiceParameters } from "./resource";

@suite
class ResourceTest extends WebdaTest {
  resource: ResourceService;
  resourceModel;
  ctx;
  async before(init: boolean = true) {
    await super.before(init);
    this.resource = this.getService("ResourceService");
    this.resourceModel = this.getService("ModelsResource");
    this.ctx = await this.newContext();
  }

  @test
  async parentFolder() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/../config.json");
    assert.notStrictEqual(executor, undefined);
    await assert.rejects(
      () => executor.execute(this.ctx),
      err => err == 401
    );
  }

  @test
  params() {
    let params = new ResourceServiceParameters({
      url: "/test/",
      rootRedirect: true
    });
    assert.strictEqual(params.url, "/test/");
    assert.strictEqual(params.folder, "./test/");
  }

  @test
  async redirect() {
    this.resource.getParameters().rootRedirect = true;
    this.webda.getRouter().removeRoute("/");
    assert.ok(this.webda.getRouter().getRouteFromUrl(this.ctx, "GET", "/") === undefined);
    this.resource.initRoutes();
    assert.ok(this.webda.getRouter().getRouteFromUrl(this.ctx, "GET", "/") !== undefined);
    this.resource._redirect(this.ctx);
    assert.strictEqual(this.ctx.getResponseHeaders().Location, "http://test.webda.io/resources/");
  }

  @test
  async index() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/");
    // index.html does not exist in our case
    await assert.rejects(
      () => executor.execute(this.ctx),
      err => err == 404
    );
  }

  @test
  async unknownFile() {
    this.getService<ResourceService>("ResourceService").getParameters().indexFallback = true;
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/config.unknown.json");
    assert.notStrictEqual(executor, undefined);
    await assert.rejects(() => executor.execute(this.ctx), /404/);
  }

  @test
  async jsonFile() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/config.json");
    assert.notStrictEqual(executor, undefined);
    await executor.execute(this.ctx);
    assert.strictEqual(this.ctx.getResponseBody().toString(), fs.readFileSync("./test/config.json").toString());
    assert.strictEqual(this.ctx.getResponseHeaders()["Content-Type"], "application/json");
  }

  @test
  async jsFile() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/moddas/voidstore.js");
    assert.notStrictEqual(executor, undefined);
    await executor.execute(this.ctx);
    assert.strictEqual(this.ctx.getResponseBody().toString(), fs.readFileSync("./test/moddas/voidstore.js").toString());
    assert.strictEqual(this.ctx.getResponseHeaders()["Content-Type"], "application/javascript");
  }

  @test
  async textFile() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/data/test.txt");
    assert.notStrictEqual(executor, undefined);
    await executor.execute(this.ctx);
    assert.strictEqual(this.ctx.getResponseBody().toString(), fs.readFileSync("./test/data/test.txt").toString());
    assert.strictEqual(this.ctx.getResponseHeaders()["Content-Type"], "text/plain; charset=UTF-8");
  }

  @test
  async pngFile() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/data/test.png");
    assert.notStrictEqual(executor, undefined);
    await executor.execute(this.ctx);
    assert.strictEqual(this.ctx.getResponseBody().toString(), fs.readFileSync("./test/data/test.png").toString());
    assert.strictEqual(this.ctx.getResponseHeaders()["Content-Type"], "image/png");
  }

  // Check Store HTTP mapping
  @test
  async testStoreHttpMapping() {
    let executor = this.getExecutor(
      this.ctx,
      "test.webda.io",
      "GET",
      "/templates/PASSPORT_EMAIL_RECOVERY/html.mustache"
    );
    assert.notStrictEqual(executor, undefined);
    await executor.execute(this.ctx);
    assert.strictEqual(
      this.ctx.getResponseBody().toString(),
      fs.readFileSync("./templates/PASSPORT_EMAIL_RECOVERY/html.mustache").toString()
    );
    assert.strictEqual(this.ctx.getResponseHeaders()["Content-Type"], "application/octet-stream");
  }
}
