// test-runtime.ts — TS 5 decorators version
import { useLog } from "@webda/workout";
import { AnyCtor, AnyMethod, createClassDecorator, createMethodDecorator } from "@webda/decorators";

/**
 * Some frameworks pass `this` as context to `describe` and `it`,
 * its type is irrelevant here, but the type here will be used,
 * where the `this` test or suite context was expected to be passed down.
 */
export type FrameworkContext = any;

/** Callback passed to async tests for signalling completion (Node.js-style done). */
export type Done = (err?: any) => void;

/** A test callback that may be synchronous, async, or use the done-callback pattern. */
export type CallbackOptionallyAsync = (this: FrameworkContext, done?: Done) => void | Promise<void>;

/**
 * Test or suite execution.
 * The `undefined` means execute as normal.
 */
export type Execution = "default" | "todo" | "only" | "skip";

/** Common settings shared by both suite and test decorators. */
interface SharedSettings {
  /**
   * "slow" threshold in milliseconds.
   */
  slow?: number;
  /**
   * Timeout in milliseconds.
   */
  timeout?: number;
  /**
   * Number of times to retry a failed test. (Mocha only)
   */
  retries?: number;
  /**
   * Define the execution strategy for the test.
   */
  execution?: Execution;
  /**
   * A name for the suite or test. If not provided the class or method name will be used.
   */
  name?: string;
}

/** Settings accepted by the `@suite` decorator. */
export interface SuiteSettings extends SharedSettings {
  /**
   * Call the beforeEach and afterEach within the test wrapper
   */
  embeddedLifecycleEach?: boolean;
}

/** Settings accepted by the `@test` decorator. */
export interface TestSettings extends SharedSettings {
  /** Pre-created instance to use instead of constructing a fresh one per test. */
  instance?: any;
}

/** Settings accepted by lifecycle decorators (`@beforeAll`, `@beforeEach`, `@afterEach`, `@afterAll`). */
export interface LifecycleSettings {
  timeout?: number;
  slow?: number;
}

/**
 * Return a definition of the test framework
 */
type TestFramework = {
  type: "mocha" | "jest" | "vitest" | "bun";
  executers: Promise<{
    describe: (name: string, callback: () => void) => void;
    test: (name: string, callback: () => void, settings?: any) => void;
    afterAll(callback: () => void, settings?: any): void;
    afterEach(callback: () => void, settings?: any): void;
    beforeAll(callback: () => void, settings?: any): void;
    beforeEach(callback: () => void, settings?: any): void;
    // optional modifiers injected by framework
    ["describe.only"]?: (name: string, cb: () => void) => void;
    ["describe.skip"]?: (name: string, cb: () => void) => void;
    ["describe.todo"]?: (name: string) => void;
    ["test.only"]?: (name: string, cb: () => void, settings?: any) => void;
    ["test.skip"]?: (name: string, cb?: () => void, settings?: any) => void;
    ["test.todo"]?: (name: string) => void;
  }>;
};

/**
 * Detect the test framework in use
 * We support mocha, jest, vitest, bun
 *
 */
/* v8 ignore start */
export function detectFramework(): TestFramework {
  if (process.env.VITEST) {
    return {
      type: "vitest",
      executers: (async () => {
        const api = await import("vitest");
        // Vitest supports .only/.skip/.todo on describe/it
        return {
          describe: api.describe,
          test: api.it,
          afterAll: api.afterAll,
          afterEach: api.afterEach,
          beforeAll: api.beforeAll,
          beforeEach: api.beforeEach,
          ["describe.only"]: api.describe.only,
          ["describe.skip"]: api.describe.skip,
          ["describe.todo"]: api.describe.todo,
          ["test.only"]: api.it.only,
          ["test.skip"]: api.it.skip,
          ["test.todo"]: api.it.todo
        };
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
        beforeEach: global.beforeEach,
        ["describe.only"]: (global as any).describe.only,
        ["describe.skip"]: (global as any).describe.skip,
        ["test.only"]: (global as any).it.only,
        ["test.skip"]: (global as any).it.skip
      })
    };
  } else if (
    (typeof (global as any).before === "function" && typeof (global as any).after === "function") ||
    process.mainModule?.filename.includes("node_modules/mocha") ||
    process.argv.some(a => a.includes("mocha"))
  ) {
    return {
      type: "mocha",
      executers: Promise.resolve({
        describe: global.describe,
        test: global.it,
        afterAll: global.after,
        afterEach: global.afterEach,
        beforeAll: global.before,
        beforeEach: global.beforeEach,
        ["describe.only"]: (global as any).describe.only,
        ["describe.skip"]: (global as any).describe.skip,
        ["test.only"]: (global as any).it.only,
        ["test.skip"]: (global as any).it.skip
      })
    };
  } else if ((process as any).versions?.bun) {
    return {
      type: "bun",
      executers: (async () => {
        // @ts-ignore
        const api = await import("bun:test");
        return {
          describe: api.describe,
          test: api.it,
          afterAll: api.afterAll,
          afterEach: api.afterEach,
          beforeAll: api.beforeAll,
          beforeEach: api.beforeEach,
          ["describe.only"]: api.describe.only,
          ["describe.skip"]: api.describe.skip,
          ["test.only"]: api.it.only,
          ["test.skip"]: api.it.skip,
          ["test.todo"]: api.it.todo
        };
      })().catch(err => {
        console.error("Error loading bun", err);
        throw err;
      })
    };
  } else {
    throw new Error("Unknown test framework");
  }
}
/* v8 ignore stop */

