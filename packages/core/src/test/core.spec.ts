import { suite, test } from "@webda/test";
import { MemoryLogger, useLog, useWorkerOutput } from "@webda/workout";
import * as assert from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebdaApplicationTest } from "./application.js";
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

  @test
  async fallsBackToWebdaConfigJson() {
    const dir = mkdtempSync(join(tmpdir(), "webda-test-cfg-"));
    const { default: sinon } = await import("sinon");
    const stub = sinon.stub(process, "cwd").returns(dir);
    try {
      writeFileSync(join(dir, "webda.config.json"), JSON.stringify({ version: 4, services: {} }));
      const cfg = WebdaApplicationTest.prototype.getTestConfiguration.call({});
      assert.deepStrictEqual(cfg, { version: 4, services: {} });
    } finally {
      stub.restore();
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
