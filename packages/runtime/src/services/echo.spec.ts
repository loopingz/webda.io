import { suite, test } from "@testdeck/mocha";
import { WebdaSimpleTest } from "@webda/core/lib/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { EchoService } from "./echo";

@suite
class EchoTest extends WebdaSimpleTest {
  @test
  async cov() {
    let service = new EchoService(this.webda, "test", {
      url: "/bouzouf",
      result: "plop"
    });
    // @ts-ignore
    let stub = sinon.spy(service, "addRoute");
    try {
      service.initRoutes();
      assert.strictEqual(stub.callCount, 1);
    } finally {
      stub.restore();
    }
    let ctx = await this.newContext();
    await service.execute(ctx);
    assert.strictEqual(ctx.getResponseBody(), "plop");
    service = new EchoService(this.webda, "test", {
      url: "/bouzouf",
      mime: "mine/json",
      result: { obj: "plop" }
    });
    ctx = await this.newContext();
    await service.execute(ctx);
    assert.strictEqual(ctx.getResponseHeaders()["Content-Type"], "mine/json");
    assert.strictEqual(ctx.getResponseBody(), '{"obj":"plop"}');
  }
}
