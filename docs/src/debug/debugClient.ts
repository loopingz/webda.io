"use strict";

/**
 * Debug client for the `webda debug --web` daemon.
 *
 * Provides typed fetch wrappers and a WebSocket manager that reconnects
 * with exponential back-off.
 */

const DEFAULT_PORT = 18181;
const PORT_KEY = "webda.debug.port";

/**
 * Returns the debug daemon port configured in localStorage, falling back to
 * the default of 18181.
 */
export function getDebugPort(): number {
  if (typeof window === "undefined") return DEFAULT_PORT;
  const raw = window.localStorage.getItem(PORT_KEY);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : DEFAULT_PORT;
}

/** Saves a custom port to localStorage. */
export function setDebugPort(port: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PORT_KEY, String(port));
}

/** Returns the base URL for the debug daemon. */
export function debugBaseUrl(): string {
  return `http://localhost:${getDebugPort()}`;
}

/** Returns the WebSocket URL for the debug daemon. */
export function debugWsUrl(): string {
  return `ws://localhost:${getDebugPort()}`;
}

/**
 * Fetches a JSON endpoint from the debug daemon.
 * Throws an Error if the response is not ok.
 */
export async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${debugBaseUrl()}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Typed API shapes (derived from packages/debug/src/introspection.ts)
// ---------------------------------------------------------------------------

/** Information returned by GET /api/info */
export interface DebugInfo {
  /** Application name from package.json */
  name?: string;
  /** Application version from package.json */
  version?: string;
  /** Current working directory of the daemon */
  workingDirectory?: string;
  /** Full package.json contents */
  package?: Record<string, unknown>;
  /** Catch-all for any additional fields */
  [k: string]: unknown;
}

/** A single model entry from GET /api/models */
export interface DebugModel {
  id: string;
  plural: string;
  actions: string[];
  relations: Record<string, unknown>;
  store?: string;
  storeType?: string;
  schemas?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/** A single service entry from GET /api/services */
export interface DebugService {
  name: string;
  type: string;
  state: string;
  capabilities: Record<string, unknown>;
  configuration: Record<string, unknown>;
  schema?: Record<string, unknown>;
  metrics?: DebugMetric[];
}

/** A metric attached to a service */
export interface DebugMetric {
  name: string;
  fullName?: string;
  help?: string;
  type: string;
  labelNames?: string[];
  values?: { value: number; labels?: Record<string, string> }[];
}

/** A single operation entry from GET /api/operations */
export interface DebugOperation {
  id: string;
  input?: string;
  output?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  rest?: { method?: string; url?: string; path?: string };
  summary?: string;
  tags?: string[];
  implementor?: {
    type: "service" | "model";
    name: string;
    method?: string;
    code?: string;
  };
  [k: string]: unknown;
}

/** A single request log entry from GET /api/requests */
export interface DebugRequest {
  id: string;
  method?: string;
  url?: string;
  statusCode?: number;
  duration?: number;
  timestamp?: number;
}

/** A single log entry from GET /api/logs */
export interface DebugLogEntry {
  id: string;
  timestamp?: number;
  level: string;
  message: string;
  args?: unknown[];
}

/** WebSocket event types pushed by the daemon */
export type DebugWsEvent =
  | { type: "request"; id: string; method: string; url: string; timestamp: number }
  | { type: "result"; id: string; statusCode: number; duration: number }
  | { type: "404"; id: string; method: string; url: string }
  | { type: "log"; id: string; timestamp: number; level: string; message: string; args?: unknown[] };

// ---------------------------------------------------------------------------
// WebSocket manager with exponential back-off reconnection
// ---------------------------------------------------------------------------

export type WsEventHandler = (event: DebugWsEvent) => void;

export interface DebugWebSocket {
  /** Subscribe to incoming WebSocket events. Returns an unsubscribe function. */
  onEvent: (handler: WsEventHandler) => () => void;
  /** Disconnect the WebSocket (no automatic reconnect). */
  disconnect: () => void;
}

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 30_000;

/**
 * Opens a WebSocket connection to the debug daemon with automatic
 * exponential back-off reconnection.
 *
 * The returned object allows subscribing to events and disconnecting.
 */
export function createDebugWebSocket(): DebugWebSocket {
  let ws: WebSocket | null = null;
  let disposed = false;
  let retryDelay = BASE_DELAY_MS;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const handlers = new Set<WsEventHandler>();

  function connect() {
    if (disposed) return;
    try {
      ws = new WebSocket(debugWsUrl());
    } catch {
      scheduleReconnect();
      return;
    }

    ws.addEventListener("open", () => {
      retryDelay = BASE_DELAY_MS; // reset back-off on successful connection
    });

    ws.addEventListener("message", (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data) as DebugWsEvent;
        for (const h of handlers) {
          h(data);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.addEventListener("close", () => {
      ws = null;
      scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      ws?.close();
    });
  }

  function scheduleReconnect() {
    if (disposed) return;
    retryTimer = setTimeout(function scheduleReconnectCb() {
      retryDelay = Math.min(retryDelay * 2, MAX_DELAY_MS);
      connect();
    }, retryDelay);
  }

  connect();

  return {
    onEvent(handler: WsEventHandler) {
      handlers.add(handler);
      return function unsubscribe() {
        handlers.delete(handler);
      };
    },
    disconnect() {
      disposed = true;
      if (retryTimer != null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (ws) {
        ws.close();
        ws = null;
      }
      handlers.clear();
    }
  };
}
