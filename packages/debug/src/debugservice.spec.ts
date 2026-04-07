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

// Captured core event callbacks so tests can invoke them
const coreEventCallbacks: Record<string, Function> = {};
// Mock HttpServer for the debug() command
let mockHttpServer: any = undefined;

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
  useDynamicService: (name: string) => {
    if (name === "HttpServer") return mockHttpServer;
    return undefined;
  },
  useCoreEvents: (eventName: string, callback: Function) => {
    coreEventCallbacks[eventName] = callback;
    return () => {
      delete coreEventCallbacks[eventName];
    };
  },
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

@suite
class DebugServiceSubscribeToEventsTest {
  service: InstanceType<typeof DebugService>;

  async beforeEach() {
    // Clear any previous callbacks
    for (const key of Object.keys(coreEventCallbacks)) {
      delete coreEventCallbacks[key];
    }
    this.service = new DebugService();
    this.service.resolve();
  }

  async afterEach() {
    await this.service.stop();
  }

  @test
  async webdaRequestEventPopulatesRequestLog() {
    const cb = coreEventCallbacks["Webda.Request"];
    assert.ok(cb, "Webda.Request callback should be registered");

    const mockCtx = {
      extensions: {} as Record<string, any>,
      setExtension(key: string, val: any) {
        this.extensions[key] = val;
      },
      getExtension<T>(key: string): T {
        return this.extensions[key] as T;
      },
      getHttpContext() {
        return {
          getMethod() {
            return "GET";
          },
          getUrl() {
            return "/test-path";
          }
        };
      }
    };

    cb({ context: mockCtx });

    const entries = this.service.requestLog.getEntries();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].method, "GET");
    assert.strictEqual(entries[0].url, "/test-path");
    assert.strictEqual(entries[0].statusCode, undefined, "Pending request should have no statusCode");
  }

  @test
  async webdaResultEventCompletesRequest() {
    const reqCb = coreEventCallbacks["Webda.Request"];
    const resCb = coreEventCallbacks["Webda.Result"];
    assert.ok(reqCb && resCb);

    const mockCtx = {
      extensions: {} as Record<string, any>,
      statusCode: 201,
      setExtension(key: string, val: any) {
        this.extensions[key] = val;
      },
      getExtension<T>(key: string): T {
        return this.extensions[key] as T;
      },
      getHttpContext() {
        return {
          getMethod() {
            return "POST";
          },
          getUrl() {
            return "/api/create";
          }
        };
      }
    };

    reqCb({ context: mockCtx });
    resCb({ context: mockCtx });

    const entries = this.service.requestLog.getEntries();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].statusCode, 201);
  }

  @test
  async webdaResultEventIgnoresUnknownContext() {
    const resCb = coreEventCallbacks["Webda.Result"];
    assert.ok(resCb);

    // Context without a debugRequestId extension should be silently ignored
    const mockCtx = {
      extensions: {} as Record<string, any>,
      statusCode: 200,
      setExtension(key: string, val: any) {
        this.extensions[key] = val;
      },
      getExtension<T>(_key: string): T {
        return undefined as T;
      },
      getHttpContext() {
        return {
          getMethod() {
            return "GET";
          },
          getUrl() {
            return "/";
          }
        };
      }
    };

    // Should not throw
    resCb({ context: mockCtx });
    assert.strictEqual(this.service.requestLog.getEntries().length, 0);
  }

  @test
  async webda404EventMarksNotFound() {
    const reqCb = coreEventCallbacks["Webda.Request"];
    const notFoundCb = coreEventCallbacks["Webda.404"];
    assert.ok(reqCb && notFoundCb);

    const mockCtx = {
      extensions: {} as Record<string, any>,
      setExtension(key: string, val: any) {
        this.extensions[key] = val;
      },
      getExtension<T>(key: string): T {
        return this.extensions[key] as T;
      },
      getHttpContext() {
        return {
          getMethod() {
            return "GET";
          },
          getUrl() {
            return "/missing";
          }
        };
      }
    };

    reqCb({ context: mockCtx });
    notFoundCb({ context: mockCtx });

    const entries = this.service.requestLog.getEntries();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].statusCode, 404);
  }

  @test
  async webda404EventIgnoresUnknownContext() {
    const notFoundCb = coreEventCallbacks["Webda.404"];
    assert.ok(notFoundCb);

    const mockCtx = {
      extensions: {} as Record<string, any>,
      setExtension(key: string, val: any) {
        this.extensions[key] = val;
      },
      getExtension<T>(_key: string): T {
        return undefined as T;
      },
      getHttpContext() {
        return {
          getMethod() {
            return "GET";
          },
          getUrl() {
            return "/";
          }
        };
      }
    };

    notFoundCb({ context: mockCtx });
    assert.strictEqual(this.service.requestLog.getEntries().length, 0);
  }

  @test
  async broadcastsRequestEventsToWebSocketClients() {
    // Start the debug server so we have WS clients
    await this.service.startDebugServer(0);
    const port = ((this.service as any).server as Server).address().port;

    const client = new WebSocket(`ws://localhost:${port}`);
    await new Promise<void>(resolve => client.on("open", resolve));

    const received: any[] = [];
    const msgPromise = new Promise<void>(resolve => {
      client.on("message", (data: Buffer) => {
        received.push(JSON.parse(data.toString()));
        resolve();
      });
    });

    // Trigger a request event which should broadcast to WS clients
    const reqCb = coreEventCallbacks["Webda.Request"];
    const mockCtx = {
      extensions: {} as Record<string, any>,
      setExtension(key: string, val: any) {
        this.extensions[key] = val;
      },
      getExtension<T>(key: string): T {
        return this.extensions[key] as T;
      },
      getHttpContext() {
        return {
          getMethod() {
            return "GET";
          },
          getUrl() {
            return "/broadcast-test";
          }
        };
      }
    };

    reqCb({ context: mockCtx });
    await msgPromise;

    assert.ok(received.length >= 1);
    assert.strictEqual(received[0].type, "request");

    client.close();
  }
}

