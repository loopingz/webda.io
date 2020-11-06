import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { Queue } from "../index";
import { MemoryQueue } from "./memoryqueue";
import { QueueTest } from "./queue.spec";

@suite
class MemoryQueueTest extends QueueTest {
  @test
  async worker() {
    await new Promise(resolve => {
      let queue: Queue = new MemoryQueue(undefined, undefined, undefined);
      let seq = 0;
      queue._webda = <any>{
        log: () => {}
      };
      queue.receiveMessage = () => {
        seq++;
        switch (seq) {
          case 1:
            // Test the resume if no messages available
            return Promise.resolve([]);
          case 2:
            return Promise.resolve([
              {
                ReceiptHandle: "msg1",
                Body: '{"title":"plop"}'
              }
            ]);
          case 3:
            throw Error();
          case 4:
            // An error occured it should double the pause
            assert.strictEqual(queue.pause, 2);
            return Promise.resolve([
              {
                ReceiptHandle: "msg2",
                Body: '{"title":"plop2"}'
              }
            ]);
          case 5:
            // Error on callback dont generate a double delay
            assert.strictEqual(queue.pause, 2);
            resolve(queue.stop());
        }
      };
      queue.deleteMessage = handle => {
        // Should only have the msg1 handle in deleteMessage as msg2 is fake error
        assert.strictEqual(handle, "msg1");
      };
      let callback = event => {
        switch (seq) {
          case 2:
            assert.strictEqual(event.title, "plop");
            return;
          case 4:
            // Simulate error in callback
            throw Error();
            return;
        }
      };
      queue.worker(callback);
    });
  }

  @test
  async basic() {
    let queue: MemoryQueue = <MemoryQueue>this.getService("memoryqueue");
    // For coverage
    assert.strictEqual(queue._params.expire, 1000);
    queue._params.expire = undefined;
    await queue.init();
    assert.strictEqual(queue._params.expire, 30000);
    queue._params.expire = 1000;
    queue.__clean();
    assert.strictEqual((await queue.receiveMessage()).length, 0);
    return this.simple(queue);
  }
}
