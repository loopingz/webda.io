import { suite, test } from "@webda/test";
import * as assert from "assert";
import { QueueTest } from "@webda/core/lib/queues/queue.spec";
import { AMQPQueue, AMQPQueueParameters } from "./queue.service.js";

/**
 * Wait for `predicate()` to return true, polling every 10ms for up to `timeoutMs`
 * @param predicate - condition to wait for
 * @param timeoutMs - maximum total wait
 */
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error("Timed out waiting for condition");
}

@suite
class AMQPQueueTest extends QueueTest {
  queue: AMQPQueue;

  async afterEach() {
    await this.queue?.stop();
    this.queue = undefined;
  }

  @test
  async basic() {
    this.queue = await this.registerService(
      new AMQPQueue(
        "AMQPQueue",
        new AMQPQueueParameters().load({
          url: "amqp://localhost:5672",
          queue: "webda-test",
          maxConsumers: 1
        })
      )
    )
      .resolve()
      .init();
    await this.queue.__clean();
    await this.simple(this.queue, true);
    assert.deepStrictEqual(await this.queue.receiveMessage(), []);
  }

  /**
   * Create an empty queue
   * @param params - extra parameters
   * @returns the queue
   */
  async makeQueue(params: any = {}): Promise<AMQPQueue> {
    this.queue = await this.registerService(
      new AMQPQueue(
        "AMQPQueue",
        new AMQPQueueParameters().load({
          url: "amqp://localhost:5672",
          queue: "webda-test-push",
          // Polling would wait 5s after an empty receive
          idleDelayer: { type: "linear", interval: 5000 },
          maxIdleDelay: 5000,
          ...params
        })
      )
    )
      .resolve()
      .init();
    await this.queue.__clean();
    return this.queue;
  }

  /**
   * Count the `basic.get` sent on the main channel
   * @param queue - the queue
   * @returns a function returning the count so far
   */
  countGets(queue: AMQPQueue): () => number {
    const channel: any = queue.channel;
    const get = channel.get;
    let count = 0;
    channel.get = function countedGet(this: any, ...args: any[]) {
      count++;
      return get.apply(this, args);
    };
    return () => count;
  }

  @test
  async consumeIsPushed() {
    const queue = await this.makeQueue();
    const gets = this.countGets(queue);
    const received: number[] = [];
    const consumer = queue.consume(async (msg: any) => {
      received.push(Date.now() - msg.sentAt);
    });
    try {
      await this.sleep(300);
      await queue.sendMessage({ sentAt: Date.now() });
      await waitFor(() => received.length === 1, 1000);
      assert.ok(received[0] < 500, `received after ${received[0]}ms`);
      await this.sleep(300);
      // An idle consumer does not poll
      assert.strictEqual(gets(), 0);
    } finally {
      await consumer.cancel();
      await consumer;
    }
    assert.strictEqual(await queue.size(), 0);
  }

  @test
  async failedMessagesAreRequeued() {
    const queue = await this.makeQueue();
    const attempts: Record<number, number> = {};
    const consumer = queue.consume(async (msg: any) => {
      attempts[msg.n] = (attempts[msg.n] ?? 0) + 1;
      if (msg.n === 1 && attempts[msg.n] === 1) throw new Error("induced failure");
    });
    try {
      await queue.sendMessage({ n: 1 });
      await queue.sendMessage({ n: 2 });
      await waitFor(() => attempts[1] === 2 && attempts[2] === 1, 2000);
    } finally {
      await consumer.cancel();
      await consumer;
    }
    assert.deepStrictEqual(attempts, { 1: 2, 2: 1 });
    assert.strictEqual(await queue.size(), 0);
  }

  @test
  async prefetchBoundsTheMessagesInProgress() {
    const queue = await this.makeQueue({ maxConsumers: 2 });
    let inflight = 0;
    let maxInflight = 0;
    let done = 0;
    const consumer = queue.consume(async () => {
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      await this.sleep(50);
      inflight--;
      done++;
    });
    try {
      for (let i = 0; i < 6; i++) await queue.sendMessage({ i });
      await waitFor(() => done === 6, 3000);
    } finally {
      await consumer.cancel();
      await consumer;
    }
    assert.strictEqual(maxInflight, 2);
  }

  @test
  async cancelStopsTheDelivery() {
    const queue = await this.makeQueue();
    const received: any[] = [];
    const consumer = queue.consume(async msg => {
      received.push(msg);
    });
    await this.sleep(100);
    const start = Date.now();
    await consumer.cancel();
    await consumer;
    assert.ok(Date.now() - start < 1000, `cancel took ${Date.now() - start}ms`);
    await queue.sendMessage({ after: "cancel" });
    await this.sleep(200);
    assert.deepStrictEqual(received, []);
    // The message stays in the queue
    const msgs = await queue.receiveMessage();
    assert.strictEqual(msgs.length, 1);
    await queue.deleteMessage(msgs[0].ReceiptHandle);
  }

  @test
  async pushDisabledPolls() {
    const queue = await this.makeQueue({ push: false, idleDelayer: { type: "linear", interval: 50 } });
    const gets = this.countGets(queue);
    const received: any[] = [];
    const consumer = queue.consume(async msg => {
      received.push(msg);
    });
    try {
      await queue.sendMessage({ polled: true });
      await waitFor(() => received.length === 1, 2000);
      assert.ok(gets() > 0);
    } finally {
      await consumer.cancel();
      await consumer;
    }
  }

  @test
  async resubscribesAfterAChannelError() {
    const queue = await this.makeQueue({ workerDelayer: { type: "linear", interval: 100 } });
    const channels: any[] = [];
    const createChannel = queue.conn!.createChannel;
    queue.conn!.createChannel = async function capturedCreateChannel(this: any, ...args: any[]) {
      const ch = await createChannel.apply(this, args);
      channels.push(ch);
      return ch;
    };
    const received: any[] = [];
    const consumer = queue.consume(async msg => {
      received.push(msg);
    });
    try {
      await waitFor(() => channels.length === 1);
      await this.sleep(100);
      // Acknowledging an unknown delivery tag makes the broker close the channel
      channels[0].ack({ fields: { deliveryTag: 999 } });
      await waitFor(() => channels.length === 2, 2000);
      await queue.sendMessage({ after: "error" });
      await waitFor(() => received.length === 1, 2000);
    } finally {
      await consumer.cancel();
      await consumer;
    }
  }

  @test
  async stoppingTheServiceEndsTheConsumer() {
    const queue = await this.makeQueue();
    const consumer = queue.consume(async () => {});
    await this.sleep(100);
    await queue.stop();
    this.queue = undefined;
    const start = Date.now();
    await consumer;
    assert.ok(Date.now() - start < 1000);
  }
}
