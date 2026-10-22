import { suite, test } from "@webda/test";
import * as assert from "assert";
import { register } from "prom-client";
import { Queue } from "../index.js";
import { MemoryQueue, MemoryQueueParameters } from "./memoryqueue.service.js";
import { QueueTest } from "./queue.spec.js";
import { CancelablePromise } from "@webda/utils";

class Title {
  title: string;

  constructor(title?: string) {
    this.title = title || "";
  }
}
@suite
class MemoryQueueTest extends QueueTest {
  queue: MemoryQueue;

  async beforeEach() {
    await super.beforeEach();
    this.queue = await this.addService(MemoryQueue, {
      expire: 1,
      maxConsumers: 1
    });
  }

  static seq: number;
  static resolve: (value: unknown) => void;
  static queue: Queue;
  static failedIterations: any[];
  static workerPromise: CancelablePromise<void>;

  async receiveMessage<K>(proto?: { new (): K }) {
    MemoryQueueTest.seq++;
    switch (MemoryQueueTest.seq) {
      case 1:
        // Test the resume if no messages available
        return [];
      case 2:
        return [
          {
            ReceiptHandle: "msg1",
            Message: MemoryQueueTest.queue.unserialize(JSON.stringify({ title: "plop" }), proto)
          }
        ];
      case 3:
        throw Error();
      case 4:
        // An error occured it should double the pause
        MemoryQueueTest.failedIterations.push(
          // @ts-ignore
          MemoryQueueTest.queue.failedIterations
        );
        return Promise.resolve([
          {
            ReceiptHandle: "msg2",
            Message: MemoryQueueTest.queue.unserialize(JSON.stringify({ title: "plop2" }), proto)
          }
        ]);
      case 5:
        // Error on callback dont generate a double delay
        MemoryQueueTest.failedIterations.push(
          // @ts-ignore
          MemoryQueueTest.queue.failedIterations
        );
        MemoryQueueTest.resolve(MemoryQueueTest.workerPromise.cancel());
        return [];
    }
  }

  async receiveMessageParallelism<K>(proto?: { new (): K }) {
    MemoryQueueTest.seq++;
    if (MemoryQueueTest.seq > 2) {
      await new Promise(r => setTimeout(r, 30000));
      return [];
    }
    switch (MemoryQueueTest.seq) {
      case 1:
        return [
          {
            ReceiptHandle: "msg1",
            Message: { title: "plop" }
          },
          {
            ReceiptHandle: "msg2",
            Message: { title: "plop2" }
          }
        ];
      case 2:
        MemoryQueueTest.resolve(MemoryQueueTest.workerPromise.cancel());
        return [];
    }
  }

  @test
  async worker() {
    MemoryQueueTest.failedIterations = [];
    await new Promise(resolve => {
      MemoryQueueTest.resolve = resolve;
      const queue: Queue = new MemoryQueue("q", {
        workerParallelism: false
      });
      queue.initMetrics();
      MemoryQueueTest.queue = queue;
      // @ts-ignore
      queue.delayer = () => 1;
      MemoryQueueTest.seq = 0;
      // @ts-ignore
      queue._webda = <any>{
        log: () => {}
      };
      queue.receiveMessage = this.receiveMessage.bind(queue);
      queue.deleteMessage = async handle => {
        // Should only have the msg1 handle in deleteMessage as msg2 is fake error
        assert.strictEqual(handle, "msg1");
      };
      const callback = async event => {
        switch (MemoryQueueTest.seq) {
          case 2:
            assert.strictEqual(event.title, "plop");
            return;
          case 4:
            // Simulate error in callback
            throw Error();
        }
      };
      MemoryQueueTest.workerPromise = queue.consume(callback, Title);
    });
    assert.deepStrictEqual(MemoryQueueTest.failedIterations, [1, 0]);
  }

  @test
  async parallelized() {
    let op = 0;
    const run = async (parallel: boolean) => {
      await new Promise(resolve => {
        const queue: Queue = new MemoryQueue("q", {
          workerParallelism: parallel
        });
        queue.initMetrics();
        MemoryQueueTest.queue = queue;
        MemoryQueueTest.resolve = resolve;
        // @ts-ignore
        queue.delayer = () => 1;
        MemoryQueueTest.seq = 0;
        // @ts-ignore
        queue._webda = <any>{
          log: () => {}
        };
        queue.receiveMessage = this.receiveMessageParallelism.bind(queue);
        queue.deleteMessage = async handle => {};
        const callback = async event => {
          if (event.title === "plop") {
            await this.sleep(300);
            op = 1;
          } else {
            await this.sleep(100);
            op *= 2;
          }
        };
        MemoryQueueTest.workerPromise = queue.consume(callback, undefined);
      });
    };
    await run(true);
    assert.strictEqual(op, 1, 'It should have been run in parallel so op=0 as *2 will happen before =1"');
    await run(false);
    assert.strictEqual(op, 2, 'It should have been run in parallel so op=2 as *2 will happen after =1"');
  }

