import { suite, test } from "@webda/test";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import * as assert from "node:assert";
import { EventEmitter } from "node:events";
import { vi } from "vitest";
import GCPPubSubService from "./pubsub.service.js";
import { GCPQueue } from "./queue.service.js";

@suite
class QueueReceiverTest extends WebdaApplicationTest {
  @test
  async rejectsCallsAfterStoppingTheClient() {
    const queue = await this.addService(GCPQueue, { mode: "receiver" });
    await queue.stop();
    await assert.rejects(() => queue.sendMessage({}), /not initialized/);
    await assert.rejects(() => queue.receiveMessage(), /not initialized/);
    assert.throws(() => queue.consume(async () => {}), /not initialized/);
    const pubsub = await this.addService(GCPPubSubService, { topic: "unit" });
    await pubsub.stop();
    await assert.rejects(() => pubsub.sendMessage({}), /not initialized/);
    assert.throws(() => pubsub.consume(async () => {}), /not initialized/);
  }

  @test
  async resolvesTheCurrentReceiverBeforePreparingTheNext() {
    const queue = await this.addService(GCPQueue, { mode: "receiver", timeout: 10 });
    const subscription = Object.assign(new EventEmitter(), { close: async () => {} });
    queue.subscription = subscription as any;
    try {
      for (const id of ["first", "second"]) {
        const pending = queue.receiveMessage();
        subscription.emit("message", { ackId: id, data: Buffer.from(JSON.stringify({ id })) });
        assert.deepStrictEqual(await pending, [{ Message: { id }, ReceiptHandle: id }]);
      }
      assert.deepStrictEqual(await queue.receiveMessage(), []);
      const pending = queue.receiveMessage();
      subscription.emit("message", { ackId: "after-timeout", data: Buffer.from("{}") });
      assert.deepStrictEqual(await pending, [{ Message: {}, ReceiptHandle: "after-timeout" }]);
    } finally {
      await queue.stop();
    }
  }

  @test
  async waitsForAMessageWithoutTimeout() {
    const queue = await this.addService(GCPQueue, { mode: "receiver", timeout: 0 });
    const subscription = Object.assign(new EventEmitter(), { close: async () => {} });
    queue.subscription = subscription as any;
    try {
      let received: any;
      const pending = queue.receiveMessage().then(res => (received = res));
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.strictEqual(received, undefined, "No empty answer without timeout");
      subscription.emit("message", { ackId: "late", data: Buffer.from("{}") });
      assert.deepStrictEqual(await pending, [{ Message: {}, ReceiptHandle: "late" }]);
    } finally {
      await queue.stop();
    }
  }

  @test
  async consumesAnExistingSubscription() {
    const pubsub = await this.addService(GCPPubSubService, { topic: "unit" });
    const createSubscription = vi.fn();
    const subscription = Object.assign(new EventEmitter(), {
      exists: async () => [true],
      delete: vi.fn().mockResolvedValue(undefined)
    });
    const client = pubsub.pubsub;
    try {
      pubsub.pubsub = { subscription: () => subscription, topic: () => ({ createSubscription }) } as any;
      let bound: any;
      const consumer = pubsub.consume(
        async () => {},
        undefined,
        sub => (bound = sub)
      );
      await new Promise(resolve => setTimeout(resolve, 10));
      // The subscription is not created again
      assert.strictEqual(bound, subscription);
      assert.strictEqual(createSubscription.mock.calls.length, 0);
      assert.strictEqual(subscription.listenerCount("message"), 1);
      const cancelled = assert.rejects(consumer, /Cancelled/);
      await consumer.cancel();
      await cancelled;
      assert.strictEqual(subscription.listenerCount("message"), 0);
      assert.strictEqual(subscription.delete.mock.calls.length, 1);

      // Nothing to release when the subscription could not be reached
      pubsub.pubsub = {
        subscription: () => {
          throw new Error("unreachable");
        }
      } as any;
      const failed = pubsub.consume(async () => {});
      await assert.rejects(failed, /unreachable/);
      await failed.cancel();
      assert.strictEqual(subscription.delete.mock.calls.length, 1);
    } finally {
      pubsub.pubsub = client;
      await pubsub.stop();
    }
  }
}
