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
  seq: number;
  resolve: (value: unknown) => void;
  queue: Queue;
  failedIterations: any[];
  workerPromise: CancelablePromise<void>;

  async receiveMessage<K>(proto?: { new (): K }) {
    this.seq++;
    switch (this.seq) {
      case 1:
        // Test the resume if no messages available
        return [];
      case 2:
        return [
          {
            ReceiptHandle: "msg1",
            Message: this.queue.unserialize(JSON.stringify({ title: "plop" }), proto)
          }
        ];
      case 3:
        throw Error();
      case 4:
        // An error occured it should double the pause
        // @ts-ignore
        this.failedIterations.push(this.queue.failedIterations);
        return Promise.resolve([
          {
            ReceiptHandle: "msg2",
            Message: this.queue.unserialize(JSON.stringify({ title: "plop2" }), proto)
          }
        ]);
      case 5:
        // Error on callback dont generate a double delay
        // @ts-ignore
        this.failedIterations.push(this.queue.failedIterations);
        this.resolve(this.workerPromise.cancel());
    }
  }

  async receiveMessageParallelism<K>(proto?: { new (): K }) {
    this.seq++;
    switch (this.seq) {
      case 1:
        return Promise.resolve([
          {
            ReceiptHandle: "msg1",
            Message: { title: "plop" }
          },
          {
            ReceiptHandle: "msg2",
            Message: { title: "plop2" }
          }
        ]);
      case 2:
        this.resolve(this.workerPromise.cancel());
    }
  }

  @test
  async worker() {
    this.failedIterations = [];
    await new Promise(resolve => {
      this.resolve = resolve;
      let queue: Queue = new MemoryQueue(undefined, undefined, {
        workerParallelism: false
      });
      this.queue = queue;
      // @ts-ignore
      queue.delayer = () => 1;
      this.seq = 0;
      // @ts-ignore
      queue._webda = <any>{
        log: () => {}
      };
      queue.receiveMessage = this.receiveMessage.bind(this);
      queue.deleteMessage = async handle => {
        // Should only have the msg1 handle in deleteMessage as msg2 is fake error
        assert.strictEqual(handle, "msg1");
      };
      let callback = async event => {
        switch (this.seq) {
          case 2:
            assert.strictEqual(event.title, "plop");
            return;
          case 4:
            // Simulate error in callback
            throw Error();
        }
      };
      this.workerPromise = queue.consume(callback, Title);
    });
    assert.deepStrictEqual(this.failedIterations, [1, 0]);
  }

  @test
  async parallelized() {
    let op = 0;
    const run = async (parallel: boolean) => {
      await new Promise(resolve => {
        let queue: Queue = new MemoryQueue(undefined, undefined, { workerParallelism: parallel });
        this.queue = queue;
        this.resolve = resolve;
        // @ts-ignore
        queue.delayer = () => 1;
        this.seq = 0;
        // @ts-ignore
        queue._webda = <any>{
          log: () => {}
        };
        queue.receiveMessage = this.receiveMessageParallelism.bind(this);
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
        this.workerPromise = queue.consume(callback);
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
}
