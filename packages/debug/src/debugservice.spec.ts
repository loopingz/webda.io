import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { createServer, Server, IncomingMessage, ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { AddressInfo } from "node:net";
import { RequestLog } from "./requestlog.js";

// Mocks for the actual DebugService tests
const mockModels = [{ id: "Test/Model", plural: "Models", actions: [], relations: {}, metadata: {} }];
const mockServices = [{ name: "Router", type: "Webda/Router", state: "running", capabilities: {} }];
const mockOperations = [{ id: "Test.Op", input: "Test/Model" }];
const mockRoutes = [{ path: "/test", methods: ["GET"], executor: "TestService" }];
const mockConfig = { services: {}, parameters: {} };
const mockAppInfo = { name: "test-app", workingDirectory: "/tmp" };
const mockLogEntries = [{ id: "l1", timestamp: 1, level: "INFO", message: "hello", args: ["hello"] }];

vi.mock("./introspection.js", () => ({
  getModels: () => mockModels,
  getModel: (id: string) => (id === "Test/Model" ? mockModels[0] : undefined),
  getServices: () => mockServices,
  getOperations: () => mockOperations,
  getRoutes: () => mockRoutes,
  getConfig: () => mockConfig,
  getAppInfo: () => mockAppInfo
}));

const mockRouterCompleteOpenAPI = vi.fn(function completeOpenAPI(doc: any) {
  doc.paths = { "/test": {} };
});
let mockRouterThrows = false;

vi.mock("@webda/core", () => ({
  Service: class {
    parameters: any = {};
    log() {}
    resolve() {
      return this;
    }
    init() {
      return this;
    }
    async stop() {}
  },
  ServiceParameters: class {},
  useDynamicService: () => undefined,
  useCoreEvents: () => () => {},
  useRouter: () => {
    if (mockRouterThrows) throw new Error("No router");
    return { completeOpenAPI: mockRouterCompleteOpenAPI };
  },
  Command: () => () => {}
}));

vi.mock("./tui/tui.js", () => ({
  DebugTui: class {
    async start() {}
  }
}));

/**
 * Helper: create a minimal HTTP server that mirrors the DebugService routing pattern.
 * Returns the server and its assigned port (listening on port 0).
 */
function createTestHttpServer(requestLog: RequestLog): Promise<{ server: Server; port: number }> {
  return new Promise(resolve => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "application/json");

      const pathname = (req.url || "/").split("?")[0];
      try {
        if (pathname === "/api/requests") {
          res.writeHead(200);
          res.end(JSON.stringify(requestLog.getEntries()));
        } else if (pathname === "/api/models") {
          res.writeHead(200);
          res.end(JSON.stringify([{ id: "Test/Model" }]));
        } else if (pathname === "/api/models/Test%2FModel") {
          res.writeHead(200);
          res.end(JSON.stringify({ id: "Test/Model" }));
        } else if (pathname === "/api/models/Unknown") {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Model not found" }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Not found" }));
        }
      } catch (err: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, port });
    });
  });
}

/**
 * Helper: create a WebSocket server that broadcasts messages to all clients
 * (mirrors the DebugService broadcast pattern).
 */
function createTestWsServer(): Promise<{
  server: Server;
  wss: WebSocketServer;
  port: number;
  clients: Set<WebSocket>;
  broadcast: (data: unknown) => void;
}> {
  return new Promise(resolve => {
    const server = createServer();
    const wss = new WebSocketServer({ server });
    const clients = new Set<WebSocket>();

    wss.on("connection", (ws: WebSocket) => {
      clients.add(ws);
      ws.on("close", () => clients.delete(ws));
    });

    const broadcast = (data: unknown) => {
      const message = JSON.stringify(data);
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      }
    };

    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, wss, port, clients, broadcast });
    });
  });
}

// ---------------------------------------------------------------------------
// Tests for the actual DebugService class
// ---------------------------------------------------------------------------

// Dynamic import so mocks are set up first
const { DebugService } = await import("./debugservice.js");

@suite
class DebugServiceHandleRequestTest {
  service: InstanceType<typeof DebugService>;
  port: number;

  async beforeEach() {
    this.service = new DebugService();
    this.service.resolve();
    await this.service.startDebugServer(0);
    this.port = ((this.service as any).server as Server).address().port;
  }

  async afterEach() {
    await this.service.stop();
  }

  @test
  async getApiServicesReturnsServices() {
    const res = await fetch(`http://localhost:${this.port}/api/services`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body, mockServices);
  }