const framework = detectFramework();

// Jest cannot use top-level await reliably with ts-jest + ESM, keep the guard.
let executers: Awaited<TestFramework["executers"]>;
/* v8 ignore start */
if (framework.type !== "jest") {
  // @ts-ignore - top-level await in TS5/ES2022
  executers = await framework.executers;
} else {
  // In Jest, expose executers lazily via beforeAll on globals
  (global as any).beforeAll(async () => {
    executers = await framework.executers;
  });
}
/* v8 ignore stop */

/** ------------ TS5 decorators glue ------------- */

/** Symbol-keyed metadata bag names used to store decorator annotations on class metadata. */
const META = {
  SUITE: "webda:suite",
  TESTS: "webda:tests",
  LIFECYCLE: "webda:lifecycle"
} as const;

/** Metadata stored per test method by the `@test` decorator. */
type TestMeta = {
  kind: "test";
  /** Display name shown in the test reporter. */
  name: string;
  /** Name of the method on the class. */
  fnKey: string;
  settings?: TestSettings;
  mode: Execution;
};

/** The four hook phases supported by every major test framework. */
type LifecycleKind = "beforeAll" | "beforeEach" | "afterEach" | "afterAll";

/** Metadata stored per lifecycle method by the `@beforeAll` / `@afterEach` etc. decorators. */
type LifecycleMeta = {
  kind: "lifecycle";
  phase: LifecycleKind;
  /** Name of the method on the class. */
  fnKey: string;
  settings?: LifecycleSettings;
};

/** Metadata stored per class by the `@suite` decorator. */
type SuiteMeta = {
  /** Display name used in the test reporter. */
  name: string;
  settings?: SuiteSettings;
  mode: Execution;
  /** Name of the method to use as a wrapper around each test (set by `@testWrapper`). */
  wrapper?: string;
  /** Parameter matrix for data-driven suites (set by `@params`). */
  paramMatrix?: Record<string, unknown[]>;
};

// Helpers
/**
 * Return (and lazily initialise) a named bag on the TS5 class-metadata object.
 * @param metadata The `context.metadata` object from a decorator context.
 * @param key The metadata key to read / create.
 * @param fallback Initial value used when the key is absent.
 * @returns The existing or newly created value for `key`.
 */
export function getBag(metadata: Record<string | symbol, any>, key: string, fallback: any) {
  metadata[key] ??= fallback;
  return metadata[key];
}

/**
 * Get the test metadata for a target, including inherited metadata
 * @param target
 * @returns
 */
export function getMetadata(target: AnyCtor): {
  "webda:suite"?: SuiteMeta;
  "webda:tests"?: TestMeta[];
  "webda:lifecycle"?: LifecycleMeta[];
} {
  let prototype = target;
  const results = {
    "webda:suite": undefined,
    "webda:tests": undefined,
    "webda:lifecycle": undefined
  };
  const prototypes = [];
  while (prototype && prototype !== Object.prototype) {
    prototypes.push(prototype);
    prototype = Object.getPrototypeOf(prototype);
  }
  // Ensure configuration from current class overrides parent classes
  prototypes.forEach(p => {
    const meta = (p as any)[Symbol.metadata];
    if (meta && meta[META.TESTS]) {
      results["webda:tests"] ??= [];
      results["webda:tests"] = [
        ...results["webda:tests"],
        /* v8 ignore next 1 -- Array.filter() never returns null/undefined */
        ...(meta[META.TESTS].filter(t => !results["webda:tests"].some((ot: TestMeta) => ot.fnKey === t.fnKey)) ?? [])
      ];
    }
    if (meta && meta[META.LIFECYCLE]) {
      results["webda:lifecycle"] ??= [];
      results["webda:lifecycle"] = [
        ...results["webda:lifecycle"],
        /* v8 ignore next 3 -- Array.filter() never returns null/undefined */
        ...(meta[META.LIFECYCLE].filter(
          l => !results["webda:lifecycle"].some((ol: LifecycleMeta) => ol.fnKey === l.fnKey)
        ) ?? [])
      ];
    }
  });
  // Ensure configuration from current class overrides parent classes
  // so reverse the prototypes order
  prototypes.reverse().forEach(p => {
    const meta = (p as any)[Symbol.metadata];
    if (meta && meta[META.SUITE]) {
      results["webda:suite"] ??= meta[META.SUITE];
      results["webda:suite"] = { ...results["webda:suite"], ...meta[META.SUITE] };
    }
  });
  return results;
}

