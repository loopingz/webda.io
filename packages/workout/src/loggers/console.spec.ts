import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { WorkerLog, WorkerMessage, WorkerOutput } from "../core";
import { ConsoleLogger } from "./console";
import { WorkerLogger } from "./index";

@suite
class ConsoleLoggerTest {
  output: WorkerOutput;
  @test
  test() {
    this.output = new WorkerOutput();
    new ConsoleLogger(this.output);
    const log = sinon.spy(console, "log");
    try {
      this.output.log("WARN", "Testor");
      this.output.log("ERROR", "Testor");
      this.output.log("INFO", "Testor");
      this.output.log("DEBUG", "Testor");
      this.output.log("TRACE", "Testor");
      assert.strictEqual(log.callCount, 3);
      this.output.removeAllListeners();
      log.resetHistory();
      new ConsoleLogger(this.output, "TRACE");
      this.output.log("WARN", "Testor");
      this.output.log("ERROR", "Testor");
      this.output.log("INFO", "Testor");
      this.output.log("DEBUG", "Testor");
      this.output.log("TRACE", "Testor");
      assert.strictEqual(log.callCount, 5);
      this.output.log("INFO", new Error());
      assert.strictEqual(log.callCount, 6);
      console.error(log.getCall(5).args[0]);
      assert.ok(log.getCall(5).args[0].includes("Error\n    at"));

    } finally {
      log.restore();
    }
  }

  @test
  cov() {
    ConsoleLogger.display(
      new WorkerMessage("log", undefined, {
        log: new WorkerLog("INFO", undefined, {}, "plop")
      })
    );
    const msg = new WorkerMessage("log", undefined, {
      log: new WorkerLog("INFO", undefined, {}, "plop")
    });
    msg.timestamp = Date.now();
    assert.strictEqual(ConsoleLogger.format(msg, "%5$r"), "bad log format: %5$r");
    assert.ok(
      ConsoleLogger.format(msg).match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z \[ INFO\] undefined \{\} plop/) !==
        null
    );
    ConsoleLogger.format(new WorkerMessage("title.set", undefined, { title: "plop" }));
    msg.context = { line: 10, function: "plopFunction", file: "plop.ts", column: 5 };
    assert.strictEqual(
      ConsoleLogger.format(msg, "[%(ff)s(%(f)s:%(ll)d:%(c)d)]"),
      "[plopFunction(plop.ts:10:5)]"
    );
  }

  @test
  titleSet() {
    this.output = new WorkerOutput();
    ConsoleLogger.handleMessage(new WorkerMessage("title.set", this.output, {}), "TRACE");
  }

  @test
  testWorkerLoggerStopStart() {
    this.output = new WorkerOutput();
    const logger = new ConsoleLogger(this.output, "INFO");

    // Test stop (alias for close)
    logger.stop();
    assert.strictEqual(this.output.listeners("message").length, 0);

    // Test start
    logger.start();
    assert.strictEqual(this.output.listeners("message").length, 1);

    // Test start again (should not add duplicate)
    logger.start();
    assert.strictEqual(this.output.listeners("message").length, 1);

    // Clean up
    logger.close();
  }

  @test
  testWorkerLoggerDynamicLevel() {
    // Test that WorkerLogger can accept a function for dynamic log level
    this.output = new WorkerOutput();
    let currentLevel = "INFO" as import("../core").WorkerLogLevel;

    // Create a minimal logger implementation to test the base class
    class TestLogger extends WorkerLogger {
      onMessage(msg: WorkerMessage) {
        ConsoleLogger.handleMessage(msg, this.level(), ConsoleLogger.defaultFormat);
      }
    }

    const logger = new TestLogger(this.output, () => currentLevel);

    const log = sinon.spy(console, "log");
    try {
      this.output.log("DEBUG", "Should not show");
      assert.strictEqual(log.callCount, 0);

      currentLevel = "DEBUG";
      this.output.log("DEBUG", "Should show");
      assert.strictEqual(log.callCount, 1);
    } finally {
      log.restore();
      logger.close();
    }
  }
}
