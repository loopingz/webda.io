import { suite, test } from "@webda/test";
import * as assert from "assert";
import { createServer, Server, IncomingMessage, ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { AddressInfo } from "node:net";
import { DebugClient } from "./client.js";

@suite
class DebugClientHTTPMethodsTest {
  server: Server;
  port: number;
  client: DebugClient;
  mockData: Record<string, any> = {
    "/api/models": [{ id: "MyApp/Task" }],
    "/api/models/MyApp%2FTask": { id: "MyApp/Task", plural: "Tasks" },
    "/api/services": [{ name: "Router" }],
    "/api/operations": [{ id: "Task.Create" }],
    "/api/routes": [{ path: "/tasks", methods: ["GET"] }],
    "/api/config": { parameters: {} },
    "/api/openapi": { openapi: "3.0.3" },
    "/api/requests": [{ id: "r1" }],
    "/api/logs": [{ id: "l1", level: "INFO" }],
    "/api/info": { package: { name: "test" } }
  };

  async beforeEach() {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const data = this.mockData[req.url || ""];
      if (data) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>(resolve => this.server.listen(0, () => resolve()));
    this.port = (this.server.address() as AddressInfo).port;
    this.client = new DebugClient(`http://localhost:${this.port}`);
  }

  async afterEach() {
    this.client?.disconnect();
    await new Promise<void>(resolve => this.server.close(() => resolve()));
  }

  @test
  async getModels() {
    const result = await this.client.getModels();
    assert.deepStrictEqual(result, [{ id: "MyApp/Task" }]);
  }

  @test
  async getModel() {
    const result = await this.client.getModel("MyApp/Task");
    assert.strictEqual(result.id, "MyApp/Task");
  }

  @test
  async getServices() {
    const result = await this.client.getServices();
    assert.strictEqual(result[0].name, "Router");
  }

  @test
  async getOperations() {
    const result = await this.client.getOperations();
    assert.strictEqual(result[0].id, "Task.Create");
  }

  @test
  async getRoutes() {
    const result = await this.client.getRoutes();
    assert.strictEqual(result[0].path, "/tasks");
  }

  @test
  async getConfig() {
    const result = await this.client.getConfig();
    assert.ok("parameters" in result);
  }

  @test
  async getOpenAPI() {
    const result = await this.client.getOpenAPI();
    assert.strictEqual(result.openapi, "3.0.3");
  }

  @test
  async getRequests() {
    const result = await this.client.getRequests();
    assert.strictEqual(result[0].id, "r1");
  }

  @test
  async getLogs() {
    const result = await this.client.getLogs();
    assert.strictEqual(result[0].level, "INFO");
  }

  @test
  async getAppInfo() {
    const result = await this.client.getAppInfo();
    assert.strictEqual(result.package.name, "test");
  }

  @test
  async searchLogs() {
    this.mockData["/api/logs?q=error"] = [{ id: "l2", level: "ERROR" }];
    const result = await this.client.searchLogs("error");
    assert.strictEqual(result[0].level, "ERROR");
  }

  @test
  async throwsOnHTTPError() {
    await assert.rejects(async () => this.client.getModel("nonexistent"), /HTTP 404/);
  }

  @test
  async handlesTrailingSlashInBaseURL() {
    const c = new DebugClient(`http://localhost:${this.port}/`);
    try {
      const result = await c.getModels();
      assert.deepStrictEqual(result, [{ id: "MyApp/Task" }]);
    } finally {
      c.disconnect();
    }
  }
}

@suite
class DebugClientWebSocketReconnectionTest {
  @test
  async setsConnectedToTrueOnOpenAndFalseOnClose() {
    const server = createServer();
    const wss = new WebSocketServer({ server });
    await new Promise<void>(resolve => server.listen(0, () => resolve()));
    const port = (server.address() as AddressInfo).port;

    const client = new DebugClient(`http://localhost:${port}`);
    try {
      assert.strictEqual(client.connected, false);

      client.connectWebSocket();

      // Wait for connection
      await new Promise<void>(resolve => {
        const interval = setInterval(() => {
          if (client.connected) {
            clearInterval(interval);
            resolve();
          }
        }, 10);
      });

      assert.strictEqual(client.connected, true);

      // Disconnect and verify
      client.disconnect();
      assert.strictEqual(client.connected, false);
    } finally {
      client.disconnect();
      wss.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  @test
  async receivesEventsViaOnEventCallback() {
    const server = createServer();
    const wss = new WebSocketServer({ server });
    await new Promise<void>(resolve => server.listen(0, () => resolve()));
    const port = (server.address() as AddressInfo).port;

    const serverClients = new Set<WebSocket>();
    wss.on("connection", ws => serverClients.add(ws));

    const client = new DebugClient(`http://localhost:${port}`);
    try {
      const events: any[] = [];
      client.onEvent(e => events.push(e));
      client.connectWebSocket();

      // Wait for connection
      await new Promise<void>(resolve => {
        const interval = setInterval(() => {
          if (client.connected) {
            clearInterval(interval);
            resolve();
          }
        }, 10);
      });

      // Send a message from server
      for (const ws of serverClients) {
        ws.send(JSON.stringify({ type: "restart" }));
      }

      // Wait for message
      await new Promise<void>(resolve => {
        const interval = setInterval(() => {
          if (events.length > 0) {
            clearInterval(interval);
            resolve();
          }
        }, 10);
      });

      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].type, "restart");
    } finally {
      client.disconnect();
      wss.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  @test
  async webSocketCloseTriggersReconnectAttempt() {
    const server = createServer();
    const wss = new WebSocketServer({ server });
    await new Promise<void>(resolve => server.listen(0, () => resolve()));
    const port = (server.address() as AddressInfo).port;

    const client = new DebugClient(`http://localhost:${port}`);
    try {
      client.connectWebSocket();

      // Wait for initial connection
      await new Promise<void>(resolve => {
        const interval = setInterval(() => {
          if (client.connected) {
            clearInterval(interval);
            resolve();
          }
        }, 10);
      });

      // Force close all server-side connections
      for (const ws of wss.clients) {
        ws.close();
      }

      // Wait for disconnection
      await new Promise<void>(resolve => {
        const interval = setInterval(() => {
          if (!client.connected) {
            clearInterval(interval);
            resolve();
          }
        }, 10);
      });

      assert.strictEqual(client.connected, false);

      // Wait for reconnect (reconnectDelay starts at 1000ms)
      await new Promise<void>(resolve => {
        const interval = setInterval(() => {
          if (client.connected) {
            clearInterval(interval);
            resolve();
          }
        }, 50);
        // Timeout safety
        setTimeout(() => {
          clearInterval(interval);
          resolve();
        }, 3000);
      });

      // Should have reconnected
      assert.strictEqual(client.connected, true);
    } finally {
      client.disconnect();
      wss.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  @test
  async webSocketErrorSetsConnectedToFalse() {
    // Connect to a port that will immediately refuse
    const client = new DebugClient("http://localhost:1");
    try {
      client.connectWebSocket();

      // The connection should fail and connected should stay false
      assert.strictEqual(client.connected, false);

      // Wait a bit to ensure error handler fired
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.strictEqual(client.connected, false);
    } finally {
      client.disconnect();
    }
  }

  @test
  onEventUnsubscribeFunctionWorks() {
    const client = new DebugClient("http://localhost:1");
    try {
      const events: any[] = [];
      const unsub = client.onEvent(e => events.push(e));

      // Verify the unsubscribe removes the callback
      unsub();
      assert.strictEqual((client as any).subscribers.size, 0);
    } finally {
      client.disconnect();
    }
  }

  @test
  async doConnectCatchSchedulesReconnectWhenConstructorThrows() {
    // Test lines 194-195: when WebSocket constructor throws, scheduleReconnect is called.
    // We monkey-patch doConnect to make the WebSocket constructor throw.
    const client = new DebugClient("http://localhost:1");
    try {
      // Save the original doConnect
      const origDoConnect = (client as any).doConnect.bind(client);

      // Patch doConnect to replace WebSocket temporarily
      let reconnectScheduled = false;
      const origScheduleReconnect = (client as any).scheduleReconnect.bind(client);
      (client as any).scheduleReconnect = function scheduleReconnect() {
        reconnectScheduled = true;
        // Don't actually schedule to avoid timer leaks
      };

      // Call connectWebSocket with a URL that causes the constructor to throw
      // by temporarily overriding the baseUrl to something truly invalid
      (client as any).baseUrl = "not-a-valid-protocol://[invalid";
      (client as any).shouldReconnect = true;
      (client as any).doConnect();

      // The catch block should have called scheduleReconnect
      assert.strictEqual(reconnectScheduled, true, "scheduleReconnect should be called when WebSocket constructor throws");
    } finally {
      client.disconnect();
    }
  }
}
