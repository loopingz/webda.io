import type {
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SnapshotRequest,
  SnapshotResponse,
  WatchEvent,
  WatchRequest
} from "../../protocol/index.js";
import { TransportError, type Transport } from "./transport.js";

export interface HttpTransportOptions {
  /** Base URL of the Webda REST API */
  baseUrl: string;
  /** Extra headers per request, e.g. Authorization */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  /** fetch implementation @default globalThis.fetch */
  fetch?: typeof fetch;
  /** Route overrides when the operations are mounted elsewhere */
  paths?: Partial<Record<"pull" | "push" | "snapshot" | "watch", string>>;
}

const PATHS = { pull: "sync/pull", push: "sync/push", snapshot: "sync/snapshot", watch: "sync/watch" };

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
        // Flush the decoder and a last event the server did not terminate
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
    // Stop the underlying connection when the consumer leaves early
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/**
 * Transport over the RESTOperationsTransport routes of the SyncService
 */
export class HttpTransport implements Transport {
  /**
   * @param options - transport options
   */
  constructor(protected options: HttpTransportOptions) {}

  /**
   * @param name - operation
   * @returns its URL
   */
  protected url(name: keyof typeof PATHS): string {
    return `${this.options.baseUrl.replace(/\/+$/, "")}/${this.options.paths?.[name] ?? PATHS[name]}`;
  }

  /**
   * @param name - operation
   * @param body - JSON body
   * @param extra - extra init
   * @returns the response
   */
  protected async request(name: keyof typeof PATHS, body: any, extra: RequestInit = {}): Promise<Response> {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(await this.options.headers?.())
    };
    let res: Response;
    try {
      res = await (this.options.fetch ?? globalThis.fetch)(this.url(name), {
        method: "POST",
        ...extra,
        headers: { ...headers, ...(extra.headers as any) },
        body: JSON.stringify(body)
      });
    } catch (err) {
      throw new TransportError(0, (err as Error).message);
    }
    if (!res.ok) throw new TransportError(res.status, (await res.text().catch(() => "")) || res.statusText);
    return res;
  }

  /**
   *
   * @param req - the req
   * @returns the page of changes
   */
  async pull(req: PullRequest): Promise<PullResponse> {
    return (await this.request("pull", req)).json();
  }

  /**
   *
   * @param req - the req
   * @returns one result per mutation
   */
  async push(req: PushRequest): Promise<PushResponse> {
    return (await this.request("push", req)).json();
  }

  /**
   *
   * @param req - the req
   * @returns the page of objects
   */
  async snapshot(req: SnapshotRequest): Promise<SnapshotResponse> {
    return (await this.request("snapshot", req)).json();
  }

  /**
   *
   * @param req - the req
   * @param signal - the signal
   */
  async *watch(req: WatchRequest, signal: AbortSignal): AsyncIterable<WatchEvent> {
    const res = await this.request("watch", req, { signal, headers: { Accept: "text/event-stream" } });
    if (!res.body) return;
    for await (const { event, data } of parseSse(res.body)) {
      if (event === "end") return;
      if (event === "error") throw new TransportError(500, data);
      yield JSON.parse(data);
    }
  }
}
