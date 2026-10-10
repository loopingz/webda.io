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
   * The response is over or its connection destroyed
   * @override
   */
  protected get connectionEnded(): boolean {
    return this.response.writableEnded || this.response.destroyed;
  }

  /**
   * Send the status line and headers, once, then start the keep-alive
   */
  start(): void {
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
   * Send an SSE keep-alive comment every interval while the response is open. When the operation has not yielded
   * anything yet the first one commits the response as a stream (an error after it is an error event).
   */
  startKeepAlive(): void {
    if (this.format !== "sse" || this.keepAliveInterval <= 0 || this.timer) return;
    this.timer = setInterval(() => {
      if (this.finished || this.connectionEnded) return;
      this.start();
      this.response.write(": keep-alive\n\n");
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
   * One JSON line or server-sent event per chunk, without its `__` keys
   * @override
   */
  protected sendChunk(chunk: any): boolean {
    this.start();
    const json = JSONUtils.stringify(chunk, undefined, 0, true) ?? "null";
    return this.response.write(this.format === "sse" ? `data: ${json}\n\n` : `${json}\n`);
  }

  /**
   * Wait for the response buffer to empty, or the response to close or fail
   * @override
   */
  protected async waitForDrain(signal: AbortSignal): Promise<void> {
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
   */
  writeError(message: string, code: number): void {
    if (this.finished || this.connectionEnded) return;
    this.start();
    const payload = JSON.stringify({ message, code });
    this.response.write(this.format === "sse" ? `event: error\ndata: ${payload}\n\n` : `{"error":${payload}}\n`);
  }

  /**
   * End the response (a normal end is announced to SSE clients with an `end` event)
   * @param normal - whether the stream ended without error
   */
  finish(normal: boolean = false): void {
    if (this.finished) return;
    this.stopKeepAlive();
    if (this.connectionEnded) {
      this.finished = true;
      return;
    }
    this.start();
    if (normal && this.format === "sse") this.response.write("event: end\ndata: {}\n\n");
    this.finished = true;
    this.response.end();
  }
}
