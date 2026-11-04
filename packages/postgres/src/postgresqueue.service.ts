import { MessageReceipt, Queue, QueueParameters, SecretString } from "@webda/core";
import { CancelablePromise, JSONUtils } from "@webda/utils";
import { useLog } from "@webda/workout";
import pg, { ClientConfig, PoolConfig } from "pg";
import { acquirePool, releasePool } from "./pgpool.js";
import { PostgresListener } from "./pglisten.js";

/**
 * Configuration for {@link PostgresQueueService}.
 */
export class PostgresQueueParameters extends QueueParameters {
  /**
   * Table name backing the queue. Auto-created on init if missing.
   *
   * @default "webda_queue"
   * @pattern /^[a-zA-Z_][a-zA-Z0-9_]*$/
   * @example "myapp_queue"
   * @example "user_notifications"
   * @example "cache_invalidation"
   * @example "orders"
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
   *
   * Can be encrypted with `webda config encrypt`
   * @secret password,connectionString
   */
  postgresqlServer?: ClientConfig | PoolConfig;
  /**
   * Whether to auto-create the queue table on init.
   *
   * @default true
   */
  autoCreateTable?: boolean;
  /**
   * Wake up the consumers with LISTEN / NOTIFY instead of polling
   *
   * `sendMessage` NOTIFYs a channel named after the table (lowercased), and `consume()` opens a dedicated
   * LISTEN connection: once the queue is empty, its receives wait for a notification, up to `waitTimeout`,
   * before querying again. Direct `receiveMessage` calls never wait. Set to false to poll as before.
   *
   * @default true
   */
  notify?: boolean;
  /**
   * Maximum time a receive of `consume()` waits for a notification, in seconds
   *
   * The queue is queried at least that often, and at least every `visibilityTimeout`, as a safety net: it
   * picks up the messages whose visibility lock expired, and the ones whose notification was missed.
   *
   * @default 20
   */
  waitTimeout?: number;
  /**
   * Reconnect delay in milliseconds when the LISTEN connection drops. A
   * randomized jitter is added. Consumers poll while it is down.
   *
   * @default 500
   */
  reconnectDelay?: number;

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
    this.notify ??= true;
    this.waitTimeout ??= 20;
    this.reconnectDelay ??= 500;
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
   * True when {@link client} is a shared pool acquired from the registry.
   * Drives the matching {@link releasePool} call in {@link stop}.
   */
  protected ownsPool = false;
  /**
   * LISTEN connection, opened by the first {@link consume} when `notify` is enabled
   */
  protected listener?: PostgresListener;
  /**
   * Resolved once the LISTEN connection is opened (or failed to): the first receive waits for it
   */
  protected listening?: Promise<void>;
  /**
   * Number of running {@link consume}: receives only wait for a notification while consuming
   */
  protected consumers = 0;
  /**
   * Receives waiting for a notification
   */
  protected waiters = new Set<(notified: boolean) => void>();
  /**
   * Incremented on each notification: a receive does not wait if one arrived while it queried
   */
  protected notifications = 0;

  /**
   * Resolved table identifier. Validated at init to keep the table name
   * out of any literal SQL paths that aren't parameterizable.
   * @returns the table name
   */
  protected get table(): string {
    return this.parameters.table!;
  }

