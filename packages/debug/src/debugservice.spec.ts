import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

let mockRouterCompleteOpenAPI = vi.fn(function completeOpenAPI(doc: any) {
  doc.paths = { "/test": {} };
});
let mockRouterThrows = false;

vi.mock("@webda/core", () => ({
  Service: class {
    parameters: any = {};
    log() {}
    resolve() { return this; }
    init() { return this; }
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

describe("DebugService.handleRequest (real class)", () => {
  let service: InstanceType<typeof DebugService>;
  let port: number;

  beforeEach(async () => {
    service = new DebugService();
    // Resolve won't fail because useCoreEvents is mocked
    service.resolve();
    await service.startDebugServer(0);
    port = ((service as any).server as Server).address().port;
  });

  afterEach(async () => {
    await service.stop();
  });

  it("GET /api/services returns services", async () => {
    const res = await fetch(`http://localhost:${port}/api/services`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockServices);
  });

  it("GET /api/operations returns operations", async () => {
    const res = await fetch(`http://localhost:${port}/api/operations`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockOperations);
  });

  it("GET /api/routes returns routes", async () => {
    const res = await fetch(`http://localhost:${port}/api/routes`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockRoutes);
  });

  it("GET /api/config returns config", async () => {
    const res = await fetch(`http://localhost:${port}/api/config`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockConfig);
  });

  it("GET /api/info returns app info", async () => {
    const res = await fetch(`http://localhost:${port}/api/info`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockAppInfo);
  });

  it("GET /api/openapi returns OpenAPI spec", async () => {
    mockRouterThrows = false;
    const res = await fetch(`http://localhost:${port}/api/openapi`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe("3.0.3");
    expect(body.paths).toEqual({ "/test": {} });
  });

  it("GET /api/openapi returns stub when router unavailable", async () => {
    mockRouterThrows = true;
    const res = await fetch(`http://localhost:${port}/api/openapi`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe("3.0.3");
    expect(body.paths).toEqual({});
    mockRouterThrows = false;
  });

  it("GET /api/logs returns log entries", async () => {
    const res = await fetch(`http://localhost:${port}/api/logs`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/logs?q=search filters logs", async () => {
    const res = await fetch(`http://localhost:${port}/api/logs?q=test`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/models/:id returns 404 for unknown model", async () => {
    const res = await fetch(`http://localhost:${port}/api/models/Unknown`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Model not found");
  });

  it("GET /api/models/:id returns model for known id", async () => {
    const res = await fetch(`http://localhost:${port}/api/models/Test%2FModel`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("Test/Model");
  });

  it("OPTIONS request returns 204", async () => {
    const res = await fetch(`http://localhost:${port}/api/services`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
  });

  it("GET /api/requests returns request log entries", async () => {
    const res = await fetch(`http://localhost:${port}/api/requests`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("DebugService.stop cleans up resources", () => {
  it("closes server and wss on stop", async () => {
    const service = new DebugService();
    service.resolve();
    await service.startDebugServer(0);
    const port = ((service as any).server as Server).address().port;

    // Connect a WS client
    const client = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>(resolve => client.on("open", resolve));

    expect((service as any).clients.size).toBe(1);

    await service.stop();

    expect((service as any).server).toBeUndefined();
    expect((service as any).wss).toBeUndefined();
    expect((service as any).clients.size).toBe(0);
  });

  it("stop is safe to call without starting server", async () => {
    const service = new DebugService();
    // No startDebugServer called - stop should not throw
    await service.stop();
  });
});

describe("DebugService.broadcast", () => {
  it("sends JSON to connected WebSocket clients", async () => {
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

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("restart");

    client.close();
    await service.stop();
  });
});

// ---------------------------------------------------------------------------
// Original pattern-based tests (unchanged)
// ---------------------------------------------------------------------------

describe("DebugService HTTP routing pattern", () => {
  let server: Server;
  let port: number;
  let requestLog: RequestLog;

  afterEach(async () => {
    if (server) {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it("GET /api/requests returns logged entries", async () => {
    requestLog = new RequestLog();
    requestLog.startRequest("r1", "GET", "/foo");
    requestLog.completeRequest("r1", 200, 10);
    ({ server, port } = await createTestHttpServer(requestLog));

    const res = await fetch(`http://localhost:${port}/api/requests`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("r1");
    expect(body[0].statusCode).toBe(200);
    expect(body[0].duration).toBe(10);
  });

  it("GET /api/models returns model list", async () => {
    requestLog = new RequestLog();
    ({ server, port } = await createTestHttpServer(requestLog));

    const res = await fetch(`http://localhost:${port}/api/models`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("Test/Model");
  });

  it("GET /api/models/:id returns a specific model", async () => {
    requestLog = new RequestLog();
    ({ server, port } = await createTestHttpServer(requestLog));

    const res = await fetch(`http://localhost:${port}/api/models/Test%2FModel`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("Test/Model");
  });

  it("GET /api/models/:id returns 404 for unknown model", async () => {
    requestLog = new RequestLog();
    ({ server, port } = await createTestHttpServer(requestLog));

    const res = await fetch(`http://localhost:${port}/api/models/Unknown`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Model not found");
  });

  it("unknown paths return 404", async () => {
    requestLog = new RequestLog();
    ({ server, port } = await createTestHttpServer(requestLog));

    const res = await fetch(`http://localhost:${port}/api/unknown`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not found");
  });

  it("sets CORS header on responses", async () => {
    requestLog = new RequestLog();
    ({ server, port } = await createTestHttpServer(requestLog));

    const res = await fetch(`http://localhost:${port}/api/requests`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("DebugService WebSocket broadcast pattern", () => {
  let server: Server;
  let wss: WebSocketServer;
  let port: number;
  let clients: Set<WebSocket>;
  let broadcast: (data: unknown) => void;

  afterEach(async () => {
    for (const c of clients) c.close();
    wss.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("broadcasts request log events to connected clients", async () => {
    ({ server, wss, port, clients, broadcast } = await createTestWsServer());

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

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe("request");
    expect(received[0].id).toBe("ws-1");
    expect(received[1].type).toBe("result");
    expect(received[1].statusCode).toBe(200);

    client.close();
  });

  it("broadcasts a restart event to all clients", async () => {
    ({ server, wss, port, clients, broadcast } = await createTestWsServer());

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

    expect(messages1).toHaveLength(1);
    expect(messages1[0].type).toBe("restart");
    expect(messages2).toHaveLength(1);
    expect(messages2[0].type).toBe("restart");

    client1.close();
    client2.close();
  });

  it("removes clients that disconnect", async () => {
    ({ server, wss, port, clients, broadcast } = await createTestWsServer());

    const client = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>(resolve => client.on("open", resolve));

    expect(clients.size).toBe(1);

    const closePromise = new Promise<void>(resolve => {
      // Wait for the server-side close event
      const interval = setInterval(() => {
        if (clients.size === 0) {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });

    client.close();
    await closePromise;

    expect(clients.size).toBe(0);
  });
});
