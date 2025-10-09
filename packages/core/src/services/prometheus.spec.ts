import { suite, test } from "@webda/test";
import * as assert from "assert";
import axios from "axios";
import { Histogram } from "prom-client";
import { WebdaApplicationTest } from "../test/application.js";
import { HttpContext } from "../contexts/httpcontext.js";
import { UnpackedConfiguration } from "../internal/iapplication.js";
import { WebdaInternalTest } from "../test/internal.js";
import { emitCoreEvent } from "../events/events.js";

@suite
class PrometheusTest extends WebdaApplicationTest {
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
    await emitCoreEvent("Webda.Request", { context: ctx });
    await emitCoreEvent("Webda.Result", { context: ctx });
    ctx.setHttpContext(new HttpContext("localhost", "PUT", "/version"));
    await emitCoreEvent("Webda.Request", { context: ctx });
    await emitCoreEvent("Webda.Result", { context: ctx });
    await this.execute(ctx, "localhost", "GET", "/metrics");
    await emitCoreEvent("Webda.Request", { context: ctx });
    await emitCoreEvent("Webda.Result", { context: ctx });
    // TODO Revisit
    // this.webda.getGlobalParams().metrics = false;
    // Fake metrics should return 0 for timer
    // assert.strictEqual((<Histogram>this.webda.getMetric(Histogram, { name: "test", help: "fake" })).startTimer()(), 0);
  }
}
