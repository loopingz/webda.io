import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "../test";
import * as assert from "assert";

@suite
class VersionTest extends WebdaTest {
  @test
  async normal() {
    let ctx = await this.newContext();
    await this.getExecutor(ctx, "webda.io", "GET", "/version").execute(ctx);
    // Version within package.json of test/ folder
    assert.strictEqual(ctx.getResponseBody(), "1.1.0");
  }
}
