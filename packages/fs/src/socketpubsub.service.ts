import { PubSubService, ServiceParameters } from "@webda/core";
import { CancelablePromise, JSONUtils } from "@webda/utils";
import { useLog } from "@webda/workout";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import * as net from "net";
import { dirname } from "path";

/**
 * Configuration for {@link SocketPubSubService}.
 */
export class SocketPubSubParameters extends ServiceParameters {
  /**
   * Filesystem path of the unix-domain socket. The first peer to bind this
   * path becomes the broker; subsequent peers connect as clients.
   */
  path: string;
  /**
   * Reconnect delay in milliseconds when the broker disconnects. A small
   * random jitter is added on top to avoid stampedes when several clients
   * race to bind a new socket.
   *
   * @default 100
   */
  reconnectDelay?: number;

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.reconnectDelay ??= 100;
    return this;
  }
}

interface Subscriber<T> {
  callback: (event: T) => Promise<void>;
  proto?: { new (): T };
}

/**
 * Pub/sub backed by a unix-domain socket. Designed for single-host IPC:
 * one peer binds the socket file and acts as broker, fanning each
 * published message out to every connected client; other peers connect as
 * clients. Any peer can publish — non-broker publishers send through the
 * socket and the broker fanouts. Every connected peer (publisher
 * included) receives every message, so the in-process semantics match the
 * cross-process ones.
 *
 * If the broker disconnects, surviving clients reconnect after a short
 * randomized delay; one of them wins the bind race and becomes the new
 * broker. Stale socket files left by killed brokers are detected via
 * `connect()` returning ECONNREFUSED and unlinked before re-binding.
 *
 * Wire format: 4-byte big-endian uint32 length prefix followed by a UTF-8
 * JSON payload.
 *
 * @WebdaModda SocketPubSub
 */
export default class SocketPubSubService<
  T = any,
  K extends SocketPubSubParameters = SocketPubSubParameters
