import { afterEach, describe, expect, it } from "vitest";
import { createServer, Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { AddressInfo } from "node:net";
import { DebugClient } from "./client.js";

describe("DebugClient WebSocket reconnection", () => {
  let server: Server;
  let wss: WebSocketServer;
  let port: number;
  let client: DebugClient;

  afterEach(async () => {
    client?.disconnect();
    if (wss) wss.close();
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("sets connected to true on open and false on close", async () => {
    server = createServer();
    wss = new WebSocketServer({ server });
    await new Promise<void>(resolve => server.listen(0, () => resolve()));
    port = (server.address() as AddressInfo).port;

    client = new DebugClient(`http://localhost:${port}`);
    expect(client.connected).toBe(false);

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

    expect(client.connected).toBe(true);

    // Disconnect and verify
    client.disconnect();
    expect(client.connected).toBe(false);
  });

  it("receives events via onEvent callback", async () => {
    server = createServer();
    wss = new WebSocketServer({ server });
    await new Promise<void>(resolve => server.listen(0, () => resolve()));
    port = (server.address() as AddressInfo).port;

    const serverClients = new Set<WebSocket>();
    wss.on("connection", ws => serverClients.add(ws));

    client = new DebugClient(`http://localhost:${port}`);
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

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("restart");
  });

  it("WebSocket close triggers reconnect attempt", async () => {
    server = createServer();
    wss = new WebSocketServer({ server });
    await new Promise<void>(resolve => server.listen(0, () => resolve()));
    port = (server.address() as AddressInfo).port;

    client = new DebugClient(`http://localhost:${port}`);
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

    expect(client.connected).toBe(false);

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
    expect(client.connected).toBe(true);
  });

  it("WebSocket error sets connected to false", async () => {
    // Connect to a port that will immediately refuse
    client = new DebugClient("http://localhost:1");
    client.connectWebSocket();

    // The connection should fail and connected should stay false
    expect(client.connected).toBe(false);

    // Wait a bit to ensure error handler fired
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(client.connected).toBe(false);

    client.disconnect();
  });

  it("onEvent unsubscribe function works", () => {
    client = new DebugClient("http://localhost:1");
    const events: any[] = [];
    const unsub = client.onEvent(e => events.push(e));

    // Verify the unsubscribe removes the callback
    unsub();
    expect((client as any).subscribers.size).toBe(0);
  });
});
