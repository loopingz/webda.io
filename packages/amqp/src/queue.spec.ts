import { suite, test } from "@testdeck/mocha";
import { QueueTest } from "@webda/core/lib/queues/queue.spec";
import * as assert from "assert";
import AMQPQueue from "./queue";

@suite
class AMQPQueueTest extends QueueTest {
  @test
  async basic() {
    const queue: AMQPQueue = await this.addService(AMQPQueue, {
      endpoint: "amqp://localhost:5672",
      queue: "webda-test",
      maxConsumers: 1
    });
    await queue.__clean();
    await this.simple(queue, true);
    assert.deepStrictEqual(await queue.receiveMessage(), []);
  }
}
