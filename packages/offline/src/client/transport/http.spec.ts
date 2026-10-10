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
    const res = await transport.pull({ scopes: [{ model: "A" }], cursor: null });
    expect(res.cursor).toBe("c");
    expect(calls[0][0]).toBe("https://api.test/sync/pull");
    expect(calls[0][1]).toBe("POST");
    expect(calls[0][2]).toMatchObject({ Authorization: "Bearer t", "Content-Type": "application/json" });
    expect(calls[0][3]).toEqual({ scopes: [{ model: "A" }], cursor: null });
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
});
