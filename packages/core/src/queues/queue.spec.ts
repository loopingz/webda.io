import { WebdaTest } from "../test";
import * as assert from "assert";

class QueueTest extends WebdaTest {
  async simple(queue, inconsistentSize: boolean = false) {
    var msg;
    await queue.sendMessage({
      type: 1
    });
    let size = await queue.size();
    if (!inconsistentSize) {
      assert.strictEqual(size, 1);
    }
    await queue.sendMessage({
      type: 2
    });
    // Pause for 1s - to verify the repopulation
    await this.sleep(1000);
    size = await queue.size();
    if (!inconsistentSize) {
      assert.strictEqual(size, 2);
    }
    msg = await queue.receiveMessage();
    size = await queue.size();
    if (!inconsistentSize) {
      assert.strictEqual(size, 2);
    }
    if (msg.length > 0) {
      await queue.deleteMessage(msg[0].ReceiptHandle);
    }
    // Pause for 1s - to verify the repopulation
    await this.sleep(1000);
    msg = await queue.receiveMessage();
    if (!inconsistentSize) {
      assert.strictEqual(msg.length, 1);
    }
    if (msg.length > 0) {
      await queue.deleteMessage(msg[0].ReceiptHandle);
    }
    if (!inconsistentSize) {
      assert.strictEqual(await queue.size(), 0);
    }
  }
}

export { QueueTest };
