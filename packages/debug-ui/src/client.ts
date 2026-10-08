import type {
  DebugConfig,
  DebugInfo,
  DebugLogEntry,
  DebugModel,
  DebugOperation,
  DebugRequest,
  DebugServiceInfo,
  DebugWsEvent
} from "./types.js";

/** Sub-protocol offered on the websocket; the server selects it. */
export const WS_PROTOCOL = "webda-debug.v1";
/** Prefix of the sub-protocol entry carrying the token. */
export const WS_TOKEN_PREFIX = "webda-token.";

/**
 * Why a request to the debug server failed.
 *
 * - `unauthorized`: the server answered 401 (missing or stale token);
 * - `not_found`: the server answered 404 (older server without that endpoint);
 * - `mixed_content`: the page is served over https and the browser refused the
 *   plain-http request to localhost (some Safari versions);
 * - `unreachable`: no server answered (not running, wrong port, CORS/PNA refusal);
 * - `http`: any other non-2xx status.
 */
export type DebugErrorReason = "unauthorized" | "not_found" | "mixed_content" | "unreachable" | "http";

/** Error thrown by the client, with a machine-readable reason. */
export class DebugClientError extends Error {
  /** Classification of the failure */
  reason: DebugErrorReason;
  /** HTTP status, when the server answered */
  status?: number;

  /**
   * @param reason - classification of the failure
   * @param message - human readable message
   * @param status - HTTP status, when the server answered
   */
  constructor(reason: DebugErrorReason, message: string, status?: number) {
    super(message);
    this.name = "DebugClientError";
    this.reason = reason;
    this.status = status;
  }
}

/** Options of {@link createDebugClient}. */
export interface DebugClientOptions {
  /** Base URL of the debug server, e.g. `http://localhost:18181` or `location.origin` */
  baseUrl: string;
  /** Session token (required by the server on every request) */
  token?: string;
  /** `fetch` implementation (defaults to the global one) */
  fetch?: typeof fetch;
  /** Protocol of the page, used to detect mixed-content refusals (defaults to `location.protocol`) */
  pageProtocol?: string;
}

/** Live websocket subscription. */
export interface DebugSocket {
  /** Subscribe to events; returns the unsubscribe function */
  onEvent(handler: (event: DebugWsEvent) => void): () => void;
  /** Subscribe to connection state changes; returns the unsubscribe function */
  onStatus(handler: (connected: boolean) => void): () => void;
  /** Whether the socket is currently open */
  readonly connected: boolean;
  /** Close and stop reconnecting */
  disconnect(): void;
}

/** Typed client for the debug API. */
export interface DebugClient {
  /** Base URL without trailing slash */
  readonly baseUrl: string;
  /** Websocket URL derived from the base URL */
  readonly wsUrl: string;
  /** Fetch any API path */
  get<T>(path: string): Promise<T>;
  getInfo(): Promise<DebugInfo>;
  getModels(): Promise<DebugModel[]>;
  getModel(id: string): Promise<DebugModel>;
  getServices(): Promise<DebugServiceInfo[]>;
  getOperations(): Promise<DebugOperation[]>;
  getConfig(): Promise<DebugConfig>;
  getRequests(): Promise<DebugRequest[]>;
  getRequestDetail(id: string): Promise<DebugRequest>;
  getLogs(query?: string): Promise<DebugLogEntry[]>;
  /** Open a reconnecting websocket */
  connect(): DebugSocket;
}

/**
 * Derive the websocket URL from an HTTP base URL.
 *
 * @param baseUrl - `http(s)://host[:port]`
 * @returns `ws(s)://host[:port]/ws`
 */
export function deriveWsUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "").replace(/^http/, "ws") + "/ws";
}

/**
 * Base URL of a debug server on the loopback interface.
 *
 * @param port - debug port
 * @param host - `localhost` (default) or `127.0.0.1`
 * @returns the base URL
 */
export function localhostBaseUrl(port: number, host: "localhost" | "127.0.0.1" = "localhost"): string {
  return `http://${host}:${port}`;
}

/**
 * Classify a `fetch` failure.
 *
 * @param pageProtocol - protocol of the page issuing the request
 * @param baseUrl - target of the request
 * @returns `mixed_content` for https pages calling http, `unreachable` otherwise
 */
export function classifyNetworkError(pageProtocol: string | undefined, baseUrl: string): DebugErrorReason {
  if (pageProtocol === "https:" && baseUrl.startsWith("http:")) {
    return "mixed_content";
  }
  return "unreachable";
}

