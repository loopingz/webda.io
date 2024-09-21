import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { readdirSync, unlinkSync, writeFileSync } from "fs";
import { WorkerMessage, WorkerLog, WorkerOutput } from "../core";
import { DebugLogger } from "./debug";
import { FileLogger } from "./file";

@suite
class FileConsoleTest {
  output: WorkerOutput;
  calls: any[];
  before() {
    this.output = new WorkerOutput();
    this.clean();
  }

  clean() {
    const files = readdirSync(".").filter(f => f.startsWith("test-file"));
    files.forEach(f => unlinkSync(f));
    return files.length;
  }

  @test
  async testLogsOnlyAndFilter() {
    const logger = new FileLogger(this.output, "TRACE", "./test-file.log");
    writeFileSync("./test-file2.log", "PAD\n".repeat(50));

    const logger2 = new FileLogger(this.output, "DEBUG", "./test-file2.log", 5000, "%(d)s [%(l)s] %(m)s");
    for (let i = 0; i < 200; i++) {
      this.output.log("DEBUG", `Test ${i}`);
    }
    this.output.log("TRACE", `Trace`);
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
    assert.ok(this.clean() === 3);
  }

  @test
  async debugLogger() {
    const logger = new DebugLogger(this.output, "./test-file-debug.log");
    assert.strictEqual(logger.filter(), true);
    assert.notStrictEqual(
      logger
        .getLine(new WorkerMessage("log", this.output, {}))
        .match(/log:\d+:\{"progresses":\{\},"groups":\[\],"type":"log","timestamp":\d+}\n/),
      undefined
    );
    await new Promise(resolve => process.nextTick(resolve));
    this.clean();
  }

  @test
  cov() {
    assert.throws(() => new FileLogger(this.output, "TRACE", <any>undefined));
  }
}
