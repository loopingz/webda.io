import { MessageReceipt, Queue, QueueParameters } from "@webda/core";
import type { SQLDatabase } from "@webda/sql";
import { JSONUtils } from "@webda/utils";
import type { SQLiteConnectionParameters, SQLitePersistence } from "./connection.js";
import { acquireDatabase, releaseDatabase } from "./dbregistry.js";
import type { SQLiteHandle } from "./dbregistry.js";

/**
 * Configuration for {@link SQLiteQueueService}
 */
export class SQLiteQueueParameters extends QueueParameters implements SQLiteConnectionParameters {
  /**
   * Table backing the queue, created on init
   * @default "webda_queue"
   * @pattern /^[a-zA-Z_][a-zA-Z0-9_]*$/
   */
  table?: string;
  /**
   * Seconds a received but not deleted message stays invisible before being delivered again
   * @default 30
   */
  visibilityTimeout?: number;
  /**
   * Messages per receiveMessage
   * @default 10
   */
  batchSize?: number;
  /**
   * Create the queue table on init
   * @default true
   */
  autoCreateTable?: boolean;
  /**
   * Seconds an empty receiveMessage waits for a message before returning (long polling): a message sent by this
   * process ends the wait at once, one written by another process is seen at the end of it
   * @default 1
   */
  waitTime?: number;
  /**
   * Omitted: in-memory queue, lost on stop(); set: file database, messages survive restarts
   */
  persistence?: SQLitePersistence;
  /**
   * Services giving the same database name share one handle
   */
  database?: SQLDatabase;
  /**
   * PRAGMA busy_timeout in ms
   * @default 5000
   */
  busyTimeout?: number;
  /**
   * Extra PRAGMAs run on open
   */
  pragmas?: Record<string, string | number>;

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.table ??= "webda_queue";
    this.visibilityTimeout ??= 30;
    this.batchSize ??= 10;
    this.autoCreateTable ??= true;
    this.waitTime ??= 1;
    this.busyTimeout ??= 5000;
    return this;
  }
}

/**
 * FIFO queue on a SQLite table: in memory, or a file shared by the processes of one host.
 *
 * A receive locks a batch with one `UPDATE ... RETURNING` (SQLite serializes writers, so no SKIP LOCKED is needed);
 * delete acks, an expired visibility timeout makes the message visible again. Times are computed in JS and bound
 * as parameters. Without `persistence` it is a drop-in alternative to MemoryQueue honoring the visibility timeout.
 *
 * @WebdaModda SQLiteQueue
 */
export default class SQLiteQueueService<T = any, K extends SQLiteQueueParameters = SQLiteQueueParameters> extends Queue<
  T,
  K