  @test
  async getApiOperationsReturnsOperations() {
    const res = await fetch(`http://localhost:${this.port}/api/operations`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body, mockOperations);
  }

  @test
  async getApiRoutesReturnsRoutes() {
    const res = await fetch(`http://localhost:${this.port}/api/routes`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body, mockRoutes);
  }

  @test
  async getApiConfigReturnsConfig() {
    const res = await fetch(`http://localhost:${this.port}/api/config`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body, mockConfig);
  }

  @test
  async getApiInfoReturnsAppInfo() {
    const res = await fetch(`http://localhost:${this.port}/api/info`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body, mockAppInfo);
  }

  @test
  async getApiOpenapiReturnsOpenAPISpec() {
    mockRouterThrows = false;
    const res = await fetch(`http://localhost:${this.port}/api/openapi`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.openapi, "3.0.3");
    assert.deepStrictEqual(body.paths, { "/test": {} });
  }

  @test
  async getApiOpenapiReturnsStubWhenRouterUnavailable() {
    mockRouterThrows = true;
    try {
      const res = await fetch(`http://localhost:${this.port}/api/openapi`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.openapi, "3.0.3");
      assert.deepStrictEqual(body.paths, {});
    } finally {
      mockRouterThrows = false;
    }
  }

  @test
  async getApiLogsReturnsLogEntries() {
    const res = await fetch(`http://localhost:${this.port}/api/logs`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
  }

  @test
  async getApiLogsWithQueryFiltersLogs() {
    const res = await fetch(`http://localhost:${this.port}/api/logs?q=test`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
  }

  @test
  async getApiModelsIdReturns404ForUnknownModel() {
    const res = await fetch(`http://localhost:${this.port}/api/models/Unknown`);
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.error, "Model not found");
  }

  @test
  async getApiModelsIdReturnsModelForKnownId() {
    const res = await fetch(`http://localhost:${this.port}/api/models/Test%2FModel`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.id, "Test/Model");
  }

  @test
  async optionsRequestReturns204() {
    const res = await fetch(`http://localhost:${this.port}/api/services`, { method: "OPTIONS" });
    assert.strictEqual(res.status, 204);
  }

  @test
  async getApiRequestsReturnsRequestLogEntries() {
    const res = await fetch(`http://localhost:${this.port}/api/requests`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
  }
}

@suite
class DebugServiceStopTest {
  @test
  async closesServerAndWssOnStop() {
    const service = new DebugService();
    service.resolve();
    await service.startDebugServer(0);
    const port = ((service as any).server as Server).address().port;

    // Connect a WS client
    const client = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>(resolve => client.on("open", resolve));

    assert.strictEqual((service as any).clients.size, 1);

    await service.stop();

    assert.strictEqual((service as any).server, undefined);
    assert.strictEqual((service as any).wss, undefined);
    assert.strictEqual((service as any).clients.size, 0);
  }

  @test
  async stopIsSafeToCallWithoutStartingServer() {
    const service = new DebugService();
    // No startDebugServer called - stop should not throw
    await service.stop();
  }
}

@suite
class DebugServiceBroadcastTest {
  @test
  async sendsJsonToConnectedWebSocketClients() {
    const service = new DebugService();
    service.resolve();
    await service.startDebugServer(0);
    const port = ((service as any).server as Server).address().port;

    const client = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>(resolve => client.on("open", resolve));

    const received: any[] = [];
    const msgPromise = new Promise<void>(resolve => {
      client.on("message", (data: Buffer) => {
        received.push(JSON.parse(data.toString()));
        resolve();
      });
    });

    service.broadcast({ type: "restart" });
    await msgPromise;

    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].type, "restart");

    client.close();
    await service.stop();
  }
}

// ---------------------------------------------------------------------------
// Original pattern-based tests (unchanged)
// ---------------------------------------------------------------------------

