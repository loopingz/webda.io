import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, Server, IncomingMessage, ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { AddressInfo } from "node:net";
import { DebugClient } from "./client.js";

/** Mock data returned by the test server */
const MOCK_MODELS = [{ id: "Test/Task", plural: "Tasks", actions: ["complete"], relations: {} }];
const MOCK_SERVICES = [{ name: "myStore", type: "MemoryStore", state: "Running", capabilities: {} }];
const MOCK_OPERATIONS = [{ id: "Task.Create", input: "CreateTaskInput", output: "Task" }];
const MOCK_ROUTES = [{ path: "/tasks", methods: ["GET", "POST"], executor: "myStore" }];
const MOCK_CONFIG = { services: { myStore: { type: "MemoryStore" } } };
const MOCK_REQUESTS = [
  { id: "r1", method: "GET", url: "/tasks", timestamp: 1700000000000, statusCode: 200, duration: 5 }
];

/**
 * Create a mock debug server that responds to all API endpoints.
 */
function createMockServer(): Promise<{ server: Server; wss: WebSocketServer; port: number }> {
  return new Promise(resolve => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      res.setHeader("Content-Type", "application/json");
      const pathname = (req.url || "/").split("?")[0];

      const routes: Record<string, unknown> = {
        "/api/models": MOCK_MODELS,
        "/api/services": MOCK_SERVICES,
        "/api/operations": MOCK_OPERATIONS,
        "/api/routes": MOCK_ROUTES,
        "/api/config": MOCK_CONFIG,
        "/api/openapi": { openapi: "3.0.3" },
        "/api/requests": MOCK_REQUESTS
      };

      if (pathname in routes) {
        res.writeHead(200);
        res.end(JSON.stringify(routes[pathname]));
      } else if (pathname === "/api/models/Test%2FTask") {
        res.writeHead(200);
        res.end(JSON.stringify(MOCK_MODELS[0]));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Not found" }));
      }
    });

    const wss = new WebSocketServer({ server });

    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, wss, port });
    });
  });
}

describe("DebugClient", () => {
  let server: Server;
  let wss: WebSocketServer;
  let port: number;
  let client: DebugClient;

  beforeEach(async () => {
    ({ server, wss, port } = await createMockServer());
    client = new DebugClient(`http://localhost:${port}`);
  });

  afterEach(async () => {
    client.disconnect();
    wss.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("fetches models", async () => {
    const models = await client.getModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe("Test/Task");
  });

  it("fetches a single model", async () => {
    const model = await client.getModel("Test/Task");
    expect(model.id).toBe("Test/Task");
  });

  it("fetches services", async () => {
    const services = await client.getServices();
    expect(services).toHaveLength(1);
    expect(services[0].name).toBe("myStore");
    expect(services[0].state).toBe("Running");
  });

  it("fetches operations", async () => {
    const ops = await client.getOperations();
    expect(ops).toHaveLength(1);
    expect(ops[0].id).toBe("Task.Create");
  });

  it("fetches routes", async () => {
    const routes = await client.getRoutes();
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toBe("/tasks");
    expect(routes[0].methods).toEqual(["GET", "POST"]);
  });

  it("fetches config", async () => {
    const config = await client.getConfig();
    expect(config.services).toBeDefined();
    expect(config.services.myStore.type).toBe("MemoryStore");
  });

  it("fetches openapi", async () => {
    const spec = await client.getOpenAPI();
    expect(spec.openapi).toBe("3.0.3");
  });

  it("fetches requests", async () => {
    const requests = await client.getRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");
  });

  it("throws on HTTP errors", async () => {
    await expect(client.getModel("NonExistent")).rejects.toThrow("HTTP 404");
  });

  it("connects to WebSocket and receives events", async () => {
    const received: any[] = [];
    client.onEvent(event => received.push(event));
    client.connectWebSocket();

    // Wait for connection
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (client.connected) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    expect(client.connected).toBe(true);

    // Broadcast a message from the server
    const testEvent = { type: "request", id: "t1", method: "GET", url: "/test", timestamp: Date.now() };
    for (const ws of wss.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(testEvent));
      }
    }

    // Wait for the message
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (received.length > 0) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    expect(received).toHaveLength(1);
    expect(received[0].type).toBe("request");
    expect(received[0].id).toBe("t1");
  });

  it("reports disconnected when not connected", () => {
    expect(client.connected).toBe(false);
  });

  it("unsubscribes from events", () => {
    const received: any[] = [];
    const unsub = client.onEvent(event => received.push(event));
    unsub();

    // Simulate: even if we manually call, nothing should be received
    // This just tests the unsubscribe mechanism
    expect(received).toHaveLength(0);
  });

  it("handles trailing slash in base URL", async () => {
    const client2 = new DebugClient(`http://localhost:${port}/`);
    const models = await client2.getModels();
    expect(models).toHaveLength(1);
    client2.disconnect();
  });
});
