import { QueueTest } from "@webda/core/lib/queues/queue.spec";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import GCPQueue from "./queue";
import { EventEmitter } from "events";
import * as sinon from "sinon";

class FakeSubscription extends EventEmitter {
  emitError() {
    this.emit("error", "Fake error");
  }
  close() {}
}

@suite
class GCPQueueTest extends QueueTest {
  @test
  async basic() {
    let queue: GCPQueue = this.webda.getService<GCPQueue>("queue");
    queue.getParameters().subscription = `${queue.getParameters().subscription}_${this.webda.getUuid()}`;
    await queue.pubsub.createSubscription(queue.getParameters().topic, queue.getParameters().subscription, {
      ackDeadlineSeconds: 10,
    });
    try {
      await this.simple(queue, true);
      await this.sleep(500);
      this.log("DEBUG", "Verify receiveMessage is now empty");
      assert.deepStrictEqual(await queue.receiveMessage(), []);
      GCPQueue.getModda();

      // Test consumer
      let msg;
      let consumer = queue.consume(async dt => {
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
      await consumer.cancel();
      this.log("DEBUG", "Consume assert");
      assert.strictEqual(msg.plop, 1);
      assert.deepStrictEqual(await queue.receiveMessage(), []);
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
      return service;
    });
    let consumer = queue.receiveMessage();
    service.emitError();
    await assert.rejects(() => consumer, /Fake error/);
  }
}
