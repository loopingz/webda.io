import { suite, test } from "@webda/test";
import { WorkerOutput } from "@webda/workout";
import * as assert from "assert";
import { WebdaTest } from "../test/core.js";
import { Logger } from "./ilogger.js";
import { FileLoggerService } from "./file.js";
import { ConsoleLoggerService } from "./console.js";
import { MemoryLoggerService } from "./memory.js";
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
    const service = new LoggerService("testLoggerSvc", new LoggerServiceParameters().load({ addLogProducerLine: true }));
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
  }
}
