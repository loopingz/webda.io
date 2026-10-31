import { afterEach, describe, expect, it, vi } from "vitest";
import type { CallContext, Transport } from "./types.js";
import { WebdaClient } from "./client.js";
import { FakeServer, MODELS, OPERATIONS } from "./fixture.js";
import { ModelClient } from "./model-client.js";
import { SdkModel } from "./model.js";
import { traceHeaders } from "./tracing.js";

class Task extends SdkModel<{ uuid: string; title: string }> {
  declare uuid: string;
}

const TRACING_OPERATIONS = {
  ...OPERATIONS,
  "Otel.EnableWebTracing": {
    id: "Otel.EnableWebTracing",
    input: "enableWebTracingRequest",
    output: "enableWebTracingResponse",
    streaming: "none",
    kind: "service",
    rest: { method: "post", path: "/otel/tracing", pathParams: [] }
  }
} as typeof OPERATIONS;

const TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/;

/**
 * @param expiresAt - expiry returned by the server
 * @returns a client and its server
 */
function setup(expiresAt: number = Date.now() + 60000) {
  const server = new FakeServer();
  server.on("POST", "/otel/tracing", (_m, req) => ({
    token: "tok-1",
    sessionId: req.body?.sessionId ?? "generated",
    expiresAt
  }));
  server.on("GET", "/tasks/:uuid", m => ({ uuid: m[1], title: "t" }));
  const client = new WebdaClient({
    baseUrl: "https://api.test",
    fetch: server.fetch(),
    operations: TRACING_OPERATIONS,
    models: MODELS
  });
  const tasks = new ModelClient<Task>(client, MODELS["App/Task"], Task);
  const last = () => server.requests[server.requests.length - 1].headers as Record<string, string>;
  return { server, client, tasks, last };
}

