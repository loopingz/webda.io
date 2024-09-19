import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import axios from "axios";
import { Histogram } from "prom-client";
import { WebdaInternalTest } from "../test";
import { HttpContext } from "../utils/httpcontext";
import { PrometheusService } from "./prometheus";
import { UnpackedConfiguration } from "../application";

@suite
class PrometheusTest extends WebdaInternalTest {
  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      parameters: {
        ignoreBeans: true
      },
      services: {
        PrometheusService: {
          portNumber: 9090,
          includeNodeMetrics: false,
          includeRequestMetrics: false
        }
      }
    };
  }

  @test
  async sideServe() {
    try {
      // Should be listen on 9090 now
      const res = await axios.get("http://localhost:9090/metrics");
      assert.ok(res.data.includes("webda_registry_operations_total"));
      await assert.rejects(() => axios.get("http://localhost:9090/metrics2"), /Request failed with status code 404/);
    } finally {
      //service.http?.close();
    }
  }
}

@suite
class EmbeddedPrometheusTest extends WebdaInternalTest {
  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      services: {
        PrometheusService: {}
      }
    };
  }
  @test
  async normal() {
    const ctx = await this.newContext("toto");
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
