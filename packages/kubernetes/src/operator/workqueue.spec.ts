import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WorkQueue } from "./workqueue.js";

/**
 * A promise resolved from outside
 * @returns the promise and its resolve
 */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(r => (resolve = r));
  return { promise, resolve };
}

@suite
class WorkQueueTest {
  @test
  async deduplicates() {
    const processed: string[] = [];
    const gate = deferred();
    const queue = new WorkQueue(async key => {
      processed.push(key);
      if (key === "a" && processed.length === 1) await gate.promise;
    });
    queue.add("a");
    // Added while processed: once more after
    queue.add("a");
    queue.add("a");
    // Added while queued: once
    queue.add("b");
    queue.add("b");
    assert.strictEqual(queue.depth, 1);
    gate.resolve();
    await queue.drain();
    assert.deepStrictEqual(processed, ["a", "b", "a"]);
  }

  @test
  async concurrency() {
    let running = 0;
    let max = 0;
    const queue = new WorkQueue(
      async () => {
        running++;
        max = Math.max(max, running);
        await new Promise(resolve => setTimeout(resolve, 5));
        running--;
      },
      { concurrency: 3 }
    );
    for (let i = 0; i < 10; i++) queue.add(`k${i}`);
    await queue.drain();
    assert.strictEqual(max, 3);
  }

  @test
  async backoffAndRequeue() {
    const calls: number[] = [];
    const errors: number[] = [];
    const start = Date.now();
    const queue = new WorkQueue(
      async () => {
        calls.push(Date.now() - start);
        if (calls.length < 3) throw new Error("fail");
        if (calls.length === 3) return { requeueAfter: 10 };
      },
      { baseDelay: 10, maxDelay: 15, onError: (_key, _err, delay) => errors.push(delay) }
    );
    queue.add("k");
    while (calls.length < 4) await new Promise(resolve => setTimeout(resolve, 5));
    // 10ms then 15ms (capped) after the failures, 10ms after the requeue
    assert.deepStrictEqual(errors, [10, 15]);
    assert.ok(calls[1] - calls[0] >= 9 && calls[2] - calls[1] >= 14 && calls[3] - calls[2] >= 9, calls.join(","));
    // A successful process resets the backoff
    assert.strictEqual((queue as any).failures.size, 0);
    await queue.stop();
  }

  @test
  async stop() {
    const processed: string[] = [];
    const gate = deferred();
    const queue = new WorkQueue(async key => {
      processed.push(key);
      await gate.promise;
    });
    queue.add("a");
    queue.add("b");
    queue.addAfter("c", 1);
    const stopped = queue.stop();
    gate.resolve();
    await stopped;
    queue.add("d");
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepStrictEqual(processed, ["a"]);
  }
}
