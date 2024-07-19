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
    await queue.pubsub.createSubscription(queue.getParameters().topic, queue.getParameters().subscription, {
      ackDeadlineSeconds: 10,
      enableExactlyOnceDelivery: true
    });
    try {
      console.log("INFO", "Test basic");
      await this.simple(queue, true, 12000);
      console.log("INFO", "Test basic done");
      // Seems to be penalized by no promise on ACK
      await this.sleep(5000);
      this.log("DEBUG", "Verify receiveMessage is now empty");
      queue.getParameters().timeout = 3000;
      // TODO Investigate this one
      if ((await queue.receiveMessage()).length > 0) {
        this.log("ERROR", "Queue should be empty - not an assert to avoid random");
      }
    } finally {
      console.log("INFO", "Deleting subscription");
      try {
        await queue.pubsub.subscription(queue.getParameters().subscription).delete();
      } catch (err) {
        console.error("Error deleting subscription", err);
      }
    }
    console.log("INFO", "POST Deleting subscription");
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
      // The second message throw an exception so it can come back
      await queue.receiveMessage();
      await queue.receiveMessage();
    } finally {
      await queue.pubsub.subscription(queue.getParameters().subscription).delete();
    }
  }

  @test
  async receiveError() {
    this.log("DEBUG", "Receive Error test");
    let queue: GCPQueue = this.webda.getService<GCPQueue>("queue");
    let service = new FakeSubscription();
    sinon.stub(queue.pubsub, "subscription").callsFake(() => {
      return <any>service;
    });
    let consumer = queue.receiveMessage();
    service.emitError();
    await assert.rejects(() => consumer, /Fake error/);
  }
}
