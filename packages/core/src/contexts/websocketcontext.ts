import { once } from "node:events";
import type { WebSocket } from "ws";
import { JSONUtils } from "@webda/utils";
import { HttpContext } from "./httpcontext.js";
import { WebContext } from "./webcontext.js";
import type { Session } from "../session/session.js";
import * as WebdaError from "../errors/errors.js";

/** Pending output (bytes) above which write() asks the operation to wait. */
const HIGH_WATER = 1024 * 1024;

/** WebSocket readyState values after which nothing can be sent (CLOSING, CLOSED) */
const CLOSING = 2;

/**
 * The context of a bidirectional operation served over a WebSocket: the upgrade request's headers and session,
 * each streamed chunk sent as one JSON text message.
 */
export class WebSocketOperationContext extends WebContext {
  private cancelled = false;
  private lastSend: Promise<void> = Promise.resolve();

  /**
   * @param httpContext - the upgrade request
   * @param socket - the accepted socket
   * @param session - the session already loaded for the upgrade request, if any
   */
  constructor(
    httpContext: HttpContext,
    private readonly socket: WebSocket,
    session?: Session
  ) {
    super(httpContext);
    if (session) this.session = session;
  }

  /**
   * The session of an authorized upgrade is reused, not loaded twice
   * @override
   */
  async init(): Promise<this> {
    return this.session ? this : super.init();
  }

  /**
   * @returns whether the client closed the socket
   */
  get isCancelled(): boolean {
    return this.cancelled;
  }

  /** The client closed the socket: the next write or drain throws. */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * @throws OperationCancelledError when the client went away or the socket is closing
   */
  private assertAlive(): void {
    if (this.cancelled || this.socket.readyState >= CLOSING) {
      throw new WebdaError.OperationCancelledError();
    }
  }

  /**
   * Streamed chunks go out immediately as one JSON message; a non-streamed result is buffered as usual
   * @override
   */
  // @ts-ignore same signature as WebContext.write
  public write(output: any, encoding?: string, cb?: (error: Error) => void): boolean {
    if (!this.getExtension("operationStreaming")) return super.write(output, encoding, cb);
    this.assertAlive();
    const text = JSONUtils.stringify(output, undefined, 0, true);
    const sent = new Promise<void>((resolve, reject) => this.socket.send(text, err => (err ? reject(err) : resolve())));
    sent.catch(() => {
      // reported through drained()
    });
    this.lastSend = sent;
    return this.socket.bufferedAmount < HIGH_WATER;
  }

  /**
   * Wait for the last message to be flushed, without leaving listeners behind
   * @override
   */
  async drained(): Promise<void> {
    this.assertAlive();
    const controller = new AbortController();
    try {
      await Promise.race([
        this.lastSend,
        once(this.socket, "close", { signal: controller.signal }).then(() => {
          throw new WebdaError.OperationCancelledError();
        })
      ]);
    } catch {
      throw new WebdaError.OperationCancelledError();
    } finally {
      controller.abort();
    }
    this.assertAlive();
  }
}
