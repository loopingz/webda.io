import { describe, it, beforeEach } from "vitest";
import * as assert from "assert";
import { readdirSync, unlinkSync, writeFileSync } from "fs";
import { WorkerMessage, WorkerLog, WorkerOutput } from "../core.js";
import { DebugLogger } from "./debug.js";
import { FileLogger } from "./file.js";

describe("FileConsoleTest", () => {
  let output: WorkerOutput;

  function clean() {
    const files = readdirSync(".").filter(f => f.startsWith("test-file"));
    files.forEach(f => unlinkSync(f));
    return files.length;
  }

  beforeEach(() => {
    output = new WorkerOutput();
    clean();
  });

  it("testLogsOnlyAndFilter", async () => {
    const logger = new FileLogger(output, "TRACE", "./test-file.log");
    writeFileSync("./test-file2.log", "PAD\n".repeat(50));

    const logger2 = new FileLogger(output, "DEBUG", "./test-file2.log", 5000, "%(d)s [%(l)s] %(m)s");
    for (let i = 0; i < 200; i++) {
      output.log("DEBUG", `Test ${i}`);
    }
    output.log("TRACE", `Trace`);
    for (let i = 0; i < 50; i++) {
      if (readdirSync(".").filter(f => f.startsWith("test-file")).length === 3) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    logger.onMessage(new WorkerMessage("title.set", undefined, { title: "Title" }));
    logger.onMessage(
      new WorkerMessage("log", undefined, {
        log: new WorkerLog("INFO", "test")
      })
    );
    logger.onMessage(new WorkerMessage("group.open", undefined, {}));
    logger.outputStream.close();
    logger2.outputStream.close();

    // 2 for logger2 and 1 for logger1
    assert.ok(clean() === 3);
  });

  it("debugLogger", async () => {
    const logger = new DebugLogger(output, "./test-file-debug.log");
    assert.strictEqual(logger.filter(), true);
    assert.notStrictEqual(
      logger
        .getLine(new WorkerMessage("log", output, {}))
        .match(/log:\d+:\{"progresses":\{\},"groups":\[\],"type":"log","timestamp":\d+}\n/),
      undefined
    );
    await new Promise(resolve => process.nextTick(resolve));
    clean();
  });

  it("cov", () => {
    assert.throws(() => new FileLogger(output, "TRACE", <any>undefined));
  });
});
