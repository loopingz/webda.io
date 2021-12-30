import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { CancelablePromise, Queue } from "..";
import { MemoryQueue } from "./memoryqueue";
import { QueueTest } from "./queue.spec";

class Title {
  title: string;

  constructor(title?: string) {
    this.title = title;
  }
}
@suite
class MemoryQueueTest extends QueueTest {
  static seq: number;
  static resolve: (value: unknown) => void;
  static queue: Queue;
  static failedIterations: any[];
  static workerPromise: CancelablePromise<void>;

  async receiveMessage<K>(proto?: { new (): K }) {
    MemoryQueueTest.seq++;
    switch (MemoryQueueTest.seq) {
      case 1:
        // Test the resume if no messages available
        return [];
      case 2:
        return [
          {
            ReceiptHandle: "msg1",
            Message: MemoryQueueTest.queue.unserialize(JSON.stringify({ title: "plop" }), proto)
          }
        ];
      case 3:
        throw Error();
      case 4:
        // An error occured it should double the pause
        // @ts-ignore
        MemoryQueueTest.failedIterations.push(MemoryQueueTest.queue.failedIterations);
        return Promise.resolve([
          {
            ReceiptHandle: "msg2",
            Message: MemoryQueueTest.queue.unserialize(JSON.stringify({ title: "plop2" }), proto)
          }
        ]);
      case 5:
        // Error on callback dont generate a double delay
        // @ts-ignore
        MemoryQueueTest.failedIterations.push(MemoryQueueTest.queue.failedIterations);
        MemoryQueueTest.resolve(MemoryQueueTest.workerPromise.cancel());
        return [];
    }
  }

  async receiveMessageParallelism<K>(proto?: { new (): K }) {
    MemoryQueueTest.seq++;
    switch (MemoryQueueTest.seq) {
      case 1:
        return [
          {
            ReceiptHandle: "msg1",
            Message: { title: "plop" }
          },
          {
            ReceiptHandle: "msg2",
            Message: { title: "plop2" }
          }
        ];
      case 2:
        MemoryQueueTest.resolve(MemoryQueueTest.workerPromise.cancel());
        return [];
    }
  }

  @test
  async worker() {
    MemoryQueueTest.failedIterations = [];
    await new Promise(resolve => {
      MemoryQueueTest.resolve = resolve;
      let queue: Queue = new MemoryQueue(this.webda, "q", {
        workerParallelism: false
      });
      MemoryQueueTest.queue = queue;
      // @ts-ignore
      queue.delayer = () => 1;
      MemoryQueueTest.seq = 0;
      // @ts-ignore
      queue._webda = <any>{
        log: () => {}
      };
      queue.receiveMessage = this.receiveMessage.bind(queue);
      queue.deleteMessage = async handle => {
        // Should only have the msg1 handle in deleteMessage as msg2 is fake error
        assert.strictEqual(handle, "msg1");
      };
      let callback = async event => {
        switch (MemoryQueueTest.seq) {
          case 2:
            assert.strictEqual(event.title, "plop");
            return;
          case 4:
            // Simulate error in callback
            throw Error();
        }
      };
      MemoryQueueTest.workerPromise = queue.consume(callback, Title);
    });
    assert.deepStrictEqual(MemoryQueueTest.failedIterations, [1, 0]);
  }

  @test
  async parallelized() {
    let op = 0;
    const run = async (parallel: boolean) => {
      await new Promise(resolve => {
        let queue: Queue = new MemoryQueue(this.webda, "q", { workerParallelism: parallel });
        MemoryQueueTest.queue = queue;
        MemoryQueueTest.resolve = resolve;
        // @ts-ignore
        queue.delayer = () => 1;
        MemoryQueueTest.seq = 0;
        // @ts-ignore
        queue._webda = <any>{
          log: () => {}
        };
        queue.receiveMessage = this.receiveMessageParallelism.bind(queue);
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
        MemoryQueueTest.workerPromise = queue.consume(callback, undefined);
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
    // Should not have issue with unknown receipt
    queue.deleteMessage("bouzouf");
    assert.strictEqual((await queue.receiveMessage()).length, 0);
    return this.simple(queue);
  }

  @test
  async uuid() {
    let queue: MemoryQueue = <MemoryQueue>this.getService("memoryqueue");
    let first = true;
    let callCount = 0;
    // @ts-ignore
    queue._queue = new Proxy(queue._queue, {
      get: (q, prop) => {
        callCount += 1;
        if (callCount === 1) {
          return "plop";
        }
      }
    });
    await queue.sendMessage({});
    assert.strictEqual(callCount, 2);
  }
}
