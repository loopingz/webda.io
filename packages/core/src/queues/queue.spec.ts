import * as assert from "assert";
import { WebdaTest } from "../test";

class QueueItemTest {
  type: number;

  constructor(type?: number) {
    this.type = type;
  }

  getDouble(): number {
    return this.type * 2;
  }
}

class QueueTest extends WebdaTest {
  async simple(queue, inconsistentSize: boolean = false, ackDelayMs: number = 1000) {
    var msg;
    this.log("DEBUG", "Send test message 1");
    await queue.sendMessage(new QueueItemTest(1));
    let size = await queue.size();
    if (!inconsistentSize) {
      assert.strictEqual(size, 1);
    }
    this.log("DEBUG", "Send test message 2");
    await queue.sendMessage(new QueueItemTest(2));
    // Pause for 1s - to verify the repopulation
    await this.sleep(ackDelayMs);
    size = await queue.size();
    if (!inconsistentSize) {
      assert.strictEqual(size, 2);
    }
    this.log("DEBUG", "Receive a message");
    msg = await queue.receiveMessage();
    assert.strictEqual(msg[0].Message.getDouble, undefined);
    size = await queue.size();
    if (!inconsistentSize) {
      assert.strictEqual(size, 2);
    }
    this.log("DEBUG", "Delete message");
    await queue.deleteMessage(msg[0].ReceiptHandle);

    // Pause for 1s - to verify the repopulation
    await this.sleep(ackDelayMs);
    this.log("DEBUG", "Receive a message with prototype");
    msg = await queue.receiveMessage(QueueItemTest);
    this.log("DEBUG", "Received message", msg);
    assert.notStrictEqual(msg.length, 0);
    assert.notStrictEqual(msg[0].Message.getDouble, undefined);
    if (!inconsistentSize) {
      assert.strictEqual(msg.length, 1);
    }
    this.log("DEBUG", "Delete message");
    await queue.deleteMessage(msg[0].ReceiptHandle);

    if (!inconsistentSize) {
      assert.strictEqual(await queue.size(), 0);
    }
  }
}

export { QueueTest };
