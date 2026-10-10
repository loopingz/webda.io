import { describe, expect, it } from "vitest";
import { HttpTransport, parseSse } from "./http.js";
import { TransportError } from "./transport.js";

/**
 * @param text - body
 * @returns a stream of it, split in small chunks
 */
function stream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
      controller.close();
    }
  });
}

describe("HttpTransport", () => {
  it("posts JSON with headers", async () => {
    const calls: any[] = [];
    const transport = new HttpTransport({
      baseUrl: "https://api.test/",
      headers: async () => ({ Authorization: "Bearer t" }),
      fetch: (async (url: string, init: any) => {
        calls.push([url, init.method, init.headers, JSON.parse(init.body)]);
        return new Response(JSON.stringify({ upserts: [], evicts: [], cursor: "c", hasMore: false }), { status: 200 });
      }) as any
    });
    const res = await transport.pull({ scopes: [{ model: "A" }] });
    expect(res.cursor).toBe("c");
    expect(calls[0][0]).toBe("https://api.test/sync/pull");
    expect(calls[0][1]).toBe("POST");
    expect(calls[0][2]).toMatchObject({ Authorization: "Bearer t", "Content-Type": "application/json" });
    expect(calls[0][3]).toEqual({ scopes: [{ model: "A" }] });
  });

  it("throws TransportError on failures", async () => {
    const transport = new HttpTransport({
      baseUrl: "https://api.test",
      fetch: (async () => new Response("nope", { status: 403 })) as any
    });
    await expect(transport.push({ mutations: [] })).rejects.toBeInstanceOf(TransportError);
    const network = new HttpTransport({
      baseUrl: "https://api.test",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as any
    });
    await expect(network.push({ mutations: [] })).rejects.toMatchObject({ status: 0 });
  });

  it("parses server-sent events", async () => {
    const events = [];
    for await (const e of parseSse(
      stream(': keep-alive\n\ndata: {"cursor":"1"}\n\ndata: {"cursor":"2"}\n\nevent: end\ndata: {}\n\n')
    )) {
      events.push(e);
    }
    expect(events).toEqual([
      { event: "message", data: '{"cursor":"1"}' },
      { event: "message", data: '{"cursor":"2"}' },
      { event: "end", data: "{}" }
    ]);
  });

  it("watch yields hints until end", async () => {
    const transport = new HttpTransport({
      baseUrl: "https://api.test",
      fetch: (async (_url: string, init: any) => {
        expect(init.headers.Accept).toBe("text/event-stream");
        return new Response(stream('data: {"cursor":"9"}\n\nevent: end\ndata: {}\n\n'), { status: 200 });
      }) as any
    });
    const hints = [];
    for await (const hint of transport.watch({ scopes: [] }, new AbortController().signal)) hints.push(hint);
    expect(hints).toEqual([{ cursor: "9" }]);
  });

  it("parses CRLF and CR line endings and multi-line data", async () => {
    const events = [];
    for await (const e of parseSse(stream("data: a\r\ndata: b\r\n\r\nevent: x\rdata: c\r\r: note\r\n\r\n"))) {
      events.push(e);
    }
    expect(events).toEqual([
      { event: "message", data: "a\nb" },
      { event: "x", data: "c" }
    ]);
  });

  it("flushes a trailing event without blank line", async () => {
    const events = [];
    for await (const e of parseSse(stream('data: {"a":1}\n\nevent: error\ndata: boom'))) events.push(e);
    expect(events).toEqual([
      { event: "message", data: '{"a":1}' },
      { event: "error", data: "boom" }
    ]);
  });

  it("watch throws on an error event, even unterminated", async () => {
    const transport = new HttpTransport({
      baseUrl: "https://api.test",
      fetch: (async () => new Response(stream('data: {"cursor":"1"}\n\nevent: error\ndata: {"m":1}'))) as any
    });
    const hints = [];
    const run = async () => {
      for await (const h of transport.watch({ scopes: [] }, new AbortController().signal)) hints.push(h);
    };
    await expect(run()).rejects.toBeInstanceOf(TransportError);
    expect(hints).toEqual([{ cursor: "1" }]);
  });

  it("watch ends on abort", async () => {
    const controller = new AbortController();
    const transport = new HttpTransport({
      baseUrl: "https://api.test",
      fetch: (async (_u: string, init: any) => {
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            if (init.signal.aborted) return c.error(new Error("aborted"));
            init.signal.addEventListener("abort", () => c.error(new Error("aborted")));
          }
        });
        return new Response(body);
      }) as any
    });
    const run = (async () => {
      for await (const _h of transport.watch({ scopes: [] }, controller.signal)) {
        // nothing
      }
    })();
    controller.abort();
    await expect(run).rejects.toThrow("aborted");
  });

  it("cancels the stream when the consumer stops early", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode("data: 1\n\ndata: 2\n\n"));
      },
      cancel() {
        cancelled = true;
      }
    });
    for await (const _e of parseSse(body)) break;
    expect(cancelled).toBe(true);
  });

  it("reports status and message of failures", async () => {
    const transport = new HttpTransport({
      baseUrl: "https://api.test",
      fetch: (async () => new Response("nope", { status: 403 })) as any
    });
    await expect(transport.push({ mutations: [] })).rejects.toMatchObject({ status: 403, message: "nope" });
  });
});
