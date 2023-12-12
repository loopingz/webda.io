import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import axios from "axios";
import { Histogram } from "prom-client";
import { WebdaTest } from "../test";
import { HttpContext } from "../utils/httpcontext";
import { PrometheusService } from "./prometheus";

@suite
class PrometheusTest extends WebdaTest {
  @test
  async sideServe() {
    let service = new PrometheusService(this.webda, "", {
      portNumber: 9090,
      includeNodeMetrics: false,
      includeRequestMetrics: false
    });
    try {
      await service.resolve().init();
      // Should be listen on 9090 now
      let res = await axios.get("http://localhost:9090/metrics");
      assert.ok(res.data.includes("webda_filequeue_queue_size"));
      await assert.rejects(() => axios.get("http://localhost:9090/metrics2"), /Request failed with status code 404/);
    } finally {
      service.http?.close();
    }
  }

  @test
  async normal() {
    let ctx = await this.newContext("toto");
    ctx.setHttpContext(new HttpContext("localhost", "GET", "/version"));
    await this.webda.emitSync("Webda.Request", { context: ctx });
    await this.webda.emitSync("Webda.Result", { context: ctx });
    ctx.setHttpContext(new HttpContext("localhost", "PUT", "/version"));
    await this.webda.emitSync("Webda.Request", { context: ctx });
    await this.webda.emitSync("Webda.Result", { context: ctx });
    await this.execute(ctx, "localhost", "GET", "/metrics");
    await this.webda.emitSync("Webda.Request", { context: ctx });
    await this.webda.emitSync("Webda.Result", { context: ctx });
    this.webda.getGlobalParams().metrics = false;
    // Fake metrics should return 0 for timer
    assert.strictEqual((<Histogram>this.webda.getMetric(Histogram, { name: "test", help: "fake" })).startTimer()(), 0);
  }
}