/**
 * Create a typed client for the debug server.
 *
 * - `--local`: `baseUrl = location.origin`, same origin as the bundled page;
 * - hosted: `baseUrl = http://localhost:<port>`.
 * The token is sent as `Authorization: Bearer` on HTTP and as the
 * `webda-token.<token>` sub-protocol on the websocket: it never appears in a URL.
 *
 * @param options - base URL, token and overrides
 * @returns the client
 */
export function createDebugClient(options: DebugClientOptions): DebugClient {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const wsUrl = deriveWsUrl(baseUrl);
  const doFetch = options.fetch ?? (typeof fetch === "function" ? fetch.bind(globalThis) : undefined);
  const pageProtocol =
    options.pageProtocol ?? (typeof location !== "undefined" && location ? location.protocol : undefined);

  const get = async function get<T>(path: string): Promise<T> {
    if (!doFetch) throw new DebugClientError("unreachable", "fetch is not available");
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, { headers, mode: "cors", credentials: "omit" });
    } catch (err) {
      const reason = classifyNetworkError(pageProtocol, baseUrl);
      throw new DebugClientError(reason, (err as Error)?.message || "Network error");
    }
    if (res.status === 401) throw new DebugClientError("unauthorized", "Unauthorized", 401);
    if (res.status === 404) throw new DebugClientError("not_found", `${path} not found`, 404);
    if (!res.ok) throw new DebugClientError("http", `${path}: HTTP ${res.status}`, res.status);
    return (await res.json()) as T;
  };

  return {
    baseUrl,
    wsUrl,
    get,
    getInfo: () => get<DebugInfo>("/api/info"),
    getModels: () => get<DebugModel[]>("/api/models"),
    getModel: id => get<DebugModel>(`/api/models/${encodeURIComponent(id)}`),
    getServices: () => get<DebugServiceInfo[]>("/api/services"),
    getOperations: () => get<DebugOperation[]>("/api/operations"),
    getConfig: () => get<DebugConfig>("/api/config"),
    getRequests: () => get<DebugRequest[]>("/api/requests"),
    getRequestDetail: id => get<DebugRequest>(`/api/requests/${encodeURIComponent(id)}`),
    getLogs: query => get<DebugLogEntry[]>(query ? `/api/logs?q=${encodeURIComponent(query)}` : "/api/logs"),
    connect: () => openSocket(wsUrl, options.token)
  };
}

/**
 * Open a websocket that reconnects with exponential back-off (500ms → 30s).
 *
 * @param wsUrl - websocket URL
 * @param token - session token offered as a sub-protocol
 * @returns the subscription handle
 */
function openSocket(wsUrl: string, token?: string): DebugSocket {
  const handlers = new Set<(event: DebugWsEvent) => void>();
  const statusHandlers = new Set<(connected: boolean) => void>();
  let ws: WebSocket | null = null;
  let disposed = false;
  let delay = 500;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let connected = false;

  const setConnected = (value: boolean) => {
    if (connected === value) return;
    connected = value;
    for (const h of statusHandlers) h(value);
  };

  const scheduleReconnect = () => {
    if (disposed || timer) return;
    timer = setTimeout(() => {
      timer = null;
      delay = Math.min(delay * 2, 30_000);
      connect();
    }, delay);
  };

  const connect = () => {
    if (disposed || typeof WebSocket === "undefined") return;
    const protocols = token ? [WS_PROTOCOL, `${WS_TOKEN_PREFIX}${token}`] : [WS_PROTOCOL];
    try {
      ws = new WebSocket(wsUrl, protocols);
    } catch {
      scheduleReconnect();
      return;
    }
    ws.addEventListener("open", () => {
      delay = 500;
      setConnected(true);
    });
    ws.addEventListener("message", (evt: MessageEvent) => {
      try {
        const data = JSON.parse(String(evt.data)) as DebugWsEvent;
        for (const h of handlers) h(data);
      } catch {
        // ignore malformed frames
      }
    });
    ws.addEventListener("close", () => {
      ws = null;
      setConnected(false);
      scheduleReconnect();
    });
    ws.addEventListener("error", () => {
      ws?.close();
    });
  };

  connect();

  return {
    get connected() {
      return connected;
    },
    onEvent(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    onStatus(handler) {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    },
    disconnect() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      ws?.close();
      ws = null;
      handlers.clear();
      statusHandlers.clear();
      setConnected(false);
    }
  };
}
