import { PubSub } from "@google-cloud/pubsub";
import { QueueTest } from "@webda/core/lib/queues/queue.spec";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { randomUUID } from "node:crypto";
import { GCPQueue, GCPQueueParameters } from "./queue.service.js";

/**
 * Dedicated topic: the pubsub spec publishes on "unit-tests" in parallel
 */
const TOPIC = "unit-tests-queue";

@suite
class GCPQueueTest extends QueueTest {
  queue: GCPQueue;

  async beforeEach() {
    const pubsub = new PubSub();
    const [exists] = await pubsub.topic(TOPIC).exists();
    if (!exists) {
      await pubsub.createTopic(TOPIC);
    }
    await pubsub.close();
    await super.beforeEach();
  }

  async afterEach() {
    if (this.queue) {
      try {
        await this.queue.pubsub.subscription(this.queue.getParameters().subscription).delete();
      } catch {
        // Subscription might not exist
      }
      await this.queue.stop();
      this.queue = undefined;
    }
  }

  /**
   * Create the queue service
   * @param mode - queue mode
   * @returns the queue initialized
   */
  async getQueue(mode: "receiver" | "consumer"): Promise<GCPQueue> {
    this.queue = await this.registerService(
      new GCPQueue(
        "queue",
        new GCPQueueParameters().load({
          subscription: `queue_${randomUUID()}`,
          mode,
          topic: TOPIC,
          timeout: 30000
        })
      )
    )
      .resolve()
      .init();
    return this.queue;
  }

  @test
  params() {
    assert.strictEqual(new GCPQueueParameters().load().mode, "consumer");
    assert.strictEqual(new GCPQueueParameters().load({ mode: "receiver" }).mode, "receiver");
  }

  @test
  async basic() {
    const queue = await this.getQueue("receiver");
    await queue.pubsub.createSubscription(queue.getParameters().topic, queue.getParameters().subscription, {
      ackDeadlineSeconds: 10,
      enableExactlyOnceDelivery: true
    });
    await this.simple(queue, true, 2000);
    this.log("DEBUG", "Verify receiveMessage is now empty");
    queue.getParameters().timeout = 1000;
    const msgs = await queue.receiveMessage();
    assert.strictEqual(msgs.length, 0);
    assert.strictEqual(await queue.size(), 0);
  }

  @test
  async consumers() {
    const queue = await this.getQueue("receiver");
    await queue.pubsub.createSubscription(queue.getParameters().topic, queue.getParameters().subscription, {
      ackDeadlineSeconds: 10,
      enableMessageOrdering: true
    });
    let msg;
    let consumed = 0;
    const consumer = queue.consume(async dt => {
      consumed++;
      if (msg) {
        throw new Error("Already received");
      }
      msg = dt;
    });
    await this.sleep(1000);
    await queue.sendMessage({ plop: 1 });
    await queue.sendMessage({ plop: 2 });
    // Need to wait before cancel to ensure message are received
    for (let i = 0; i < 60 && consumed < 2; i++) {
      await this.sleep(500);
    }
    // Cancelling rejects the consumer promise with "Cancelled"
    const cancelled = assert.rejects(() => consumer, /Cancelled/);
    await consumer.cancel();
    await cancelled;
    assert.ok(consumed >= 2);
    assert.notStrictEqual(msg, undefined);
  }

  @test
  async receiveError() {
    const queue = await this.getQueue("consumer");
    await assert.rejects(() => queue.receiveMessage(), /You can only use receiveMessage in 'receiver' mode/);
  }
}