  /**
   * Channel used by LISTEN / NOTIFY: the table name, lowercased as Postgres does for unquoted identifiers
   * @returns the channel name
   */
  protected get channel(): string {
    return this.table.toLowerCase();
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
    if (this.parameters.usePool) {
      this.client = acquirePool(this.parameters.postgresqlServer as PoolConfig);
      this.ownsPool = true;
    } else {
      this.client = new pg.Client(SecretString.unwrap(this.parameters.postgresqlServer as ClientConfig));
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
    if (!this.parameters.notify) {
      await this.client.query(`INSERT INTO ${this.table} (payload) VALUES ($1::jsonb)`, [JSONUtils.stringify(event)]);
      return;
    }
    // Same statement, so same transaction: the notification is delivered when the row is committed
    await this.client.query(
      `WITH inserted AS (INSERT INTO ${this.table} (payload) VALUES ($1::jsonb) RETURNING id)
      SELECT pg_notify($2, '') FROM inserted`,
      [JSONUtils.stringify(event), this.channel]
    );
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
   * Receive a batch of messages
   *
   * Within {@link consume}, when the queue is empty and the LISTEN connection is up, it waits for a
   * notification, up to `waitTimeout` (or `visibilityTimeout` if shorter), and queries again. Otherwise it
   * returns immediately.
   *
   * @override
   * @param proto - optional prototype to rehydrate the payload into
   * @returns the locked batch
   */
  async receiveMessage<L>(proto?: { new (): L }): Promise<MessageReceipt<L>[]> {
    if (this.consumers > 0 && this.listening) {
      await this.listening;
    }
    const waitMs = Math.min(this.parameters.waitTimeout!, this.parameters.visibilityTimeout!) * 1000;
    const deadline = Date.now() + (this.canWait() ? waitMs : 0);
    for (;;) {
      const notifications = this.notifications;
      const messages = await this.lockMessages(proto);
      const remaining = deadline - Date.now();
      if (messages.length > 0 || remaining <= 0 || !this.canWait()) {
        return messages;
      }
      // A notification received during the query may be for a message it did not see
      if (notifications === this.notifications && !(await this.waitForNotification(remaining))) {
        // Timeout or cancellation: the next receive of the consumer queries again
        return [];
      }
    }
  }

  /**
   * @returns true if a receive can wait for a notification: consuming, with LISTEN active
   */
  protected canWait(): boolean {
    return this.consumers > 0 && this.listener?.connected === true;
  }

  /**
   * Wait for a notification, at most `ms`
   *
   * @param ms - maximum wait in milliseconds
   * @returns true if woken up by a notification or a reconnection, false on timeout or cancellation
   */
  protected waitForNotification(ms: number): Promise<boolean> {
    return new Promise(resolve => {
      const wake = (notified: boolean) => {
        clearTimeout(timer);
        this.waiters.delete(wake);
        resolve(notified);
      };
      const timer = setTimeout(() => wake(false), ms);
      this.waiters.add(wake);
    });
  }

  /**
   * Wake up every receive waiting for a notification
   *
   * @param notified - true to query again, false to return no message
   */
  protected wakeUp(notified: boolean): void {
    [...this.waiters].forEach(wake => wake(notified));
  }

  /**
   * Open the LISTEN connection if not already done
   *
   * It stays open until {@link stop}. If it cannot be opened, the consumers keep polling and the next
   * {@link consume} tries again.
   */
  protected listen(): void {
    if (this.listening) return;
    const listener = new PostgresListener(this.parameters.postgresqlServer, this.channel, {
      name: "PostgresQueue",
      reconnectDelay: this.parameters.reconnectDelay!,
      onNotification: () => {
        this.notifications++;
        this.wakeUp(true);
      },
      // Waiting receives query again: they poll while disconnected, and catch up the missed notifications
      onDisconnect: () => this.wakeUp(true),
      onReconnect: () => this.wakeUp(true)
    });
    this.listener = listener;
    this.listening = listener.connect().catch(err => {
      useLog("WARN", `PostgresQueue cannot LISTEN, falling back to polling: ${(err as Error).message}`);
      if (this.listener === listener) {
        this.listener = undefined;
        this.listening = undefined;
      }
    });
  }

  /**
   * Work the queue, woken up by LISTEN / NOTIFY when `notify` is enabled
   *
   * @override
   * @param callback - the callback function
   * @param eventPrototype - the event prototype
   * @returns the consumer, cancelling it interrupts the wait for a notification
   */
  consume(callback: (event: T) => Promise<void>, eventPrototype?: { new (): T }): CancelablePromise {
    if (!this.parameters.notify) {
      return super.consume(callback, eventPrototype);
    }
    this.consumers++;
    this.listen();
    const consumer = super.consume(callback, eventPrototype);
    const cancel = consumer.cancel;
    let cancelled = false;
    consumer.cancel = async () => {
      if (!cancelled) {
        cancelled = true;
        this.consumers--;
      }
      await cancel();
      // Stop the receives waiting for a notification: the loop ends
      this.wakeUp(false);
    };
    return consumer;
  }

  /**
   * Lock a batch of pending messages
   *
   * @param proto - optional prototype to rehydrate the payload into
   * @returns the locked batch, empty if no message is visible
   */
  protected async lockMessages<L>(proto?: { new (): L }): Promise<MessageReceipt<L>[]> {
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
      Message: proto ? Object.assign(new proto() as L & object, row.payload) : (row.payload as L)
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
    this.consumers = 0;
    this.wakeUp(false);
    if (this.listener) {
      const listener = this.listener;
      this.listener = undefined;
      this.listening = undefined;
      await listener.stop();
    }
    if (this.client) {
      const client = this.client;
      const owned = this.ownsPool;
      this.client = undefined;
      this.ownsPool = false;
      if (owned) {
        await releasePool(this.parameters.postgresqlServer as PoolConfig);
      } else {
        await (client as pg.Client).end().catch(() => {
          /* already ended */
        });
      }
    }
    await super.stop();
  }
}

export { PostgresQueueService };
