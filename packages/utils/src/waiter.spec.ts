import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { Logger } from "@webda/workout";
import {
  CancelableLoopPromise,
  CancelablePromise,
  nextTick,
  WaitDelayerFactories,
  WaitExponentialDelay,
  WaitFor,
  WaitLinearDelay
} from "./waiter.js";

@suite
class WaiterTest {
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
      consoleSpy.resetHistory();
      // Returning true without calling resolve() must still settle the promise (#1147)
      let trueCalls = 0;
      await WaitFor(
        async () => {
          trueCalls++;
          return trueCalls >= 3;
        },
        5,
        "trueOnly",
        undefined,
        WaitLinearDelay(1)
      );
      assert.strictEqual(trueCalls, 3);
      // The default delayer waits 1s then 2s: run it on a fake clock
      const clock = sinon.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
      try {
        const time = Date.now();
        const waiting = WaitFor(
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
        await clock.tickAsync(2999);
        assert.strictEqual(consoleSpy.callCount, 2);
        await clock.tickAsync(1);
        await waiting;
        assert.strictEqual(Date.now() - time, 3000, "Should have waited 1s then 2s");
      } finally {
        clock.restore();
      }
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
  async syncSettledCancelablePromise() {
    // Settled synchronously from the executor: must settle normally and not stay registered
    let promise = new CancelablePromise<number>(resolve => resolve(1));
    assert.ok(!CancelablePromise.promises.has(promise));
    assert.strictEqual(await promise, 1);

    promise = new CancelablePromise<number>((_resolve, reject) => reject(new Error("SYNC_REJECT")));
    assert.ok(!CancelablePromise.promises.has(promise));
    await assert.rejects(() => promise, /SYNC_REJECT/);

    promise = new CancelablePromise<number>(() => {
      throw new Error("SYNC_THROW");
    });
    assert.ok(!CancelablePromise.promises.has(promise));
    await assert.rejects(() => promise, /SYNC_THROW/);
  }

  @test
  async derivedPromisesAreNotCancelable() {
    // Awaiting or chaining must not register extra promises that cancelAll() would reject unobserved
    const promise = new CancelablePromise(
      () => {
        // never settles
      },
      async () => {}
    );
    const derived = promise.then(() => "done");
    assert.ok(!(derived instanceof CancelablePromise));
    assert.strictEqual(CancelablePromise.promises.size, 1);
    const unhandled = [];
    const listener = err => unhandled.push(err);
    process.on("unhandledRejection", listener);
    try {
      const awaited = (async () => {
        try {
          await promise;
        } catch (err) {
          return err;
        }
      })();
      await CancelablePromise.cancelAll();
      assert.strictEqual(await awaited, "Cancelled");
      await derived.catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.deepStrictEqual(unhandled, []);
      assert.strictEqual(CancelablePromise.promises.size, 0);
    } finally {
      process.off("unhandledRejection", listener);
    }
  }

  @test
  async asyncExecutorRejectBeforeAwait() {
    // An async executor rejecting before its first await used to leak a
    // "Must call super constructor" unhandled rejection
    const unhandled = [];
    const listener = err => unhandled.push(err);
    process.on("unhandledRejection", listener);
    try {
      const promise = new CancelablePromise(async (_resolve, reject) => {
        reject(new Error("ASYNC_REJECT"));
      });
      await assert.rejects(() => promise, /ASYNC_REJECT/);
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.deepStrictEqual(unhandled, []);
      assert.ok(!CancelablePromise.promises.has(promise));
    } finally {
      process.off("unhandledRejection", listener);
    }
  }

  @test
  async cancelPendingCancelablePromise() {
    let cancelled = false;
    const promise = new CancelablePromise(
      () => {
        // never settles
      },
      async () => {
        cancelled = true;
      }
    );
    assert.ok(CancelablePromise.promises.has(promise));
    await promise.cancel();
    await assert.rejects(() => promise, /Cancelled/);
    assert.ok(cancelled);
    assert.ok(!CancelablePromise.promises.has(promise));
  }

  @test
  async loopPromiseSyncCancel() {
    // Cancelling synchronously from the first iteration without onCancel
    let i = 0;
    const promise = new CancelableLoopPromise(async canceller => {
      i++;
      await canceller();
    });
    await promise;
    assert.strictEqual(i, 1);
    assert.ok(!CancelablePromise.promises.has(promise as any));
  }

  @test
  async nextTick() {
    // cov only
    await nextTick();
  }

  @test
  async waitForWithLoggerWithoutTitle() {
    const logger: Logger = {
      log: sinon.stub(),
      logProgressStart: sinon.stub(),
      logProgressUpdate: sinon.stub(),
      logGroupClose: () => {},
      logGroupOpen: () => {},
      logProgressIncrement: () => {}
    };
    let calls = 0;
    const res = await WaitFor(
      async resolve => {
        if (++calls < 2) return false;
        resolve("done");
        return true;
      },
      3,
      undefined,
      logger,
      WaitLinearDelay(1)
    );
    assert.strictEqual(res, "done");
    // Without title, no debug line is emitted and the progress has an empty title
    assert.strictEqual((<sinon.SinonStub>logger.log).callCount, 0);
    const start = <sinon.SinonStub>logger.logProgressStart;
    assert.strictEqual(start.callCount, 1);
    assert.deepStrictEqual(start.firstCall.args.slice(1), [3, ""]);
    const update = <sinon.SinonStub>logger.logProgressUpdate;
    assert.deepStrictEqual(
      update.args.map(a => [a[0], a[2]]),
      [
        [1, ""],
        [2, ""],
        [3, ""]
      ]
    );
  }
}
