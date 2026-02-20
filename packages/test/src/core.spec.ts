import { AsyncLocalStorage } from "async_hooks";
import {
  test,
  suite,
  beforeEach,
  beforeAll,
  afterAll,
  afterEach,
  testWrapper,
  skip,
  retries,
  timeout,
  params,
  slow,
  todo,
  only,
  getMetadata
} from ".";
import * as assert from "assert";

const asyncStorage = new AsyncLocalStorage<{ count: number }>();
const useInstanceStorage = () => asyncStorage.getStore();

/**
 * This class ensure that the InstanceStorage is correctly reset between tests
 *
 * The initialization from static should be restored between tests and the beforeEach/afterEach should be called *
 *
 * We use a counter to ensure it behave the way we want
 */
class WebdaTesterTest {
  defaultState: any = { count: 0 };
  beforeAllState: string = JSON.stringify(this.defaultState);

  @testWrapper
  async wrap(type: "beforeAll" | "afterAll" | "test", callback: Function) {
    let state = this.defaultState;
    if (type === "test") {
      // Duplicate the state for the test
      state = JSON.parse(this.beforeAllState);
    }
    await asyncStorage.run(state, async () => {
      await callback();
      if (type === "beforeAll") {
        // Save the state for the test
        this.defaultState = asyncStorage.getStore()!;
        this.beforeAllState = JSON.stringify(this.defaultState);
      }
    });
  }

  @beforeEach
  async beforeEach() {
    useInstanceStorage()!.count++;
    assert.strictEqual(useInstanceStorage()!.count, 2);
  }

  /**
   * Execute before all tests
   */
  @beforeAll
  async beforeAll() {
    useInstanceStorage()!.count++;
    assert.strictEqual(useInstanceStorage()!.count, 1);
  }

  @afterEach
  async afterEach() {
    useInstanceStorage()!.count++;
    assert.strictEqual(useInstanceStorage()!.count, 4);
  }

  @afterAll
  async afterAll() {
    assert.strictEqual(useInstanceStorage()!.count, 1);
  }
}

@suite
class WebdaTestTest extends WebdaTesterTest {
  @test
  async test(...args) {
    useInstanceStorage()!.count++;
    assert.strictEqual(useInstanceStorage()!.count, 3);
  }

  @test
  test2() {
    useInstanceStorage()!.count++;
    assert.strictEqual(useInstanceStorage()!.count, 3);
  }
}

@suite
class WebdaTestTest2 extends WebdaTesterTest {
  @test
  async test(...args) {
    useInstanceStorage()!.count++;
    assert.strictEqual(useInstanceStorage()!.count, 3);
  }
}

// Test skip
@suite
class WebdaSkip {
  @test.skip
  test() {
    assert.ok(false);
  }

  @test.todo
  todo() {}
}

@suite
@params({ value: [] })
class Other {
  @test({
    retries: 3
  })
  @only
  @retries(2)
  @timeout(5000)
  @slow(2000)
  test() {
    const metadata = getMetadata(Other);
    const tests = metadata["webda:tests"] || [];
    assert.strictEqual(tests.length, 3);
    assert.strictEqual(tests[0].name, "test");
    assert.strictEqual(tests[0].settings?.retries, 3);
    assert.strictEqual(tests[0].settings?.timeout, 5000);
    assert.strictEqual(tests[0].settings?.slow, 2000);
    assert.strictEqual(tests[0].mode, "only");
    assert.strictEqual(tests[1].mode, "todo");
    assert.strictEqual(tests[2].mode, "skip");
  }

  @todo
  test2() {}

  @skip
  test3() {}
}

@suite("todo", {
  execution: "todo"
})
class TodoSuite {}

// Exercises @params: generates one describe block per parameter combination
const paramTestValues: number[] = [];

@suite
@params({ x: [1, 2] })
class ParamsTest {
  x!: number;

  @test
  async testParam() {
    assert.ok(this.x === 1 || this.x === 2, `x should be 1 or 2, got ${this.x}`);
    paramTestValues.push(this.x);
  }
}

// Exercises line 374: suite.skip — describe.skip branch in the suite initializer
@suite.skip
class SuiteSkipTest {
  @test
  neverRuns() {
    assert.ok(false, "suite.skip should prevent this from running");
  }
}

