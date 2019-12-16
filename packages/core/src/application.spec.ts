import * as assert from "assert";
import { suite, test } from "mocha-typescript";
import { Application, Core } from "./index";
import { WebdaTest } from "./test";

@suite
class ApplicationTest extends WebdaTest {
  @test
  async migrateV0toV2() {
    let webda = new Core(new Application(__dirname + "/../test/config.old.json"));
    await webda.init();
    // All services - DefinedMailer
    assert.equal(Object.keys(webda.getServices()).length, 12);
    // Check locales are moved correctly
    assert.equal(webda.getLocales().length, 3);
    // Check models - 2 from configuration files - 2 from Webda
    let count = 0;
    for (let key in webda.getModels()) {
      if (key.startsWith("webdatest")) {
        count++;
      }
    }
    assert.equal(count, 2);
    // Check params
    assert.equal(webda.getGlobalParams().TEST, "Global");
    assert.equal(webda.getGlobalParams().region, "us-east-1");
    // Check custom route migration
    let ctx = await this.newContext();
    let executor = this.getExecutor(ctx, "test.webda.io", "GET", "/urltemplate/666");
    assert.notEqual(executor, undefined);
  }

  @test
  async migrateV0toV2DefaultDomain() {
    let webda = new Core(new Application(__dirname + "/../test/config.old-default.json"));
    await webda.init();
    // All services - DefinedMailer
    assert.equal(Object.keys(webda.getServices()).length, 12);
    // Check locales are moved correctly
    assert.equal(webda.getLocales().length, 3);
    // Check models - 2 from configuration files - 2 from Webda
    let count = 0;
    for (let key in webda.getModels()) {
      if (key.startsWith("webdatest")) {
        count++;
      }
    }
    assert.equal(count, 2);
    webda.getConfiguration().parameters["sessionSecret"] =
      "Lp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5ENLp4B72FPU5n6q4EpVRGyPFnZp5cgLRPScVWixW52Yq84hD4MmnfVfgxKQ5EN";
    // Check custom route migration
    let ctx = await this.newContext();
    let executor = this.getExecutor(ctx, "test.webda.io", "GET", "/urltemplate/666");
    assert.notEqual(executor, undefined);
  }
}
