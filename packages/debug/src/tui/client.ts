import { WebSocket } from "ws";

/**
 * Event types received over the WebSocket connection.
 */
export type WsEvent =
  | { type: "request"; id: string; method: string; url: string; timestamp: number }
  | { type: "result"; id: string; statusCode: number; duration: number }
  | { type: "404"; id: string; method: string; url: string }
  | { type: "restart" }
  | { type: "log"; level: string; message: string; timestamp: number };

/**
 * Callback for WebSocket events.
 */
export type WsEventCallback = (event: WsEvent) => void;

/**
 * HTTP + WebSocket client for the debug server API.
 *
 * Connects to the debug server started by `webda debug` and provides
 * typed methods for each introspection endpoint, plus a reconnecting
 * WebSocket subscription for live request events.
 */
export class DebugClient {
  /** Base URL for HTTP requests (no trailing slash) */
  private baseUrl: string;
  /** Active WebSocket connection */
  private ws?: WebSocket;
  /** Whether the client should try to reconnect */
  private shouldReconnect = false;
  /** Current reconnect delay in ms */
  private reconnectDelay = 1000;
  /** Maximum reconnect delay in ms */
  private maxReconnectDelay = 30000;
  /** Event subscribers */
  private subscribers: Set<WsEventCallback> = new Set();
  /** Reconnect timer handle */
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  /** Connection status */
  private _connected = false;

  /**
   * Creates a new DebugClient.
   *
   * @param baseUrl - Base URL of the debug server, e.g. "http://localhost:18181"
   */
  constructor(baseUrl: string = "http://localhost:18181") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /**
   * Whether the WebSocket is currently connected.
   * @returns true if the WebSocket connection is open
   */
  get connected(): boolean {
    return this._connected;
  }

  /**
   * Fetch parsed JSON from a debug API endpoint.
   *
   * @param path - API path starting with /
   * @returns Parsed JSON response
   */
  private async fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  /**
   * Fetch all registered models.
   * @returns array of model metadata objects
   */
  async getModels(): Promise<any[]> {
    return this.fetchJson("/api/models");
  }

  /**
   * Fetch a single model by identifier.
   *
   * @param id - Fully-qualified model identifier
   * @returns model metadata object
   */
  async getModel(id: string): Promise<any> {
    return this.fetchJson(`/api/models/${encodeURIComponent(id)}`);
  }

  /**
   * Fetch all registered services.
   * @returns array of service info objects
   */
  async getServices(): Promise<any[]> {
    return this.fetchJson("/api/services");
  }

  /**
   * Fetch all registered operations.
   * @returns array of operation info objects
   */
  async getOperations(): Promise<any[]> {
    return this.fetchJson("/api/operations");
  }

  /**
   * Fetch all registered routes.
   * @returns array of route info objects
   */
  async getRoutes(): Promise<any[]> {
    return this.fetchJson("/api/routes");
  }

  /**
   * Fetch the resolved application configuration.
   * @returns resolved configuration record
   */
  async getConfig(): Promise<Record<string, any>> {
    return this.fetchJson("/api/config");
  }

  /**
   * Fetch the OpenAPI specification.
   * @returns OpenAPI 3.0.3 document
   */
  async getOpenAPI(): Promise<Record<string, any>> {
    return this.fetchJson("/api/openapi");
  }

  /**
   * Fetch recent request log entries (summary fields only — no headers/bodies).
   * @returns array of request log entry summaries
   */
  async getRequests(): Promise<any[]> {
    return this.fetchJson("/api/requests");
  }

  /**
   * Fetch the full detail of a single request by id, including captured
   * headers, bodies, and any error.
   *
   * @param id - The request id (as returned in the summary list).
   * @returns The detailed request entry.
   */
  async getRequestDetail(id: string): Promise<any> {
    return this.fetchJson(`/api/requests/${encodeURIComponent(id)}`);
  }

  /**
   * Fetch recent application log entries.
   * @returns array of log entries
   */
  async getLogs(): Promise<any[]> {
    return this.fetchJson("/api/logs");
  }

  /**
   * Fetch application info (package name, version, working directory).
   * @returns project information record
   */
  async getAppInfo(): Promise<any> {
    return this.fetchJson("/api/info");
  }

  /**
   * Search application log entries by query string.
   *
   * @param query - search text to filter logs
   * @returns array of matching log entries
   */
  async searchLogs(query: string): Promise<any[]> {
    return this.fetchJson(`/api/logs?q=${encodeURIComponent(query)}`);
  }

  /**
   * Subscribe to WebSocket events.
   *
   * @param callback - Called for each event received
   * @returns Unsubscribe function
   */
  onEvent(callback: WsEventCallback): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Connect to the debug server WebSocket and begin receiving events.
   * Automatically reconnects with exponential backoff on disconnect.
   */
  connectWebSocket(): void {
    this.shouldReconnect = true;
    this.doConnect();
  }

  /**
   * Internal: establish the WebSocket connection.
   */
  private doConnect(): void {
    const wsUrl = this.baseUrl.replace(/^http/, "ws") + "/ws";
    try {
      this.ws = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      this._connected = true;
      this.reconnectDelay = 1000;
    });

    this.ws.on("message", (data: Buffer) => {
      try {
        const event = JSON.parse(data.toString()) as WsEvent;
        for (const cb of this.subscribers) {
          cb(event);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    this.ws.on("close", () => {
      this._connected = false;
      this.scheduleReconnect();
    });

    this.ws.on("error", () => {
      this._connected = false;
      // close event will fire after error, triggering reconnect
    });
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.doConnect();
    }, this.reconnectDelay);
  }

  /**
   * Disconnect the WebSocket and stop reconnecting.
   */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    this._connected = false;
  }
}
