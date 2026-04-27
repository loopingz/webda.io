"use strict";

/**
 * React context that tracks the live connection state of the
 * `webda debug --web` daemon.
 *
 * Mount <DebugConnectionProvider> as high as possible in the tree (ideally in
 * the swizzled Root component) so that both the Configuration panels and the
 * navbar item share the same connection state without duplicate polling.
 */

import React, { createContext, useEffect, useState, useCallback, useRef } from "react";
import {
  fetchApi,
  createDebugWebSocket,
  type DebugInfo,
  type DebugWsEvent,
  type DebugWebSocket
} from "./debugClient";

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface DebugConnectionState {
  /** Whether the daemon is reachable. */
  connected: boolean;
  /** Data returned by GET /api/info, or null when disconnected. */
  info: DebugInfo | null;
  /** Most recent connection error message, or null when connected. */
  error: string | null;
  /** The active WebSocket wrapper (for panels that need live events). */
  socket: DebugWebSocket | null;
}

export const DebugConnectionContext = createContext<DebugConnectionState>({
  connected: false,
  info: null,
  error: null,
  socket: null
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const PROBE_INTERVAL_MS = 5_000;

/** Props accepted by {@link DebugConnectionProvider}. */
export interface DebugConnectionProviderProps {
  children: React.ReactNode;
}

/**
 * Polls GET /api/info every 5 seconds to determine daemon reachability,
 * and maintains a single WebSocket connection that child panels can share.
 */
export function DebugConnectionProvider({ children }: DebugConnectionProviderProps) {
  const [state, setState] = useState<DebugConnectionState>({
    connected: false,
    info: null,
    error: null,
    socket: null
  });

  // Keep the WebSocket alive for the lifetime of the provider.
  // We store it in a ref so changes to the socket don't trigger re-renders.
  const socketRef = useRef<DebugWebSocket | null>(null);

  // Initialize the WebSocket on mount (browser only).
  useEffect(function initWebSocket() {
    if (typeof window === "undefined") return; // SSR guard

    const ws = createDebugWebSocket();
    socketRef.current = ws;
    setState(prev => ({ ...prev, socket: ws }));

    return function cleanup() {
      ws.disconnect();
      socketRef.current = null;
    };
  }, []);

  const probe = useCallback(async function probeConnection() {
    try {
      const info = await fetchApi<DebugInfo>("/api/info");
      setState(prev => ({ ...prev, connected: true, info, error: null }));
    } catch (e) {
      setState(prev => ({
        ...prev,
        connected: false,
        info: null,
        error: prev.connected ? "Disconnected" : (e as Error).message
      }));
    }
  }, []);

  useEffect(function startPolling() {
    if (typeof window === "undefined") return; // SSR guard

    probe();
    const id = setInterval(probe, PROBE_INTERVAL_MS);
    return function stopPolling() {
      clearInterval(id);
    };
  }, [probe]);

  return (
    <DebugConnectionContext.Provider value={state}>
      {children}
    </DebugConnectionContext.Provider>
  );
}
