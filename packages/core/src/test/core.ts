import { afterEach, CallbackOptionallyAsync, testWrapper, getMetadata, beforeAll } from "@webda/test";
import { ConsoleLogger, MemoryLogger, useLog, useWorkerOutput } from "@webda/workout";
import { existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { sanitizeFilename } from "@webda/utils";
import { dirname } from "node:path";

/**
 * Define a test suite
 */
export class WebdaTest {
  cleanFiles: string[] = [];

  async wrap(type: "beforeAll" | "test" | "afterAll", callback: CallbackOptionallyAsync) {
    return callback();
  }

  /**
   * Run the test with a custom memory logger to store logs in case of failure
   * @param callback
   */
  @testWrapper
  protected async testWrapper(type: "beforeAll" | "test" | "afterAll" = "test", callback: CallbackOptionallyAsync) {
    let exportLog = process.env.WEBDA_TEST_LOGS !== undefined;
    const memoryLogger = new MemoryLogger(useWorkerOutput(), "TRACE");
    const start = Date.now();
    try {
      await this.wrap(type, callback.bind(this));
    } catch (err) {
      exportLog = true;
      useLog("ERROR", err);
      throw err;
    } finally {
      if (exportLog) {
        WebdaTest.exportMemoryLogger(type, this, callback.name, memoryLogger, start);
      }
      memoryLogger.close();
    }
  }

  /**
   * Get log file for the test
   *
   * @param object
   * @param method
   * @param memory
   * @param start
   * @returns
   */
  static exportMemoryLogger(
    type: "beforeAll" | "test" | "afterAll" = "test",
    object,
    method: string,
    memory: MemoryLogger,
    start: number
  ): string {
    let duration: number | string = Date.now() - start;
    if (duration > 1000) {
      duration = Math.round(duration / 10) / 100 + "s";
    } else {
      duration = duration + "ms";
    }
    let suiteName = "UnknownSuite";
    let testName = method;
    const metadata = getMetadata(object.constructor);
    if (metadata["webda:suite"]?.name) {
      suiteName = metadata["webda:suite"].name;
    }
    if (type === "test" && metadata["webda:tests"]) {
      const test = metadata["webda:tests"].find(t => t.fnKey === method);
      if (test?.name) {
        testName = test.name;
      }
    } else {
      testName = type;
    }

    const file = `.webda/tests/${sanitizeFilename(suiteName)}/${testName}.log`;
    mkdirSync(dirname(file), { recursive: true });
    if (existsSync(file)) unlinkSync(file);
    writeFileSync(
      file,
      [
        `Test ${suiteName}.${method} took ${duration}`,
        ...memory
          .getLogs()
          .filter(l => l.type === "log")
          .map(msg => ConsoleLogger.format(msg, ConsoleLogger.defaultFormat))
      ].join("\n")
    );
    return file;
  }

  /**
   * Clean all logs for this suite
   * @returns
   */
  static cleanLogs() {
    const folder = `.webda/tests/${sanitizeFilename((this as any)["__webda_suite_name"] ?? this.name ?? "Suite")}`;
    if (!existsSync(folder)) return;
    rmSync(folder, { recursive: true });
  }

  // Optional: keep no-op private hooks for parity (not used by the TS5 decorator wiring)
  async afterEach() {
    try {
      this.cleanFiles.filter(existsSync).forEach(unlinkSync);
    } catch {}
    this.cleanFiles = [];
  }

  /**
   * Wait for x ms
   * @param ms
   */
  async wait(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}

beforeAll(() => {
  console.log("CLEANING LOGS");
  WebdaTest.cleanLogs();
});
