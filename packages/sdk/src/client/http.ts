import { SdkError } from "./errors.js";
import type { BidiStream, CallContext, OperationDescriptor, Transport } from "./types.js";

/** Options of the REST transport */
export interface HttpTransportOptions {
  /** Base URL of the Webda REST API, the REST transport `url` included (`https://api.example.com/api`) */
  baseUrl: string;
  /** Extra headers per request, e.g. Authorization */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  /** fetch implementation @default globalThis.fetch */
  fetch?: typeof fetch;
  /** Credentials mode of the requests @default "include" (cookie session) */
  credentials?: RequestCredentials;
  /**
   * Called once on a `401`; when it resolves to true the request is retried once (e.g. after refreshing a token)
   */
  onUnauthorized?: () => boolean | Promise<boolean>;
  /** WebSocket constructor for bidirectional operations @default globalThis.WebSocket */
  webSocket?: new (url: string, protocols?: string | string[]) => WebSocket;
}

/**
 * Parse a server-sent events stream
 * @param stream - the response body
 * @returns the events (comments skipped)
 */
export async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  /**
   * @param block - lines of one event, already normalized to \n
   * @returns the event, undefined when it carries no data
   */
  const parse = (block: string): { event: string; data: string } | undefined => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.substring(6).trim();
      else if (line.startsWith("data:")) data.push(line.substring(5).trimStart());
    }
    return data.length ? { event, data: data.join("\n") } : undefined;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer = (buffer + decoder.decode()).replace(/\r\n?/g, "\n");
        const last = parse(buffer);
        if (last) yield last;
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      // A trailing \r may be the first half of a \r\n split across chunks
      const held = buffer.endsWith("\r") ? "\r" : "";
      buffer = buffer.substring(0, buffer.length - held.length).replace(/\r\n?/g, "\n");
      let index: number;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.substring(0, index);
        buffer = buffer.substring(index + 2);
        const parsed = parse(block);
        if (parsed) yield parsed;
      }
      buffer += held;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/**
 * Parse a newline-delimited JSON stream
 * @param stream - the response body
 * @returns the lines, as text
 */
export async function* parseNdjson(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) yield buffer;
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.substring(0, index).replace(/\r$/, "");
        buffer = buffer.substring(index + 1);
        if (line.trim()) yield line;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/**
 * The error of a response body, as Webda sends it (`{ error: { message, code } }` or `{ message }`)
 * @param body - the parsed body
 * @returns message and code when found
 */
function errorOf(body: unknown): { message?: string; code?: string } {
  if (!body || typeof body !== "object") return {};
  const error = (body as any).error && typeof (body as any).error === "object" ? (body as any).error : body;
  const code = error.code ?? error.errorCode;
  return {
    message: typeof error.message === "string" ? error.message : undefined,
    code: code !== undefined ? String(code) : undefined
  };
}

/**
 * A request to send: the URL and the JSON body left after the path and query parameters are taken from the input
 */
export interface PreparedRequest {
  url: string;
  method: string;
  body?: unknown;
}

/**
 * Transport over the routes of `Webda/RESTOperationsTransport`
 *
 * Path parameters (`{uuid}`, `{slug}`, `{pid.0}`) are filled from the input and the `parents` of the call, the rest of
 * the input is the JSON body, or the query string of a `GET`/`DELETE`. Server-streaming operations are read as NDJSON
 * (`Accept: application/x-ndjson`) with a server-sent events fallback, bidirectional ones open a WebSocket.
 */
export class HttpTransport implements Transport {
  readonly name = "rest";

  /**
   * @param options - transport options
   */
  constructor(protected options: HttpTransportOptions) {}

  /**
   * @param op - the operation
   * @returns true when the operation has a REST route a plain request can carry
   */
  supports(op: OperationDescriptor): boolean {
    return op.rest !== undefined && op.streaming !== "client";
  }

