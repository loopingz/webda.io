import { once } from "node:events";
import type { WebSocket } from "ws";
import { JSONUtils } from "@webda/utils";
import { HttpContext } from "./httpcontext.js";
import { StreamingOperationContext } from "./streamingcontext.js";
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
export class WebSocketOperationContext extends StreamingOperationContext {
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
   * The socket is closing or closed
   * @override
   */
  protected get connectionEnded(): boolean {
    return this.socket.readyState >= CLOSING;
  }

  /**
   * One JSON text message per chunk
   * @override
   */
  protected sendChunk(chunk: any): boolean {
    const text = JSONUtils.stringify(chunk, undefined, 0, true);
    const sent = new Promise<void>((resolve, reject) => this.socket.send(text, err => (err ? reject(err) : resolve())));
    sent.catch(() => {
      // reported through drained()
    });
    this.lastSend = sent;
    return this.socket.bufferedAmount < HIGH_WATER;
  }

  /**
   * Wait for the last message to be flushed, or the socket to close
   * @override
   */
  protected async waitForDrain(signal: AbortSignal): Promise<void> {
    await Promise.race([
      this.lastSend,
      once(this.socket, "close", { signal }).then(() => {
        throw new WebdaError.OperationCancelledError();
      })
    ]);
  }
}
