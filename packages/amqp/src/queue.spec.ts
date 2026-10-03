import { suite, test } from "@webda/test";
import * as assert from "assert";
import { QueueTest } from "@webda/core/lib/queues/queue.spec";
import { AMQPQueue, AMQPQueueParameters } from "./queue.service.js";

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
}
