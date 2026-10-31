import { suite, test } from "@webda/test";
import { MemoryLogger, useLog, useWorkerOutput } from "@webda/workout";
import * as assert from "node:assert";
import { readFileSync, rmSync } from "node:fs";
import { WebdaTest } from "./core.js";

@suite
class LogExportTest {
  @test
  replacesAPreviousLogWithoutAppendingToIt() {
    const memory = new MemoryLogger(useWorkerOutput(), "TRACE");
    let file: string | undefined;
    try {
      useLog("INFO", "exported test message");
      file = WebdaTest.exportMemoryLogger("test", this, "replacesAPreviousLogWithoutAppendingToIt", memory, Date.now());
      const first = readFileSync(file, "utf8");
      assert.ok(first.includes("exported test message"));
      WebdaTest.exportMemoryLogger("test", this, "replacesAPreviousLogWithoutAppendingToIt", memory, Date.now());
      const second = readFileSync(file, "utf8");
      assert.strictEqual(second.match(/exported test message/g)?.length, 1);
    } finally {
      memory.close();
      if (file) rmSync(file, { force: true });
    }
  }
}
