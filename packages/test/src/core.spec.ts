import { AsyncLocalStorage } from "async_hooks";
import { test, suite, WebdaTest } from "./core";
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
class WebdaTesterTest extends WebdaTest {
  static globalState: string;
  localState: any;
  static wrap = async (type, callback, instance) => {
    if (type === "beforeAll") {
      WebdaTesterTest.globalState = '{"count": 0}';
    }
    console.log(
      "Wrap",
      type,
      type.startsWith("before") || type === "afterAll" ? JSON.parse(WebdaTesterTest.globalState) : instance.localState
    );
    await asyncStorage.run(
      type.startsWith("before") || type === "afterAll" ? JSON.parse(WebdaTesterTest.globalState) : instance.localState,
      async () => {
        await callback();
        if (instance) {
          instance.localState = asyncStorage.getStore();
        } else if (type === "beforeAll") {
          WebdaTesterTest.globalState = JSON.stringify(asyncStorage.getStore());
        }
      }
    );
  };

  async beforeEach() {
    await super.beforeEach();
    useInstanceStorage()!.count++;
    assert.strictEqual(useInstanceStorage()!.count, 2);
  }

  /**
   * Execute before all tests
   */
  static async beforeAll() {
    await super.beforeAll();
    useInstanceStorage()!.count++;
    assert.strictEqual(useInstanceStorage()!.count, 1);
  }

  async afterEach() {
    await super.afterEach();
    useInstanceStorage()!.count++;
    assert.strictEqual(useInstanceStorage()!.count, 4);
  }

  static async afterAll() {
    await super.afterAll();
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
@suite.skip
class WebdaSkip {
  @test.skip
  test() {
    assert.ok(false);
  }

  @test.pending
  todo() {}
}

@suite.pending
class WebdaTodo {}