/** ----------- public decorators ------------- */

/**
 * Class decorator that registers a test suite with the active test framework.
 *
 * @example
 * ```ts
 * @suite("My tests")
 * class MyTests { ... }
 *
 * @suite.only("Focused tests")
 * class FocusedTests { ... }
 * ```
 */
export const suite: ReturnType<typeof createClassDecorator> & {
  only: ClassDecorator;
  skip: ClassDecorator;
  todo: ClassDecorator;
} = createClassDecorator(
  (
    value: AnyCtor<unknown>,
    context: ClassDecoratorContext,
    name?: string,
    settings?: SuiteSettings & { execution?: Execution }
  ) => {
    const bag = getBag(context.metadata, META.SUITE, {} as SuiteMeta);
    /* v8 ignore next 1 -- "Suite" fallback: unreachable for named classes */
    bag.name = name ?? (value as any).name ?? "Suite";
    bag.settings = settings;
    bag.mode = (settings?.execution as Execution) ?? "default"; // Register with the runner once the class finishes definition
    context.addInitializer(() => {
      const suiteMeta: SuiteMeta = context.metadata[META.SUITE] as any;

      // Build parameter combinations from @params matrix
      const matrix = suiteMeta.paramMatrix;
      let combos: Record<string, unknown>[] = [{}];
      if (matrix) {
        const keys = Object.keys(matrix);
        combos = keys.reduce(
          (acc, key) => {
            const vals = matrix[key];
            if (vals.length === 0) return acc; // skip empty arrays — keep existing combos
            return acc.flatMap(row => vals.map(val => ({ ...row, [key]: val })));
          },
          [{}] as Record<string, unknown>[]
        );
        /* v8 ignore next 1 -- reduce starts from [{}], so length can never reach 0 */
        if (combos.length === 0) combos = [{}]; // safety net: all keys were empty arrays
      }

      for (const combo of combos) {
        const hasParams = Object.keys(combo).length > 0;
        const suiteName = hasParams
          ? `${bag.name} [${Object.entries(combo)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")}]`
          : bag.name;

        let describe = executers.describe;
        if (suiteMeta.settings?.execution === "only") {
          /* v8 ignore next 1 -- fallback for frameworks that lack describe.only */
          describe = executers["describe.only"] ?? executers.describe;
        } else if (suiteMeta.settings?.execution === "skip") {
          /* v8 ignore next 1 -- fallback for frameworks that lack describe.skip */
          describe = executers["describe.skip"] ?? executers.describe;
        } else if (suiteMeta.settings?.execution === "todo") {
          describe = executers["describe.todo"]!;
          /* v8 ignore next 4 -- all framework have todo */
          if (!describe) {
            useLog("INFO", "Skipping suite (no .todo support)", suiteName);
            continue;
          }
        }

        describe(suiteName, async () => {
          const instance = new (value as any)();
          if (hasParams) Object.assign(instance, combo);
          const lifecycles: LifecycleMeta[] = getBag(context.metadata, META.LIFECYCLE, [] as LifecycleMeta[]);
          const wrapper = suiteMeta.wrapper
            ? instance[suiteMeta.wrapper]?.bind(instance)
            : (_type: string, cb: Function) => cb();
          // Register lifecycle beforeAll and afterAll
          lifecycles
            .filter(l => ["beforeAll", "afterAll"].includes(l.phase) && l.fnKey !== l.phase)
            .forEach(l => {
              executers[l.phase](() => wrapper(l.phase, instance[l.fnKey].bind(instance)));
            });
          // Also register beforeAll and afterAll methods if any
          ["beforeAll", "afterAll"]
            .filter(phase => instance[phase])
            .forEach(phase => {
              executers[phase](() => wrapper(phase, instance[phase].bind(instance)));
            });
          const tests: TestMeta[] = getBag(context.metadata, META.TESTS, [] as TestMeta[]);
          tests.forEach(t => {
            if (t.settings?.retries !== undefined && framework.type !== "mocha") {
              useLog("WARN", `@retries is Mocha-only, ignored for ${framework.type} (test: ${t.name})`);
            }
            let exec = executers.test;
            if (t.mode === "todo" || t.mode === "skip") {
              exec = executers["test." + t.mode];
              /* v8 ignore next 4 -- all framework have todo and skip */
              if (!exec) {
                useLog("INFO", `Skipping test (no .${t.settings?.execution ?? t.mode} support)`, t.name);
                return;
              }
            }
            if (t.mode === "only") {
              exec = executers["test.only"];
              /* v8 ignore next 3 -- all framework have only */
              if (!exec) {
                exec = executers.test;
              }
            }
            /**
             * Create a test executor that will call the beforeEach, the test and the afterEach
             */
            const testExecutor = async () => {
              await instance["beforeEach"]?.(t.fnKey); // beforeEach methods are automatically called
              await Promise.all(
                lifecycles
                  .filter(l => l.phase === "beforeEach" && l.fnKey !== l.phase)
                  .map(l => instance[l.fnKey]?.(t.fnKey))
              );
              let testError: unknown = undefined;
              try {
                await instance[t.fnKey]();
              } catch (err) {
                testError = err;
              }
              try {
                await Promise.all(
                  lifecycles
                    .filter(l => l.phase === "afterEach" && l.fnKey !== l.phase)
                    .map(l => instance[l.fnKey]?.(t.fnKey))
                );
                await instance["afterEach"]?.(t.fnKey); // afterEach methods are automatically called
              } catch (afterErr) {
                if (testError) {
                  useLog("WARN", `afterEach threw after test failure: ${(afterErr as Error).message}`);
                } else {
                  testError = afterErr;
                }
              }
              // If the test failed keep the failure
              if (testError) {
                throw testError;
              }
            };
            // Wrap the test executor; pass timeout as 3rd arg for non-Mocha frameworks
            /* v8 ignore next 1 -- Mocha uses a different timeout API; not exercised in Vitest/Jest/Bun */
            const testTimeout = framework.type !== "mocha" ? t.settings?.timeout : undefined;
            exec(t.name, async () => wrapper("test", testExecutor, instance), testTimeout);
          });
        });
      }
    });
  }
) as any;

