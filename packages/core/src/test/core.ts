import {
  TestRunner,
  ClassTestUI,
  CallbackOptionallyAsync,
  LifecycleSettings,
  SuiteCallback,
  SuiteSettings,
  TestSettings
} from "./abstract";

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
        afterAll: global.afterAll,
        afterEach: global.afterEach,
        beforeAll: global.beforeAll,
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

class WebdaRunner implements TestRunner {
  constructor(protected framework: TestFramework) {}
  suite(name: string, callback: SuiteCallback, settings?: SuiteSettings): void {
    this.framework.executers.then(({ describe }) => {
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
    });
  }

  test(name: string, callback: CallbackOptionallyAsync, settings?: TestSettings): void {
    this.framework.executers.then(({ test }) => {
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
    });
  }
  beforeAll(callback: CallbackOptionallyAsync, settings?: LifecycleSettings): void {
    this.framework.executers.then(({ beforeAll }) => {
      beforeAll(callback, settings);
    });
  }
  beforeEach(callback: CallbackOptionallyAsync, settings?: LifecycleSettings): void {
    this.framework.executers.then(({ beforeEach }) => {
      beforeEach(callback, settings);
    });
  }
  afterEach(callback: CallbackOptionallyAsync, settings?: LifecycleSettings & any): void {
    this.framework.executers.then(({ afterEach }) => {
      afterEach(callback, settings);
    });
  }
  afterAll(callback: CallbackOptionallyAsync, settings?: LifecycleSettings): void {
    this.framework.executers.then(({ afterAll }) => {
      afterAll(callback, settings);
    });
  }
}
class WebdaTestUI extends ClassTestUI {
  public constructor(runner: TestRunner) {
    super(runner);
  }
}

if (framework.type === "vitest") {
  //@ts-ignore
  await framework.executers;
  // Jest does not support the global await
  // https://github.com/kulshekhar/ts-jest/blob/main/e2e/esm-features/__tests__/esm-features.spec.ts
}

const webdaDecorators = new WebdaTestUI(new WebdaRunner(framework));
export const { suite, test, slow, timeout, retries, pending, only, skip, params } = webdaDecorators;
