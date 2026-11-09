import { suite, test } from "@webda/test";
import { WorkerOutput } from "@webda/workout";
import * as assert from "assert";
import { WebdaTest } from "../test/core.js";
import { Logger } from "./ilogger.js";
import { FileLoggerService } from "./file.service.js";
import { ConsoleLoggerService } from "./console.service.js";
import { MemoryLoggerService } from "./memory.service.js";
import { LoggerService } from "./logger.js";
import {
  LoggerServiceParameters,
  ConsoleLoggerServiceParameters,
  MemoryLoggerServiceParameters,
  FileLoggerServiceParameters
} from "./params.js";

@suite
class LoggerTest extends WebdaTest {
  @test
  testLogger() {
    const output: any = {
      log: (...args) => {},
      logWithContext: (...args) => {},
      openGroup: (...args) => {},
      closeGroup: (...args) => {},
      startProgress: (...args) => {},
      incrementProgress: (...args) => {},
      updateProgress: (...args) => {},
      setTitle: (...args) => {}
    };
    const logger = new Logger(<WorkerOutput>output, { class: "plop" });
    logger.log("DEBUG", "test");
    logger.logGroupOpen("bouzouf");
    logger.logProgressStart("test", 100, "plop");
    logger.logWithContext("INFO", {}, "plop");
    logger.logProgressUpdate(50, "test");
    logger.logProgressIncrement(15, "test");
    logger.logGroupClose();
    logger.logTitle("MyTitle");
  }

  @test
  async fileLogger() {
    this.cleanFiles.push("test.log");
    const logger = new FileLoggerService("flogger", {
      file: "test.log"
    });
  }
}

@suite
class LoggerParametersTest {
  @test
  defaultLogLevel() {
    const params = new LoggerServiceParameters().load({});
    assert.strictEqual(params.logLevel, "INFO");
  }

  @test
  customLogLevel() {
    const params = new LoggerServiceParameters().load({ logLevel: "DEBUG" });
    assert.strictEqual(params.logLevel, "DEBUG");
  }

  @test
  invalidLogLevel() {
    const params = new LoggerServiceParameters().load({ logLevel: "INVALID" });
    // Should fallback to INFO
    assert.strictEqual(params.logLevel, "INFO");
  }

  @test
  consoleLoggerParams() {
    const params = new ConsoleLoggerServiceParameters().load({ format: "json" });
    assert.strictEqual(params.format, "json");
  }

  @test
  memoryLoggerParams() {
    const params = new MemoryLoggerServiceParameters().load({ limit: 500 });
    assert.strictEqual(params.limit, 500);
  }

  @test
  fileLoggerParams() {
    const params = new FileLoggerServiceParameters().load({ file: "/tmp/test.log", sizeLimit: 1024 });
    assert.strictEqual(params.file, "/tmp/test.log");
    assert.strictEqual(params.sizeLimit, 1024);
  }

  @test
  loggerServiceResolveWithAddLogProducerLine() {
    const service = new LoggerService(
      "testLoggerSvc",
      new LoggerServiceParameters().load({ addLogProducerLine: true })
    );
    // resolve should set addLogProducerLine on the output
    service.resolve();
    // Just ensure it doesn't throw
  }

  @test
  loggerServiceResolveWithoutAddLogProducerLine() {
    const service = new LoggerService("testLoggerSvc2", new LoggerServiceParameters().load({}));
    service.resolve();
  }

  @test
  memoryLoggerServiceResolve() {
    const service = new MemoryLoggerService("memLogger", new MemoryLoggerServiceParameters().load({}));
    service.resolve();
    assert.ok(service.workoutLogger);
  }

  @test
  consoleLoggerServiceResolve() {
    const service = new ConsoleLoggerService("conLogger", new ConsoleLoggerServiceParameters().load({}));
    service.resolve();
    assert.ok(service.workoutLogger);
    assert.ok(service.loadParameters({}));
  }

  @test
  async additionalLoggersEventsAndMetricsCoverage() {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { setWorkerOutput, useWorkerOutput } = await import("./ilogger.js");
    const { useLogger } = await import("./hooks.js");
    const { User } = await import("../models/user.model.js");
    const { AsyncEventEmitterImpl } = await import("../events/asynceventemitter.js");
    const { emitCoreEvent, useCoreEvents } = await import("../events/events.js");
    const { useMetric, Histogram } = await import("../metrics/metrics.js");
    const { runWithInstanceStorage, useInstanceStorage } = await import("../core/instancestorage.js");
    const { Application } = await import("../application/application.js");

    // 1. ilogger.ts setWorkerOutput
    const currentOut = useWorkerOutput();
    setWorkerOutput(currentOut);
    assert.strictEqual(useWorkerOutput(), currentOut);

    // 2. file.service.ts resolve error + success + loadParameters
    const badFileLogger = new FileLoggerService("badFile", new FileLoggerServiceParameters().load({}));
    assert.throws(() => badFileLogger.resolve(), /You must specify a file to log into/);
    const tmp = mkdtempSync(join(tmpdir(), "webda-log-"));
    try {
      const logFile = join(tmp, "app.log");
      const fileLogger = new FileLoggerService("okFile", new FileLoggerServiceParameters().load({ file: logFile }));
      assert.ok(fileLogger.loadParameters({ file: logFile }));
      fileLogger.resolve();
      assert.ok(fileLogger.workoutLogger);
      fileLogger.workoutLogger.close();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }

    // 3. hooks.ts useLogger(Model instance) and metrics.ts startTimer when metrics === false
    await runWithInstanceStorage({}, async () => {
      const app = new Application({ version: 4, parameters: { metrics: false }, services: {} });
      app.addModel("Webda/User", User);
      useInstanceStorage().application = app;
      const modelLogger = useLogger(new User());
      assert.strictEqual(modelLogger.context.class, "Webda/User");

      const mockMetric = useMetric(Histogram, { name: "test_hist", help: "help" });
      const endTimer = mockMetric.startTimer();
      assert.strictEqual(endTimer(), 0);
    });

    // 4. AsyncEventEmitterImpl methods
    class TestAsyncEmitter extends AsyncEventEmitterImpl<{ ping: number }> {
      constructor() {
        super();
      }
    }
    const emitter = new TestAsyncEmitter();
    emitter.setMaxListeners(25);
    assert.strictEqual(emitter.getMaxListeners(), 25);
    const seen: number[] = [];
    emitter.addListener("ping", v => {
      seen.push(v);
    });
    emitter.once("ping", async v => {
      seen.push(v * 10);
    });
    await emitter.emit("ping", 2);
    assert.deepStrictEqual(seen, [2, 20]);
    emitter.removeAllListeners("ping");
    assert.strictEqual(emitter.listeners("ping").length, 0);

    // 5. events.ts emitCoreEvent sync throw and async rejection
    const offSync = useCoreEvents("Webda.Init", () => {
      throw new Error("sync listener boom");
    });
    const offAsync = useCoreEvents("Webda.Init", async () => {
      throw new Error("async listener boom");
    });
    try {
      emitCoreEvent("Webda.Init", {});
      await new Promise(r => setImmediate(r));
    } finally {
      offSync();
      offAsync();
    }
  }
}