describe("web tracing", () => {
  afterEach(() => vi.useRealTimers());

  it("sends no trace header before enabling", async () => {
    const { client, tasks, server } = setup();
    await client.call("Task.Get", { uuid: "t1" } as any);
    await tasks.get("t1");
    for (const req of server.requests) {
      expect(req.headers["X-Webda-Trace"]).toBeUndefined();
      expect(req.headers.traceparent).toBeUndefined();
      expect(req.headers.baggage).toBeUndefined();
    }
    expect(client.isWebTracing()).toBe(false);
  });

  it("sends the headers on operations and model calls once enabled", async () => {
    const { client, tasks, server, last } = setup();
    const res = await client.enableWebTracing("rec-1");
    expect(res.sessionId).toBe("rec-1");
    expect(client.isWebTracing()).toBe(true);
    expect(server.requests[0].headers["X-Webda-Trace"]).toBeUndefined();
    await client.call("Task.Get", { uuid: "t1" } as any);
    for (const check of [last(), (await tasks.get("t2"), last())]) {
      expect(check["X-Webda-Trace"]).toBe("tok-1");
      expect(check.baggage).toBe("session.id=rec-1");
      expect(check.traceparent).toMatch(TRACEPARENT);
    }
  });

  it("generates a new trace id per call", async () => {
    const { client, last } = setup();
    await client.enableWebTracing("rec-1");
    await client.call("Task.Get", { uuid: "t1" } as any);
    const a = last().traceparent;
    await client.call("Task.Get", { uuid: "t2" } as any);
    expect(last().traceparent).not.toBe(a);
  });

  it("lets a caller header win", async () => {
    const { client, last } = setup();
    await client.enableWebTracing("rec-1");
    const tp = "00-" + "a".repeat(32) + "-" + "b".repeat(16) + "-01";
    await client.call("Task.Get", { uuid: "t1" } as any, { headers: { traceparent: tp } });
    expect(last().traceparent).toBe(tp);
    expect(last()["X-Webda-Trace"]).toBe("tok-1");
  });

  it("uses the active span context from the callback", async () => {
    const { client, last } = setup();
    const traceId = "1234567890abcdef1234567890abcdef";
    await client.enableWebTracing("rec-1", { activeSpanContext: () => ({ traceId, spanId: "0123456789abcdef" }) });
    await client.call("Task.Get", { uuid: "t1" } as any);
    expect(last().traceparent).toBe(`00-${traceId}-0123456789abcdef-01`);
  });

  it("falls back to random ids when the callback gives nothing valid", async () => {
    const { client, last } = setup();
    await client.enableWebTracing("rec-1", { activeSpanContext: () => ({ traceId: "0".repeat(32), spanId: "x" }) });
    await client.call("Task.Get", { uuid: "t1" } as any);
    expect(last().traceparent).toMatch(TRACEPARENT);
    expect(last().traceparent).not.toContain("0".repeat(32));
  });

  it("uses a custom operation id", async () => {
    const { client, server } = setup();
    server.on("POST", "/custom", () => ({ token: "t", sessionId: "s", expiresAt: Date.now() + 1000 }));
    const ops = {
      ...TRACING_OPERATIONS,
      "My.Op": {
        ...TRACING_OPERATIONS["Otel.EnableWebTracing"],
        id: "My.Op",
        rest: { method: "post", path: "/custom", pathParams: [] }
      }
    };
    (client as any).operations = ops;
    await client.enableWebTracing(undefined, { operationId: "My.Op" });
    expect(server.requests[0].url).toContain("/custom");
  });

  it("stops after disableWebTracing", async () => {
    const { client, last } = setup();
    await client.enableWebTracing("rec-1");
    client.disableWebTracing();
    expect(client.isWebTracing()).toBe(false);
    await client.call("Task.Get", { uuid: "t1" } as any);
    expect(last()["X-Webda-Trace"]).toBeUndefined();
    expect(last().traceparent).toBeUndefined();
  });

  it("stops once expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { client, last } = setup(1_000_000 + 5000);
    await client.enableWebTracing("rec-1");
    expect(client.isWebTracing()).toBe(true);
    vi.setSystemTime(1_000_000 + 5000);
    expect(client.isWebTracing()).toBe(false);
    await client.call("Task.Get", { uuid: "t1" } as any);
    expect(last()["X-Webda-Trace"]).toBeUndefined();
  });

  it("lets a caller header win whatever its case", async () => {
    const { client, last } = setup();
    await client.enableWebTracing("rec-1");
    const tp = "00-" + "a".repeat(32) + "-" + "b".repeat(16) + "-01";
    await client.call("Task.Get", { uuid: "t1" } as any, { headers: { Traceparent: tp, "x-webda-trace": "mine" } });
    const h = last();
    expect(h.Traceparent).toBe(tp);
    expect(h["x-webda-trace"]).toBe("mine");
    expect(h.traceparent).toBeUndefined();
    expect(h["X-Webda-Trace"]).toBeUndefined();
    expect(h.baggage).toBe("session.id=rec-1");
  });

  it("ignores malformed span contexts from the callback", async () => {
    const { client, last } = setup();
    const good = "0123456789abcdef";
    const cases = [
      { traceId: "A".repeat(32), spanId: good },
      { traceId: "ab", spanId: good },
      { traceId: "1".repeat(32), spanId: "short" },
      { traceId: "bad", spanId: good }
    ];
    for (const ctx of cases) {
      await client.enableWebTracing("rec-1", { activeSpanContext: () => ctx });
      await client.call("Task.Get", { uuid: "t1" } as any);
      const tp = last().traceparent;
      expect(tp).toMatch(TRACEPARENT);
      expect(tp).not.toContain(ctx.traceId);
    }
  });

  it("reaches every transport and call kind", async () => {
    const seen: Record<string, CallContext | undefined> = {};
    const stub = (name: string): Transport => ({
      name,
      supports: () => true,
      call: async (op, _i, ctx) => {
        seen[name + ".call"] = ctx;
        return op.id === "Otel.EnableWebTracing"
          ? { token: "tok-1", sessionId: "rec-1", expiresAt: Date.now() + 9999 }
          : {};
      },
      async *stream(_op, _i, ctx) {
        seen[name + ".stream"] = ctx;
      },
      connect: (_op, ctx) => {
        seen[name + ".connect"] = ctx;
        return {} as any;
      }
    });
    for (const name of ["graphql", "grpc"]) {
      const client = new WebdaClient({ transports: [stub(name)], operations: TRACING_OPERATIONS, models: MODELS });
      await client.enableWebTracing("rec-1");
      await client.call("Task.Get", { uuid: "t1" } as any);
      for await (const _ of client.stream("Task.Get", { uuid: "t1" } as any)) void _;
      client.connect("Task.Get");
      for (const kind of ["call", "stream", "connect"]) {
        const h = seen[`${name}.${kind}`]?.headers;
        expect(h?.["X-Webda-Trace"], `${name}.${kind}`).toBe("tok-1");
        expect(h?.baggage).toBe("session.id=rec-1");
        expect(h?.traceparent).toMatch(TRACEPARENT);
      }
    }
  });

  it("traceHeaders is empty without state or when expired", () => {
    expect(traceHeaders(undefined)).toEqual({});
    expect(traceHeaders({ token: "t", sessionId: "s", expiresAt: 10 }, 10)).toEqual({});
    expect(traceHeaders({ token: "t", sessionId: "s", expiresAt: 10 }, 5)["X-Webda-Trace"]).toBe("t");
  });
});