> {
  protected handle?: SQLiteHandle;

  /**
   * @returns the validated table name
   */
  protected get table(): string {
    return this.parameters.table!;
  }

  /**
   * @returns the client
   * @throws when the service is not initialized
   */
  protected get client() {
    if (!this.handle) {
      throw new Error("SQLiteQueue not connected");
    }
    return this.handle.client;
  }

  /**
   * Current time in ms, overridable by tests
   * @returns epoch ms
   */
  protected now(): number {
    return Date.now();
  }

  /**
   * @override
   * @returns this service
   */
  async init(): Promise<this> {
    await super.init();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(this.table)) {
      throw new Error(`Invalid table name "${this.table}" — must match /^[a-zA-Z_][a-zA-Z0-9_]*$/`);
    }
    this.handle = await acquireDatabase(this.parameters, this.getName());
    if (this.parameters.autoCreateTable) {
      await this.ensureTable();
    }
    return this;
  }

  /**
   * Create the queue table and the index of the receive query, if they are missing
   */
  protected async ensureTable(): Promise<void> {
    // AUTOINCREMENT: ids are never reused, receipts stay unique
    await this.client.query(
      `CREATE TABLE IF NOT EXISTS ${this.table} (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL CHECK (json_valid(payload)), created_at INTEGER NOT NULL, locked_until INTEGER)`
    );
    await this.client.query(`CREATE INDEX IF NOT EXISTS ${this.table}_visible_idx ON ${this.table} (locked_until, id)`);
  }

  /**
   * @override
   * @param event - the event to enqueue
   */
  async sendMessage(event: T): Promise<void> {
    const client = this.client;
    this.metrics?.messages_sent?.inc();
    await client.query(`INSERT INTO ${this.table} (payload, created_at) VALUES (?1, ?2)`, [
      JSONUtils.stringify(event),
      this.now()
    ]);
    // Wake up the receivers of this process waiting on an empty queue
    this.handle!.events.emit("changed", this.table);
  }

  /**
   * @override
   * @returns count of messages currently visible (pending or expired lock)
   */
  async size(): Promise<number> {
    if (!this.handle) return 0;
    const res = await this.client.query(
      `SELECT COUNT(*) AS count FROM ${this.table} WHERE locked_until IS NULL OR locked_until < ?1`,
      [this.now()]
    );
    return Number(res.rows[0].count);
  }

  /**
   * @override
   * @param proto - optional prototype to rehydrate the payload into
   * @returns the locked batch, oldest first
   */
  async receiveMessage<L>(proto?: { new (): L }): Promise<MessageReceipt<L>[]> {
    let rows = await this.lockBatch();
    if (rows.length === 0 && this.parameters.waitTime! > 0) {
      // The statements are synchronous: without a wait, an idle consumer loop would never yield to the event loop
      await this.waitForMessage(this.parameters.waitTime! * 1000);
      rows = await this.lockBatch();
    }
    return rows.map(row => {
      const payload = JSONUtils.parse(row.payload);
      return {
        ReceiptHandle: String(row.id),
        Message: proto ? Object.assign(new proto() as L & object, payload) : (payload as L)
      };
    });
  }

  /**
   * Lock a batch of visible messages, oldest first
   * @returns the locked rows
   */
  protected async lockBatch(): Promise<{ id: number; payload: string }[]> {
    const client = this.client;
    const now = this.now();
    // One statement, atomic: a single writer at a time, so each row goes to exactly one receiver per window
    const rows = await client.rows(
      `UPDATE ${this.table} SET locked_until = ?1 + ?2 WHERE id IN (SELECT id FROM ${this.table} WHERE locked_until IS NULL OR locked_until < ?1 ORDER BY id LIMIT ?3) RETURNING id, payload`,
      [now, this.parameters.visibilityTimeout! * 1000, this.parameters.batchSize]
    );
    // RETURNING order is unspecified
    return rows.sort((a, b) => Number(a.id) - Number(b.id));
  }

  /**
   * Wait for a message sent by this process, at most `ms`
   * @param ms - the maximum wait
   */
  protected waitForMessage(ms: number): Promise<void> {
    const events = this.handle!.events;
    return new Promise<void>(resolve => {
      const done = () => {
        clearTimeout(timer);
        events.off("changed", onChanged);
        resolve();
      };
      const onChanged = (table: string) => {
        if (table === this.table) done();
      };
      const timer = setTimeout(done, ms);
      events.on("changed", onChanged);
    });
  }

  /**
   * @override
   * @param id - the receipt handle returned by {@link receiveMessage}
   */
  async deleteMessage(id: string): Promise<void> {
    await this.client.query(`DELETE FROM ${this.table} WHERE id = ?1`, [Number(id)]);
  }

  /**
   * receiveMessage already pulls a batch: one consumer per `batchSize`
   * @override
   * @returns the number of consumers
   */
  getMaxConsumers(): number {
    return Math.max(1, Math.floor(this.parameters.maxConsumers / Math.max(this.parameters.batchSize!, 1)));
  }

  /**
   * Test helper: empty the table and reset the id sequence
   */
  async __clean(): Promise<void> {
    if (!this.handle) return;
    await this.client.query(`DELETE FROM ${this.table}`);
    await this.client.query(`DELETE FROM sqlite_sequence WHERE name = ?1`, [this.table]);
  }

  /**
   * @override
   */
  async stop(): Promise<void> {
    if (this.handle) {
      releaseDatabase(this.handle);
      this.handle = undefined;
    }
    await super.stop();
  }
}

export { SQLiteQueueService };
