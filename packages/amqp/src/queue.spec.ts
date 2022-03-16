import { QueueTest } from "@webda/core/lib/queues/queue.spec";
import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import AMQPQueue from "./queue";

@suite
class AMQPQueueTest extends QueueTest {
  @test
  async basic() {
    let queue: AMQPQueue = this.webda.getService<AMQPQueue>("queue");
    await queue.__clean();
    await this.simple(queue, true);
    assert.deepStrictEqual(await queue.receiveMessage(), []);
  }
}
