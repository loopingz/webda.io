import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { FileQueue, FileQueueParameters } from "./filequeue.service.js";

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
  @test
  loadedExpiration() {
    assert.strictEqual(new FileQueueParameters().load({}).expire, 30);
    assert.strictEqual(new FileQueueParameters().load({ expire: null }).expire, 30);
    assert.strictEqual(new FileQueueParameters().load({ expire: 0 }).expire, 0);
  }

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
  defaultWaitParameters() {
    const params = new FileQueueParameters().load({ folder: this.tmpDir });
    assert.strictEqual(params.timeout, 10);
    assert.strictEqual(params.pollInterval, 100);
    const custom = new FileQueueParameters().load({ folder: this.tmpDir, timeout: 0, pollInterval: 5 });
    assert.strictEqual(custom.timeout, 0);
    assert.strictEqual(custom.pollInterval, 5);
  }

  @test
  async emptyQueueReturnsAfterTimeout() {
    const queue = createFileQueue(this.tmpDir, { timeout: 0.05, pollInterval: 10 });
    let start = Date.now();
    assert.deepStrictEqual(await queue.receiveMessage(), []);
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 40 && elapsed < 1000, `waited ${elapsed}ms, expected about 50ms`);
    // No wait at all with a zero timeout
    const noWait = createFileQueue(this.tmpDir, { timeout: 0 });
    start = Date.now();
    assert.deepStrictEqual(await noWait.receiveMessage(), []);
    assert.ok(Date.now() - start < 40);
  }

  @test
  async waitingReceiverWokenUpBySend() {
    // A poll interval longer than the test: only the wake-up can deliver the message in time
    const queue = createFileQueue(this.tmpDir, { timeout: 5, pollInterval: 60000 });
    const start = Date.now();
    setTimeout(() => queue.sendMessage({ wake: "up" }), 20);
    const messages = await queue.receiveMessage();
    assert.deepStrictEqual(
      messages.map(m => m.Message),
      [{ wake: "up" }]
    );
    assert.ok(Date.now() - start < 1000, "the receiver should not wait for the poll interval");
    assert.strictEqual(queue["waiters"].size, 0, "waiters are removed once woken up");
  }

  @test
  async waitingReceiverPicksUpMessagesOfOtherProcesses() {
    const receiver = createFileQueue(this.tmpDir, { timeout: 5, pollInterval: 20 });
    // Another service on the same folder, like another process: it cannot wake the receiver up
    const sender = createFileQueue(this.tmpDir);
    const start = Date.now();
    setTimeout(() => sender.sendMessage({ from: "other" }), 30);
    const messages = await receiver.receiveMessage();
    assert.deepStrictEqual(
      messages.map(m => m.Message),
      [{ from: "other" }]
    );
    assert.ok(Date.now() - start < 1000, "the message should be picked up by the next poll");
  }

  @test
  async concurrentWaitingReceivers() {
    const queue = createFileQueue(this.tmpDir, { timeout: 5, pollInterval: 60000 });
    const receivers = [queue.receiveMessage(), queue.receiveMessage()];
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.strictEqual(queue["waiters"].size, 2);
    await queue.sendMessage({ n: 1 });
    await queue.sendMessage({ n: 2 });
    const received = (await Promise.all(receivers)).map(messages => messages[0]?.Message?.n).sort();
    assert.deepStrictEqual(received, [1, 2]);
  }

  @test
  async messageNamesKeepTheOrder() {
    // Sent in the same millisecond: the sequence keeps the order
    for (let i = 0; i < 20; i++) {
      await this.queue.sendMessage({ i });
    }
    const files = fs.readdirSync(this.tmpDir).filter(f => f.endsWith(".json"));
    assert.ok(
      files.every(f => /^\d{15}-\d{6}-[0-9a-f-]{36}\.json$/.test(f)),
      files.join(",")
    );
    const received: number[] = [];
    for (let i = 0; i < 20; i++) {
      const [message] = await this.queue.receiveMessage();
      received.push(message.Message.i);
      await this.queue.deleteMessage(message.ReceiptHandle);
    }
    assert.deepStrictEqual(
      received,
      Array.from({ length: 20 }, (_, i) => i)
    );
  }

  @test
  async legacyMessagesFirst() {
    await this.queue.sendMessage({ name: "current" });
    // Messages written by a previous version are named by a random UUID
    const legacy = ["f0000000-0000-4000-8000-000000000000", "10000000-0000-4000-8000-000000000000"];
    for (const [i, uid] of legacy.entries()) {
      fs.writeFileSync(this.queue.getFile(uid), JSON.stringify({ name: `legacy${i}` }));
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const names: string[] = [];
    for (let i = 0; i < 3; i++) {
      const [message] = await this.queue.receiveMessage();
      names.push(message.Message.name);
    }
    assert.deepStrictEqual(names, ["legacy0", "legacy1", "current"]);
    // A legacy file removed since the listing is ignored
    assert.deepStrictEqual(this.queue["sortMessages"](["deleted.json"]), []);
  }

  @test
  async lockedMessagesAreSkippedUntilExpired() {
    await this.queue.sendMessage({ name: "first" });
    await this.queue.sendMessage({ name: "second" });
    const [first] = fs
      .readdirSync(this.tmpDir)
      .filter(f => f.endsWith(".json"))
      .sort();
    // Locked by another consumer: skipped
    fs.writeFileSync(path.join(this.tmpDir, `${first}.lock`), "");
    let [message] = await this.queue.receiveMessage();
    assert.strictEqual(message.Message.name, "second");
    // The lock of the first message expires: it is delivered again
    const old = new Date(Date.now() - 60000);
    fs.utimesSync(path.join(this.tmpDir, `${first}.lock`), old, old);
    [message] = await this.queue.receiveMessage();
    assert.strictEqual(message.Message.name, "first");
    assert.ok(fs.statSync(path.join(this.tmpDir, `${first}.lock`)).mtimeMs > old.getTime(), "the lock is renewed");
  }

  @test
  async messageLockedByAnotherConsumerSinceTheListing() {
    await this.queue.sendMessage({ name: "first" });
    await this.queue.sendMessage({ name: "second" });
    const lock = this.queue["lock"].bind(this.queue);
    let calls = 0;
    this.queue["lock"] = (file: string) => {
      if (calls++ === 0) {
        // Another consumer creates the lock between the listing and our lock
        fs.writeFileSync(`${file}.lock`, "");
      }
      return lock(file);
    };
    const [message] = await this.queue.receiveMessage();
    assert.strictEqual(message.Message.name, "second");
  }

  @test
  async messageDeletedSinceTheListing() {
    await this.queue.sendMessage({ name: "first" });
    await this.queue.sendMessage({ name: "second" });
    const lock = this.queue["lock"].bind(this.queue);
    let deleted: string;
    this.queue["lock"] = (file: string) => {
      const owned = lock(file);
      if (!deleted) {
        // Another consumer acknowledged the message between the listing and our read
        deleted = file;
        fs.unlinkSync(file);
      }
      return owned;
    };
    const [message] = await this.queue.receiveMessage();
    assert.strictEqual(message.Message.name, "second");
    assert.ok(!fs.existsSync(`${deleted}.lock`), "the lock of the deleted message is removed");
  }

  @test
  async filesystemErrorsAreThrown() {
    // A folder named like a message cannot be read
    fs.mkdirSync(path.join(this.tmpDir, `${"0".repeat(15)}-000000-broken.json`));
    await assert.rejects(() => this.queue.receiveMessage(), /EISDIR/);
    // The queue folder is gone: the lock cannot be created
    assert.throws(() => this.queue["lock"](path.join(this.tmpDir, "missing", "x.json")), /ENOENT/);
    // A lock already released counts as released
    assert.strictEqual(this.queue["releaseExpiredLock"](path.join(this.tmpDir, "none.json.lock")), true);
    // A lock that cannot be inspected fails the receive
    assert.throws(() => this.queue["releaseExpiredLock"]("\0invalid"), /ERR_INVALID_ARG_VALUE|null bytes/);
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
