import * as assert from "assert";
import * as fs from "fs";
import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "../test";

@suite
class ResourceTest extends WebdaTest {
  resource;
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
    assert.notEqual(executor, undefined);
    await assert.rejects(executor.execute.bind(executor, this.ctx), err => err == 401);
  }

  @test
  async unknownFile() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/config.unknown.json");
    assert.notEqual(executor, undefined);
    await assert.rejects(executor.execute.bind(executor, this.ctx), err => err == 404);
  }

  @test
  async jsonFile() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/config.json");
    assert.notEqual(executor, undefined);
    await executor.execute(this.ctx);
    assert.equal(this.ctx.getResponseBody(), fs.readFileSync("./test/config.json").toString());
    assert.equal(this.ctx.getResponseHeaders()["Content-Type"], "application/json");
  }

  @test
  async jsFile() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/moddas/voidstore.js");
    assert.notEqual(executor, undefined);
    await executor.execute(this.ctx);
    assert.equal(this.ctx.getResponseBody(), fs.readFileSync("./test/moddas/voidstore.js").toString());
    assert.equal(this.ctx.getResponseHeaders()["Content-Type"], "application/javascript");
  }

  @test
  async textFile() {
    let executor = this.getExecutor(this.ctx, "test.webda.io", "GET", "/resources/data/test.txt");
    assert.notEqual(executor, undefined);
    await executor.execute(this.ctx);
    assert.equal(this.ctx.getResponseBody(), fs.readFileSync("./test/data/test.txt").toString());
    assert.equal(this.ctx.getResponseHeaders()["Content-Type"], "text/plain");
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
    assert.notEqual(executor, undefined);
    await executor.execute(this.ctx);
    assert.equal(
      this.ctx.getResponseBody(),
      fs.readFileSync("./templates/PASSPORT_EMAIL_RECOVERY/html.mustache").toString()
    );
    assert.equal(this.ctx.getResponseHeaders()["Content-Type"], "application/octet-stream");
  }
}
