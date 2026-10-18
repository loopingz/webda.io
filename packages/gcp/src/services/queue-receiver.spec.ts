import { suite, test } from "@webda/test";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import * as assert from "node:assert";
import { EventEmitter } from "node:events";
import { GCPQueue } from "./queue.service.js";

@suite
class QueueReceiverTest extends WebdaApplicationTest {
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
}