type MethodDecorator = (value: AnyMethod, context: ClassMethodDecoratorContext) => AnyMethod | void;

/**
 * Method decorator that registers a class method as an individual test case.
 *
 * @example
 * ```ts
 * @test("adds two numbers")
 * async testAdd() { ... }
 *
 * @test.only
 * async focusedTest() { ... }
 * ```
 */
export const test: ReturnType<typeof createMethodDecorator> & {
  only: MethodDecorator;
  skip: MethodDecorator;
  todo: MethodDecorator;
} = createMethodDecorator((value: AnyMethod, context: ClassMethodDecoratorContext, settings?: TestSettings) => {
  /* v8 ignore next 1 -- String(context.name) fallback: unreachable for named class methods */
  const testName = settings?.name || value.name || String(context.name);
  const tests: TestMeta[] = getBag(context.metadata, META.TESTS, [] as TestMeta[]);
  const entry: TestMeta = tests.find(t => t.fnKey === String(context.name)) || {
    kind: "test",
    name: testName,
    fnKey: String(context.name),
    settings: {},
    mode: (settings as any)?.execution ?? "default"
  };
  entry.name = testName;
  Object.keys(settings ?? {}).forEach(k => {
    if (entry.settings[k]) {
      useLog("WARN", `Overriding test setting ${k} for ${entry.name}`);
    }
  });
  entry.settings = { ...entry.settings, ...settings }; // merge settings
  if (!tests.includes(entry)) {
    tests.push(entry);
  }
  return value;
}) as any;

// lifecycle: @beforeAll(), @beforeEach(), @afterEach(), @afterAll()
/**
 * Factory that produces a lifecycle method decorator for the given phase.
 * @param phase One of `"beforeAll"`, `"beforeEach"`, `"afterEach"`, `"afterAll"`.
 * @returns A method decorator that registers the decorated method for `phase`.
 */