> extends PubSubService<T, K> {
  /**
   * Broker-mode listener. Set when this peer is the broker, undefined
   * otherwise. Mutually exclusive with {@link clientSocket}.
   */
  protected server?: net.Server;
  /**
   * Outbound socket to the broker, when this peer is a client.
   */
  protected clientSocket?: net.Socket;
  /**
   * Active subscriber sockets the broker fans messages out to.
   */
  protected subscribers: Set<net.Socket> = new Set();
  /**
   * Local callback registrations made via {@link consume}. The broker
   * dispatches to these directly; client-mode peers feed them from the
   * broker socket's incoming frames.
   */
  protected callbacks: Set<Subscriber<T>> = new Set();
  /**
   * Set during {@link stop} so disconnect handlers don't try to reconnect
   * after we've torn down.
   */
  protected stopping = false;

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
   * Connect to an existing broker, or bind ourselves as broker if there
   * isn't one. Handles the EADDRINUSE race by retrying as a client.
   */
  protected async connect(): Promise<void> {
    const path = this.parameters.path;
    try {
      await this.connectAsClient(path);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ECONNREFUSED") throw err;
      // Stale socket file or no listener — clean up before binding.
      if (existsSync(path)) {
        try {
          unlinkSync(path);
        } catch {
          /* race: another peer may have already removed it */
        }
      }
    }

    try {
      await this.bindAsBroker(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
        await this.connectAsClient(path);
        return;
      }
      throw err;
    }
  }

  /**
   * Bind the socket file and start listening. On every accepted connection
   * we frame-decode incoming bytes, fanout the raw frame to all OTHER
   * subscribers, and dispatch the parsed payload to local callbacks.
   * @param path - filesystem path of the unix socket
   * @returns resolves once the listener is up
   */
  protected bindAsBroker(path: string): Promise<void> {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    return new Promise((resolve, reject) => {
      const server = net.createServer(socket => {
        this.subscribers.add(socket);
        const reader = makeFrameReader(buf => {
          this.fanout(buf, socket);
          this.dispatchToCallbacks(buf);
        });
        socket.on("data", reader);
        socket.on("close", () => this.subscribers.delete(socket));
        socket.on("error", () => this.subscribers.delete(socket));
      });
      server.once("error", reject);
      server.listen(path, () => {
        this.server = server;
        resolve();
      });
    });
  }

  /**
   * Open a client socket to the broker.
   * @param path - filesystem path of the unix socket
   * @returns resolves once connected, rejects on the first connection error
   */
  protected connectAsClient(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(path);
      const onError = (err: Error) => {
        socket.removeAllListeners();
        socket.destroy();
        reject(err);
      };
      socket.once("error", onError);
      socket.once("connect", () => {
        socket.removeListener("error", onError);
        this.clientSocket = socket;
        const reader = makeFrameReader(buf => this.dispatchToCallbacks(buf));
        socket.on("data", reader);
        socket.on("close", () => this.handleBrokerDisconnect());
        socket.on("error", err => useLog("WARN", `SocketPubSub broker socket error: ${err.message}`));
        resolve();
      });
    });
  }

  /**
   * Schedule a reconnect attempt after a randomized backoff. The jitter
   * keeps surviving clients from all racing to bind the new socket on the
   * same tick.
   */
  protected handleBrokerDisconnect(): void {
    if (this.stopping) return;
    this.clientSocket = undefined;
    const delay = this.parameters.reconnectDelay! + Math.floor(Math.random() * 100);
    setTimeout(() => {
      if (this.stopping) return;
      this.connect().catch(err => useLog("WARN", `SocketPubSub reconnect failed: ${(err as Error).message}`));
    }, delay);
  }

  /**
   * Write a framed payload to every subscriber except the optional sender
   * (used to avoid echoing a client's own message back to it via the
   * broker — the client receives it via its local callback dispatch
   * instead).
   * @param buf - the unframed JSON payload bytes
   * @param except - optional socket to exclude from fanout
   */
  protected fanout(buf: Buffer, except?: net.Socket): void {
    const framed = frame(buf);
    for (const sub of this.subscribers) {
      if (sub === except) continue;
      sub.write(framed);
    }
  }

  /**
   * Decode a JSON frame and run every registered callback against it.
   * Errors thrown by callbacks are swallowed (logged + counted) so one bad
   * subscriber doesn't break others.
   * @param buf - the unframed JSON payload bytes
   */
  protected dispatchToCallbacks(buf: Buffer): void {
    let raw: any;
    try {
      raw = JSONUtils.parse(buf.toString("utf-8"));
    } catch (err) {
      this.metrics?.errors?.inc();
      useLog("WARN", `SocketPubSub invalid frame: ${(err as Error).message}`);
      return;
    }
    this.metrics?.messages_received?.inc();
    for (const sub of this.callbacks) {
      const event = sub.proto ? Object.assign(new sub.proto(), raw) : (raw as T);
      const start = Date.now();
      sub
        .callback(event)
        .catch(err => {
          this.metrics?.errors?.inc();
          useLog("ERROR", `SocketPubSub callback failed: ${(err as Error).message}`);
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
    const buf = Buffer.from(JSONUtils.stringify(event), "utf-8");
    this.metrics?.messages_sent?.inc();
    if (this.server) {
      // Broker mode: fanout to every subscriber and dispatch locally.
      this.fanout(buf);
      this.dispatchToCallbacks(buf);
    } else if (this.clientSocket) {
      // Client mode: send to broker, also dispatch locally so the publisher
      // observes its own message without round-tripping.
      this.clientSocket.write(frame(buf));
      this.dispatchToCallbacks(buf);
    } else {
      throw new Error("SocketPubSub not connected");
    }
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
    // Register the callback synchronously and resolve the promise so the
    // returned handle is "settled-but-cancelable" — onCancel removes the
    // callback when the caller invokes .cancel(). A long-lived pending
    // promise would just produce unhandled "Cancelled" rejections in the
    // typical usage where the caller never awaits the handle.
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
    if (this.clientSocket) {
      this.clientSocket.destroy();
      this.clientSocket = undefined;
    }
    if (this.server) {
      const server = this.server;
      this.server = undefined;
      for (const sub of this.subscribers) sub.destroy();
      this.subscribers.clear();
      await new Promise<void>(resolve => server.close(() => resolve()));
      try {
        unlinkSync(this.parameters.path);
      } catch {
        /* already gone */
      }
    }
    await super.stop();
  }
}

export { SocketPubSubService };

/**
 * Length-prefix-frame a JSON payload. 4-byte big-endian uint32 length
 * followed by the payload bytes.
 * @param buf - the payload to frame
 * @returns the framed bytes
 */
function frame(buf: Buffer): Buffer {
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(buf.length, 0);
  return Buffer.concat([len, buf]);
}

/**
 * Build a stateful frame decoder. Returns a function that consumes raw
 * socket chunks and calls `onFrame` once for each complete frame read.
 * @param onFrame - invoked with each complete unframed payload
 * @returns the chunk consumer
 */
function makeFrameReader(onFrame: (buf: Buffer) => void): (chunk: Buffer) => void {
  let pending = Buffer.alloc(0);
  return chunk => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 4) {
      const len = pending.readUInt32BE(0);
      if (pending.length < 4 + len) break;
      const payload = pending.subarray(4, 4 + len);
      pending = pending.subarray(4 + len);
      onFrame(payload);
    }
  };
}
