import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { PostgresQueueService, PostgresQueueParameters } from "./postgresqueue.js";

const params = {
  postgresqlServer: {
    host: "localhost",
    user: "webda.io",
    database: "webda.io",
    password: "webda.io",
    statement_timeout: 60000,
    max: 4
  }
};

@suite
class PostgresQueueTest {
  queues: PostgresQueueService[] = [];

  async afterEach() {
    for (const q of this.queues) {
      try {
        await q.__clean();
      } catch {
        /* ignore */
      }
      try {
        await q.stop();
      } catch {
        /* ignore */
      }
    }
    this.queues = [];
  }

  /**
   * Spin up a fresh PostgresQueue peer pointing at the shared table.
   * Visibility timeout defaults to 30s; tests that need a shorter window
   * pass `visibilityTimeout` explicitly.
   * @param name - service name (must be unique within a test)
   * @param table - table override (default: derived from name)
   * @param overrides - extra parameter overrides
   * @returns the initialized service
   */
  async makeQueue(name: string, table: string, overrides: Partial<PostgresQueueParameters> = {}): Promise<PostgresQueueService> {
    const p = new PostgresQueueParameters().load({ ...params, table, batchSize: 5, ...overrides });
    const service = new PostgresQueueService(name, p);
    await service.init();
    this.queues.push(service);
    return service;
  }

  @test
  async sendAndReceiveSingleMessage() {
    const q = await this.makeQueue("q", "webda_test_q_basic");
    await q.__clean();

    await q.sendMessage({ hello: "world" });
    assert.strictEqual(await q.size(), 1);

    const msgs = await q.receiveMessage();
    assert.strictEqual(msgs.length, 1);
    assert.deepStrictEqual(msgs[0].Message, { hello: "world" });
    assert.ok(msgs[0].ReceiptHandle);
  }

  @test
  async deleteMessageRemovesFromQueue() {
    const q = await this.makeQueue("q", "webda_test_q_delete");
    await q.__clean();

    await q.sendMessage({ id: 1 });
    const [msg] = await q.receiveMessage();
    await q.deleteMessage(msg.ReceiptHandle);
    assert.strictEqual(await q.size(), 0);
  }

  @test
  async receiveBatchRespectsBatchSize() {
    const q = await this.makeQueue("q", "webda_test_q_batch");
    await q.__clean();

    for (let i = 0; i < 12; i++) await q.sendMessage({ i });
    // batchSize is 5 in our test fixture
    const batch1 = await q.receiveMessage();
    assert.strictEqual(batch1.length, 5);
    const batch2 = await q.receiveMessage();
    assert.strictEqual(batch2.length, 5);
    const batch3 = await q.receiveMessage();
    assert.strictEqual(batch3.length, 2);
  }

  @test
  async parallelWorkersGetDisjointBatches() {
    // The defining test for SKIP LOCKED: two workers calling
    // receiveMessage at the same time should see different rows.
    const a = await this.makeQueue("a", "webda_test_q_parallel", { batchSize: 5 });
    const b = await this.makeQueue("b", "webda_test_q_parallel", { batchSize: 5 });
    await a.__clean();

    for (let i = 0; i < 10; i++) await a.sendMessage({ i });
    const [resA, resB] = await Promise.all([a.receiveMessage(), b.receiveMessage()]);

    const idsA = new Set(resA.map(m => m.ReceiptHandle));
    const idsB = new Set(resB.map(m => m.ReceiptHandle));
    // Total of 10 distinct messages, each delivered exactly once.
    assert.strictEqual(idsA.size + idsB.size, 10);
    for (const id of idsA) assert.ok(!idsB.has(id), `id ${id} delivered to both workers`);
  }

  @test
  async lockedMessageIsInvisibleUntilTimeout() {
    const q = await this.makeQueue("q", "webda_test_q_lock", { visibilityTimeout: 1 });
    await q.__clean();

    await q.sendMessage({ k: "v" });
    const first = await q.receiveMessage();
    assert.strictEqual(first.length, 1);

    // Immediate retry: locked message is hidden.
    const second = await q.receiveMessage();
    assert.strictEqual(second.length, 0);

    // size() also reflects only visible messages.
    assert.strictEqual(await q.size(), 0);

    // After visibility timeout expires, the message reappears.
    await new Promise(r => setTimeout(r, 1100));
    const third = await q.receiveMessage();
    assert.strictEqual(third.length, 1);
  }

  @test
  async eventPrototypeRehydratesPayload() {
    class Job {
      task!: string;
      label(): string {
        return `[${this.task}]`;
      }
    }
    const q = await this.makeQueue("q", "webda_test_q_proto");
    await q.__clean();

    await q.sendMessage({ task: "build" } as any);
    const msgs = await q.receiveMessage(Job);
    assert.strictEqual(msgs.length, 1);
    assert.ok(msgs[0].Message instanceof Job);
    assert.strictEqual(msgs[0].Message.label(), "[build]");
  }

  @test
  async sizeReturnsPendingCountOnly() {
    const q = await this.makeQueue("q", "webda_test_q_size", { visibilityTimeout: 60 });
    await q.__clean();

    for (let i = 0; i < 4; i++) await q.sendMessage({ i });
    assert.strictEqual(await q.size(), 4);

    await q.receiveMessage(); // locks all 4 (batchSize=5)
    assert.strictEqual(await q.size(), 0);
  }

  @test
  async sendingBeforeConnectThrows() {
    const p = new PostgresQueueParameters().load({ ...params, table: "webda_test_q_disc" });
    const orphan = new PostgresQueueService("orphan", p);
    // Skip init().
    await assert.rejects(() => orphan.sendMessage({}), /not connected/);
  }

  @test
  async invalidTableNameIsRejected() {
    const p = new PostgresQueueParameters().load({ ...params, table: "bad-table-name" });
    const bad = new PostgresQueueService("bad", p);
    await assert.rejects(() => bad.init(), /Invalid table name/);
  }
}
