import { afterEach, describe, expect, it, vi } from "vitest";
import { SdkError } from "./errors.js";
import { chunked, FakeServer, OPERATIONS } from "./fixture.js";
import { HttpTransport, parseNdjson, parseSse } from "./http.js";

describe("HttpTransport", () => {
  it("uses explicit query fields, repeated scalar arrays, catch-all objects and whole JSON bodies", () => {
    const transport = new HttpTransport({ baseUrl: "https://api.test" });
    const operation = {
      ...OPERATIONS["Task.Archive"],
      rest: {
        method: "post" as const,
        path: "/tasks/{uuid}/assign",
        pathParams: ["uuid"],
        query: ["notify", "tags"],
        queryCatchAll: "filters",
        body: "payload"
      }
    };
    expect(
      transport.prepare(
        operation,
        {
          uuid: "t1",
          notify: true,
          tags: [1, 2],
          filters: { limit: 5, active: false, notify: false },
          payload: { name: "new" }
        },
        {}
      )
    ).toEqual({
      url: "https://api.test/tasks/t1/assign?notify=true&tags=1&tags=2&limit=5&active=false",
      method: "POST",
      body: { name: "new" }
    });
    expect(
      transport.prepare(
        { ...operation, rest: { method: "get", path: "/tasks", pathParams: [], query: ["tags"] } },
        { tags: ["a", "b"] },
        {}
      )
    ).toEqual({
      url: "https://api.test/tasks?tags=a&tags=b",
      method: "GET"
    });
    expect(
      transport.prepare(
        { ...operation, rest: { method: "get", path: "/tasks", pathParams: [], query: ["tags"] } },
        { tags: [] },
        {}
      ).url
    ).toBe("https://api.test/tasks?tags=");
  });

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
  it("skips unknown SSE fields, holds a split CRLF and ends cleanly without a trailing event", async () => {
    const events: unknown[] = [];
    // One byte per chunk: every \r arrives alone, before its \n
    for await (const e of parseSse(chunked("id: 7\r\nretry: 10\r\ndata: a\r\n\r\ndata: b\r\n\r\n", 1))) events.push(e);
    expect(events).toEqual([
      { event: "message", data: "a" },
      { event: "message", data: "b" }
    ]);
  });

  it("reports failures with the body, the status text or the status", async () => {
    const server = new FakeServer()
      .on("GET", "/tasks/coded", () => new Response(JSON.stringify({ error: { code: 7 } }), { status: 409 }))
      .on("GET", "/tasks/empty", () => new Response("", { status: 503, statusText: "Unavailable" }))
      .on("GET", "/tasks/bare", () => new Response(null, { status: 502 }));
    const transport = new HttpTransport({ baseUrl: "https://api.test", fetch: server.fetch() });
    await expect(transport.call(OPERATIONS["Task.Get"], { uuid: "coded" }, {})).rejects.toMatchObject({
      status: 409,
      code: "7",
      message: '{"error":{"code":7}}'
    });
    await expect(transport.call(OPERATIONS["Task.Get"], { uuid: "empty" }, {})).rejects.toMatchObject({
      status: 503,
      message: "Unavailable"
    });
    await expect(transport.call(OPERATIONS["Task.Get"], { uuid: "bare" }, {})).rejects.toMatchObject({
      status: 502,
      message: "HTTP 502"
    });
    // A rejection that is not an Error
    const offline = new HttpTransport({
      baseUrl: "https://api.test",
      fetch: (async () => {
        throw undefined;
      }) as any
    });
    await expect(offline.call(OPERATIONS["Task.Get"], { uuid: "t1" }, {})).rejects.toMatchObject({
      status: 0,
      message: "Network error"
    });
  });

  it("skips null query values and serializes non-string ones", () => {
    const transport = new HttpTransport({ baseUrl: "https://api.test" });
    expect(
      transport.prepare(OPERATIONS["Tasks.Query"], { q: "a = 1", limit: 5, skip: null, none: undefined }, {}).url
    ).toBe("https://api.test/tasks?q=a+%3D+1&limit=5");
    const operation = {
      ...OPERATIONS["Task.Get"],
      rest: { method: "get" as const, path: "/tasks/{uuid}", pathParams: ["uuid"], queryCatchAll: "filters" }
    };
    for (const filters of [null, "invalid", ["invalid"], undefined]) {
      expect(transport.prepare(operation, { uuid: "t1", filters }, {}).url).toBe("https://api.test/tasks/t1");
    }
  });

  describe("with the global fetch", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("uses globalThis.fetch and reads empty or untyped answers", async () => {
      const server = new FakeServer()
        .on("GET", "/tasks/empty", () => new Response("", { headers: { "content-type": "application/json" } }))
        .on("GET", "/tasks/raw", () => new Response(new TextEncoder().encode('{"uuid":"raw"}')))
        .on("GET", "/tasks/text", () => new Response(new TextEncoder().encode("hello")));
      vi.stubGlobal("fetch", server.fetch());
      const transport = new HttpTransport({ baseUrl: "https://api.test" });
      expect(await transport.call(OPERATIONS["Task.Get"], { uuid: "empty" }, {})).toBeUndefined();
      expect(await transport.call(OPERATIONS["Task.Get"], { uuid: "raw" }, {})).toEqual({ uuid: "raw" });
      expect(await transport.call(OPERATIONS["Task.Get"], { uuid: "text" }, {})).toBe("hello");
      expect(server.requests[0].headers.Accept).toBe("application/json");
    });
  });

  it("streams the edge cases: no body, empty data, untyped plain answers and errors without details", async () => {
    let answer: () => Response = () => new Response(null);
    const server = new FakeServer().on("PUT", "/audit/tail", () => answer());
    const transport = new HttpTransport({ baseUrl: "https://api.test", fetch: server.fetch() });
    const collect = async () => {
      const chunks: unknown[] = [];
      for await (const chunk of transport.stream(OPERATIONS["Audit.Tail"], {}, {})) chunks.push(chunk);
      return chunks;
    };
    // No body at all
    expect(await collect()).toEqual([]);
    // SSE without an end event, with an empty data line
    answer = () =>
      new Response(chunked('data:\n\ndata: {"n":1}\n\n'), { headers: { "content-type": "text/event-stream" } });
    expect(await collect()).toEqual([undefined, { n: 1 }]);
    // SSE error event without a message nor a code
    answer = () =>
      new Response(chunked("event: error\ndata: {}\n\n"), { headers: { "content-type": "text/event-stream" } });
    await expect(collect()).rejects.toMatchObject({ status: 500, message: "Stream error" });
    // NDJSON error line without a message nor a code
    answer = () => new Response(chunked('{"error":"boom"}\n'), { headers: { "content-type": "application/x-ndjson" } });
    await expect(collect()).rejects.toMatchObject({ status: 500, message: "Stream error" });
    // NDJSON error line with a message and a non-numeric code
    answer = () =>
      new Response(chunked('{"error":{"message":"Bad","code":"E_BAD"}}\n'), {
        headers: { "content-type": "application/x-ndjson" }
      });
    await expect(collect()).rejects.toMatchObject({ status: 500, message: "Bad", code: "E_BAD" });
    // Plain answers: untyped text, empty
    answer = () => new Response(new TextEncoder().encode("hello"));
    expect(await collect()).toEqual(["hello"]);
    answer = () => new Response("", { headers: { "content-type": "application/json" } });
    expect(await collect()).toEqual([]);
  });

  describe("WebSocket", () => {
    /** A controllable WebSocket */
    class FakeSocket {
      static last: FakeSocket;
      readyState = 0;
      sent: string[] = [];
      onopen?: () => void;
      onmessage?: (event: { data: unknown }) => void;
      onclose?: (event: { wasClean: boolean; code: number; reason: string }) => void;
      onerror?: () => void;
      constructor(readonly url: string) {
        FakeSocket.last = this;
      }
      open() {
        this.readyState = 1;
        this.onopen?.();
      }
      send(data: string) {
        this.sent.push(data);
      }
      close() {
        this.end(true, 1000, "");
      }
      end(wasClean: boolean, code: number, reason: string) {
        this.readyState = 3;
        this.onclose?.({ wasClean, code, reason });
      }
    }

    afterEach(() => vi.unstubAllGlobals());

    it("uses the global WebSocket and fails when there is none", () => {
      vi.stubGlobal("WebSocket", FakeSocket);
      const transport = new HttpTransport({ baseUrl: "http://api.test" });
      transport.connect(OPERATIONS["Audit.Chat"], {});
      expect(FakeSocket.last.url).toBe("ws://api.test/audit/chat");
      vi.stubGlobal("WebSocket", undefined);
      expect(() => transport.connect(OPERATIONS["Audit.Chat"], {})).toThrow(/WebSocket is not available/);
    });

    it("sends right away once open, ends pending readers on a clean close and stops on return", async () => {
      const transport = new HttpTransport({ baseUrl: "https://api.test", webSocket: FakeSocket as any });
      const stream = transport.connect(OPERATIONS["Audit.Chat"], {});
      const socket = FakeSocket.last;
      socket.open();
      stream.send({ a: 1 });
      expect(socket.sent).toEqual(['{"a":1}']);
      const iterator = stream[Symbol.asyncIterator]();
      const pending = iterator.next();
      socket.close();
      expect(await pending).toEqual({ value: undefined, done: true });
      expect(await iterator.next()).toEqual({ value: undefined, done: true });
      await stream.closed;

      // Breaking out of the loop closes the socket
      const second = transport.connect(OPERATIONS["Audit.Chat"], {});
      const other = FakeSocket.last;
      other.open();
      other.onmessage?.({ data: "1" });
      for await (const message of second) {
        expect(message).toBe(1);
        break;
      }
      expect(other.readyState).toBe(3);
    });

    it("closes on abort and rejects readers after an error or an unclean close", async () => {
      const controller = new AbortController();
      const transport = new HttpTransport({ baseUrl: "https://api.test", webSocket: FakeSocket as any });
      const aborted = transport.connect(OPERATIONS["Audit.Chat"], { signal: controller.signal });
      const abortedSocket = FakeSocket.last;
      controller.abort();
      expect(abortedSocket.readyState).toBe(3);
      await aborted.closed;

      // An error then a close: the pending reader and the next ones reject with the error
      const failing = transport.connect(OPERATIONS["Audit.Chat"], {});
      const socket = FakeSocket.last;
      const iterator = failing[Symbol.asyncIterator]();
      const pending = iterator.next();
      socket.onerror?.();
      socket.onerror?.();
      socket.end(false, 1006, "");
      await expect(pending).rejects.toThrow("WebSocket error on Audit.Chat");
      await expect(iterator.next()).rejects.toThrow("WebSocket error on Audit.Chat");
      await expect(failing.closed).rejects.toThrow("WebSocket error on Audit.Chat");

      // An unclean close, with or without a reason
      const dropped = transport.connect(OPERATIONS["Audit.Chat"], {});
      FakeSocket.last.end(false, 1011, "Server restart");
      await expect(dropped.closed).rejects.toThrow("Server restart");
      const silent = transport.connect(OPERATIONS["Audit.Chat"], {});
      FakeSocket.last.end(false, 1006, "");
      await expect(silent.closed).rejects.toThrow("WebSocket closed (1006)");
    });
  });

  it("FakeServer defaults to GET without headers and answers 404 to unknown routes", async () => {
    const server = new FakeServer();
    const response = await server.fetch()("https://api.test/nowhere");
    expect(response.status).toBe(404);
    expect(server.requests[0]).toMatchObject({ method: "GET", headers: {}, body: undefined });
  });
});
