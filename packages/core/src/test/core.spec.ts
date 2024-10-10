import { useInstanceStorage } from "../core/instancestorage";
import { test, suite } from "./core";
import * as assert from "assert";
import { WebdaTest } from "./test";
import { sleep } from "../utils/waiter";

/**
 * This class ensure that the InstanceStorage is correctly reset between tests
 *
 * The initialization from static should be restored between tests and the beforeEach/afterEach should be called *
 *
 * We use a counter to ensure it behave the way we want
 */
class WebdaTesterTest extends WebdaTest {
  async beforeEach() {
    await super.beforeEach();
    useInstanceStorage().caches!.count++;
    assert.strictEqual(useInstanceStorage().caches?.count, 2);
  }

  /**
   * Execute before all tests
   */
  static async beforeAll() {
    await super.beforeAll();
    useInstanceStorage().caches!.count ??= 1;
  }

  async afterEach() {
    await super.afterEach();
    useInstanceStorage().caches!.count++;
    assert.strictEqual(useInstanceStorage().caches?.count, 4);
  }

  static async afterAll() {
    await super.afterAll();
    assert.strictEqual(useInstanceStorage().caches?.count, 1);
  }
}

@suite
class WebdaTestTest extends WebdaTesterTest {
  @test
  async test(...args) {
    useInstanceStorage().caches!.count++;
    assert.strictEqual(useInstanceStorage().caches?.count, 3);
  }

  @test
  test2() {
    useInstanceStorage().caches!.count++;
    assert.strictEqual(useInstanceStorage().caches?.count, 3);
  }
}

@suite
class WebdaTestTest2 extends WebdaTesterTest {
  @test
  async test(...args) {
    useInstanceStorage().caches!.count++;
    assert.strictEqual(useInstanceStorage().caches?.count, 3);
  }
}
