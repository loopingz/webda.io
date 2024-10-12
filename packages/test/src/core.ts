import { ConsoleLogger, MemoryLogger, useWorkerOutput, useLog } from "@webda/workout";
import {
  TestRunner,
  ClassTestUI,
  CallbackOptionallyAsync,
  LifecycleSettings,
  SuiteCallback,
  SuiteSettings,
  TestSettings
} from "./abstract";
import { mkdirSync, existsSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Replace name by a sanitized version
 * @param name
 * @returns
 */
function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Return a definition of the test framework
 */
type TestFramework = {
  type: "mocha" | "jest" | "vitest" | "bun";
  executers: Promise<{
    describe: (name: string, callback: () => void) => void;
    test: (name: string, callback: () => void, settings: any) => void;
    afterAll(callback: () => void, settings: any): void;
    afterEach(callback: () => void, settings: any): void;
    beforeAll(callback: () => void, settings: any): void;
    beforeEach(callback: () => void, settings: any): void;
  }>;
};

/**
 * Detect the test framework
 */
export function detectFramework(): TestFramework {
  if (process.env.VITEST) {
    return {
      type: "vitest",
      executers: (async () => {
        const { describe, it, afterAll, afterEach, beforeAll, beforeEach } = await import("vitest");
        return { describe, test: it, afterAll, afterEach, beforeAll, beforeEach };
      })().catch(err => {
        console.error("Error loading vitest", err);
        throw err;
      })
    };
  } else if (process.env.JEST_WORKER_ID) {
    return {
      type: "jest",
      executers: Promise.resolve({
        describe: global.describe,
        test: global.it,
        afterAll: (global as any).afterAll,
        afterEach: global.afterEach,
        beforeAll: (global as any).beforeAll,
        beforeEach: global.beforeEach
      })
    };
  } else if (process.mainModule?.filename.includes("node_modules/mocha")) {
    return {
      type: "mocha",
      executers: Promise.resolve({
        describe: global.describe,
        test: global.it,
        afterAll: global.after,
        afterEach: global.afterEach,
        beforeAll: global.before,
        beforeEach: global.beforeEach
      })
    };
  } else if (process.versions.bun) {
    return {
      type: "bun",
      executers: (async () => {
        // @ts-ignore
        const { describe, it, afterAll, afterEach, beforeAll, beforeEach } = await import("bun:test");
        return { describe, test: it, afterAll, afterEach, beforeAll, beforeEach };
      })().catch(err => {
        console.error("Error loading bun", err);
        throw err;
      })
    };
  } else {
    throw new Error("Unknown test framework");
  }
}

const framework = detectFramework();

let executers;

if (framework.type !== "jest") {
  //@ts-ignore
  executers = await framework.executers;
  // Jest does not support the global await
  // https://github.com/kulshekhar/ts-jest/blob/main/e2e/esm-features/__tests__/esm-features.spec.ts
} else {
  // If jest add the executers to the global
  (global as any).beforeAll(() => framework.executers);
}

class WebdaRunner implements TestRunner {
  constructor(protected framework: TestFramework) {}
  suite(name: string, callback: SuiteCallback, settings?: SuiteSettings): void {
    const { describe } = executers;
    switch (settings && settings.execution) {
      case "only":
        // @ts-ignore
        describe.only(name, callback);
        break;
      case "pending":
        if (["vitest"].includes(framework.type)) {
          // @ts-ignore
          describe.todo(name);
          break;
        }
      case "skip":
        // @ts-ignore
        describe.skip(name, callback);
        break;

      default:
        describe(name, callback);
    }
  }

  test(name: string, callback: CallbackOptionallyAsync, settings?: TestSettings): void {
    const { test } = executers;
    switch (settings && settings.execution) {
      case "only":
        // @ts-ignore
        test.only(name, callback, settings && settings.timeout);
        break;
      case "pending":
        if (["vitest"].includes(framework.type)) {
          // @ts-ignore
          test.todo(name);
          break;
        }
      case "skip":
        // @ts-ignore
        test.skip(name, callback, settings);
        break;
      default:
        test(name, callback, settings);
    }
  }
  beforeAll(callback: CallbackOptionallyAsync, settings?: LifecycleSettings): void {
    const { beforeAll } = executers;
    beforeAll(callback, settings);
  }
  beforeEach(callback: CallbackOptionallyAsync, settings?: LifecycleSettings): void {
    const { beforeEach } = executers;
    beforeEach(callback, settings);
  }
  afterEach(callback: CallbackOptionallyAsync, settings?: LifecycleSettings & any): void {
    const { afterEach } = executers;
    afterEach(callback, settings);
  }
  afterAll(callback: CallbackOptionallyAsync, settings?: LifecycleSettings): void {
    const { afterAll } = executers;
    afterAll(callback, settings);
  }
}
class WebdaTestUI extends ClassTestUI {
  public constructor(runner: TestRunner) {
    super(runner);
  }
}

const webdaDecorators = new WebdaTestUI(new WebdaRunner(framework));
export const { suite, test, slow, timeout, retries, pending, only, skip, params } = webdaDecorators;

/**
 * Define a test suite
 */
export class WebdaTest {
  cleanFiles: string[] = [];

  /**
   * Wrap a callback if needed
   *
   * The default behavior is to call the callback without wrapping it
   * @param type
   * @param callback
   * @returns
   */
  static wrap = (
    type: "beforeEach" | "beforeAll" | "test" | "afterEach" | "afterAll",
    callback: CallbackOptionallyAsync,
    instance?: WebdaTest
  ) => {
    return callback();
  };

  wrap(type: "beforeEach" | "beforeAll" | "test" | "afterEach" | "afterAll", callback: CallbackOptionallyAsync) {
    // @ts-ignore
    return this.constructor.wrap(type, callback, this);
  }

  /**
   * Execute before each test
   */
  async beforeEach() {}

  /**
   * Execute before all tests
   */
  static async beforeAll() {}

  /**
   * Execute after each test
   */
  async afterEach() {}

  /**
   * Execute after all tests
   */
  static async afterAll() {}

  /**
   * Run the test with the instance storage
   * @param callback
   * @returns
   */
  protected async testWrapper(callback: CallbackOptionallyAsync) {
    let exportLog = process.env.WEBDA_TEST_LOGS !== undefined;
    const memoryLogger = new MemoryLogger(useWorkerOutput(), "TRACE");
    const start = Date.now();
    try {
      await this.wrap("test", callback.bind(this));
    } catch (err) {
      exportLog = true;
      useLog("ERROR", err);
      throw err;
    } finally {
      if (exportLog) {
        WebdaTest.exportMemoryLogger(this, callback.name, memoryLogger, start);
      }
      memoryLogger.close();
    }
  }

  /**
   * Get log file for the test
   *
   * @param object
   * @param method
   * @param clean
   * @returns
   */
  static exportMemoryLogger(object, method: string, memory: MemoryLogger, start: number): string {
    let duration: number | string = Date.now() - start;
    if (duration > 1000) {
      duration = Math.round(duration / 10) / 100 + "s";
    } else {
      duration = duration + "ms";
    }
    const file = `.webda/tests/${sanitizeFilename(object["__webda_suite_name"])}/${method}.log`;
    mkdirSync(dirname(file), { recursive: true });
    if (existsSync(file)) {
      unlinkSync(file);
    }
    writeFileSync(
      file,
      [
        `Test ${object["__webda_suite_name"]}.${method} took ${duration}`,
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
   */
  static cleanLogs() {
    const folder = `.webda/tests/${sanitizeFilename(this["__webda_suite_name"])}`;
    if (!existsSync(folder)) {
      return;
    }
    rmSync(folder, { recursive: true });
  }

  /**
   * INTERNAL: Called by the test framework before each tests
   * Do not delete
   *
   * @ignore
   */
  private async before(...args) {
    let exportLog = process.env.WEBDA_TEST_LOGS !== undefined;
    const memoryLogger = new MemoryLogger(useWorkerOutput(), "TRACE");
    const start = Date.now();
    try {
      await this.wrap("beforeEach", this.beforeEach);
    } catch (err) {
      exportLog = true;
      useLog("ERROR", err);
      throw err;
    } finally {
      if (exportLog) {
        WebdaTest.exportMemoryLogger(this, "beforeEach", memoryLogger, start);
      }
      memoryLogger.close();
    }
  }

  /**
   * INTERNAL: Called by the test framework before all tests
   * Do not delete
   *
   * @ignore
   */
  private static async before<T extends WebdaTest>(this) {
    this.cleanLogs();

    const memoryLogger = new MemoryLogger(useWorkerOutput(), "TRACE");
    const start = Date.now();
    let exportLog = process.env.WEBDA_TEST_LOGS !== undefined;
    try {
      await this.wrap("beforeAll", this.beforeAll);
    } catch (err) {
      exportLog = true;
      useLog("ERROR", err);
      throw err;
    } finally {
      if (exportLog) {
        this.exportMemoryLogger(this, "beforeAll", memoryLogger, start);
      }
      memoryLogger.close();
    }
  }

  /**
   * INTERNAL: Called by the test framework after each tests
   * Do not delete
   *
   * @ignore
   */
  private async after() {
    const memoryLogger = new MemoryLogger(useWorkerOutput(), "TRACE");
    let exportLog = process.env.WEBDA_TEST_LOGS !== undefined;
    const start = Date.now();
    try {
      await this.wrap("afterEach", this.afterEach);
    } catch (err) {
      exportLog = true;
      useLog("ERROR", err);
      throw err;
    } finally {
      if (exportLog) {
        WebdaTest.exportMemoryLogger(this, "afterEach", memoryLogger, start);
      }
      memoryLogger.close();
    }
    try {
      this.cleanFiles.filter(existsSync).forEach(unlinkSync);
    } catch (err) {
      // Swallow the error
    }
    this.cleanFiles = [];
  }

  /**
   * INTERNAL: Called by the test framework after all tests
   * Do not delete
   *
   * @ignore
   */
  private static async after() {
    const memoryLogger = new MemoryLogger(useWorkerOutput(), "TRACE");
    let exportLog = process.env.WEBDA_TEST_LOGS !== undefined;
    const start = Date.now();
    try {
      await this.wrap("afterAll", this.afterAll);
    } catch (err) {
      exportLog = true;
      useLog("ERROR", err);
      throw err;
    } finally {
      if (exportLog) {
        this.exportMemoryLogger(this, "afterAll", memoryLogger, start);
      }
    }
    memoryLogger.close();
  }
}
