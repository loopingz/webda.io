import { WebdaApplicationTest } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __resetDatabases } from "./dbregistry.js";
import { SQLiteQueueParameters, SQLiteQueueService } from "./sqlitequeue.service.js";

@suite
class SQLiteQueueTest extends WebdaApplicationTest {
  queues: SQLiteQueueService[] = [];
  dir = mkdtempSync(join(tmpdir(), "webda-sqlite-queue-"));

  async afterEach() {
    for (const q of this.queues) {
      await q.stop();
    }
    this.queues = [];
    __resetDatabases();
    await super.afterEach();
  }

  async afterAll() {
    rmSync(this.dir, { recursive: true, force: true });
    await super.afterAll();
  }

  /**
   * @param name - service name
   * @param overrides - parameter overrides
   * @returns the initialized queue
   */
  async makeQueue(name: string, overrides: Partial<SQLiteQueueParameters> = {}): Promise<SQLiteQueueService> {
    const service = new SQLiteQueueService(
      name,
      new SQLiteQueueParameters().load({ batchSize: 5, waitTime: 0, ...overrides })
    );
    this.registerService(service as any, name);
    await service.resolve().init();
    this.queues.push(service);
    return service;
  }

  @test
  async sendAndReceiveSingleMessage() {
    const q = await this.makeQueue("q");
    await q.sendMessage({ hello: "world" });
    assert.strictEqual(await q.size(), 1);
    const msgs = await q.receiveMessage();
    assert.strictEqual(msgs.length, 1);
    assert.deepStrictEqual(msgs[0].Message, { hello: "world" });
    assert.ok(msgs[0].ReceiptHandle);
  }

  @test
  async deleteMessageRemovesFromQueue() {
    const q = await this.makeQueue("q");
    await q.sendMessage({ id: 1 });
    const [msg] = await q.receiveMessage();
    await q.deleteMessage(msg.ReceiptHandle);
    assert.strictEqual(await q.size(), 0);
    await q.deleteMessage(msg.ReceiptHandle);
  }

  @test
  async receiveBatchRespectsBatchSizeAndFifo() {
    const q = await this.makeQueue("q");
    for (let i = 0; i < 12; i++) await q.sendMessage({ i });
    const b1 = await q.receiveMessage();
    assert.deepStrictEqual(
      b1.map(m => (m.Message as any).i),
      [0, 1, 2, 3, 4]
    );
    assert.strictEqual((await q.receiveMessage()).length, 5);
    assert.strictEqual((await q.receiveMessage()).length, 2);
  }

  @test
  async twoConnectionsNeverReceiveTheSameMessage() {
    const path = join(this.dir, "q.sqlite");
    const a = await this.makeQueue("a", { persistence: { path }, database: { name: "conn-a" } });
    const b = await this.makeQueue("b", { persistence: { path }, database: { name: "conn-b" } });
    assert.notStrictEqual((a as any).handle, (b as any).handle, "two real connections");
    for (let i = 0; i < 10; i++) await a.sendMessage({ i });
    const [ra, rb] = await Promise.all([a.receiveMessage(), b.receiveMessage()]);
    const ids = new Set([...ra, ...rb].map(m => m.ReceiptHandle));
    assert.strictEqual(ids.size, 10);
    assert.strictEqual(ra.length + rb.length, 10);
  }

  @test
  async lockedMessageIsInvisibleUntilTimeout() {
    const q = await this.makeQueue("q", { visibilityTimeout: 1 });
    let now = Date.now();
    (q as any).now = () => now;
    await q.sendMessage({ k: "v" });
    assert.strictEqual((await q.receiveMessage()).length, 1);
    assert.strictEqual((await q.receiveMessage()).length, 0);
    assert.strictEqual(await q.size(), 0);
    now += 1001;
    assert.strictEqual((await q.receiveMessage()).length, 1);
  }

  @test
  async eventPrototypeRehydratesPayload() {
    class Job {
      task!: string;
      label() {
        return `[${this.task}]`;
      }
    }
    const q = await this.makeQueue("q");
    await q.sendMessage({ task: "build" } as any);
    const msgs = await q.receiveMessage(Job);
    assert.ok(msgs[0].Message instanceof Job);
    assert.strictEqual(msgs[0].Message.label(), "[build]");
  }

  @test
  async consumeEndToEnd() {
    const q = await this.makeQueue("q", { maxConsumers: 4, waitTime: 0.05 });
    const seen: number[] = [];
    for (let i = 0; i < 7; i++) await q.sendMessage({ i });
    const consumer = q.consume(async (msg: any) => {
      seen.push(msg.i);
    });
    const deadline = Date.now() + 5000;
    while (seen.length < 7 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 20));
    }
    consumer.cancel();
    assert.deepStrictEqual(
      seen.sort((x, y) => x - y),
      [0, 1, 2, 3, 4, 5, 6]
    );
    assert.strictEqual(await q.size(), 0);
  }

  @test
  async emptyReceiveWaitsAndIsWokenUpByASend() {
    const q = await this.makeQueue("q", { waitTime: 5 });
    const started = Date.now();
    const pending = q.receiveMessage();
    setTimeout(() => q.sendMessage({ late: true }), 30);
    const msgs = await pending;
    assert.strictEqual(msgs.length, 1);
    assert.ok(Date.now() - started < 4000, "woken up by the send, not by the timeout");
    const idle = await this.makeQueue("idle", { waitTime: 0.05 });
    const before = Date.now();
    assert.strictEqual((await idle.receiveMessage()).length, 0);
    assert.ok(Date.now() - before >= 40, "an empty receive waits for waitTime");
  }

  @test
  async getMaxConsumersDividesByBatchSize() {
    const q = await this.makeQueue("q", { maxConsumers: 20, batchSize: 5 });
    assert.strictEqual(q.getMaxConsumers(), 4);
  }

  @test
  async cleanResetsIds() {
    const q = await this.makeQueue("q");
    await q.sendMessage({});
    assert.strictEqual((await q.receiveMessage())[0].ReceiptHandle, "1");
    await q.__clean();
    await q.sendMessage({});
    assert.strictEqual((await q.receiveMessage())[0].ReceiptHandle, "1");
  }

  @test
  async messagesSurviveRestartInFileMode() {
    const path = join(this.dir, "durable.sqlite");
    const q = await this.makeQueue("q", { persistence: { path } });
    await q.sendMessage({ x: 1 });
    await q.stop();
    await q.init();
    assert.strictEqual(await q.size(), 1);
  }

  @test
  async sendingBeforeInitThrows() {
    const orphan = new SQLiteQueueService("orphan", new SQLiteQueueParameters().load({}));
    await assert.rejects(() => orphan.sendMessage({}), /not connected/);
    assert.strictEqual(await orphan.size(), 0);
    await orphan.__clean();
  }

  @test
  async invalidTableNameIsRejected() {
    const bad = new SQLiteQueueService("bad", new SQLiteQueueParameters().load({ table: "bad-table" }));
    await assert.rejects(() => bad.resolve().init(), /Invalid table name/);
  }
}
