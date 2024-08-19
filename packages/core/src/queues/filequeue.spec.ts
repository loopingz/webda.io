import { suite, test, only } from "@testdeck/mocha";
import * as assert from "assert";
import * as fs from "fs";
import { unlinkSync } from "fs";
import { emptyDirSync } from "fs-extra";
import { FileQueue } from "./filequeue";
import { QueueTest } from "./queue.spec";

@suite
class FileQueueTest extends QueueTest {
  queue: FileQueue;

  async before() {
    await super.before();
    this.queue = await this.addService(FileQueue, {
      expire: 1,
      folder: "./test/data/queue"
    });
  }

  @test
  async basic() {
    await this.queue.__clean();
    await this.simple(this.queue);
  }

  @test
  async lock() {
    let queue: FileQueue = <FileQueue>this.getService("FileQueue");
    await queue.__clean();

    // Try to receive one message only
    await queue.sendMessage({ test: "plop" });
    let msg = await queue.receiveMessage();
    let msg2 = await queue.receiveMessage();
    assert.strictEqual(msg.length, 1);

    // Check if there is no more message left
    assert.strictEqual(msg2.length, 0);

    // Wait for the lock to expire, as it is set at 1 second in config file
    await this.sleep(1000);

    await queue.sendMessage({ test: "plop2" });
    msg2 = await queue.receiveMessage();
    assert.strictEqual(msg2.length, 1);
    assert.deepStrictEqual(msg2[0], msg[0]);

    // Check if the deletion is not crashing even if the lock file is removed
    unlinkSync(`${queue.getParameters().folder}/${msg[0].ReceiptHandle}.json.lock`);
    await queue.deleteMessage(msg[0].ReceiptHandle);
    msg2 = await queue.receiveMessage();

    // Check if the deletion is not crashing even if the content file is removed
    unlinkSync(`${queue.getParameters().folder}/${msg2[0].ReceiptHandle}.json`);
    await queue.deleteMessage(msg2[0].ReceiptHandle);

    // Check if default parameter is correctly set
    queue = new FileQueue(this.webda, "q", {});
    assert.strictEqual(queue.getParameters().expire, 30000);
  }

  @test
  async sendMessage() {
    let queue: FileQueue = <FileQueue>this.getService("FileQueue");
    let firstCall = true;
    queue.getFile = (uid: string) => {
      if (firstCall) {
        fs.writeFileSync(`${queue.getParameters().folder}/${uid}.json`, "{}");
        firstCall = false;
      }
      return `${queue.getParameters().folder}/${uid}.json`;
    };
    await queue.sendMessage({ plop: "test" });
    emptyDirSync(queue.getParameters().folder);
    fs.rmdirSync(queue.getParameters().folder);
    assert.ok(!fs.existsSync(queue.getParameters().folder));
    queue.computeParameters();
    assert.ok(fs.existsSync(queue.getParameters().folder));
    queue.computeParameters();
  }
}
