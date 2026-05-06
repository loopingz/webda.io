import { MessageReceipt, Queue, QueueParameters } from "@webda/core";
import { JSONUtils } from "@webda/utils";
import { useLog } from "@webda/workout";
import pg, { ClientConfig, PoolConfig } from "pg";

/**
 * Configuration for {@link PostgresQueueService}.
 */
export class PostgresQueueParameters extends QueueParameters {
  /**
   * Table name backing the queue. Auto-created on init if missing.
   *
   * @default "webda_queue"
   */
  table?: string;
  /**
   * Visibility timeout in seconds — how long a locked-but-undeleted
   * message stays invisible to other consumers before being eligible for
   * redelivery. Workers that crash mid-process without acking will see
   * their messages reappear after this window.
   *
   * @default 30
   */
  visibilityTimeout?: number;
  /**
   * Max number of messages pulled per `receiveMessage` call. The queue
   * worker calls receiveMessage in a loop, so this is also the parallel
   * batch size.
   *
   * @default 10
   */
  batchSize?: number;
  /**
   * Whether to use a `pg.Pool` (recommended for shared workloads) or a
   * single `pg.Client`.
   *
   * @default true
   */
  usePool?: boolean;
  /**
   * Connection settings forwarded to the chosen pg client/pool. Defaults
   * to PG* environment variables.
   */
  postgresqlServer?: ClientConfig | PoolConfig;
  /**
   * Whether to auto-create the queue table on init.
   *
   * @default true
   */
  autoCreateTable?: boolean;

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
    this.usePool ??= true;
    this.autoCreateTable ??= true;
    return this;
  }
}

/**
 * Postgres-backed FIFO queue using `SELECT … FOR UPDATE SKIP LOCKED` (PG
 * 9.5+) for atomic multi-worker pulls. A schema-managed table holds
 * pending and locked rows; receive locks a batch atomically, delete (or
 * the visibility-timeout sweep) clears them. No extra infrastructure
 * needed beyond a Postgres connection — reuses the same DB you're
 * already running for the store.
 *
 * Wire format: payload column is `jsonb` so messages survive
 * round-tripping with their structure intact and can be queried directly
 * if you ever need to inspect the queue.
 *
 * @WebdaModda PostgresQueue
 */
export default class PostgresQueueService<
  T = any,
  K extends PostgresQueueParameters = PostgresQueueParameters
> extends Queue<T, K> {
  /**
   * Backing pg client or pool. Pools are preferred under load — receive
   * locks rotate across connections and benefit from concurrency.
   */
  protected client?: pg.Client | pg.Pool;

  /**
   * Resolved table identifier. Validated at init to keep the table name
   * out of any literal SQL paths that aren't parameterizable.
   * @returns the table name
   */
  protected get table(): string {
    return this.parameters.table!;
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
    this.client = this.parameters.usePool
      ? new pg.Pool(this.parameters.postgresqlServer as PoolConfig)
      : new pg.Client(this.parameters.postgresqlServer as ClientConfig);
    if (this.client instanceof pg.Client) {
      await this.client.connect();
    }
    if (this.parameters.autoCreateTable) {
      await this.ensureTable();
    }
    return this;
  }

  /**
   * Create the queue table and the index that supports the SKIP LOCKED
   * receive query, if they're missing.
   */
  protected async ensureTable(): Promise<void> {
    await this.client!.query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        id BIGSERIAL PRIMARY KEY,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        locked_until TIMESTAMPTZ
      )
    `);
    // PG rejects STABLE functions like now() in index predicates ("functions
    // in index predicate must be marked IMMUTABLE"), so the partial index
    // covers only the unlocked half. Expired locks fall back to the
    // sequential `locked_until < now()` filter at query time, which scans
    // the (small) set of currently-locked rows. Pending rows — the hot path
    // for healthy receive loops — get the index.
    await this.client!.query(`
      CREATE INDEX IF NOT EXISTS ${this.table}_pending_idx
      ON ${this.table} (id)
      WHERE locked_until IS NULL
    `);
  }

  /**
   * @override
   * @param event - the event to enqueue
   */
  async sendMessage(event: T): Promise<void> {
    if (!this.client) throw new Error("PostgresQueue not connected");
    this.metrics?.messages_sent?.inc();
    await this.client.query(`INSERT INTO ${this.table} (payload) VALUES ($1::jsonb)`, [JSONUtils.stringify(event)]);
  }

  /**
   * @override
   * @returns count of messages currently visible (pending or expired-lock)
   */
  async size(): Promise<number> {
    if (!this.client) return 0;
    const res = await this.client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${this.table} WHERE locked_until IS NULL OR locked_until < now()`
    );
    return Number.parseInt(res.rows[0].count, 10);
  }

  /**
   * @override
   * @param proto - optional prototype to rehydrate the payload into
   * @returns the locked batch
   */
  async receiveMessage<L>(proto?: { new (): L }): Promise<MessageReceipt<L>[]> {
    if (!this.client) throw new Error("PostgresQueue not connected");
    // Atomically lock a batch: lock_until is set to now() + visibilityTimeout
    // for rows whose previous lock has expired (or that are pending). Other
    // workers running this same query in parallel get the SKIP LOCKED
    // semantics from the inner SELECT, so each row goes to exactly one
    // worker per visibility window.
    const visibilityMs = this.parameters.visibilityTimeout! * 1000;
    const res = await this.client.query<{ id: string; payload: any }>(
      `
      UPDATE ${this.table}
      SET locked_until = now() + ($1::bigint || ' milliseconds')::interval
      WHERE id IN (
        SELECT id FROM ${this.table}
        WHERE locked_until IS NULL OR locked_until < now()
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT $2
      )
      RETURNING id, payload
      `,
      [visibilityMs, this.parameters.batchSize]
    );
    return res.rows.map(row => ({
      ReceiptHandle: row.id,
      Message: proto ? Object.assign(new proto(), row.payload) : (row.payload as L)
    }));
  }

  /**
   * @override
   * @param id - the receipt handle returned by {@link receiveMessage}
   */
  async deleteMessage(id: string): Promise<void> {
    if (!this.client) throw new Error("PostgresQueue not connected");
    await this.client.query(`DELETE FROM ${this.table} WHERE id = $1::bigint`, [id]);
  }

  /**
   * Override the queue's per-receive parallelism: receiveMessage already
   * pulls a batch, so the consumer-spawning loop only needs one parent
   * worker per `batchSize`.
   *
   * @override
   * @returns the result number
   */
  getMaxConsumers(): number {
    return Math.max(1, Math.floor(this.parameters.maxConsumers / Math.max(this.parameters.batchSize!, 1)));
  }

  /**
   * Convenience: drop and recreate the queue table. Used by tests; not
   * for production. Mirrors the `__clean` hook on FileQueue.
   */
  async __clean(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.query(`TRUNCATE TABLE ${this.table} RESTART IDENTITY`);
    } catch (err) {
      useLog("WARN", `PostgresQueue truncate failed: ${(err as Error).message}`);
    }
  }

  /**
   * @override
   */
  async stop(): Promise<void> {
    if (this.client) {
      const client = this.client;
      this.client = undefined;
      if (client instanceof pg.Pool) {
        await client.end().catch(() => {
          /* already ended */
        });
      } else {
        await client.end().catch(() => {
          /* already ended */
        });
      }
    }
    await super.stop();
  }
}

export { PostgresQueueService };
