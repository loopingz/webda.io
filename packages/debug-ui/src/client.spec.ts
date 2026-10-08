import * as assert from "assert";
import { afterEach, vi, describe, it } from "vitest";
import {
  classifyNetworkError,
  createDebugClient,
  DebugClientError,
  deriveWsUrl,
  localhostBaseUrl,
  WS_PROTOCOL,
  WS_TOKEN_PREFIX
} from "./client.js";
import { FakeWebSocket, healthyRoutes, installFetch, installWebSocket, INFO, TOKEN } from "./test/harness.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DebugClientUrlTest", () => {
  it("normalizesTheBaseUrl", () => {
    const client = createDebugClient({ baseUrl: "http://localhost:18181/", token: TOKEN });
    assert.strictEqual(client.baseUrl, "http://localhost:18181");
    assert.strictEqual(client.wsUrl, "ws://localhost:18181/ws");
  });

  it("derivesSecureWebSocketUrls", () => {
    assert.strictEqual(deriveWsUrl("https://example.com"), "wss://example.com/ws");
    assert.strictEqual(deriveWsUrl("http://127.0.0.1:18181/"), "ws://127.0.0.1:18181/ws");
  });

  it("buildsLoopbackBaseUrls", () => {
    assert.strictEqual(localhostBaseUrl(18181), "http://localhost:18181");
    assert.strictEqual(localhostBaseUrl(1234, "127.0.0.1"), "http://127.0.0.1:1234");
  });
});

describe("DebugClientRequestTest", () => {
  it("sendsTheBearerTokenOnEveryRequest", async () => {
    const fetchMock = installFetch(healthyRoutes(), { token: TOKEN });
    const client = createDebugClient({ baseUrl: "http://localhost:18181", token: TOKEN });
    const info = await client.getInfo();
    assert.deepStrictEqual(info, INFO);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    assert.strictEqual(url, "http://localhost:18181/api/info");
    assert.strictEqual(new Headers(init.headers).get("authorization"), `Bearer ${TOKEN}`);
    assert.strictEqual(init.credentials, "omit");
  });

  it("encodesIdentifiers", async () => {
    const fetchMock = installFetch({ ...healthyRoutes(), "/api/models/Sample%2FUser": { id: "Sample/User" } });
    const client = createDebugClient({ baseUrl: "http://localhost:18181" });
    await client.getModel("Sample/User");
    await client.getRequestDetail("r1");
    await client.getLogs("a b");
    const urls = fetchMock.mock.calls.map(c => c[0]);
    assert.deepStrictEqual(urls, [
      "http://localhost:18181/api/models/Sample%2FUser",
      "http://localhost:18181/api/requests/r1",
      "http://localhost:18181/api/logs?q=a%20b"
    ]);
  });

  it("mapsUnauthorizedResponses", async () => {
    installFetch(healthyRoutes(), { token: TOKEN });
    const client = createDebugClient({ baseUrl: "http://localhost:18181", token: "wrong" });
    await assert.rejects(
      client.getInfo(),
      (err: DebugClientError) => err.reason === "unauthorized" && err.status === 401
    );
  });

  it("mapsNotFoundResponses", async () => {
    installFetch(healthyRoutes());
    const client = createDebugClient({ baseUrl: "http://localhost:18181" });
    await assert.rejects(
      client.get("/api/missing"),
      (err: DebugClientError) => err.reason === "not_found" && err.status === 404
    );
  });

  it("mapsOtherHttpErrors", async () => {
    installFetch({ "/api/info": { status: 500, body: { error: "boom" } } });
    const client = createDebugClient({ baseUrl: "http://localhost:18181" });
    await assert.rejects(client.getInfo(), (err: DebugClientError) => err.reason === "http" && err.status === 500);
  });

  it("mapsNetworkFailuresToUnreachable", async () => {
    installFetch({}, { networkError: true });
    const client = createDebugClient({ baseUrl: "http://localhost:18181", pageProtocol: "http:" });
    await assert.rejects(client.getInfo(), (err: DebugClientError) => err.reason === "unreachable");
  });

  it("mapsNetworkFailuresFromHttpsPagesToMixedContent", async () => {
    installFetch({}, { networkError: true });
    const client = createDebugClient({ baseUrl: "http://localhost:18181", pageProtocol: "https:" });
    await assert.rejects(client.getInfo(), (err: DebugClientError) => err.reason === "mixed_content");
    assert.strictEqual(classifyNetworkError("https:", "http://localhost:1"), "mixed_content");
    assert.strictEqual(classifyNetworkError("https:", "https://localhost:1"), "unreachable");
    assert.strictEqual(classifyNetworkError(undefined, "http://localhost:1"), "unreachable");
  });
});

describe("DebugClientSocketTest", () => {
  it("offersTheTokenAsSubProtocol", () => {
    installWebSocket();
    const client = createDebugClient({ baseUrl: "http://localhost:18181", token: TOKEN });
    const socket = client.connect();
    const ws = FakeWebSocket.instances[0];
    assert.strictEqual(ws.url, "ws://localhost:18181/ws");
    assert.deepStrictEqual(ws.protocols, [WS_PROTOCOL, `${WS_TOKEN_PREFIX}${TOKEN}`]);
    socket.disconnect();
  });

  it("dispatchesEventsAndStatus", async () => {
    installWebSocket();
    const client = createDebugClient({ baseUrl: "http://localhost:18181", token: TOKEN });
    const socket = client.connect();
    const events: unknown[] = [];
    const statuses: boolean[] = [];
    socket.onEvent(e => events.push(e));
    socket.onStatus(s => statuses.push(s));
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.emit({ type: "restart" });
    assert.deepStrictEqual(events, [{ type: "restart" }]);
    assert.strictEqual(socket.connected, true);
    socket.disconnect();
    assert.deepStrictEqual(statuses, [true, false]);
    assert.strictEqual(ws.readyState, FakeWebSocket.CLOSED);
  });

  it("reconnectsAfterClose", async () => {
    vi.useFakeTimers();
    try {
      installWebSocket();
      const client = createDebugClient({ baseUrl: "http://localhost:18181", token: TOKEN });
      const socket = client.connect();
      FakeWebSocket.instances[0].open();
      FakeWebSocket.instances[0].close();
      await vi.advanceTimersByTimeAsync(600);
      assert.strictEqual(FakeWebSocket.instances.length, 2);
      socket.disconnect();
      await vi.advanceTimersByTimeAsync(5000);
      assert.strictEqual(FakeWebSocket.instances.length, 2, "no reconnect after disconnect");
    } finally {
      vi.useRealTimers();
    }
  });
});
