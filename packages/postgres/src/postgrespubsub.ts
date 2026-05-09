import { PubSubService, ServiceParameters } from "@webda/core";
import { CancelablePromise, JSONUtils } from "@webda/utils";
import { useLog } from "@webda/workout";
import pg, { ClientConfig } from "pg";

/**
 * NOTIFY's payload limit is 8000 bytes (the underlying NAMEDATALEN /
 * NOTIFY_PAYLOAD_LIMIT). We keep a small safety margin to leave room for
 * the protocol overhead.
 */
const NOTIFY_PAYLOAD_MAX = 7900;

/**
 * Configuration for {@link PostgresPubSubService}.
 */
export class PostgresPubSubParameters extends ServiceParameters {
  /**
   * Channel name passed to LISTEN / NOTIFY. Must be a valid Postgres
   * identifier (lowercased, no quoting). Defaults to the service name.
   */
  channel?: string;
  /**
   * Connection settings forwarded to `pg.Client`. By default `pg` reads
   * standard PG* environment variables.
   */
  postgresqlServer?: ClientConfig;
  /**
   * Reconnect delay in milliseconds when the LISTEN connection drops. A
   * randomized jitter is added to keep crash-loop reconnects from
   * stampeding.
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
    this.reconnectDelay ??= 500;
    return this;
  }
}

interface Subscriber<T> {
  callback: (event: T) => Promise<void>;
  proto?: { new (): T };
}

/**
 * Pub/sub backed by Postgres' native LISTEN / NOTIFY. A long-lived
 * `pg.Client` (NOT a pool — pools rotate connections, but each LISTEN is
 * scoped to the connection that issued it) holds the subscription;
 * publishes go through `pg_notify(channel, payload)`. The 8 kB NOTIFY
 * payload cap is enforced in {@link sendMessage} — for larger payloads,
 * stash them in a row and notify the row id.
 *
 * Disconnects trigger a randomized-backoff reconnect so the listener
 * survives transient network or restart blips.
 *
 * @WebdaModda PostgresPubSub
 */
export default class PostgresPubSubService<
  T = any,
  K extends PostgresPubSubParameters = PostgresPubSubParameters
> extends PubSubService<T, K> {
  /**
   * Long-lived listener client. One per service instance.
   */
  protected client?: pg.Client;
  /**
   * Local callback registrations. Notifications dispatch to all of them.
   */
  protected callbacks: Set<Subscriber<T>> = new Set();
  /**
   * Set during {@link stop} so reconnect handlers don't try to come back
   * after teardown.
   */
  protected stopping = false;

  /**
   * Channel name used for LISTEN/NOTIFY. Resolved at init time so we can
   * default to the service's name when not configured.
   * @returns the channel name
   */
  protected channel(): string {
    return this.parameters.channel ?? this.getName().toLowerCase();
  }

  /**
   * @override
   * @returns this service
   */
  async init(): Promise<this> {
    await super.init();
    await this.connect();
    return this;
  }

  /**
   * Open a fresh client, run LISTEN, and wire the notification handler.
   */
  protected async connect(): Promise<void> {
    // Validate the channel name before opening any connection: LISTEN
    // can't be parameterized so the channel name gets inlined into SQL,
    // which makes it a query-injection vector. Failing fast here keeps
    // the bad-input case independent of database reachability.
    const ch = this.channel();
    if (!/^[a-z_][a-z0-9_]*$/.test(ch)) {
      throw new Error(`Invalid channel name "${ch}" — must match /^[a-z_][a-z0-9_]*$/`);
    }
    const client = new pg.Client(this.parameters.postgresqlServer);
    client.on("notification", (msg: pg.Notification) => {
      if (msg.channel !== this.channel()) return;
      this.dispatch(msg.payload ?? "");
    });
    client.on("error", err => useLog("WARN", `PostgresPubSub client error: ${err.message}`));
    client.on("end", () => this.handleDisconnect());
    await client.connect();
    await client.query(`LISTEN ${ch}`);
    this.client = client;
  }

  /**
   * Schedule a reconnect after a short randomized backoff.
   */
  protected handleDisconnect(): void {
    if (this.stopping) return;
    this.client = undefined;
    const delay = this.parameters.reconnectDelay! + Math.floor(Math.random() * 250);
    setTimeout(() => {
      if (this.stopping) return;
      this.connect().catch(err => useLog("WARN", `PostgresPubSub reconnect failed: ${(err as Error).message}`));
    }, delay);
  }

  /**
   * Decode a notification payload and run every registered callback
   * against it.
   * @param payload - the raw NOTIFY payload string
   */
  protected dispatch(payload: string): void {
    let raw: any;
    try {
      raw = payload === "" ? undefined : JSONUtils.parse(payload);
    } catch (err) {
      this.metrics?.errors?.inc();
      useLog("WARN", `PostgresPubSub invalid payload: ${(err as Error).message}`);
      return;
    }
    this.metrics?.messages_received?.inc();
    for (const sub of this.callbacks) {
      const event = sub.proto && raw ? Object.assign(new sub.proto(), raw) : (raw as T);
      const start = Date.now();
      sub
        .callback(event)
        .catch(err => {
          this.metrics?.errors?.inc();
          useLog("ERROR", `PostgresPubSub callback failed: ${(err as Error).message}`);
        })
        .finally(() => {
          this.metrics?.processing_duration?.observe((Date.now() - start) / 1000);
        });
    }
  }

  /**
   * @override
   * @param event - the event to publish
   */
  async sendMessage(event: T): Promise<void> {
    if (!this.client) throw new Error("PostgresPubSub not connected");
    const payload = JSONUtils.stringify(event);
    if (Buffer.byteLength(payload, "utf-8") > NOTIFY_PAYLOAD_MAX) {
      throw new Error(
        `PostgresPubSub payload exceeds Postgres' 8 kB NOTIFY limit. Stash large payloads in a row and notify the row id instead.`
      );
    }
    this.metrics?.messages_sent?.inc();
    await this.client.query("SELECT pg_notify($1, $2)", [this.channel(), payload]);
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
    const entry: Subscriber<T> = { callback, proto: eventPrototype };
    this.callbacks.add(entry);
    onBind?.();
    return new CancelablePromise(
      resolve => resolve(),
      async () => {
        this.callbacks.delete(entry);
      }
    );
  }

  /**
   * @override
   */
  async stop(): Promise<void> {
    this.stopping = true;
    this.callbacks.clear();
    if (this.client) {
      const client = this.client;
      this.client = undefined;
      try {
        await client.query(`UNLISTEN ${this.channel()}`);
      } catch {
        /* connection may already be dead */
      }
      await client.end().catch(() => {
        /* already ended */
      });
    }
    await super.stop();
  }
}

export { PostgresPubSubService };
