import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "../test";
import * as assert from "assert";

@suite
class VersionTest extends WebdaTest {
  @test
  async normal() {
    let ctx = await this.newContext();
    await this.getExecutor(ctx, "webda.io", "GET", "/version").execute(ctx);
    assert.strictEqual(ctx.getResponseBody(), require("../../package.json").version);
  }
}
