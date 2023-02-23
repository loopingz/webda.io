import { suite, test } from "@testdeck/mocha";
import { QueueTest } from "@webda/core/lib/queues/queue.spec";
import * as assert from "assert";
import * as fs from "fs";
import { unlinkSync } from "fs";
import { emptyDirSync } from "fs-extra";
import { FileQueue } from "./filequeue";

@suite
class FileQueueTest extends QueueTest {
  @test
  async basic() {
    let queue: FileQueue = <FileQueue>this.getService("FileQueue");
    await queue.__clean();
    await this.simple(queue);
  }

  @test
  async lock() {
    let queue: FileQueue = <FileQueue>this.getService("FileQueue");
    await queue.__clean();
    await queue.sendMessage({ test: "plop" });
    let msg = await queue.receiveMessage();
    let msg2 = await queue.receiveMessage();
    assert.strictEqual(msg.length, 1);
    assert.strictEqual(msg2.length, 0);
    await this.sleep(1000);
    await queue.sendMessage({ test: "plop2" });
    msg2 = await queue.receiveMessage();
    assert.strictEqual(msg2.length, 1);
    assert.deepStrictEqual(msg2[0], msg[0]);
    unlinkSync(`${queue.getParameters().folder}/${msg[0].ReceiptHandle}.json.lock`);
    await queue.deleteMessage(msg[0].ReceiptHandle);
    msg2 = await queue.receiveMessage();
    unlinkSync(`${queue.getParameters().folder}/${msg2[0].ReceiptHandle}.json`);
    await queue.deleteMessage(msg2[0].ReceiptHandle);
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
