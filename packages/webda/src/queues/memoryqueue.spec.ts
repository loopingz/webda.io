import { QueueTest } from "./queue.spec";
import { Queue } from "../index";
import { suite, test } from "mocha-typescript";
import * as assert from "assert";

@suite
class MemoryQueueTest extends QueueTest {
  @test
  abstractQueue() {
    // Ensure abstract - mainly for code coverage
    let queue = new Queue(undefined, undefined, undefined);
    this.assertThrowsAsync(queue.sendMessage, Error);
    this.assertThrowsAsync(queue.size, Error);
    this.assertThrowsAsync(queue.receiveMessage, Error);
    this.assertThrowsAsync(queue.deleteMessage, Error);
  }

  @test
  async worker() {
    await new Promise(resolve => {
      let queue: any = new Queue(undefined, undefined, undefined);
      let seq = 0;
      queue._webda = {
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
            assert.equal(queue.pause, 2);
            return Promise.resolve([
              {
                ReceiptHandle: "msg2",
                Body: '{"title":"plop2"}'
              }
            ]);
          case 5:
            // Error on callback dont generate a double delay
            assert.equal(queue.pause, 2);
            resolve(queue.stop());
        }
      };
      queue.deleteMessage = handle => {
        // Should only have the msg1 handle in deleteMessage as msg2 is fake error
        assert.equal(handle, "msg1");
      };
      let callback = event => {
        switch (seq) {
          case 2:
            assert.equal(event.title, "plop");
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
    let queue = this.getService("memoryqueue");
    // For coverage
    assert.equal(queue._params.expire, 1000);
    queue._params.expire = undefined;
    await queue.init();
    assert.equal(queue._params.expire, 30000);
    queue._params.expire = 1000;
    queue.__clean();
    return this.simple(queue);
  }
}
