import { DiagLogLevel, diag } from "@opentelemetry/api";
import { suite, test } from "@testdeck/mocha";
import { ResourceService, Service } from "@webda/core";
import { WebdaSimpleTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { OtelLogger, OtelService } from "./otel";

class FakeService extends Service {
  myRecursiveMethod(i: number = 0) {
    if (i > 3) {
      return 3;
    }
    return this.myRecursiveMethod(i + 1);
  }

  myFaultyMethod() {
    throw new Error("Fake");
  }
}

@suite
class OtelTest extends WebdaSimpleTest {
  @test
  async test() {
    const resource = await this.addService(ResourceService, { folder: "./src", url: "/" });

    const fake = await this.addService(FakeService);
    const service = await this.addService(OtelService);

    const ctx = await this.newContext();
    await this.execute(ctx, "test.webda.io", "GET", "/otel.ts");
    fake.myRecursiveMethod();
    assert.throws(() => fake.myFaultyMethod());
    delete service.getParameters().traceExporter;
    await service.reinit({ traceExporter: { type: "otlp", enable: false } });
    await service.reinit({ traceExporter: { type: "otlp", enable: true } });
    // Ensure to be able to stop
    await service.stop();
  }

  @test
  async otelLogger() {
    const out = this.webda.getApplication().getWorkerOutput();
    new OtelLogger({ emit: () => {} }, out);
    out.log("INFO", "test");
    await this.nextTick(2);
  }

  @test
  async getDiagLevel() {
    const service = new OtelService(this.webda, "otel", { diagnostic: "ALL" });
    assert.strictEqual(service.getDiagLevel(), DiagLogLevel.ALL);

    service.reinit({ diagnostic: "ERROR" });
    assert.strictEqual(service.getDiagLevel(), DiagLogLevel.ERROR);

    service.reinit({ diagnostic: "INFO" });
    assert.strictEqual(service.getDiagLevel(), DiagLogLevel.INFO);

    service.reinit({ diagnostic: "TRACE" });
    assert.strictEqual(service.getDiagLevel(), DiagLogLevel.VERBOSE);

    service.reinit({ diagnostic: "WARN" });
    assert.strictEqual(service.getDiagLevel(), DiagLogLevel.WARN);

    service.reinit({ diagnostic: "DEBUG" });
    assert.strictEqual(service.getDiagLevel(), DiagLogLevel.DEBUG);

    diag.verbose("test");
    diag.debug("test");
    diag.error("test");
    diag.warn("test");
    diag.info("test");

    await this.nextTick(2);
  }
}
