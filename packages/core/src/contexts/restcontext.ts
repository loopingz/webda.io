import { once } from "node:events";
import type { OutgoingHttpHeaders, ServerResponse } from "node:http";
import { JSONUtils } from "@webda/utils";
import { HttpContext } from "./httpcontext.js";
import { StreamingOperationContext } from "./streamingcontext.js";
import type { Session } from "../session/session.js";

/** How the chunks of a streamed response are framed */
export type RestStreamFormat = "ndjson" | "sse";

/** Headers that only exist in HTTP/1.1: refused by HTTP/2 */
const HTTP1_ONLY_HEADERS = ["connection", "keep-alive", "transfer-encoding", "upgrade"];

/** Content type of each format */
const CONTENT_TYPES: Record<RestStreamFormat, string> = {
  ndjson: "application/x-ndjson",
  sse: "text/event-stream; charset=utf-8"
};

/**
 * @param response - an HTTP/1.1 or HTTP/2 (compatibility API) response
 * @returns whether it is over or its connection gone
 */
export function isResponseGone(response: ServerResponse): boolean {
  return response.writableEnded || response.destroyed || (response as any).stream?.destroyed === true;
}

/**
 * The context of a server-streaming operation served over a plain HTTP request: each streamed chunk is written to the
 * response as soon as the operation yields it, as one JSON line (`ndjson`) or one server-sent event (`sse`).
 *
 * The status line and headers leave with the first chunk (or the first keep-alive): until then an error is still a
 * normal HTTP error response. The context never ends the response by itself, see {@link RestStreamingOperationContext.finish}.
 */
export class RestStreamingOperationContext extends StreamingOperationContext {
  private started = false;
  private finished = false;
  private timer?: NodeJS.Timeout;
  private beginning?: Promise<void>;
  private queued: string[] = [];
  private needDrain = false;
  private aborted = false;

  /**
   * @param httpContext - the request
   * @param response - the HTTP response to stream to
   * @param format - how to frame the chunks
   * @param session - the session already loaded for the request, if any
   * @param keepAliveInterval - milliseconds between two SSE keep-alive comments (0 disables them)
   * @param baseHeaders - headers already set for the response (CORS...), sent with the first chunk
   * @param cookies - Set-Cookie values already set for the response
   */
  constructor(
    httpContext: HttpContext,
    private readonly response: ServerResponse,
    private readonly format: RestStreamFormat,
    session?: Session,
    private readonly keepAliveInterval: number = 20000,
    private readonly baseHeaders: OutgoingHttpHeaders = {},
    private readonly cookies: string[] = []
  ) {
    super(httpContext, response);
    if (session) this.session = session;
    response.once("close", () => {
      this.stopKeepAlive();
      // The client left before the end of the stream
      if (!this.finished) this.cancel();
    });
  }

  /**
   * The session of an authorized request is reused, not loaded twice
   * @override
   */
  async init(): Promise<this> {
    return this.session ? this : super.init();
  }

  /**
   * @returns whether the status line and headers were sent
   */
  get hasStarted(): boolean {
    return this.started;
  }

  /**
   * The response is over or its connection destroyed (an HTTP/2 response has no `destroyed`: its stream tells)
   * @override
   */
  protected get connectionEnded(): boolean {
    return isResponseGone(this.response);
  }

  /**
   * @returns whether the client is gone or the response is over
   */
  get disconnected(): boolean {
    return this.connectionEnded;
  }

