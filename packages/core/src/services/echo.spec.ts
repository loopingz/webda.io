import { WebdaTest } from "../test";
import * as assert from "assert";
import { EchoService } from "./echo";
import { suite, test } from "@testdeck/mocha";
import * as sinon from "sinon";

@suite
class EchoTest extends WebdaTest {
  @test
  async cov() {
    let service = new EchoService(this.webda, "test", { url: "/bouzouf", result: "plop" });
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
    service = new EchoService(this.webda, "test", { url: "/bouzouf", mime: "mine/json", result: { obj: "plop" } });
    ctx = await this.newContext();
    await service.execute(ctx);
    assert.strictEqual(ctx.getResponseHeaders()["Content-Type"], "mine/json");
    assert.strictEqual(ctx.getResponseBody(), '{"obj":"plop"}');
  }
}
