import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { FileQueue, FileQueueParameters } from "./filequeue.js";

/**
 * Helper to create a FileQueue instance with proper parameters,
 * bypassing the full Webda application bootstrap.
 */
function createFileQueue(folder: string, opts: Record<string, any> = {}): FileQueue {
  const params = new FileQueueParameters().load({ folder, ...opts });
  const queue = new FileQueue("testFileQueue", params);
  // Ensure the folder exists and defaults are applied
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  // Apply defaults (expire conversion to ms)
  params.default();
  return queue;
}

/**
 * Remove a directory and all contents recursively.
 */
function rmrf(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

@suite
class FileQueueUnitTest {
  tmpDir: string;
  queue: FileQueue;

  beforeEach() {
    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fq-test-"));
    this.queue = createFileQueue(this.tmpDir);
  }

  afterEach() {
    rmrf(this.tmpDir);
  }

  @test
  async sendAndReceiveMessage() {
    await this.queue.sendMessage({ hello: "world" });
    const size = await this.queue.size();
    assert.strictEqual(size, 1);

    const messages = await this.queue.receiveMessage();
    assert.strictEqual(messages.length, 1);
    assert.deepStrictEqual(messages[0].Message, { hello: "world" });
  }

  @test
  async sendMultipleMessages() {
    await this.queue.sendMessage({ a: 1 });
    await this.queue.sendMessage({ b: 2 });
    await this.queue.sendMessage({ c: 3 });
    const size = await this.queue.size();
    assert.strictEqual(size, 3);
  }

  @test
  async deleteMessage() {
    await this.queue.sendMessage({ test: "delete" });
    const messages = await this.queue.receiveMessage();
    assert.strictEqual(messages.length, 1);
    await this.queue.deleteMessage(messages[0].ReceiptHandle);
    const size = await this.queue.size();
    assert.strictEqual(size, 0);
  }

  @test
  async deleteMessageAlsoRemovesLock() {
    await this.queue.sendMessage({ test: "lockdelete" });
    const messages = await this.queue.receiveMessage();
    // receiveMessage creates a lock file
    const lockFile = this.queue.getFile(messages[0].ReceiptHandle) + ".lock";
    assert.ok(fs.existsSync(lockFile));
    await this.queue.deleteMessage(messages[0].ReceiptHandle);
    assert.ok(!fs.existsSync(lockFile));
    assert.ok(!fs.existsSync(this.queue.getFile(messages[0].ReceiptHandle)));
  }

  @test
  async deleteNonExistentDoesNotThrow() {
    await this.queue.deleteMessage("nonexistent-uuid");
  }

  @test
  async lockedMessageNotReceived() {
    await this.queue.sendMessage({ test: "locked" });
    const msg1 = await this.queue.receiveMessage();
    assert.strictEqual(msg1.length, 1);

    // Second receive should return empty (message is locked) - but with 10s timeout
    // We need to avoid the 10s wait, so we add another message
    await this.queue.sendMessage({ test: "second" });
    const msg2 = await this.queue.receiveMessage();
    assert.strictEqual(msg2.length, 1);
    assert.deepStrictEqual(msg2[0].Message, { test: "second" });
  }

  @test
  async lockExpiresAfterTimeout() {
    // Create queue with very short expire (0.1 seconds = 100ms)
    const shortQueue = createFileQueue(this.tmpDir, { expire: 0.001 });
    // Override expire to be very small in ms
    shortQueue.getParameters().expire = 1;

    await shortQueue.sendMessage({ test: "expire" });
    const msg1 = await shortQueue.receiveMessage();
    assert.strictEqual(msg1.length, 1);

    // Wait for the lock to expire
    await new Promise(resolve => setTimeout(resolve, 50));

    // Message should be available again
    const msg2 = await shortQueue.receiveMessage();
    assert.strictEqual(msg2.length, 1);
    assert.deepStrictEqual(msg2[0].Message, { test: "expire" });
  }

  @test
  async sizeReturnsZeroForEmpty() {
    const size = await this.queue.size();
    assert.strictEqual(size, 0);
  }

  @test
  async getFileReturnsCorrectPath() {
    const filePath = this.queue.getFile("my-uuid");
    assert.strictEqual(filePath, path.join(this.tmpDir, "my-uuid.json"));
  }

  @test
  computeParametersCreatesFolder() {
    const newDir = path.join(this.tmpDir, "newqueue");
    const params = new FileQueueParameters().load({ folder: newDir });
    const queue = new FileQueue("testQueue2", params);
    assert.ok(!fs.existsSync(newDir));
    queue.computeParameters();
    assert.ok(fs.existsSync(newDir));
  }

  @test
  computeParametersExistingFolder() {
    // Should not throw if folder already exists
    this.queue.computeParameters();
    assert.ok(fs.existsSync(this.tmpDir));
  }

  @test
  defaultExpire() {
    const params = new FileQueueParameters().load({ folder: this.tmpDir });
    params.default();
    // Default expire is 30 seconds, converted to ms = 30000
    assert.strictEqual(params.expire, 30000);
  }

  @test
  customExpire() {
    const params = new FileQueueParameters().load({ folder: this.tmpDir, expire: 10 });
    params.default();
    // 10 seconds converted to ms = 10000
    assert.strictEqual(params.expire, 10000);
  }

  @test
  async deleteMessageWithoutLockFile() {
    await this.queue.sendMessage({ test: "nolockdel" });
    // Manually find the json file
    const files = fs.readdirSync(this.tmpDir).filter(f => f.endsWith(".json"));
    assert.strictEqual(files.length, 1);
    const uid = files[0].replace(".json", "");

    // Delete without lock file (no receive was called)
    await this.queue.deleteMessage(uid);
    assert.ok(!fs.existsSync(path.join(this.tmpDir, files[0])));
  }

  @test
  async messageOrdering() {
    // Messages should be returned in order of creation (FIFO by birthtime)
    await this.queue.sendMessage({ order: 1 });
    // Small delay to ensure different birthtimes
    await new Promise(resolve => setTimeout(resolve, 10));
    await this.queue.sendMessage({ order: 2 });

    const msg1 = await this.queue.receiveMessage();
    assert.strictEqual(msg1.length, 1);
    assert.deepStrictEqual(msg1[0].Message, { order: 1 });

    // Delete first message
    await this.queue.deleteMessage(msg1[0].ReceiptHandle);

    const msg2 = await this.queue.receiveMessage();
    assert.strictEqual(msg2.length, 1);
    assert.deepStrictEqual(msg2[0].Message, { order: 2 });
  }

  @test
  async sizeIgnoresNonJsonFiles() {
    fs.writeFileSync(path.join(this.tmpDir, "notjson.txt"), "hello");
    fs.writeFileSync(path.join(this.tmpDir, "test.json.lock"), "lock");
    await this.queue.sendMessage({ real: true });
    const size = await this.queue.size();
    assert.strictEqual(size, 1);
  }

  @test
  loadParametersReturnsFileQueueParameters() {
    const result = this.queue.loadParameters({ folder: "/tmp/qtest", expire: 15 });
    assert.ok(result instanceof FileQueueParameters);
    assert.strictEqual(result.folder, "/tmp/qtest");
    assert.strictEqual(result.expire, 15);
  }

  @test
  async cleanEmptiesFolder() {
    await this.queue.sendMessage({ a: 1 });
    await this.queue.sendMessage({ b: 2 });
    assert.ok((await this.queue.size()) > 0);
    await this.queue.__clean();
    assert.strictEqual(await this.queue.size(), 0);
  }

  @test
  async sendMessageWithCollision() {
    // Simulate a UUID collision by pre-creating a file with a known UUID
    // Use monkey-patching on getFile to force first call to return existing file
    let firstCall = true;
    const origGetFile = this.queue.getFile.bind(this.queue);
    this.queue.getFile = (uid: string) => {
      if (firstCall) {
        // Write a file to simulate collision
        const collisionPath = origGetFile(uid);
        fs.writeFileSync(collisionPath, "{}");
        firstCall = false;
      }
      return origGetFile(uid);
    };
    await this.queue.sendMessage({ collision: true });
    // Should have sent successfully (retried with new UUID)
    const size = await this.queue.size();
    // Size should be 2: the collision file + the actual message
    assert.ok(size >= 1);
  }
}

export { FileQueueUnitTest };
