import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as fs from "fs";
import * as WebdaError from "../errors";
import { WebdaInternalTest } from "../test";
import { ResourceService, ResourceServiceParameters } from "./resource";
import { UnpackedConfiguration } from "../application";

@suite
class ResourceTest extends WebdaInternalTest {
  resource: ResourceService;
  resourceModel;
  ctx;
  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      parameters: {
        ignoreBeans: true
      },
      services: {
        ResourceService: {
          folder: "test",
          indexFallback: false
        },
        ModelsResource: {
          type: "Webda/ResourceService",
          url: "templates"
        }
      }
    };
  }
  async before(init: boolean = true) {
    await super.before(init);
    this.resource = this.getService("ResourceService");
    this.resourceModel = this.getService("ModelsResource");
    this.ctx = await this.newContext();
  }

  @test
  async parentFolder() {
    this.resource.getParameters().allowHiddenFiles = true;
    const executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/../config.json");
    assert.notStrictEqual(executor, undefined);
    await assert.rejects(
      () => executor.execute(this.ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 401
    );
  }

  @test
  params() {
    const params = new ResourceServiceParameters({
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
    const executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/");
    // index.html does not exist in our case
    await assert.rejects(
      () => executor.execute(this.ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 404
    );
  }

  @test
  async unknownFile() {
    this.getService<ResourceService>("ResourceService").getParameters().indexFallback = true;
    const executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/config.unknown.json");
    assert.notStrictEqual(executor, undefined);
    await assert.rejects(
      () => executor.execute(this.ctx),
      (err: WebdaError.HttpError) => err.getResponseCode() === 404
    );
  }

  @test
  async jsonFile() {
    const executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/config.json");
    assert.notStrictEqual(executor, undefined);
    await executor.execute(this.ctx);
    assert.strictEqual(this.ctx.getResponseBody().toString(), fs.readFileSync("./test/config.json").toString());
    assert.strictEqual(this.ctx.getResponseHeaders()["content-type"], "application/json");
  }

  @test
  async textFile() {
    const executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/data/test.txt");
    assert.notStrictEqual(executor, undefined);
    await executor.execute(this.ctx);
    assert.strictEqual(this.ctx.getResponseBody().toString(), fs.readFileSync("./test/data/test.txt").toString());
    assert.strictEqual(this.ctx.getResponseHeaders()["content-type"], "text/plain; charset=UTF-8");
  }

  @test
  async pngFile() {
    const executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/data/test.png");
    assert.notStrictEqual(executor, undefined);
    await executor.execute(this.ctx);
    assert.strictEqual(this.ctx.getResponseBody().toString(), fs.readFileSync("./test/data/test.png").toString());
    assert.strictEqual(this.ctx.getResponseHeaders()["content-type"], "image/png");
  }

  @test
  async hiddenFile() {
    await assert.rejects(() => this.http("/resources/data/.env"), WebdaError.NotFound);
    this.resource.getParameters().allowHiddenFiles = true;
    const res = await this.http("/resources/data/.env");
    assert.strictEqual(res.toString(), "TEST=plop");
  }

  // Check Store HTTP mapping
  @test
  async testStoreHttpMapping() {
    const executor = this.getExecutor(
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
    assert.strictEqual(this.ctx.getResponseHeaders()["content-type"], "application/octet-stream");
  }
}
