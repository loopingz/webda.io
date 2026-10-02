import { describe, it, afterEach } from "vitest";
import * as assert from "assert";
import { WorkerMessage, WorkerOutput } from "./core.js";
import { patchConsole } from "./consolepatch.js";

describe("patchConsole", () => {
  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  /**
   * Collect the log messages emitted on an output
   * @param output - the output to listen to
   * @returns the collected [level, args] pairs
   */
  function collect(output: WorkerOutput): [string, any[]][] {
    const logs: [string, any[]][] = [];
    output.on("message", (msg: WorkerMessage) => {
      if (msg.type === "log") logs.push([msg.log.level, msg.log.args]);
    });
    return logs;
  }

  it("routes console methods to log levels", () => {
    const output = new WorkerOutput();
    const logs = collect(output);
    restore = patchConsole(output);
    const obj = { a: 1 };
    console.log("log", obj);
    console.info("info");
    console.warn("warn");
    console.error("error");
    console.debug("debug");
    console.trace("trace");
    assert.deepStrictEqual(logs, [
      ["INFO", ["log", obj]],
      ["INFO", ["info"]],
      ["WARN", ["warn"]],
      ["ERROR", ["error"]],
      ["DEBUG", ["debug"]],
      ["TRACE", ["trace"]]
    ]);
  });

  it("restores the original methods", () => {
    const original = { log: console.log, error: console.error, warn: console.warn };
    restore = patchConsole(new WorkerOutput());
    assert.notStrictEqual(console.log, original.log);
    restore();
    restore = undefined;
    assert.strictEqual(console.log, original.log);
    assert.strictEqual(console.error, original.error);
    assert.strictEqual(console.warn, original.warn);
  });

  it("is idempotent", () => {
    const output = new WorkerOutput();
    const logs = collect(output);
    restore = patchConsole(output);
    const second = patchConsole(output);
    console.log("once");
    second();
    assert.deepStrictEqual(logs, [["INFO", ["once"]]]);
    // The no-op restore of the second call keeps the patch active
    console.log("still patched");
    assert.strictEqual(logs.length, 2);
  });

  it("does not loop when a listener uses console", () => {
    const output = new WorkerOutput();
    let calls = 0;
    output.on("message", () => {
      calls++;
      // A logger writing through console must reach the original method
      console.log("from listener");
    });
    restore = patchConsole(output);
    console.log("outer");
    assert.strictEqual(calls, 1);
  });
});
