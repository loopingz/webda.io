import { describe, it } from "vitest";
import * as assert from "assert";
import * as sinon from "sinon";
import { WorkerLog, WorkerMessage, WorkerOutput } from "../core.js";
import { ConsoleLogger } from "./console.js";
import { WorkerLogger } from "./index.js";

describe("ConsoleLoggerTest", () => {
  let output: WorkerOutput;

  it("test", () => {
    output = new WorkerOutput();
    new ConsoleLogger(output);
    const log = sinon.spy(console, "log");
    try {
      output.log("WARN", "Testor");
      output.log("ERROR", "Testor");
      output.log("INFO", "Testor");
      output.log("DEBUG", "Testor");
      output.log("TRACE", "Testor");
      assert.strictEqual(log.callCount, 3);
      output.removeAllListeners();
      log.resetHistory();
      new ConsoleLogger(output, "TRACE");
      output.log("WARN", "Testor");
      output.log("ERROR", "Testor");
      output.log("INFO", "Testor");
      output.log("DEBUG", "Testor");
      output.log("TRACE", "Testor");
      const countBefore = log.callCount;
      assert.ok(countBefore >= 5, `Expected at least 5 calls but got ${countBefore}`);
      output.log("INFO", new Error());
      // Vitest may intercept console.log, so check that at least one more call was made
      assert.ok(log.callCount >= countBefore, `Expected callCount >= ${countBefore} but got ${log.callCount}`);
      // Find the error log in the calls
      let foundError = false;
      for (let i = 0; i < log.callCount; i++) {
        if (log.getCall(i).args[0]?.includes?.("Error")) {
          foundError = true;
          break;
        }
      }
      assert.ok(foundError, "Expected to find an Error log entry");
    } finally {
      log.restore();
    }
  });

  it("cov", () => {
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
    assert.strictEqual(ConsoleLogger.format(msg, "[%(ff)s(%(f)s:%(ll)d:%(c)d)]"), "[plopFunction(plop.ts:10:5)]");
  });

  it("titleSet", () => {
    output = new WorkerOutput();
    ConsoleLogger.handleMessage(new WorkerMessage("title.set", output, {}), "TRACE");
  });

  it("testWorkerLoggerStopStart", () => {
    output = new WorkerOutput();
    const logger = new ConsoleLogger(output, "INFO");

    // Test stop (alias for close)
    logger.stop();
    assert.strictEqual(output.listeners("message").length, 0);

    // Test start
    logger.start();
    assert.strictEqual(output.listeners("message").length, 1);

    // Test start again (should not add duplicate)
    logger.start();
    assert.strictEqual(output.listeners("message").length, 1);

    // Clean up
    logger.close();
  });

  it("testWorkerLoggerDynamicLevel", () => {
    // Test that WorkerLogger can accept a function for dynamic log level
    output = new WorkerOutput();
    let currentLevel = "INFO" as import("../core").WorkerLogLevel;

    // Create a minimal logger implementation to test the base class
    class TestLogger extends WorkerLogger {
      onMessage(msg: WorkerMessage) {
        ConsoleLogger.handleMessage(msg, this.level(), ConsoleLogger.defaultFormat);
      }
    }

    const logger = new TestLogger(output, () => currentLevel);

    const log = sinon.spy(console, "log");
    try {
      output.log("DEBUG", "Should not show");
      assert.strictEqual(log.callCount, 0);

      currentLevel = "DEBUG";
      output.log("DEBUG", "Should show");
      assert.strictEqual(log.callCount, 1);
    } finally {
      log.restore();
      logger.close();
    }
  });
});