  /**
   * Consume a queue whose receiveMessage is replaced, for a duration
   *
   * @param params - queue parameters
   * @param receive - the receiveMessage replacement
   * @param durationMs - how long to consume
   * @returns the number of receives and the time the cancellation took
   */
  async consumeFor(params: any, receive: (call: number) => Promise<any[]>, durationMs: number) {
    const queue: Queue = new MemoryQueue("idle", params);
    queue.initMetrics();
    let calls = 0;
    queue.receiveMessage = async () => receive(++calls);
    queue.deleteMessage = async () => {};
    const consumer = queue.consume(async () => {});
    await this.sleep(durationMs);
    const start = Date.now();
    await consumer.cancel();
    await consumer;
    return { calls, cancelMs: Date.now() - start, queue };
  }

  @test
  async idleConsumerDoesNotSpin() {
    // An empty queue answering immediately (PostgresQueue, AMQPQueue) was polled thousands of times per second
    const { calls } = await this.consumeFor({ idleDelayer: { type: "linear", interval: 50 } }, async () => [], 300);
    assert.ok(calls >= 3 && calls <= 8, `${calls} receives in 300ms, expected about 6`);
  }

  @test
  async idleDelayBacksOffUpToTheMaximum() {
    const queue = new MemoryQueue("idle", {} as any);
    // Default: exponential from 50ms
    assert.deepStrictEqual(
      [1, 2, 3, 4].map(n => queue.getIdleDelay(n)),
      [50, 100, 200, 400]
    );
    assert.strictEqual(new MemoryQueueParameters().load().maxIdleDelay, undefined, "250ms is applied by consume");
    // 10, 20, 40 then capped at 40ms: about 3 + (400 - 70) / 40 receives
    const { calls } = await this.consumeFor(
      { idleDelayer: { type: "exponential", interval: 10 }, maxIdleDelay: 40 },
      async () => [],
      400
    );
    assert.ok(calls >= 7 && calls <= 14, `${calls} receives in 400ms, expected about 11`);
  }

  @test
  async longPollingIsNotDelayed() {
    // A receive already waiting longer than the idle delay is not followed by an extra wait
    const { calls } = await this.consumeFor(
      { idleDelayer: { type: "linear", interval: 50 } },
      async () => {
        await this.sleep(100);
        return [];
      },
      560
    );
    assert.ok(calls >= 5, `${calls} receives in 560ms, expected 5 or 6`);
  }

  @test
  async cancelDuringIdleWait() {
    const { calls, cancelMs } = await this.consumeFor(
      { idleDelayer: { type: "linear", interval: 10000 }, maxIdleDelay: 10000 },
      async () => [],
      50
    );
    assert.strictEqual(calls, 1);
    assert.ok(cancelMs < 1000, `cancel took ${cancelMs}ms, the idle wait should be interrupted`);
  }

  @test
  async cancelDuringReceiveSkipsTheIdleWait() {
    // The receive in progress when cancelling returns no message: the loop ends without the idle wait
    const queue: Queue = new MemoryQueue("idle", {
      idleDelayer: { type: "linear", interval: 10000 },
      maxIdleDelay: 10000
    } as any);
    queue.initMetrics();
    queue.receiveMessage = async () => {
      await this.sleep(100);
      return [];
    };
    const consumer = queue.consume(async () => {});
    await this.sleep(50);
    const start = Date.now();
    await consumer.cancel();
    await consumer;
    assert.ok(Date.now() - start < 1000, `the consumer ended ${Date.now() - start}ms after the cancellation`);
  }

  @test
  async idleDelayResetsAfterAMessage() {
    // Empty receives wait 20ms, 40ms; the third receive gets a message; the fourth starts the backoff again at 20ms
    const times: number[] = [];
    await this.consumeFor(
      { idleDelayer: { type: "exponential", interval: 20 }, maxConsumers: 1 },
      async call => {
        times.push(Date.now());
        return call === 3 ? [{ ReceiptHandle: "m", Message: {} }] : [];
      },
      200
    );
    assert.ok(times.length >= 5, `${times.length} receives`);
    const gap = times[4] - times[3];
    assert.ok(gap >= 15 && gap < 60, `the wait after the message should be back to 20ms, got ${gap}ms`);
  }

  @test
  async basic() {
    const queue: MemoryQueue = <MemoryQueue>this.queue;
    // For coverage
    assert.strictEqual(queue.getParameters().expire, 1, "1s");
    assert.strictEqual(queue.getParameters().expireMs, 1000, "1s should be convert to ms");
    assert.strictEqual(new MemoryQueueParameters().load().expire, 30, "default should be 30s");
    queue.__clean();
    // Should not have issue with unknown receipt
    await queue.deleteMessage("bouzouf");
    this.stub(queue.getParameters(), "timeoutMs").get(() => 1);
    assert.strictEqual((await queue.receiveMessage()).length, 0);
    return this.simple(queue);
  }

  @test
  async uuid() {
    const queue: MemoryQueue = <MemoryQueue>this.queue;
    const first = true;
    let callCount = 0;
    // @ts-ignore
    queue._queue = new Proxy(queue._queue, {
      get: (q, prop) => {
        callCount += 1;
        if (callCount === 1) {
          return "plop";
        }
      }
    });
    await queue.sendMessage({});
    assert.strictEqual(callCount, 2);
    await register.metrics();
  }
}