  /**
   * Send the status line and headers, once
   */
  private start(): void {
    if (this.started) return;
    this.started = true;
    const headers: OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries({ ...this.baseHeaders, ...this.getResponseHeaders() })) {
      // Ours below, whatever the case of the name
      if (["content-type", "cache-control", "content-length"].includes(name.toLowerCase())) continue;
      if (this.response.req?.httpVersionMajor >= 2 && HTTP1_ONLY_HEADERS.includes(name.toLowerCase())) continue;
      headers[name] = value;
    }
    headers["Content-Type"] = CONTENT_TYPES[this.format];
    headers["Cache-Control"] = "no-cache";
    // Reverse proxies must not buffer a stream
    headers["X-Accel-Buffering"] = "no";
    const cookies = [...this.cookies, ...this.getSetCookieHeaders()];
    if (cookies.length) headers["Set-Cookie"] = cookies;
    this.setFlushedHeaders();
    this.response.writeHead(200, headers);
  }

  /**
   * The operation failed before the response head was sent: it will never be written, so the caller can answer with a
   * normal HTTP error
   */
  abortBeforeStart(): void {
    if (!this.started) this.aborted = true;
  }

  /**
   * Save the session (its cookie leaves with the headers, so changes made until now are kept), send the headers, then
   * what was written meanwhile. Once.
   * @returns a promise resolved when the response head is out
   */
  begin(): Promise<void> {
    this.beginning ??= (async () => {
      this._sessionSaved = false;
      await this.saveSession();
      // Gone, over, or failed before anything was sent: the head is not ours to write anymore
      if (this.finished || this.aborted || this.connectionEnded) return;
      this.start();
      for (const text of this.queued.splice(0)) {
        if (!this.response.write(text)) this.needDrain = true;
      }
    })();
    return this.beginning;
  }

  /**
   * Send an SSE keep-alive comment every interval while the response is open. When the operation has not yielded
   * anything yet the first one commits the response as a stream (an error after it is an error event).
   */
  startKeepAlive(): void {
    if (this.format !== "sse" || this.keepAliveInterval <= 0 || this.timer) return;
    this.timer = setInterval(() => {
      if (this.finished || this.connectionEnded) return;
      this.begin().then(
        () => {
          if (!this.finished && !this.connectionEnded) this.response.write(": keep-alive\n\n");
        },
        () => undefined
      );
    }, this.keepAliveInterval);
    this.timer.unref();
  }

  /**
   * Stop sending keep-alive comments
   */
  stopKeepAlive(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * One JSON line or server-sent event per chunk, without its `__` keys. The first one waits for the response head
   * (the session is saved first): the operation is asked to wait for `drained()`.
   * @override
   */
  protected sendChunk(chunk: any): boolean {
    const json = JSONUtils.stringify(chunk, undefined, 0, true) ?? "null";
    const text = this.format === "sse" ? `data: ${json}\n\n` : `${json}\n`;
    if (this.started) {
      const flushed = this.response.write(text);
      if (!flushed) this.needDrain = true;
      return flushed;
    }
    this.queued.push(text);
    this.begin().catch(() => undefined);
    return false;
  }

  /**
   * Wait for the response head, then for the response buffer to empty, or the response to close or fail
   * @override
   */
  protected async waitForDrain(signal: AbortSignal): Promise<void> {
    await this.beginning;
    // The client left while the head was being prepared: nothing will ever drain
    this.assertAlive();
    if (this.started && !this.needDrain) return;
    this.needDrain = false;
    await Promise.race([
      once(this.response, "drain", { signal }),
      once(this.response, "close", { signal }),
      once(this.response, "error", { signal }).then(([error]) => {
        throw error;
      })
    ]);
  }

  /**
   * Tell the client the stream failed: the last event or line of the response
   * @param message - what the client may know
   * @param code - the HTTP status the error maps to
   * @returns a promise resolved once it is written
   */
  async writeError(message: string, code: number): Promise<void> {
    if (this.finished || this.connectionEnded) return;
    await this.begin();
    if (this.finished || this.connectionEnded) return;
    const payload = JSON.stringify({ message, code });
    this.response.write(this.format === "sse" ? `event: error\ndata: ${payload}\n\n` : `{"error":${payload}}\n`);
  }

  /**
   * End the response (a normal end is announced to SSE clients with an `end` event)
   * @param normal - whether the stream ended without error
   * @returns a promise resolved once the response is ended
   */
  async finish(normal: boolean = false): Promise<void> {
    if (this.finished) return;
    this.stopKeepAlive();
    if (this.connectionEnded) {
      this.finished = true;
      return;
    }
    await this.begin();
    if (this.finished) return;
    this.finished = true;
    if (this.connectionEnded) return;
    if (normal && this.format === "sse") this.response.write("event: end\ndata: {}\n\n");
    this.response.end();
  }
}
