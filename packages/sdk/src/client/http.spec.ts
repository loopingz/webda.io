import { describe, expect, it } from "vitest";
import { SdkError } from "./errors.js";
import { chunked, FakeServer, OPERATIONS } from "./fixture.js";
import { HttpTransport, parseNdjson, parseSse } from "./http.js";

describe("HttpTransport", () => {
  it("fills path parameters from the input and the parents, the rest is the body or the query string", () => {
    const transport = new HttpTransport({ baseUrl: "https://api.test/api/" });
    expect(transport.prepare(OPERATIONS["Task.Get"], { uuid: "t1" }, {})).toEqual({
      url: "https://api.test/api/tasks/t1",
      method: "GET"
    });
    expect(transport.prepare(OPERATIONS["Task.Patch"], { uuid: "t1", status: "done" }, {})).toEqual({
      url: "https://api.test/api/tasks/t1",
      method: "PATCH",
      body: { status: "done" }
    });
    expect(transport.prepare(OPERATIONS["Comment.Get"], { uuid: "c1" }, { parents: ["t1"] })).toEqual({
      url: "https://api.test/api/tasks/t1/comments/c1",
      method: "GET"
    });
    expect(transport.prepare(OPERATIONS["Comment.Get"], { uuid: "c1", "pid.0": "t 2" }, {})).toEqual({
      url: "https://api.test/api/tasks/t%202/comments/c1",
      method: "GET"
    });
    expect(transport.prepare(OPERATIONS["Tag.Get"], { org: "acme", slug: "news" }, {})).toEqual({
      url: "https://api.test/api/tags/acme/news",
      method: "GET"
    });
    // GET query: the WebdaQL goes to `q`, whatever the schema calls it
    expect(transport.prepare(OPERATIONS["Tasks.Query"], { query: "status = 'open'" }, {})).toEqual({
      url: "https://api.test/api/tasks?q=status+%3D+%27open%27",
      method: "GET"
    });
    expect(transport.prepare(OPERATIONS["Users.Query"], { query: "" }, {})).toEqual({
      url: "https://api.test/api/users",
      method: "PUT",
      body: { q: "" }
    });
    expect(transport.prepare(OPERATIONS["Task.Count"], undefined, {})).toEqual({
      url: "https://api.test/api/tasks/count",
      method: "PUT",
      body: undefined
    });
    expect(() => transport.prepare(OPERATIONS["Comment.Get"], { uuid: "c1" }, {})).toThrow(/path parameter 'pid.0'/);
  });

  it("supports REST routes but not client streams", () => {
    const transport = new HttpTransport({ baseUrl: "https://api.test" });
    expect(transport.supports(OPERATIONS["Task.Get"])).toBe(true);
    expect(transport.supports(OPERATIONS["Audit.Tail"])).toBe(true);
    expect(transport.supports(OPERATIONS["Audit.Upload"])).toBe(false);
    expect(transport.supports(OPERATIONS["Hidden.Op"])).toBe(false);
  });

  it("sends JSON with the headers and parses the answer", async () => {
    const server = new FakeServer().on("PUT", "/tasks/:uuid/archive", (m, req) => ({ uuid: m[1], ...req.body }));
    const transport = new HttpTransport({
      baseUrl: "https://api.test",
      fetch: server.fetch(),
      headers: async () => ({ Authorization: "Bearer t" })
    });
    const result = await transport.call(
      OPERATIONS["Task.Archive"],
      { uuid: "t1", reason: "old" },
      { headers: { "X-Trace": "1" } }
    );
    expect(result).toEqual({ uuid: "t1", reason: "old" });
    expect(server.requests[0].headers).toMatchObject({
      Authorization: "Bearer t",
      "X-Trace": "1",
      "Content-Type": "application/json",
      Accept: "application/json"
    });
    expect(server.requests[0].body).toEqual({ reason: "old" });
  });

  it("answers undefined on an empty response and text on a non-JSON one", async () => {
    const server = new FakeServer()
      .on("DELETE", "/tasks/:uuid", () => undefined)
      .on(
        "GET",
        "/tasks/:uuid",
        () => new Response("plain", { status: 200, headers: { "content-type": "text/plain" } })
      );
    const transport = new HttpTransport({ baseUrl: "https://api.test", fetch: server.fetch() });
    expect(await transport.call(OPERATIONS["Task.Delete"], { uuid: "t1" }, {})).toBeUndefined();
    expect(await transport.call(OPERATIONS["Task.Get"], { uuid: "t1" }, {})).toBe("plain");
  });

  it("maps failures to SdkError", async () => {
    const server = new FakeServer()
      .on(
        "GET",
        "/tasks/missing",
        () => new Response(JSON.stringify({ error: { message: "No task", code: "NOT_FOUND" } }), { status: 404 })
      )
      .on("GET", "/tasks/text", () => new Response("Nope", { status: 500 }));
    const transport = new HttpTransport({ baseUrl: "https://api.test", fetch: server.fetch() });
    const error: SdkError = await transport.call(OPERATIONS["Task.Get"], { uuid: "missing" }, {}).catch(e => e);
    expect(error).toBeInstanceOf(SdkError);
    expect(error).toMatchObject({ status: 404, code: "NOT_FOUND", message: "No task", transport: "rest" });
    await expect(transport.call(OPERATIONS["Task.Get"], { uuid: "text" }, {})).rejects.toMatchObject({
      status: 500,
      message: "Nope"
    });
    const offline = new HttpTransport({
      baseUrl: "https://api.test",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as any
    });
    const network: SdkError = await offline.call(OPERATIONS["Task.Get"], { uuid: "t1" }, {}).catch(e => e);
    expect(network.status).toBe(0);
    expect(network.isOffline()).toBe(true);
  });

  it("retries once after onUnauthorized", async () => {
    let token = "expired";
    const server = new FakeServer().on("GET", "/tasks/:uuid", (m, req) =>
      req.headers.Authorization === "Bearer fresh" ? { uuid: m[1] } : new Response("", { status: 401 })
    );
    const transport = new HttpTransport({
      baseUrl: "https://api.test",
      fetch: server.fetch(),
      headers: () => ({ Authorization: `Bearer ${token}` }),
      onUnauthorized: async () => {
        token = "fresh";
        return true;
      }
    });
    expect(await transport.call(OPERATIONS["Task.Get"], { uuid: "t1" }, {})).toEqual({ uuid: "t1" });
    expect(server.requests).toHaveLength(2);
    // A refusal to refresh surfaces the 401
    const refusing = new HttpTransport({
      baseUrl: "https://api.test",
      fetch: server.fetch(),
      headers: () => ({ Authorization: "Bearer expired" }),
      onUnauthorized: () => false
    });
    await expect(refusing.call(OPERATIONS["Task.Get"], { uuid: "t1" }, {})).rejects.toMatchObject({ status: 401 });
  });

  it("streams NDJSON and raises its error lines", async () => {
    const server = new FakeServer().on(
      "PUT",
      "/audit/tail",
      () =>
        new Response(chunked('{"n":1}\n"scalar"\n{"n":3}\n'), { headers: { "content-type": "application/x-ndjson" } })
    );
    const transport = new HttpTransport({ baseUrl: "https://api.test", fetch: server.fetch() });
    const chunks: unknown[] = [];
    for await (const chunk of transport.stream(OPERATIONS["Audit.Tail"], { since: 1 }, {})) chunks.push(chunk);
    expect(chunks).toEqual([{ n: 1 }, "scalar", { n: 3 }]);
    expect(server.requests[0].headers.Accept).toMatch(/^application\/x-ndjson/);
    expect(server.requests[0].body).toEqual({ since: 1 });

    const failing = new FakeServer().on(
      "PUT",
      "/audit/tail",
      () =>
        new Response(chunked('{"n":1}\n{"error":{"message":"Bad frame","code":400}}\n'), {
          headers: { "content-type": "application/x-ndjson" }
        })
    );
    const got: unknown[] = [];
    const run = async () => {
      for await (const chunk of new HttpTransport({ baseUrl: "https://api.test", fetch: failing.fetch() }).stream(
        OPERATIONS["Audit.Tail"],
        {},
        {}
      )) {
        got.push(chunk);
      }
    };
    await expect(run()).rejects.toMatchObject({ status: 400, message: "Bad frame" });
    expect(got).toEqual([{ n: 1 }]);
  });

  it("streams server-sent events until the end event, raising error events", async () => {
    const server = new FakeServer().on(
      "PUT",
      "/audit/tail",
      () =>
        new Response(chunked(': keep-alive\n\ndata: {"n":1}\n\ndata: "two"\n\nevent: end\ndata: {}\n\n'), {
          headers: { "content-type": "text/event-stream; charset=utf-8" }
        })
    );
    const transport = new HttpTransport({ baseUrl: "https://api.test", fetch: server.fetch() });
    const chunks: unknown[] = [];
    for await (const chunk of transport.stream(OPERATIONS["Audit.Tail"], {}, {})) chunks.push(chunk);
    expect(chunks).toEqual([{ n: 1 }, "two"]);

    const failing = new FakeServer().on(
      "PUT",
      "/audit/tail",
      () =>
        new Response(
          chunked('data: {"n":1}\n\nevent: error\ndata: {"message":"Internal server error","code":500}\n\n'),
          {
            headers: { "content-type": "text/event-stream" }
          }
        )
    );
    const run = async () => {
      for await (const _ of new HttpTransport({ baseUrl: "https://api.test", fetch: failing.fetch() }).stream(
        OPERATIONS["Audit.Tail"],
        {},
        {}
      )) {
        // consume
      }
    };
    await expect(run()).rejects.toMatchObject({ status: 500, message: "Internal server error" });
  });

  it("yields a plain JSON answer as one chunk and fails on an HTTP error", async () => {
    const server = new FakeServer()
      .on("PUT", "/audit/tail", () => ({ ok: true }))
      .on("PUT", "/audit/upload", () => new Response("denied", { status: 403 }));
    const transport = new HttpTransport({ baseUrl: "https://api.test", fetch: server.fetch() });
    const chunks: unknown[] = [];
    for await (const chunk of transport.stream(OPERATIONS["Audit.Tail"], {}, {})) chunks.push(chunk);
    expect(chunks).toEqual([{ ok: true }]);
    const run = async () => {
      for await (const _ of transport.stream(OPERATIONS["Audit.Upload"], {}, {})) {
        // consume
      }
    };
    await expect(run()).rejects.toMatchObject({ status: 403 });
  });

  it("parses NDJSON split across chunks and without a trailing newline", async () => {
    const lines: string[] = [];
    for await (const line of parseNdjson(chunked('{"a":1}\r\n\n{"b":2}', 3))) lines.push(line);
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("parses CRLF server-sent events and multi-line data", async () => {
    const events: unknown[] = [];
    for await (const e of parseSse(
      chunked("data: a\r\ndata: b\r\n\r\nevent: x\rdata: c\r\r: note\r\n\r\ndata: last")
    )) {
      events.push(e);
    }
    expect(events).toEqual([
      { event: "message", data: "a\nb" },
      { event: "x", data: "c" },
      { event: "message", data: "last" }
    ]);
  });

  it("opens a WebSocket for a bidirectional operation", async () => {
    const sent: string[] = [];
    class FakeSocket {
      static OPEN = 1;
      static last: FakeSocket | undefined;
      readyState = 0;
      onopen?: () => void;
      onmessage?: (event: { data: string }) => void;
      onclose?: (event: { wasClean: boolean; code: number; reason: string }) => void;
      onerror?: () => void;
      constructor(readonly url: string) {
        FakeSocket.last = this;
        setTimeout(() => {
          this.readyState = 1;
          this.onopen?.();
        }, 0);
      }
      send(data: string) {
        sent.push(data);
      }
      close() {
        this.readyState = 3;
        this.onclose?.({ wasClean: true, code: 1000, reason: "" });
      }
    }
    const transport = new HttpTransport({ baseUrl: "https://api.test/api", webSocket: FakeSocket as any });
    const stream = transport.connect(OPERATIONS["Audit.Chat"], {});
    expect(FakeSocket.last!.url).toBe("wss://api.test/api/audit/chat");
    stream.send({ frame: "hello" });
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(sent).toEqual(['{"frame":"hello"}']);
    const received: unknown[] = [];
    const reading = (async () => {
      for await (const message of stream) received.push(message);
    })();
    FakeSocket.last!.onmessage?.({ data: '{"frame":"echo"}' });
    FakeSocket.last!.onmessage?.({ data: "raw" });
    stream.close();
    await reading;
    await stream.closed;
    expect(received).toEqual([{ frame: "echo" }, "raw"]);
    expect(() => stream.send({})).toThrow(/closed/);
  });
});
