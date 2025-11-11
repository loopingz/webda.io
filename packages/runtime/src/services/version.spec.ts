import { suite, test } from "@testdeck/mocha";
import { WebdaSimpleTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { VersionService } from "./version";

@suite
class VersionTest extends WebdaSimpleTest {
  @test
  async normal() {
    let ctx = await this.newContext();
    let service = await this.registerService(new VersionService(this.webda, "test", {}))
      .resolve()
      .init();
    await service.version(ctx);
    //await this.getExecutor(ctx, "webda.io", "GET", "/version").execute(ctx);
    // Version within package.json of test/ folder
    assert.ok(
      ctx
        .getResponseBody()
        .toString()
        .match(/\d+\.\d+\.\d+/) !== null
    );
  }
}