// Exercises line 372: suite.only — describe.only branch in the suite initializer
// Also exercises:
//   instance["beforeEach"]?.() call-branch (line 428) via the beforeEach() method
//   lifecycles filter callback (lines 430-431) via the @beforeAll lifecycle
//   instance["afterEach"]?.() call-branch (line 446) via the afterEach() method
@suite.only
class SuiteOnlyTest {
  // Plain methods — hit the instance["beforeEach"]?.() and instance["afterEach"]?.() call-branches
  beforeEach() {}
  afterEach() {}

  // Lifecycle decorators — make `lifecycles` non-empty so filter callbacks run.
  // @beforeEach with a non-"beforeEach" name causes l.fnKey !== l.phase to be evaluated (line 433).
  @beforeAll
  setup() {}

  @beforeEach
  preEach() {}

  @test
  async onlyRuns() {
    assert.ok(true);
  }
}

// Exercises line 451: test body passes but @afterEach throws — afterEach error is surfaced
@suite
class AfterEachSurfacesErrorTest {
  @testWrapper
  async wrap(type: string, cb: Function) {
    if (type === "test") {
      try {
        await cb();
        assert.ok(false, "Expected afterEach error to propagate");
      } catch (err: any) {
        assert.strictEqual(err.message, "afterEach error");
      }
    } else {
      await cb();
    }
  }

  @afterEach
  async myAfterEach() {
    throw new Error("afterEach error");
  }

  @test
  @only
  async testPassesAfterEachFails() {
    // Test body passes; @afterEach throws → line 451: testError = afterErr
    assert.ok(true);
  }
}

// Exercises lines 448-449: both test AND @afterEach throw — WARN logged, original error kept
@suite
class AfterEachAndTestBothFailTest {
  @testWrapper
  async wrap(type: string, cb: Function) {
    if (type === "test") {
      try {
        await cb();
        assert.ok(false, "Expected test error to propagate");
      } catch (err: any) {
        // Original test error is preserved; afterEach error only produces a WARN
        assert.strictEqual(err.message, "test error");
      }
    } else {
      await cb();
    }
  }

  @afterEach
  async myAfterEach() {
    throw new Error("afterEach also fails");
  }

  @test
  @only
  async testAndAfterEachBothFail() {
    throw new Error("test error"); // afterEach also throws → lines 448-449 hit
  }
}

// Branch coverage for decorator internals (all branches hit at class-definition time, not test-run time):
//   @test({ name }) → exercises settings?.name truthy branch (line 491)
//   @timeout as first decorator → m.settings is undefined → ?? {} branch (line 604)
//   @retries as first decorator → m.settings is undefined → ?? {} branch (line 613)
@suite
class BranchCoverageTest {
  @test({ name: "custom name" }) // settings?.name is set → line 491 branch
  customNamedTest() {}

  @test
  @timeout(100) // @timeout runs first (bottom-up) → m.settings undefined → line 604: ?? {}
  timeoutFirstDecorator() {}

  @test
  @retries(1) // @retries runs first (bottom-up) → m.settings undefined → line 613: ?? {}
  retriesFirstDecorator() {}
}

// Covers line 327: @beforeAll/@afterAll on a method whose name differs from the phase
@suite
class NamedLifecycleTest {
  setupRan = false;

  @beforeAll
  async setup() {
    // fnKey="setup" !== phase="beforeAll" → exercises line 327
    this.setupRan = true;
  }

  @test
  @only
  async testSetupRan() {
    assert.ok(this.setupRan, "setup() should have been called via line 327");
  }
}

// Covers lines 367-368 and 378-379: test error captured, afterEach still runs, then re-thrown
@suite
class TestErrorHandlingTest {
  @testWrapper
  async wrap(type: string, callback: Function) {
    if (type === "test") {
      try {
        await callback();
      } catch (err: any) {
        // Swallow the expected failure so Vitest doesn't see it as a test failure
        assert.strictEqual(err.message, "intentional failure");
      }
    } else {
      await callback();
    }
  }

  @test
  @only
  async intentionalFailure() {
    // Lines 367-368: error is caught inside testExecutor
    // Lines 378-379: error is re-thrown after afterEach, caught by wrap above
    throw new Error("intentional failure");
  }
}
