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
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.substring(0, index);
        buffer = buffer.substring(index + 2);
        let event = "message";
        const data: string[] = [];
        for (const line of block.split("\n")) {
          if (line.startsWith(":")) continue;
          if (line.startsWith("event:")) event = line.substring(6).trim();
          else if (line.startsWith("data:")) data.push(line.substring(5).trimStart());
        }
        if (data.length) yield { event, data: data.join("\n") };
      }
    }
  } finally {
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

  async pull(req: PullRequest): Promise<PullResponse> {
    return (await this.request("pull", req)).json();
  }

  async push(req: PushRequest): Promise<PushResponse> {
    return (await this.request("push", req)).json();
  }

  async snapshot(req: SnapshotRequest): Promise<SnapshotResponse> {
    return (await this.request("snapshot", req)).json();
  }

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
