import { DiagLogLevel, diag } from "@opentelemetry/api";
import { suite, test, timeout } from "@webda/test";
import { HttpContext, Service, ServiceParameters, WebContext, useApplication, useRouter } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import * as assert from "node:assert";
import { OtelLogger, OtelService, OtelServiceParameters } from "./otel.service.js";

class FakeService extends Service {
  myRecursiveMethod(i: number = 0) {
    if (i > 3) {
      return 3;
    }
    return this.myRecursiveMethod(i + 1);
  }

  async myAsyncMethod() {
    return "async";
  }

  myFaultyMethod() {
    throw new Error("Fake");
  }
}

@suite
class OtelTest extends WebdaApplicationTest {
  /**
   * Create, register and resolve an OtelService
   * @param params - the service parameters
   * @returns the service
   */
  createOtel(params: any = {}): OtelService {
    return this.registerService(
      new OtelService(
        "otel",
        new OtelServiceParameters().load({
          loggerExporter: { enable: false },
          metricExporter: { type: "otlp", enable: false },
          ...params
        })
      )
    ).resolve();
  }

  // Shutting down the auto-instrumentations takes several seconds
  @test
  @timeout(30000)
  async test() {
    const fake = this.registerService(new FakeService("fake", new ServiceParameters().load({}))).resolve();
    const original = fake.myRecursiveMethod;
    const service = this.createOtel({ traceExporter: { type: "console", enable: true, sampling: 0.5 } });
    assert.notStrictEqual(fake.myRecursiveMethod, original);

    assert.strictEqual(fake.myRecursiveMethod(), 3);
    assert.strictEqual(await fake.myAsyncMethod(), "async");
    assert.throws(() => fake.myFaultyMethod(), /Fake/);

    // Request span, executed twice to cover the sampling
    for (let i = 0; i < 2; i++) {
      const ctx = new WebContext(new HttpContext("test.webda.io", "GET", "/otel"));
      await useRouter()
        .execute(ctx)
        .catch(() => {});
      assert.ok(ctx.getExtension("otel"));
    }

    // Patching twice should not double wrap
    const patched = fake.myRecursiveMethod;
    service.patch();
    assert.strictEqual(fake.myRecursiveMethod, patched);

    service.getParameters().traceExporter.enable = false;
    service.updatePatch();
    assert.strictEqual(fake.myRecursiveMethod, original);
    service.unpatch();
    service.getParameters().traceExporter.enable = true;
    service.updatePatch();
    assert.notStrictEqual(fake.myRecursiveMethod, original);
    // Ensure to be able to stop
    await service.stop();
    assert.strictEqual(fake.myRecursiveMethod, original);
  }

  @test
  async exporters() {
    const service = new OtelService("otel", new OtelServiceParameters().load({}));
    assert.ok(service.getTraceExporter());
    service.getParameters().traceExporter.type = "console";
    assert.ok(service.getTraceExporter());
    service.getParameters().traceExporter.enable = false;
    assert.strictEqual(service.getTraceExporter(), undefined);
  }

  @test
  async withLogger() {
    const service = this.createOtel({
      loggerExporter: { enable: true, type: "otlp", url: "http://localhost:4317" },
      traceExporter: { type: "otlp", enable: false }
    });
    assert.ok(service.otelLogger);
    assert.strictEqual(service.stubs, undefined);
    await service.stop();
  }

  @test
  async otelLogger() {
    const out = useApplication().getWorkerOutput();
    const records = [];
    const logger = new OtelLogger(<any>{ emit: r => records.push(r) }, out);
    out.log("INFO", "test", "message");
    out.startProgress("p", 10, "progress");
    logger.close();
    assert.ok(records.some(r => r.severityText === "INFO" && r.body === "test message"));
    assert.ok(records.every(r => r.severityText !== undefined));
  }

  @test
  async getDiagLevel() {
    const service = new OtelService("otel", new OtelServiceParameters().load({ diagnostic: "ALL" }));
    assert.strictEqual(service.getDiagLevel(), DiagLogLevel.ALL);
    const levels = {
      NONE: DiagLogLevel.NONE,
      ERROR: DiagLogLevel.ERROR,
      INFO: DiagLogLevel.INFO,
      TRACE: DiagLogLevel.VERBOSE,
      WARN: DiagLogLevel.WARN,
      DEBUG: DiagLogLevel.DEBUG
    };
    for (const [level, expected] of Object.entries(levels)) {
      service.getParameters().diagnostic = <any>level;
      assert.strictEqual(service.getDiagLevel(), expected);
    }
  }

  @test
  async diagnostic() {
    const service = this.createOtel({ diagnostic: "ALL", traceExporter: { type: "otlp", enable: false } });
    diag.verbose("test");
    diag.debug("test");
    diag.error("test");
    diag.warn("test");
    diag.info("test");
    diag.disable();
    await service.stop();
  }
}