function createLifecycleDecorator(phase: LifecycleKind) {
  return createMethodDecorator(
    (value: Function, context: ClassMethodDecoratorContext, settings?: LifecycleSettings) => {
      const lifecycles: LifecycleMeta[] = getBag(context.metadata, META.LIFECYCLE, [] as LifecycleMeta[]);
      lifecycles.push({ kind: "lifecycle", phase, fnKey: String(context.name), settings });
    }
  );
}

/** Registers the decorated method to run once before all tests in the suite. */
export const beforeAll = createLifecycleDecorator("beforeAll");
/** Registers the decorated method to run before each test in the suite. */
export const beforeEach = createLifecycleDecorator("beforeEach");
/** Registers the decorated method to run after each test in the suite. */
export const afterEach = createLifecycleDecorator("afterEach");
/** Registers the decorated method to run once after all tests in the suite. */
export const afterAll = createLifecycleDecorator("afterAll");

/**
 * Wrap a test method
 * @param value The test method to wrap
 * @param context The context in which the test method is defined
 * @returns A wrapped test method
 */
export function testWrapper(
  value: (lifecycle: "beforeAll" | "afterAll" | "test", cb: Function) => Promise<void>,
  context: ClassMethodDecoratorContext
) {
  const suite: SuiteMeta = getBag(context.metadata, META.SUITE, {} as SuiteMeta);
  /* v8 ignore next 1 -- value.name is always set for named class methods */
  suite.wrapper = value.name || String(context.name);
}

// Modifiers: only/skip/pending and helpers: timeout/retries/slow/params
/**
 * Returns a method decorator that applies `mutator` to the `TestMeta` entry for the
 * decorated method, creating a stub entry first if `@test` has not yet been applied.
 * @param mutator Function that modifies the `TestMeta` in place.
 */
function mutateTestMeta(mutator: (m: TestMeta) => void) {
  return (_: any, context: ClassMethodDecoratorContext) => {
    // Decorators run top-down; we adjust the last matching test meta for this method
    const tests: TestMeta[] = getBag(context.metadata, META.TESTS, [] as TestMeta[]);
    const idx = [...tests].reverse().findIndex(m => m.fnKey === String(context.name));
    if (idx === -1) {
      // If used before @test, create a stub then mutate it; @test will fill in defaults later.
      const stub: TestMeta = {
        kind: "test",
        name: String(context.name),
        fnKey: String(context.name),
        mode: "default"
      };
      tests.push(stub);
      mutator(stub);
    } else {
      const realIndex = tests.length - 1 - idx;
      mutator(tests[realIndex]);
    }
  };
}

/** Marks the decorated test as the only test to run in the suite (exclusive execution). */
export function only(_: any, context: ClassMethodDecoratorContext) {
  return mutateTestMeta(m => (m.mode = "only"))(_, context);
}
test.only = only;
/** Marks the decorated test so it is skipped during the test run. */
export function skip(_: any, context: ClassMethodDecoratorContext) {
  return mutateTestMeta(m => (m.mode = "skip"))(_, context);
}
test.skip = test({ execution: "skip" });
(suite as any).only = suite(undefined, { execution: "only" });
(suite as any).skip = suite(undefined, { execution: "skip" });
(suite as any).todo = suite(undefined, { execution: "todo" });
/** Marks the decorated test as a pending TODO — reported but not executed. */
export function todo(_: any, context: ClassMethodDecoratorContext) {
  return mutateTestMeta(m => (m.mode = "todo"))(_, context);
}
test.todo = test({ execution: "todo" });
/**
 * Sets the timeout for the decorated test.
 * @param ms Timeout in milliseconds.
 */
export function timeout(ms: number) {
  return mutateTestMeta(m => {
    m.settings = { ...(m.settings ?? {}), timeout: ms } as TestSettings;
  });
}
/**
 * Sets the number of retry attempts for the decorated test (Mocha only).
 * @param n Number of retries.
 */
export function retries(n: number) {
  return mutateTestMeta(m => {
    m.settings = { ...(m.settings ?? {}), retries: n } as TestSettings;
  });
}
/**
 * Sets the "slow" threshold for the decorated test.
 * @param ms Threshold in milliseconds; tests exceeding this are highlighted as slow.
 */
export function slow(ms: number) {
  return mutateTestMeta(m => {
    m.settings = { ...(m.settings ?? {}), slow: ms } as TestSettings;
  });
}

/**
 * Not yet used here but could generate multiple suites with different params
 * @param matrix
 * @returns
 */
export function params(matrix: Record<string, unknown[]>) {
  return (value: Function, context: ClassDecoratorContext) => {
    const bag = getBag(context.metadata, META.SUITE, {} as SuiteMeta);
    bag.paramMatrix = matrix;
  };
}
