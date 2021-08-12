import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { Queue } from "../index";
import { MemoryQueue } from "./memoryqueue";
import { QueueTest } from "./queue.spec";

@suite
class MemoryQueueTest extends QueueTest {
  @test
  async worker() {
    const failedIterations = [];
    await new Promise(resolve => {
      let queue: Queue = new MemoryQueue(undefined, undefined, {
        workerParallelism: false
      });
      // @ts-ignore
      queue.delayer = () => 1;
      let seq = 0;
      // @ts-ignore
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
            // @ts-ignore
            failedIterations.push(queue.failedIterations);
            return Promise.resolve([
              {
                ReceiptHandle: "msg2",
                Body: '{"title":"plop2"}'
              }
            ]);
          case 5:
            // Error on callback dont generate a double delay
            // @ts-ignore
            failedIterations.push(queue.failedIterations);
            resolve(queue.stop());
        }
      };
      queue.deleteMessage = async handle => {
        // Should only have the msg1 handle in deleteMessage as msg2 is fake error
        assert.strictEqual(handle, "msg1");
      };
      let callback = async event => {
        switch (seq) {
          case 2:
            assert.strictEqual(event.title, "plop");
            return;
          case 4:
            // Simulate error in callback
            throw Error();
        }
      };
      queue.consume(callback);
    });
    assert.deepStrictEqual(failedIterations, [1, 0]);
  }

  @test
  async parallelized() {
    let op = 0;
    const run = async (parallel: boolean) => {
      await new Promise(resolve => {
        let queue: Queue = new MemoryQueue(undefined, undefined, { workerParallelism: parallel });
        // @ts-ignore
        queue.delayer = () => 1;
        let seq = 0;
        // @ts-ignore
        queue._webda = <any>{
          log: () => {}
        };
        queue.receiveMessage = () => {
          seq++;
          switch (seq) {
            case 1:
              return Promise.resolve([
                {
                  ReceiptHandle: "msg1",
                  Body: '{"title":"plop"}'
                },
                {
                  ReceiptHandle: "msg2",
                  Body: '{"title":"plop2"}'
                }
              ]);
            case 2:
              resolve(queue.stop());
          }
        };
        queue.deleteMessage = async handle => {};
        let callback = async event => {
          if (event.title === "plop") {
            await this.sleep(300);
            op = 1;
          } else {
            await this.sleep(100);
            op *= 2;
          }
        };
        queue.consume(callback);
      });
    };
    await run(true);
    assert.strictEqual(op, 1, 'It should have been run in parallel so op=0 as *2 will happen before =1"');
    await run(false);
    assert.strictEqual(op, 2, 'It should have been run in parallel so op=2 as *2 will happen after =1"');
  }

  @test
  async basic() {
    let queue: MemoryQueue = <MemoryQueue>this.getService("memoryqueue");
    // For coverage
    assert.strictEqual(queue.getParameters().expire, 1000, "1s should be convert to ms");
    queue.getParameters().expire = undefined;
    await queue.reinit({});
    assert.strictEqual(queue.getParameters().expire, 30000, "default should be 30s");
    queue.getParameters().expire = 1000;
    queue.__clean();
    assert.strictEqual((await queue.receiveMessage()).length, 0);
    return this.simple(queue);
  }
}
