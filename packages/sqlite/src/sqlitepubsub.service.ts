import { PubSubService, ServiceParameters } from "@webda/core";
import type { SQLDatabase } from "@webda/sql";
import { CancelablePromise, JSONUtils } from "@webda/utils";
import { useLog } from "@webda/workout";
import type { SQLiteConnectionParameters, SQLitePersistence } from "./connection.js";
import { acquireDatabase, releaseDatabase } from "./dbregistry.js";
import type { SQLiteHandle } from "./dbregistry.js";

/**
 * Configuration for {@link SQLitePubSubService}
 */
export class SQLitePubSubParameters extends ServiceParameters implements SQLiteConnectionParameters {
  /**
   * Channel name
   * @default the service name lowercased
   */
  channel?: string;
  /**
   * Table holding the message log
   * @default "webda_pubsub"
   * @pattern /^[a-zA-Z_][a-zA-Z0-9_]*$/
   */
  table?: string;
  /**
   * Poll interval in ms for messages written by other processes
   * @default 100
   */
  pollInterval?: number;
  /**
   * Seconds a message is kept for slow consumers before being purged
   * @default 60
   */
  retention?: number;
  /**
   * Max messages fetched per poll
   * @default 100
   */
  batchSize?: number;
  /**
   * Create the table on init
   * @default true
   */
  autoCreateTable?: boolean;
  /**
   * Omitted: in-process only (services sharing `database.name`); set: file shared by the processes of one host
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
    this.table ??= "webda_pubsub";
    this.pollInterval ??= 100;
    this.retention ??= 60;
    this.batchSize ??= 100;
    this.autoCreateTable ??= true;
    this.busyTimeout ??= 5000;
    return this;
  }
}

interface Subscriber<T> {
  callback: (event: T) => Promise<void>;
  proto?: { new (): T };
  /**
   * Last delivered message id: only messages published after the subscription are delivered
   */
  cursor: number;
}

/**
 * Pub/sub on a SQLite message log read through per-subscriber cursors: SQLite has no LISTEN/NOTIFY.
 *
 * Publishers of this process wake the subscribers immediately through the shared handle; other processes on the
 * same host (file mode) are detected by polling `PRAGMA data_version` every `pollInterval`. Delivery is at-most-once
 * per subscriber while subscribed; a subscriber offline longer than `retention` misses messages (use SQLiteQueue
 * for guaranteed delivery). Not a network bus.
 *
 * @WebdaModda SQLitePubSub
 */
export default class SQLitePubSubService<
  T = any,
  K extends SQLitePubSubParameters = SQLitePubSubParameters
