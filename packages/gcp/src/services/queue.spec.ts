import { suite, test } from "@testdeck/mocha";
import { QueueTest } from "@webda/core/lib/queues/queue.spec";
import * as assert from "assert";
import { EventEmitter } from "events";
import * as sinon from "sinon";
import GCPQueue from "./queue";
import { PubSub } from "@google-cloud/pubsub";

class FakeSubscription extends EventEmitter {
  emitError() {
    this.emit("error", "Fake error");
  }
  close() {}
}

@suite
class GCPQueueTest extends QueueTest {
  async before() {
    const pubsub = new PubSub();
    const [exists] = await pubsub.topic("unit-tests").exists();
    if (!exists) {
      await pubsub.createTopic("unit-tests");
    }
    await super.before();
  }

  @test
  async basic() {
    let queue: GCPQueue = this.webda.getService<GCPQueue>("queue");
    queue.getParameters().subscription = `${queue.getParameters().subscription}_${this.webda.getUuid()}`;
    queue.getParameters().mode = "receiver";
    await queue.pubsub.createSubscription(queue.getParameters().topic, queue.getParameters().subscription, {
      ackDeadlineSeconds: 10,
      enableExactlyOnceDelivery: true
    });
    try {
      await this.simple(queue, true, 12000);
      this.log("DEBUG", "Verify receiveMessage is now empty");
      queue.getParameters().timeout = 1000;
      const msgs = await queue.receiveMessage();
      assert.strictEqual(msgs.length, 0);
    } finally {
      console.log("INFO", "Deleting subscription");
      try {
        await queue.pubsub.subscription(queue.getParameters().subscription).delete();
      } catch (err) {
        console.error("Error deleting subscription", err);
      }
    }
  }

  @test
  async consumers() {
    let queue: GCPQueue = this.webda.getService<GCPQueue>("queue");
    queue.getParameters().subscription = `${queue.getParameters().subscription}_${this.webda.getUuid()}`;
    await queue.pubsub.createSubscription(queue.getParameters().topic, queue.getParameters().subscription, {
      ackDeadlineSeconds: 10,
      enableMessageOrdering: true
    });
    try {
      // Test consumer
      let msg;
      let consumed = 0;
      let consumer = queue.consume(async dt => {
        consumed++;
        if (msg) {
          throw new Error();
        }
        msg = dt;
      });
      await this.sleep(1000);
      this.log("DEBUG", "Consume sendMessage");
      await queue.sendMessage({ plop: 1 });
      this.log("DEBUG", "Consume cancel");
      await queue.sendMessage({ plop: 2 });
      // Need to wait before cancel to ensure message are received
      while (consumed < 2) {
        await this.sleep(500);
      }
      await consumer.cancel();
      this.log("DEBUG", "Consume assert");
      assert.notStrictEqual(msg, undefined);
    } finally {
      await queue.pubsub.subscription(queue.getParameters().subscription).delete();
    }
  }

  @test
  async receiveError() {
    let queue: GCPQueue = this.webda.getService<GCPQueue>("queue");
    await assert.rejects(() => queue.receiveMessage(), /You can only use receiveMessage in 'receiver' mode/);
  }
}