@suite
class DebugServiceHTTPRoutingPatternTest {
  @test
  async getApiRequestsReturnsLoggedEntries() {
    const requestLog = new RequestLog();
    requestLog.startRequest("r1", "GET", "/foo");
    requestLog.completeRequest("r1", 200, 10);
    const { server, port } = await createTestHttpServer(requestLog);

    try {
      const res = await fetch(`http://localhost:${port}/api/requests`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.length, 1);
      assert.strictEqual(body[0].id, "r1");
      assert.strictEqual(body[0].statusCode, 200);
      assert.strictEqual(body[0].duration, 10);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  @test
  async getApiModelsReturnsModelList() {
    const requestLog = new RequestLog();
    const { server, port } = await createTestHttpServer(requestLog);

    try {
      const res = await fetch(`http://localhost:${port}/api/models`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.length, 1);
      assert.strictEqual(body[0].id, "Test/Model");
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  @test
  async getApiModelsIdReturnsASpecificModel() {
    const requestLog = new RequestLog();
    const { server, port } = await createTestHttpServer(requestLog);

    try {
      const res = await fetch(`http://localhost:${port}/api/models/Test%2FModel`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.id, "Test/Model");
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  @test
  async getApiModelsIdReturns404ForUnknownModel() {
    const requestLog = new RequestLog();
    const { server, port } = await createTestHttpServer(requestLog);

    try {
      const res = await fetch(`http://localhost:${port}/api/models/Unknown`);
      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.error, "Model not found");
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  @test
  async unknownPathsReturn404() {
    const requestLog = new RequestLog();
    const { server, port } = await createTestHttpServer(requestLog);

    try {
      const res = await fetch(`http://localhost:${port}/api/unknown`);
      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.error, "Not found");
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  @test
  async setsCorsHeaderOnResponses() {
    const requestLog = new RequestLog();
    const { server, port } = await createTestHttpServer(requestLog);

    try {
      const res = await fetch(`http://localhost:${port}/api/requests`);
      assert.strictEqual(res.headers.get("access-control-allow-origin"), "*");
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }
}

@suite
class DebugServiceWebSocketBroadcastPatternTest {
  @test
  async broadcastsRequestLogEventsToConnectedClients() {
    const { server, wss, port, clients, broadcast } = await createTestWsServer();

    try {
      const received: any[] = [];
      const client = new WebSocket(`ws://localhost:${port}`);

      await new Promise<void>(resolve => client.on("open", resolve));

      const messagePromise = new Promise<void>(resolve => {
        client.on("message", (data: Buffer) => {
          received.push(JSON.parse(data.toString()));
          if (received.length === 2) resolve();
        });
      });

      // Simulate a request log event being broadcast
      const requestLog = new RequestLog();
      requestLog.onEvent(event => broadcast(event));
      requestLog.startRequest("ws-1", "GET", "/test");
      requestLog.completeRequest("ws-1", 200, 5);

      await messagePromise;

      assert.strictEqual(received.length, 2);
      assert.strictEqual(received[0].type, "request");
      assert.strictEqual(received[0].id, "ws-1");
      assert.strictEqual(received[1].type, "result");
      assert.strictEqual(received[1].statusCode, 200);

      client.close();
    } finally {
      for (const c of clients) c.close();
      wss.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  @test
  async broadcastsARestartEventToAllClients() {
    const { server, wss, port, clients, broadcast } = await createTestWsServer();

    try {
      const client1 = new WebSocket(`ws://localhost:${port}`);
      const client2 = new WebSocket(`ws://localhost:${port}`);

      await Promise.all([
        new Promise<void>(resolve => client1.on("open", resolve)),
        new Promise<void>(resolve => client2.on("open", resolve))
      ]);

      const messages1: any[] = [];
      const messages2: any[] = [];

      const p1 = new Promise<void>(resolve => {
        client1.on("message", (data: Buffer) => {
          messages1.push(JSON.parse(data.toString()));
          resolve();
        });
      });
      const p2 = new Promise<void>(resolve => {
        client2.on("message", (data: Buffer) => {
          messages2.push(JSON.parse(data.toString()));
          resolve();
        });
      });

      broadcast({ type: "restart" });

      await Promise.all([p1, p2]);

      assert.strictEqual(messages1.length, 1);
      assert.strictEqual(messages1[0].type, "restart");
      assert.strictEqual(messages2.length, 1);
      assert.strictEqual(messages2[0].type, "restart");

      client1.close();
      client2.close();
    } finally {
      for (const c of clients) c.close();
      wss.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  @test
  async removesClientsThatDisconnect() {
    const { server, wss, port, clients, broadcast } = await createTestWsServer();

    try {
      const client = new WebSocket(`ws://localhost:${port}`);
      await new Promise<void>(resolve => client.on("open", resolve));

      assert.strictEqual(clients.size, 1);

      const closePromise = new Promise<void>(resolve => {
        const interval = setInterval(() => {
          if (clients.size === 0) {
            clearInterval(interval);
            resolve();
          }
        }, 10);
      });

      client.close();
      await closePromise;

      assert.strictEqual(clients.size, 0);
    } finally {
      for (const c of clients) c.close();
      wss.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }
}
