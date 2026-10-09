import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  createDebugClient,
  DebugClientError,
  localhostBaseUrl,
  type DebugClient,
  type DebugErrorReason
} from "./client.js";
import { getStoredPort, getStoredToken, setStoredPort } from "./session.js";
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
import { compareVersions, featuresForVersion, type DebugFeatures, type VersionStatus } from "./version.js";
import { useTrack } from "./analytics.js";

/** Where the dashboard runs. */
export type DebugMode = "hosted" | "local";

/** Why the dashboard cannot talk to the server. */
export type ConnectionFailure = DebugErrorReason | "version";

/** Everything loaded from the API. */
export interface DebugData {
  models: DebugModel[];
  services: DebugServiceInfo[];
  operations: DebugOperation[];
  config: DebugConfig | null;
  requests: DebugRequest[];
  logs: DebugLogEntry[];
}

/** State shared with every panel. */
export interface DebugConnectionState {
  /** `idle` when disabled, `connecting` until `/api/info` answers */
  status: "idle" | "connecting" | "connected" | "error";
  /** Failure reason when `status === "error"` */
  failure: ConnectionFailure | null;
  /** `/api/info` */
  info: DebugInfo | null;
  /** API version comparison (null until connected) */
  version: VersionStatus | null;
  /** Endpoints detected on the server */
  features: DebugFeatures;
  /** Whether the websocket is open */
  wsConnected: boolean;
  /** Incremented on every `restart` event; panels reload on change */
  dataVersion: number;
  /** Loaded data */
  data: DebugData;
  /** Whether the initial data load is in flight */
  loading: boolean;
  /** Request lifecycle events received on the websocket, newest first */
  requestEvents: DebugWsEvent[];
  /** Subscribe to websocket events; returns the unsubscribe function */
  subscribe: (handler: (event: DebugWsEvent) => void) => () => void;
  /** The client, when a base URL is known */
  client: DebugClient | null;
  /** Where the dashboard runs */
  mode: DebugMode;
  /** Base URL of the server */
  baseUrl: string;
  /** Debug port (hosted mode) */
  port: number;
  /** Change the debug port (hosted mode) */
  setPort: (port: number) => void;
  /** Probe the server again now */
  retry: () => void;
}

const EMPTY_DATA: DebugData = { models: [], services: [], operations: [], config: null, requests: [], logs: [] };

const DebugConnectionContext = createContext<DebugConnectionState | null>(null);

/** Props of {@link DebugConnectionProvider}. */
export interface DebugConnectionProviderProps {
  /** Where the dashboard runs: same origin (`local`) or the docs site (`hosted`) */
  mode: DebugMode;
  /** Base URL of the server; defaults to `location.origin` (local) or `http://localhost:<port>` (hosted) */
  baseUrl?: string;
  /** Session token; defaults to the one stored for the tab */
  token?: string;
  /** Debug port (hosted); defaults to the stored one */
  port?: number;
  /** When `false`, nothing is probed (used on docs pages that are not the dashboard) */
  enabled?: boolean;
  /** Probe interval while disconnected, in ms */
  probeIntervalMs?: number;
  /** Called when the server refuses the token (e.g. to forget a stored one) */
  onUnauthorized?: () => void;
  children: React.ReactNode;
}

/**
 * Owns the client, the `/api/info` probe, the websocket and the loaded data.
 *
 * Mount it once, high in the tree: the navbar indicator and the panels share
 * one probe loop and one websocket.
 *
 * @param props - mode, base URL, token, port
 * @returns the provider element
 */