> extends PubSubService<T, K> {
  protected handle?: SQLiteHandle;
  protected subscribers: Set<Subscriber<T>> = new Set();
  protected timer?: NodeJS.Timeout;
  protected dataVersion?: number;
  protected lastPurge = 0;
  protected polling = false;
  /**
   * Wake-up by a publisher of this process (the shared handle emits for every table)
   * @param table - the written table
   */
  protected onChanged = (table: string) => {
    if (table === this.table) {
      this.poll(true);
    }
  };

  /**
   * @returns the validated table name
   */
  protected get table(): string {
    return this.parameters.table!;
  }

  /**
   * @returns the channel name
   */
  protected channel(): string {
    return this.parameters.channel ?? this.getName().toLowerCase();
  }

  /**
   * Current time in ms, overridable by tests
   * @returns epoch ms
   */
  protected now(): number {
    return Date.now();
  }

  /**
   * @returns the client
   * @throws when the service is not initialized
   */
  protected get client() {
    if (!this.handle) {
      throw new Error("SQLitePubSub not connected");
    }
    return this.handle.client;
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
      // AUTOINCREMENT: a monotonic cursor, never reused after the purge
      await this.client.query(
        `CREATE TABLE IF NOT EXISTS ${this.table} (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL)`
      );
      await this.client.query(`CREATE INDEX IF NOT EXISTS ${this.table}_channel_idx ON ${this.table} (channel, id)`);
    }
    this.handle.events.on("changed", this.onChanged);
    return this;
  }

  /**
   * @override
   * @param event - the event to publish
   */
  async sendMessage(event: T): Promise<void> {
    const client = this.client;
    this.metrics?.messages_sent?.inc();
    const now = this.now();
    await client.query(`INSERT INTO ${this.table} (channel, payload, created_at) VALUES (?1, ?2, ?3)`, [
      this.channel(),
      JSONUtils.stringify(event),
      now
    ]);
    // Purge the messages older than the retention, at most every retention / 2
    const retentionMs = this.parameters.retention! * 1000;
    if (now - this.lastPurge >= retentionMs / 2) {
      this.lastPurge = now;
      await client.query(`DELETE FROM ${this.table} WHERE created_at < ?1`, [now - retentionMs]);
    }
    this.handle!.events.emit("changed", this.table);
  }

  /**
   * @override
   * @returns 0 — pub/sub is transient, no queueing
   */
  async size(): Promise<number> {
    return 0;
  }

  /**
   * @override
   * @param callback - invoked with each event received
   * @param eventPrototype - optional class to rehydrate JSON into
   * @param onBind - invoked once the subscription is registered
   * @returns a cancelable subscription handle
   */
  consume(
    callback: (event: T) => Promise<void>,
    eventPrototype?: { new (): T },
    onBind?: () => void
  ): CancelablePromise {
    // Like LISTEN: only the messages published after the subscription
    const cursor = Number(this.client.db.prepare(`SELECT COALESCE(MAX(id), 0) AS id FROM ${this.table}`).get()!.id);
    const entry: Subscriber<T> = { callback, proto: eventPrototype, cursor };
    this.subscribers.add(entry);
    this.timer ??= setInterval(() => this.poll(false), this.parameters.pollInterval);
    onBind?.();
    return new CancelablePromise(
      resolve => resolve(),
      async () => {
        this.subscribers.delete(entry);
        if (this.subscribers.size === 0 && this.timer) {
          clearInterval(this.timer);
          this.timer = undefined;
        }
      }
    );
  }

  /**
   * Deliver the new messages of each subscriber
   *
   * Synchronous (DatabaseSync), so polls never overlap; the callbacks run asynchronously.
   * @param force - read even when PRAGMA data_version did not change (a write by this process is not reflected)
   */
  protected poll(force: boolean): void {
    if (!this.handle || this.polling || this.subscribers.size === 0) {
      return;
    }
    this.polling = true;
    try {
      if (!force) {
        const version = Number(this.handle.db.prepare("PRAGMA data_version").get()!.data_version);
        if (version === this.dataVersion) {
          return;
        }
        this.dataVersion = version;
      }
      const read = this.handle.db.prepare(
        `SELECT id, payload FROM ${this.table} WHERE channel = ?1 AND id > ?2 ORDER BY id LIMIT ?3`
      );
      // A full batch may hide more rows (a burst from another process): read again until a batch is short
      let more = true;
      while (more) {
        more = false;
        for (const sub of [...this.subscribers]) {
          const rows = read.all(this.channel(), sub.cursor, this.parameters.batchSize!) as unknown as {
            id: number;
            payload: string;
          }[];
          for (const row of rows) {
            sub.cursor = Number(row.id);
            this.dispatch(sub, row.payload);
          }
          more ||= rows.length >= this.parameters.batchSize!;
        }
      }
    } catch (err) {
      useLog("WARN", `SQLitePubSub poll failed: ${(err as Error).message}`);
    } finally {
      this.polling = false;
    }
  }

  /**
   * Decode a message and run a subscriber callback on it
   * @param sub - the subscriber
   * @param payload - the stored JSON
   */
  protected dispatch(sub: Subscriber<T>, payload: string): void {
    let raw: any;
    try {
      raw = JSONUtils.parse(payload);
    } catch (err) {
      this.metrics?.errors?.inc();
      useLog("WARN", `SQLitePubSub invalid payload: ${(err as Error).message}`);
      return;
    }
    this.metrics?.messages_received?.inc();
    const event = sub.proto && raw ? Object.assign(new sub.proto() as T & object, raw) : (raw as T);
    const start = Date.now();
    sub
      .callback(event)
      .catch(err => {
        this.metrics?.errors?.inc();
        useLog("WARN", `SQLitePubSub callback failed: ${(err as Error).message}`);
      })
      .finally(() => {
        this.metrics?.processing_duration?.observe((Date.now() - start) / 1000);
      });
  }

  /**
   * @override
   */
  async stop(): Promise<void> {
    this.subscribers.clear();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.handle) {
      this.handle.events.off("changed", this.onChanged);
      releaseDatabase(this.handle);
      this.handle = undefined;
    }
    await super.stop();
  }
}

export { SQLitePubSubService };