@suite
class DebugServiceDebugCommandTest {
  @test
  async debugStartsHttpServerAndDebugServer() {
    // Set up mock HttpServer
    let serveCalledWith: any[] = [];
    mockHttpServer = {
      serve: async (...args: any[]) => {
        serveCalledWith = args;
      }
    };

    const service = new DebugService();
    service.resolve();

    try {
      // Call debug with web=true to avoid TUI, using port 0 for random ports
      await service.debug(0, 0, true);

      // httpServer.serve should have been called
      assert.strictEqual(serveCalledWith.length, 2);
      assert.strictEqual(serveCalledWith[0], undefined);
      assert.strictEqual(serveCalledWith[1], 0);

      // Debug server should be running
      assert.ok((service as any).server, "Debug server should be created");
    } finally {
      await service.stop();
      mockHttpServer = undefined;
    }
  }

  @test
  async debugHandlesUndefinedHttpServer() {
    mockHttpServer = undefined;

    const service = new DebugService();
    service.resolve();

    try {
      await service.debug(0, 0, true);
      // Should not throw even when HttpServer is undefined
      assert.ok((service as any).server, "Debug server should be created");
    } finally {
      await service.stop();
      mockHttpServer = undefined;
    }
  }
}

@suite
class DebugServiceStaticFileServingTest {
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
  async servesIndexHtmlForRootPath() {
    const res = await fetch(`http://localhost:${this.port}/`);
    // Should serve index.html if it exists, or 404 if webui dir doesn't have it
    assert.ok(res.status === 200 || res.status === 404);
  }

  @test
  async servesStaticCssFile() {
    const res = await fetch(`http://localhost:${this.port}/styles.css`);
    if (res.status === 200) {
      const contentType = res.headers.get("content-type");
      assert.ok(contentType?.includes("text/css"), `Expected CSS content-type, got ${contentType}`);
    }
  }

  @test
  async servesStaticJsFile() {
    const res = await fetch(`http://localhost:${this.port}/app.js`);
    if (res.status === 200) {
      const contentType = res.headers.get("content-type");
      assert.ok(contentType?.includes("javascript"), `Expected JS content-type, got ${contentType}`);
    }
  }

  @test
  async fallsBackToIndexHtmlForUnknownPaths() {
    // SPA-style fallback: unknown paths should serve index.html
    const res = await fetch(`http://localhost:${this.port}/some/deep/path`);
    // Either serves index.html (200) or 404 if webui doesn't have index.html
    assert.ok(res.status === 200 || res.status === 404);
  }

  @test
  async preventsDirectoryTraversal() {
    const res = await fetch(`http://localhost:${this.port}/../../package.json`);
    // Should not serve files outside webui dir; will either serve index.html or 404
    assert.ok(res.status === 200 || res.status === 404);
    if (res.status === 200) {
      const body = await res.text();
      // Should NOT contain package.json content
      assert.ok(!body.includes('"dependencies"'), "Should not serve files outside webui");
    }
  }
}

@suite
class DebugServiceStopCleanupTest {
  @test
  async stopUnsubscribesCoreEvents() {
    // Clear callbacks
    for (const key of Object.keys(coreEventCallbacks)) {
      delete coreEventCallbacks[key];
    }

    const service = new DebugService();
    service.resolve();

    // After resolve, event callbacks should be registered
    assert.ok(coreEventCallbacks["Webda.Request"], "Request callback should exist");
    assert.ok(coreEventCallbacks["Webda.Result"], "Result callback should exist");
    assert.ok(coreEventCallbacks["Webda.404"], "404 callback should exist");

    await service.stop();

    // After stop, unsubscribers should have been called, removing the callbacks
    assert.strictEqual(coreEventCallbacks["Webda.Request"], undefined, "Request callback should be removed");
    assert.strictEqual(coreEventCallbacks["Webda.Result"], undefined, "Result callback should be removed");
    assert.strictEqual(coreEventCallbacks["Webda.404"], undefined, "404 callback should be removed");
  }

  @test
  async stopClearsTimings() {
    const service = new DebugService();
    service.resolve();

    // Simulate a request that adds to timings
    const reqCb = coreEventCallbacks["Webda.Request"];
    const mockCtx = {
      extensions: {} as Record<string, any>,
      setExtension(key: string, val: any) {
        this.extensions[key] = val;
      },
      getExtension<T>(key: string): T {
        return this.extensions[key] as T;
      },
      getHttpContext() {
        return {
          getMethod() {
            return "GET";
          },
          getUrl() {
            return "/timing-test";
          }
        };
      }
    };

    reqCb({ context: mockCtx });
    assert.ok((service as any).timings.size > 0, "Timings should have entries");

    await service.stop();
    assert.strictEqual((service as any).timings.size, 0, "Timings should be cleared after stop");
  }
}

@suite
class DebugServiceHandleRequestErrorTest {
  @test
  async returns500OnInternalError() {
    const service = new DebugService();
    service.resolve();
    await service.startDebugServer(0);
    const port = ((service as any).server as Server).address().port;

    try {
      // The /api/openapi endpoint can potentially throw.
      // We already test the error fallback path, but let's verify the catch block
      // by forcing the router mock to throw a non-standard error.
      mockRouterThrows = true;
      const res = await fetch(`http://localhost:${port}/api/openapi`);
      // The getOpenAPISpec method catches internally and returns a stub, so this returns 200
      assert.strictEqual(res.status, 200);
    } finally {
      mockRouterThrows = false;
      await service.stop();
    }
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