export function DebugConnectionProvider(props: DebugConnectionProviderProps): React.JSX.Element {
  const { mode, enabled = true, probeIntervalMs = 5000, onUnauthorized, children } = props;
  const track = useTrack();
  const [port, setPortState] = useState<number>(() => props.port ?? getStoredPort());
  const [token, setToken] = useState<string | undefined>(() => props.token ?? getStoredToken());
  const [status, setStatus] = useState<DebugConnectionState["status"]>("idle");
  const [failure, setFailure] = useState<ConnectionFailure | null>(null);
  const [info, setInfo] = useState<DebugInfo | null>(null);
  const [version, setVersion] = useState<VersionStatus | null>(null);
  const [features, setFeatures] = useState<DebugFeatures>({ config: true, requestDetails: true });
  const [wsConnected, setWsConnected] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);
  const [data, setData] = useState<DebugData>(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [requestEvents, setRequestEvents] = useState<DebugWsEvent[]>([]);
  const [attempt, setAttempt] = useState(0);
  const handlers = useRef(new Set<(event: DebugWsEvent) => void>());
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (props.token !== undefined) setToken(props.token);
  }, [props.token]);
  useEffect(() => {
    if (props.port !== undefined) setPortState(props.port);
  }, [props.port]);

  const baseUrl = useMemo(() => {
    if (props.baseUrl) return props.baseUrl;
    if (mode === "local") return typeof location !== "undefined" ? location.origin : "";
    return localhostBaseUrl(port);
  }, [props.baseUrl, mode, port]);

  const client = useMemo(() => (baseUrl ? createDebugClient({ baseUrl, token }) : null), [baseUrl, token]);

  const connected = status === "connected";

  // Probe /api/info until the server answers, then keep an eye on it while the websocket is down.
  useEffect(() => {
    if (!enabled || !client) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const probe = async () => {
      if (cancelled) return;
      try {
        const next = await client.getInfo();
        if (cancelled) return;
        const status = compareVersions(next);
        setInfo(next);
        setVersion(status);
        setFeatures(featuresForVersion(status));
        if (status.state === "older") {
          setFailure("version");
          setStatus("error");
          if (reported.current !== "version") {
            reported.current = "version";
            track("connection_failed", { reason: "version" });
          }
        } else {
          setFailure(null);
          setStatus("connected");
          const key = `connected:${next.debugApiVersion}`;
          if (reported.current !== key) {
            reported.current = key;
            track("debug_connected", {
              debug_api_version: status.server,
              framework_version: next.frameworkVersion ?? "unknown",
              mode
            });
          }
        }
      } catch (err) {
        if (cancelled) return;
        const reason: ConnectionFailure = err instanceof DebugClientError ? err.reason : "unreachable";
        if (reason === "unauthorized") onUnauthorized?.();
        setInfo(null);
        setVersion(null);
        setStatus("error");
        setFailure(reason);
        if (reported.current !== reason) {
          reported.current = reason;
          if (reason === "mixed_content" || reason === "unreachable" || reason === "unauthorized") {
            track("connection_failed", { reason });
          }
        }
      }
      if (!cancelled) timer = setTimeout(probe, probeIntervalMs);
    };
    setStatus(prev => (prev === "connected" ? prev : "connecting"));
    probe();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [client, enabled, probeIntervalMs, attempt, mode, track, onUnauthorized]);

  // Websocket, kept open while connected.
  useEffect(() => {
    if (!connected || !client) return;
    const socket = client.connect();
    const offStatus = socket.onStatus(setWsConnected);
    const offEvent = socket.onEvent(event => {
      if (event.type === "restart") {
        setDataVersion(v => v + 1);
      } else if (event.type === "request" || event.type === "result" || event.type === "404") {
        setRequestEvents(prev => [event, ...prev].slice(0, 500));
      }
      for (const handler of handlers.current) handler(event);
    });
    return () => {
      offStatus();
      offEvent();
      socket.disconnect();
      setWsConnected(false);
    };
  }, [connected, client]);

  // Data, loaded on connect and after every restart; /api/config is feature-detected.
  useEffect(() => {
    if (!connected || !client) {
      setData(EMPTY_DATA);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const optional = async <T,>(promise: Promise<T>, fallback: T): Promise<T> => {
      try {
        return await promise;
      } catch {
        return fallback;
      }
    };
    const loadConfig = async (): Promise<DebugConfig | null> => {
      try {
        return await client.getConfig();
      } catch (err) {
        if (err instanceof DebugClientError && err.reason === "not_found") {
          setFeatures(prev => ({ ...prev, config: false }));
        }
        return null;
      }
    };
    Promise.all([
      optional(client.getModels(), []),
      optional(client.getServices(), []),
      optional(client.getOperations(), []),
      loadConfig(),
      optional(client.getRequests(), []),
      optional(client.getLogs(), [])
    ]).then(([models, services, operations, config, requests, logs]) => {
      if (cancelled) return;
      setData({ models, services, operations, config, requests, logs });
      setRequestEvents([]);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [connected, client, dataVersion]);

  const subscribe = useCallback((handler: (event: DebugWsEvent) => void) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);

  const setPort = useCallback((next: number) => {
    setStoredPort(next);
    setPortState(next);
    reported.current = null;
  }, []);

  const retry = useCallback(() => setAttempt(a => a + 1), []);

  const value = useMemo<DebugConnectionState>(
    () => ({
      status,
      failure,
      info,
      version,
      features,
      wsConnected,
      dataVersion,
      data,
      loading,
      requestEvents,
      subscribe,
      client,
      mode,
      baseUrl,
      port,
      setPort,
      retry
    }),
    [
      status,
      failure,
      info,
      version,
      features,
      wsConnected,
      dataVersion,
      data,
      loading,
      requestEvents,
      subscribe,
      client,
      mode,
      baseUrl,
      port,
      setPort,
      retry
    ]
  );

  return <DebugConnectionContext.Provider value={value}>{children}</DebugConnectionContext.Provider>;
}

const DISCONNECTED: DebugConnectionState = {
  status: "idle",
  failure: null,
  info: null,
  version: null,
  features: { config: true, requestDetails: true },
  wsConnected: false,
  dataVersion: 0,
  data: EMPTY_DATA,
  loading: false,
  requestEvents: [],
  subscribe: () => () => {},
  client: null,
  mode: "hosted",
  baseUrl: "",
  port: 18181,
  setPort: () => {},
  retry: () => {}
};

/**
 * Connection state from the nearest {@link DebugConnectionProvider}.
 *
 * Without a provider it returns an idle, disconnected state so that components
 * like the navbar indicator render safely anywhere.
 *
 * @returns the connection state
 */
export function useDebugConnection(): DebugConnectionState {
  return useContext(DebugConnectionContext) ?? DISCONNECTED;
}
