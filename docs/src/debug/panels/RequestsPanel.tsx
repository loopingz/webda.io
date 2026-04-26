"use strict";

/**
 * RequestsPanel — displays recent HTTP requests handled by the Webda application.
 *
 * Merges historical entries from GET /api/requests with live WebSocket events
 * (`request`, `result`, `404`) — matching the behaviour of the Preact
 * webui/components/requests.js.
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useDebugConnection } from "../useDebugConnection";
import { fetchApi, type DebugRequest, type DebugWsEvent } from "../debugClient";
import styles from "./panels.module.css";

// ---------------------------------------------------------------------------
// Disconnected state
// ---------------------------------------------------------------------------

function DisconnectedState() {
  const port = typeof window !== "undefined"
    ? (parseInt(localStorage.getItem("webda.debug.port") ?? "18181", 10) || 18181)
    : 18181;

  const handleConfigure = useCallback(function handleConfigure() {
    const input = window.prompt("Enter debug daemon port:", String(port));
    if (input) {
      const n = parseInt(input, 10);
      if (Number.isFinite(n) && n > 0 && n < 65536) {
        localStorage.setItem("webda.debug.port", String(n));
        window.location.reload();
      }
    }
  }, [port]);

  return (
    <div className={styles.disconnectedBox}>
      <h3>No daemon connected</h3>
      <p>Waiting for connection to <code>http://localhost:{port}</code>…</p>
      <p>Run <code>webda debug --web</code> in your application directory.</p>
      <button className={styles.configureLink} onClick={handleConfigure}>Configure port</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusClass(code?: number): string {
  if (!code) return styles.statusPending;
  if (code < 300) return styles.status2xx;
  if (code < 400) return styles.status3xx;
  if (code < 500) return styles.status4xx;
  return styles.status5xx;
}

function methodBadgeClass(method?: string): string {
  if (!method) return styles.badgeMuted;
  const m = method.toLowerCase();
  if (m === "get") return styles.methodGet;
  if (m === "post") return styles.methodPost;
  if (m === "put") return styles.methodPut;
  if (m === "patch") return styles.methodPatch;
  if (m === "delete") return styles.methodDelete;
  return styles.methodOptions;
}

function formatTime(ts?: number): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleTimeString();
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function RequestsPanel() {
  const { connected, socket } = useDebugConnection();
  const [historical, setHistorical] = useState<DebugRequest[]>([]);
  const [wsEvents, setWsEvents] = useState<DebugWsEvent[]>([]);

  useEffect(function fetchHistorical() {
    if (!connected) return;
    fetchApi<DebugRequest[]>("/api/requests")
      .then(data => setHistorical(data))
      .catch(() => {});
  }, [connected]);

  useEffect(function subscribeWs() {
    if (!socket) return;
    return socket.onEvent(function handleWsEvent(event: DebugWsEvent) {
      if (event.type === "request" || event.type === "result" || event.type === "404") {
        setWsEvents(prev => [event, ...prev].slice(0, 1000));
      }
    });
  }, [socket]);

  const entries = useMemo(function mergeEntries() {
    const map = new Map<string, DebugRequest>();

    for (const entry of historical) {
      if (entry.id) map.set(entry.id, { ...entry });
    }

    for (const evt of [...wsEvents].reverse()) {
      const existing = map.get((evt as any).id) ?? {};
      if (evt.type === "request") {
        map.set(evt.id, { ...existing, id: evt.id, method: evt.method, url: evt.url, timestamp: evt.timestamp });
      } else if (evt.type === "result") {
        map.set(evt.id, { ...existing, id: evt.id, statusCode: evt.statusCode, duration: evt.duration });
      } else if (evt.type === "404") {
        map.set(evt.id, { ...existing, id: evt.id, method: evt.method, url: evt.url, statusCode: 404 });
      }
    }

    return Array.from(map.values()).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  }, [historical, wsEvents]);

  if (!connected) return <DisconnectedState />;

  return (
    <div>
      <div style={{ marginBottom: "0.75rem", color: "var(--ifm-color-emphasis-600)", fontSize: "0.8125rem" }}>
        {entries.length} request{entries.length !== 1 ? "s" : ""} recorded
      </div>
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Time</th>
              <th>Method</th>
              <th>URL</th>
              <th>Status</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(r => (
              <tr key={r.id}>
                <td style={{ whiteSpace: "nowrap" }}>{formatTime(r.timestamp)}</td>
                <td>
                  {r.method && (
                    <span className={`${styles.badge} ${methodBadgeClass(r.method)}`}>
                      {r.method.toUpperCase()}
                    </span>
                  )}
                </td>
                <td
                  className={styles.mono}
                  style={{ maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {r.url ?? "-"}
                </td>
                <td>
                  {r.statusCode != null
                    ? <span className={`${styles.mono} ${statusClass(r.statusCode)}`}>{r.statusCode}</span>
                    : <span className={styles.statusPending}>pending…</span>
                  }
                </td>
                <td className={styles.mono} style={{ color: "var(--ifm-color-emphasis-600)" }}>
                  {r.duration != null ? `${r.duration}ms` : "-"}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.emptyState}>
                  No requests yet. Requests will appear here in real-time.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
