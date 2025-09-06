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
