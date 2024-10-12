import { suite, test, WebdaTest } from "@webda/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { ConsoleLogger, Logger, MemoryLogger, WorkerLogger } from "@webda/workout";
import {
  CancelableLoopPromise,
  CancelablePromise,
  nextTick,
  WaitDelayerFactories,
  WaitExponentialDelay,
  WaitFor,
  WaitLinearDelay
} from "./waiter";

@suite
class WaiterTest extends WebdaTest {
  @test
  async cancellablePromise() {
    let promise = new CancelablePromise();
    await promise.cancel();
    await assert.rejects(() => promise, /Cancelled/);
    let callback = false;
    promise = new CancelablePromise(
      () => {},
      async () => {
        callback = true;
      }
    );
    await promise.cancel();
    await assert.rejects(() => promise, /Cancelled/);
    assert.strictEqual(callback, true);
  }

  @test
  async testWaitFor() {
    const logger: Logger = {
      log: () => {},
      logProgressStart: () => {},
      logProgressUpdate: () => {},
      logGroupClose: () => {},
      logGroupOpen: () => {},
      logProgressIncrement: () => {}
    };
    const consoleSpy = sinon.stub(logger, "log");
    sinon.stub(logger, "logProgressStart");
    sinon.stub(logger, "logProgressUpdate");
    WaitDelayerFactories.registerFactory("static", () => {
      return t => t;
    });
    try {
      await assert.rejects(
        async () => await WaitFor(async () => false, 3, "title", logger, WaitExponentialDelay(1)),
        /Timeout while waiting for title/g
      );
      assert.strictEqual(consoleSpy.callCount, 3);
      assert.strictEqual(consoleSpy.calledWith("DEBUG", "[1/3]", "title"), true);
      assert.strictEqual(consoleSpy.calledWith("DEBUG", "[2/3]", "title"), true);
      assert.strictEqual(consoleSpy.calledWith("DEBUG", "[3/3]", "title"), true);
      consoleSpy.resetHistory();
      const res = await WaitFor(
        async (resolve, reject) => {
          if (consoleSpy.callCount === 2) {
            resolve({ myobject: "test" });
            return true;
          }
          return false;
        },
        3,
        "title",
        logger,
        WaitLinearDelay(1)
      );
      assert.strictEqual(consoleSpy.callCount, 2);
      assert.strictEqual(consoleSpy.calledWith("DEBUG", "[1/3]", "title"), true);
      assert.strictEqual(consoleSpy.calledWith("DEBUG", "[2/3]", "title"), true);
      assert.strictEqual(consoleSpy.calledWith("DEBUG", "[3/3]", "title"), false);
      assert.deepStrictEqual(res, { myobject: "test" });
      const time = Date.now();
      consoleSpy.resetHistory();
      await WaitFor(
        async resolve => {
          if (consoleSpy.callCount === 3) {
            resolve({ myobject: "test" });
            return true;
          }
          return false;
        },
        3,
        "title",
        logger
      );
      const elapsed = Date.now() - time;
      assert.strictEqual(
        elapsed > 2200 && elapsed < 3800,
        true,
        `Should have a duration close to 3 seconds, got: ${elapsed}ms`
      );
      // COV test
      await WaitFor(async (resolve, reject) => {
        resolve();
        return true;
      }, 3);
      await WaitFor(
        async (resolve, reject) => {
          resolve();
          return true;
        },
        3,
        "title"
      );
    } finally {
      consoleSpy.restore();
    }
  }

  @test
  async loopPromise() {
    let i = 0;
    await new CancelableLoopPromise(
      async canceller => {
        i++;
        if (i > 10) {
          await canceller();
        }
      },
      async () => {}
    );
    assert.strictEqual(i, 11);
    await CancelablePromise.cancelAll();
  }

  @test
  async rejectedCancelablePromise() {
    const promise = new CancelablePromise((resolve, reject) => {
      reject(new Error("BOUZOUF"));
    });
    await assert.rejects(() => promise, /BOUZOUF/);
    await CancelablePromise.cancelAll();
  }

  @test
  async nextTick() {
    // cov only
    await nextTick();
  }
}
