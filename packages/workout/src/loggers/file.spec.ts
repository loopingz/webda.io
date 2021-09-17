import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WorkerOutput } from "..";
import { FileLogger } from "./file";
import { writeFileSync, unlinkSync, readdirSync, lstatSync } from "fs";
import { DebugLogger } from "./debug";
import { WorkerMessage } from "../core";
import { WaitFor, WaitLinearDelay } from "@webda/core";

@suite
class FileConsoleTest {
  output: WorkerOutput;
  calls: any[];
  before() {
    this.output = new WorkerOutput();
    this.clean();
  }

  clean() {
    let files = readdirSync(".").filter(f => f.startsWith("test-file"));
    files.forEach(f => unlinkSync(f));
    return files.length;
  }

  @test
  async testLogsOnlyAndFilter() {
    let logger = new FileLogger(this.output, "TRACE", "./test-file.log");
    writeFileSync("./test-file2.log", "PAD\n".repeat(50));

    let logger2 = new FileLogger(this.output, "DEBUG", "./test-file2.log", 5000, "%(d)s [%(l)s] %(m)s");
    for (let i = 0; i < 200; i++) {
      this.output.log("DEBUG", `Test ${i}`);
    }
    this.output.log("TRACE", `Trace`);
    await WaitFor<void>(
      async resolve => {
        if (readdirSync(".").filter(f => f.startsWith("test-file")).length === 3) {
          resolve();
        }
        return false;
      },
      100,
      "loggers",
      undefined,
      WaitLinearDelay(200)
    );
    logger.outputStream.close();
    logger2.outputStream.close();

    // 2 for logger2 and 1 for logger1
    assert.ok(this.clean() === 3);
  }

  @test
  async debugLogger() {
    let logger = new DebugLogger(this.output, "./test-file-debug.log");
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
}