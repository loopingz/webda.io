import { SecretString } from "@webda/core";
import { useLog } from "@webda/workout";
import pg, { ClientConfig } from "pg";

/**
 * Options of a {@link PostgresListener}
 */
export interface PostgresListenerOptions {
  /**
   * Name used in the log messages: PostgresPubSub, PostgresQueue...
   */
  name: string;
  /**
   * Reconnect delay in milliseconds when the connection drops. A randomized jitter is added to keep crash-loop
   * reconnects from stampeding.
   */
  reconnectDelay: number;
  /**
   * Called with the payload of each notification of the channel
   */
  onNotification: (payload: string) => void;
  /**
   * Called once LISTEN is active again after a reconnection: notifications sent meanwhile were missed
   */
  onReconnect?: () => void;
  /**
   * Called when the connection drops
   */
  onDisconnect?: () => void;
}

/**
 * Long-lived LISTEN connection on one channel, shared by {@link PostgresPubSubService} and
 * {@link PostgresQueueService}
 *
 * It uses a dedicated `pg.Client` (NOT a pool — pools rotate connections, but each LISTEN is scoped to the
 * connection that issued it). Disconnects trigger a randomized-backoff reconnect so the listener survives
 * transient network or restart blips.
 */
export class PostgresListener {
  /**
   * Current connection, undefined while disconnected
   */
  client?: pg.Client;
  /**
   * Set during {@link stop} so reconnect handlers don't try to come back after teardown.
   */
  protected stopping = false;

  /**
   * @param config - connection settings forwarded to `pg.Client`
   * @param channel - channel to LISTEN to, must be a valid lowercase Postgres identifier
   * @param options - callbacks and reconnection settings
   */
  constructor(
    protected config: ClientConfig | undefined,
    protected channel: string,
    protected options: PostgresListenerOptions
  ) {}

  /**
   * @returns true while LISTEN is active
   */
  get connected(): boolean {
    return this.client !== undefined;
  }

  /**
   * Open a fresh client, run LISTEN, and wire the notification handler.
   */
  async connect(): Promise<void> {
    // Validate the channel name before opening any connection: LISTEN
    // can't be parameterized so the channel name gets inlined into SQL,
    // which makes it a query-injection vector. Failing fast here keeps
    // the bad-input case independent of database reachability.
    const ch = this.channel;
    if (!/^[a-z_][a-z0-9_]*$/.test(ch)) {
      throw new Error(`Invalid channel name "${ch}" — must match /^[a-z_][a-z0-9_]*$/`);
    }
    const client = new pg.Client(SecretString.unwrap(this.config));
    client.on("notification", (msg: pg.Notification) => {
      if (msg.channel !== ch) return;
      this.options.onNotification(msg.payload ?? "");
    });
    client.on("error", err => useLog("WARN", `${this.options.name} client error: ${err.message}`));
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
    this.options.onDisconnect?.();
    const delay = this.options.reconnectDelay + Math.floor(Math.random() * 250);
    setTimeout(() => {
      if (this.stopping) return;
      this.connect()
        .then(() => this.options.onReconnect?.())
        .catch(err => useLog("WARN", `${this.options.name} reconnect failed: ${(err as Error).message}`));
    }, delay);
  }

  /**
   * UNLISTEN and close the connection, without reconnecting
   */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.client) {
      const client = this.client;
      this.client = undefined;
      try {
        await client.query(`UNLISTEN ${this.channel}`);
      } catch {
        /* connection may already be dead */
      }
      await client.end().catch(() => {
        /* already ended */
      });
    }
  }
}
