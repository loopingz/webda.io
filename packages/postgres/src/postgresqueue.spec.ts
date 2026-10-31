import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import pg from "pg";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { PostgresQueueService, PostgresQueueParameters } from "./postgresqueue.service.js";

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

/**
 * Wait for `predicate()` to return true, polling every 10ms for up to `timeoutMs`
 * @param predicate - condition to wait for
 * @param timeoutMs - maximum total wait
 */
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error("Timed out waiting for condition");
}

/**
 * Idle delays long enough to make any message received through polling arrive seconds late
 */
const SLOW_POLLING = { idleDelayer: { type: "linear", interval: 5000 }, maxIdleDelay: 5000 } as any;

/**
 * Extends WebdaApplicationTest for the Core context `resolve()` and `consume()` need (delayers, metrics)
 */
@suite
class PostgresQueueTest extends WebdaApplicationTest {
  queues: PostgresQueueService[] = [];
  /**
   * Undo the spies installed by {@link countReceives}
   */
  restores: (() => void)[] = [];

  async afterEach() {
    for (const restore of this.restores) restore();
    this.restores = [];
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
  async makeQueue(
    name: string,
    table: string,
    overrides: Partial<PostgresQueueParameters> = {}
  ): Promise<PostgresQueueService> {
    const p = new PostgresQueueParameters().load({ ...params, table, batchSize: 5, ...overrides });
    const service = await this.registerService(new PostgresQueueService(name, p)).resolve().init();
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

  /**
   * Count the receive queries (`UPDATE … SKIP LOCKED`) sent by a queue
   * @param q - the queue
   * @returns a function returning the count so far
   */
  countReceives(q: PostgresQueueService): () => number {
    const client: any = (q as any).client;
    const query = client.query;
    let count = 0;
    client.query = function countedQuery(this: any, ...args: any[]) {
      if (typeof args[0] === "string" && args[0].includes("SKIP LOCKED")) count++;
      return query.apply(this, args);
    };
    this.restores.push(() => {
      client.query = query;
    });
    return () => count;
  }

  @test
  async consumeIsWokenUpByNotify() {
    // Polling would wait 5s after an empty receive: only the NOTIFY can deliver the message quickly
    const q = await this.makeQueue("q", "webda_test_q_notify", SLOW_POLLING);
    await q.__clean();
    const received: number[] = [];
    const consumer = q.consume(async (msg: any) => {
      received.push(Date.now() - msg.sentAt);
    });
    try {
      await new Promise(r => setTimeout(r, 300));
      await q.sendMessage({ sentAt: Date.now() });
      await waitFor(() => received.length === 1, 1000);
      assert.ok(received[0] < 500, `received after ${received[0]}ms`);
      // Again after the first message
      await new Promise(r => setTimeout(r, 300));
      await q.sendMessage({ sentAt: Date.now() });
      await waitFor(() => received.length === 2, 1000);
    } finally {
      await consumer.cancel();
      await consumer;
    }
  }

  @test
  async idleConsumerDoesNotPoll() {
    const q = await this.makeQueue("q", "webda_test_q_idle");
    await q.__clean();
    const receives = this.countReceives(q);
    const consumer = q.consume(async () => {});
    try {
      await new Promise(r => setTimeout(r, 1500));
      // The default polling would run about 8 receives in 1.5s
      assert.ok(receives() <= 2, `${receives()} receives while idle`);
    } finally {
      await consumer.cancel();
      await consumer;
    }
  }

  @test
  async cancelInterruptsTheWait() {
    const q = await this.makeQueue("q", "webda_test_q_cancel", { waitTimeout: 20 });
    await q.__clean();
    const consumer = q.consume(async () => {});
    await new Promise(r => setTimeout(r, 300));
    const start = Date.now();
    await consumer.cancel();
    await consumer;
    assert.ok(Date.now() - start < 1000, `cancel took ${Date.now() - start}ms`);
    // The queue is still usable directly, without waiting
    await q.sendMessage({ after: "cancel" });
    assert.strictEqual((await q.receiveMessage()).length, 1);
  }

  @test
  async receiveMessageDoesNotWaitOutsideConsume() {
    const q = await this.makeQueue("q", "webda_test_q_direct", { waitTimeout: 20 });
    await q.__clean();
    const start = Date.now();
    assert.deepStrictEqual(await q.receiveMessage(), []);
    assert.ok(Date.now() - start < 1000);
  }

  @test
  async expiredLocksAreRedeliveredWhileConsuming() {
    // A failed message is not deleted: it is received again once its lock expired, without any NOTIFY.
    // The wait for a notification is capped by the visibility timeout.
    const q = await this.makeQueue("q", "webda_test_q_expired", { visibilityTimeout: 1, waitTimeout: 20 });
    await q.__clean();
    const attempts: number[] = [];
    const consumer = q.consume(async () => {
      attempts.push(Date.now());
      if (attempts.length === 1) throw new Error("induced failure");
    });
    try {
      await q.sendMessage({ fail: "once" });
      await waitFor(() => attempts.length === 2, 4000);
      const gap = attempts[1] - attempts[0];
      assert.ok(gap >= 900 && gap < 3000, `redelivered after ${gap}ms`);
    } finally {
      await consumer.cancel();
      await consumer;
    }
  }

  @test
  async notifyDisabledFallsBackToPolling() {
    const q = await this.makeQueue("q", "webda_test_q_polling", { notify: false, maxIdleDelay: 100 });
    await q.__clean();
    const listener = new pg.Client(params.postgresqlServer);
    await listener.connect();
    const notifications: string[] = [];
    listener.on("notification", msg => notifications.push(msg.channel));
    await listener.query("LISTEN webda_test_q_polling");
    const received: any[] = [];
    const consumer = q.consume(async msg => {
      received.push(msg);
    });
    try {
      await new Promise(r => setTimeout(r, 300));
      await q.sendMessage({ polled: true });
      await waitFor(() => received.length === 1, 2000);
      assert.deepStrictEqual(notifications, []);
      assert.strictEqual((q as any).listener, undefined);
    } finally {
      await consumer.cancel();
      await consumer;
      await listener.end();
    }
  }

  @test
  async listenerReconnects() {
    const q = await this.makeQueue("q", "webda_test_q_reconnect", { reconnectDelay: 100 });
    await q.__clean();
    const receives = this.countReceives(q);
    const received: any[] = [];
    const consumer = q.consume(async msg => {
      received.push(msg);
    });
    try {
      await waitFor(() => (q as any).listener?.connected, 2000);
      const pid = (q as any).listener.client.processID;
      await (q as any).client.query("SELECT pg_terminate_backend($1)", [pid]);
      // Sent while the listener is down or reconnecting: received by polling or after the reconnection
      await q.sendMessage({ n: 1 });
      await waitFor(() => received.length === 1, 2000);
      await waitFor(() => (q as any).listener?.connected && (q as any).listener.client.processID !== pid, 2000);
      await new Promise(r => setTimeout(r, 100));
      // Back to waiting for notifications: no more polling
      const before = receives();
      await new Promise(r => setTimeout(r, 1000));
      assert.ok(receives() - before <= 1, `${receives() - before} receives in 1s after the reconnection`);
      await q.sendMessage({ n: 2 });
      await waitFor(() => received.length === 2, 1000);
    } finally {
      await consumer.cancel();
      await consumer;
    }
  }
}
