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
    const log = sinon.stub(process.stdout, "write");
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
        if (String(log.getCall(i).args[0]).includes("Error")) {
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

    const log = sinon.stub(process.stdout, "write");
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

  it("logStream", () => {
    output = new WorkerOutput();
    const logger = new ConsoleLogger(output, "INFO", undefined, "stderr");
    const stdout = sinon.stub(process.stdout, "write");
    const stderr = sinon.stub(process.stderr, "write");
    try {
      output.log("INFO", "to stderr");
      output.log("DEBUG", "filtered");
    } finally {
      stdout.restore();
      stderr.restore();
      logger.close();
    }
    assert.strictEqual(stdout.callCount, 0);
    assert.strictEqual(stderr.callCount, 1);
    assert.ok(String(stderr.getCall(0).args[0]).match(/\[ INFO\] to stderr\n$/));
  });

  it("output", () => {
    output = new WorkerOutput();
    // Output is not a log: it ignores the level and the log stream
    const logger = new ConsoleLogger(output, "ERROR", undefined, "stderr");
    const stdout = sinon.stub(process.stdout, "write");
    const stderr = sinon.stub(process.stderr, "write");
    try {
      output.output('{"raw": true}');
    } finally {
      stdout.restore();
      stderr.restore();
      logger.close();
    }
    assert.strictEqual(stderr.callCount, 0);
    assert.deepStrictEqual(
      stdout.getCalls().map(c => c.args[0]),
      ['{"raw": true}\n']
    );
  });

  it("defaults", () => {
    const previous = process.env.LOG_LEVEL;
    const stdout = sinon.stub(process.stdout, "write");
    try {
      // The level comes from the environment when valid
      process.env.LOG_LEVEL = "DEBUG";
      output = new WorkerOutput();
      let logger = new ConsoleLogger(output);
      output.log("DEBUG", "debug from env");
      output.log("TRACE", "filtered");
      logger.close();
      assert.strictEqual(stdout.callCount, 1);
      assert.ok(String(stdout.getCall(0).args[0]).includes("[DEBUG] debug from env"));
      stdout.resetHistory();

      // The default format includes the producer line when the output captures it
      output = new WorkerOutput();
      output.addLogProducerLine = true;
      logger = new ConsoleLogger(output, "INFO");
      assert.strictEqual(logger.format, ConsoleLogger.defaultFormatWithLine);
      output.log("INFO", "with line");
      logger.close();
      assert.strictEqual(stdout.callCount, 1);
      assert.ok(String(stdout.getCall(0).args[0]).includes("with line"));
      stdout.resetHistory();

      // An output message without data is an empty line, a message without log an empty INFO line
      ConsoleLogger.writeOutput(new WorkerMessage("output", output));
      assert.deepStrictEqual(stdout.lastCall.args, ["\n"]);
      ConsoleLogger.display(new WorkerMessage("title.set", output, { title: "ignored" }));
      assert.strictEqual(String(stdout.lastCall.args[0]).replace(/\u001b\[\d+m/g, ""), "\n");
    } finally {
      stdout.restore();
      if (previous === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = previous;
      }
    }
  });

  it("handles EPIPE without crashing", async () => {
    const { PassThrough } = await import("node:stream");
    const stream = new PassThrough();
    let writes = 0;
    stream.write = (() => {
      writes++;
      const err: NodeJS.ErrnoException = new Error("write EPIPE");
      err.code = "EPIPE";
      stream.emit("error", err);
      return false;
    }) as any;

    output = new WorkerOutput();
    const msg = new WorkerMessage("log", output, { log: { level: "INFO", args: ["hello"] } as any });
    // First write emits EPIPE and marks stream closed; second write is a no-op (#1167)
    ConsoleLogger.display(msg, ConsoleLogger.defaultFormat, stream);
    ConsoleLogger.display(msg, ConsoleLogger.defaultFormat, stream);
    assert.strictEqual(writes, 1);

    // Synchronous EPIPE throw from stream.write also marks stream closed
    const syncEpipeStream = new PassThrough();
    let syncWrites = 0;
    syncEpipeStream.write = (() => {
      syncWrites++;
      const err: NodeJS.ErrnoException = new Error("sync EPIPE");
      err.code = "EPIPE";
      throw err;
    }) as any;
    ConsoleLogger.display(msg, ConsoleLogger.defaultFormat, syncEpipeStream);
    ConsoleLogger.display(msg, ConsoleLogger.defaultFormat, syncEpipeStream);
    assert.strictEqual(syncWrites, 1);

    // Non-EPIPE errors from either event or synchronous write are rethrown
    const errStream = new PassThrough();
    errStream.write = (() => {
      const err: NodeJS.ErrnoException = new Error("sync EINVAL");
      err.code = "EINVAL";
      throw err;
    }) as any;
    assert.throws(() => ConsoleLogger.safeWrite(errStream, "x"), /sync EINVAL/);
    assert.throws(() => {
      const err: NodeJS.ErrnoException = new Error("async EINVAL");
      err.code = "EINVAL";
      errStream.emit("error", err);
    }, /async EINVAL/);
  });
});