  /**
   * Build the request of an operation
   * @param op - the operation
   * @param input - the input
   * @param ctx - the call context
   * @returns url, method and body
   */
  prepare(op: OperationDescriptor, input: unknown, ctx: CallContext): PreparedRequest {
    const rest = op.rest!;
    const data: Record<string, unknown> =
      input !== null && typeof input === "object" && !Array.isArray(input) ? { ...(input as object) } : {};
    let path = rest.path;
    for (const name of rest.pathParams) {
      let value: unknown;
      const parent = /^pid\.(\d+)$/.exec(name);
      if (parent) {
        value = ctx.parents?.[Number(parent[1])] ?? data[name];
        delete data[name];
      } else {
        value = data[name];
        delete data[name];
      }
      if (value === undefined || value === null || value === "") {
        throw new SdkError(0, `Operation ${op.id} needs the path parameter '${name}'`, { transport: this.name });
      }
      path = path.split(`{${name}}`).join(encodeURIComponent(String(value)));
    }
    // A model query sends its WebdaQL as `q`, whatever the schema calls it
    if (op.kind === "query" && data.q === undefined && typeof data.query === "string") {
      data.q = data.query;
      delete data.query;
    }
    const method = rest.method.toUpperCase();
    const url = new URL(path.replace(/^\//, ""), this.options.baseUrl.replace(/\/*$/, "/"));
    if (method === "GET" || method === "DELETE") {
      for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
      }
      return { url: url.toString(), method };
    }
    const scalar = input !== null && typeof input === "object" && !Array.isArray(input) ? data : input;
    return { url: url.toString(), method, body: scalar };
  }

  /**
   * Send a request, retrying once after `onUnauthorized`
   * @param request - the request
   * @param headers - extra headers
   * @param ctx - the call context
   * @returns the response
   */
  protected async send(request: PreparedRequest, headers: Record<string, string>, ctx: CallContext): Promise<Response> {
    const init: RequestInit = {
      method: request.method,
      credentials: this.options.credentials ?? "include",
      signal: ctx.signal,
      headers: {
        Accept: "application/json",
        ...(request.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(await this.options.headers?.()),
        ...headers,
        ...ctx.headers
      },
      body: request.body !== undefined ? JSON.stringify(request.body) : undefined
    };
    const doFetch = this.options.fetch ?? globalThis.fetch;
    let response: Response;
    try {
      response = await doFetch(request.url, init);
    } catch (err) {
      throw new SdkError(0, (err as Error)?.message ?? "Network error", { transport: this.name, cause: err });
    }
    if (response.status === 401 && this.options.onUnauthorized && !headers["X-Webda-Retry"]) {
      if (await this.options.onUnauthorized()) {
        return this.send(request, { ...headers, "X-Webda-Retry": "1" }, ctx);
      }
    }
    return response;
  }

  /**
   * @param response - a failed response
   * @returns the error to throw
   */
  protected async failure(response: Response): Promise<SdkError> {
    const text = await response.text().catch(() => "");
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      // Not JSON
    }
    const { message, code } = errorOf(body);
    return new SdkError(response.status, message ?? text ?? response.statusText ?? `HTTP ${response.status}`, {
      code,
      body,
      transport: this.name
    });
  }

  /**
   * @param op - the operation
   * @param input - the input
   * @param ctx - the call context
   * @returns the parsed output, undefined on an empty response
   */
  async call(op: OperationDescriptor, input: unknown, ctx: CallContext): Promise<unknown> {
    const response = await this.send(this.prepare(op, input, ctx), {}, ctx);
    if (!response.ok) throw await this.failure(response);
    if (response.status === 204) return undefined;
    const text = await response.text();
    if (!text) return undefined;
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("json")) return JSON.parse(text);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /**
   * @param op - the operation
   * @param input - the input
   * @param ctx - the call context
   * @returns the streamed chunks
   */
  async *stream(op: OperationDescriptor, input: unknown, ctx: CallContext): AsyncIterable<unknown> {
    const response = await this.send(
      this.prepare(op, input, ctx),
      { Accept: "application/x-ndjson, text/event-stream;q=0.9, application/json;q=0.8" },
      ctx
    );
    if (!response.ok) throw await this.failure(response);
    const type = response.headers.get("content-type") ?? "";
    if (!response.body) return;
    if (type.includes("text/event-stream")) {
      for await (const event of parseSse(response.body)) {
        if (event.event === "end") return;
        const data = event.data ? JSON.parse(event.data) : undefined;
        if (event.event === "error") {
          const { message, code } = errorOf(data);
          throw new SdkError(Number(code) || 500, message ?? "Stream error", {
            code,
            body: data,
            transport: this.name
          });
        }
        yield data;
      }
      return;
    }
    if (type.includes("x-ndjson")) {
      for await (const line of parseNdjson(response.body)) {
        const chunk = JSON.parse(line);
        if (chunk && typeof chunk === "object" && "error" in chunk && Object.keys(chunk).length === 1) {
          const { message, code } = errorOf(chunk);
          throw new SdkError(Number(code) || 500, message ?? "Stream error", {
            code,
            body: chunk,
            transport: this.name
          });
        }
        yield chunk;
      }
      return;
    }
    // A plain answer: one chunk
    const text = await response.text();
    if (text) yield type.includes("json") ? JSON.parse(text) : text;
  }

  /**
   * Open a WebSocket on the route of a bidirectional operation
   * @param op - the operation
   * @param ctx - the call context
   * @returns the stream
   */
  connect(op: OperationDescriptor, ctx: CallContext): BidiStream {
    const { url } = this.prepare(op, {}, ctx);
    const WS = this.options.webSocket ?? (globalThis as any).WebSocket;
    if (!WS) throw new SdkError(0, "WebSocket is not available", { transport: this.name });
    const socket: WebSocket = new WS(url.replace(/^http/, "ws"));
    const queue: unknown[] = [];
    const waiters: Array<(result: IteratorResult<unknown>) => void> = [];
    let done = false;
    let failure: Error | undefined;
    let resolveClosed!: () => void;
    let rejectClosed!: (err: Error) => void;
    const closed = new Promise<void>((resolve, reject) => {
      resolveClosed = resolve;
      rejectClosed = reject;
    });
    closed.catch(() => {});
    const flush = () => {
      while (waiters.length && (queue.length || done)) {
        const waiter = waiters.shift()!;
        if (queue.length) waiter({ value: queue.shift(), done: false });
        else waiter({ value: undefined, done: true });
      }
    };
    socket.onmessage = event => {
      let data = event.data;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        // Not JSON: raw frame
      }
      queue.push(data);
      flush();
    };
    socket.onerror = () => {
      failure ??= new SdkError(0, `WebSocket error on ${op.id}`, { transport: this.name });
    };
    socket.onclose = event => {
      done = true;
      if (!event.wasClean && !failure) {
        failure = new SdkError(0, event.reason || `WebSocket closed (${event.code})`, { transport: this.name });
      }
      if (failure) rejectClosed(failure);
      else resolveClosed();
      flush();
    };
    const pending: unknown[] = [];
    socket.onopen = () => {
      for (const message of pending.splice(0)) socket.send(JSON.stringify(message));
    };
    ctx.signal?.addEventListener("abort", () => socket.close());
    return {
      closed,
      send: message => {
        if (socket.readyState === 1) socket.send(JSON.stringify(message));
        else if (socket.readyState === 0) pending.push(message);
        else throw new SdkError(0, "WebSocket is closed", { transport: this.name });
      },
      close: () => socket.close(),
      [Symbol.asyncIterator]: () => ({
        next: () =>
          new Promise<IteratorResult<unknown>>((resolve, reject) => {
            if (queue.length) return resolve({ value: queue.shift(), done: false });
            if (done) return failure ? reject(failure) : resolve({ value: undefined, done: true });
            waiters.push(result => (result.done && failure ? reject(failure) : resolve(result)));
          }),
        return: async () => {
          socket.close();
          return { value: undefined, done: true };
        }
      })
    };
  }
}
