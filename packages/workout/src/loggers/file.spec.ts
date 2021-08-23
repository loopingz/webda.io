import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WorkerOutput } from "..";
import { FileLogger } from "./file";
import { writeFileSync, unlinkSync, readdirSync } from "fs";
import { DebugLogger } from "./debug";
import { WorkerMessage } from "../core";

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
  testLogsOnlyAndFilter() {
    let logger = new FileLogger(this.output, "TRACE", "./test-file.log");
    writeFileSync("./test-file2.log", "PAD\n".repeat(50));
    let logger2 = new FileLogger(this.output, "DEBUG", "./test-file2.log", 500, "%d");
    for (let i = 0; i < 200; i++) {
      this.output.log("DEBUG", `Test ${i}`);
    }
    this.output.log("TRACE", `Trace`);
    assert.ok(this.clean() > 2);
  }

  @test
  debugLogger() {
    let logger = new DebugLogger(this.output, "./test-file-debug.log");
    assert.strictEqual(logger.filter(), true);
    assert.notStrictEqual(
      logger
        .getLine(new WorkerMessage("log", this.output, {}))
        .match(/log:\d+:\{"progresses":\{\},"groups":\[\],"type":"log","timestamp":\d+}\n/),
      undefined
    );
    this.clean();
  }
}
