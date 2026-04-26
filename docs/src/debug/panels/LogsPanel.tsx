"use strict";

/**
 * LogsPanel — live log tailing panel.
 *
 * Subscribes to WebSocket `log` events from the debug daemon and merges
 * them with the historical entries returned by GET /api/logs. Supports
 * search filtering and minimum log-level filtering (matching the Preact
 * webui/components/logs.js behaviour).
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useDebugConnection } from "../useDebugConnection";
import { fetchApi, type DebugLogEntry, type DebugWsEvent } from "../debugClient";
import styles from "./panels.module.css";

const LEVEL_COLORS: Record<string, string> = {
  ERROR: "#dc2626",
  WARN: "#ca8a04",
  INFO: "#16a34a",
  DEBUG: "#6b7280",
  TRACE: "#4b5563"
};

const LEVEL_ORDER = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];

function formatTime(ts?: number): string {
  if (!ts) return "-";
  return new Date(ts).toISOString().substring(11, 23);
}

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
      <p>
        Waiting for connection to{" "}
        <code>http://localhost:{port}</code>…
      </p>
      <p>
        Run{" "}
        <code>webda debug --web</code>{" "}
        in your application directory.
      </p>
      <button className={styles.configureLink} onClick={handleConfigure}>
        Configure port
      </button>
    </div>
  );
}

export function LogsPanel() {
  const { connected, socket } = useDebugConnection();
  const [historical, setHistorical] = useState<DebugLogEntry[]>([]);
  const [liveEntries, setLiveEntries] = useState<DebugLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>(
    () => (typeof window !== "undefined" ? localStorage.getItem("webda-log-level") ?? "INFO" : "INFO")
  );
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch historical logs when we connect
  useEffect(function fetchLogs() {
    if (!connected) return;
    fetchApi<DebugLogEntry[]>("/api/logs")
      .then(entries => setHistorical(entries))
      .catch(() => {/* ignore */});
  }, [connected]);

  // Subscribe to WebSocket log events
  useEffect(function subscribeWs() {
    if (!socket) return;
    return socket.onEvent(function handleWsEvent(event: DebugWsEvent) {
      if (event.type === "log") {
        setLiveEntries(prev => [event as unknown as DebugLogEntry, ...prev].slice(0, 2000));
      }
    });
  }, [socket]);

  // Merge live + historical, deduplicate by id
  const allEntries = useMemo(function mergeEntries() {
    const seen = new Set<string>();
    const merged: DebugLogEntry[] = [];
    for (const e of liveEntries) {
      if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }
    }
    for (const e of historical) {
      if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }
    }
    return merged;
  }, [historical, liveEntries]);

  const filtered = useMemo(function filterEntries() {
    const minLevel = LEVEL_ORDER.indexOf(levelFilter);
    let result = minLevel <= 0 ? allEntries : allEntries.filter(e => LEVEL_ORDER.indexOf(e.level) >= minLevel);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        e => e.message?.toLowerCase().includes(q) || e.level?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [allEntries, search, levelFilter]);

  useEffect(function scrollToBottom() {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filtered, autoScroll]);

  if (!connected) return <DisconnectedState />;

  return (
    <div>
      <div className={styles.logControls}>
        <input
          type="text"
          className={`${styles.searchInput} ${styles.logSearchInput || ""}`}
          style={{ flex: 1, marginBottom: 0 }}
          placeholder="Search logs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className={styles.logLevelSelect}
          value={levelFilter}
          onChange={e => {
            setLevelFilter(e.target.value);
            localStorage.setItem("webda-log-level", e.target.value);
          }}
        >
          {["ERROR", "WARN", "INFO", "DEBUG", "TRACE"].map(l => (
            <option key={l} value={l}>{l}{l !== "ERROR" ? "+" : ""}</option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, whiteSpace: "nowrap" }}>
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={e => setAutoScroll(e.target.checked)}
          />
          Auto-scroll
        </label>
      </div>

      <div style={{ marginBottom: "0.75rem", color: "var(--ifm-color-emphasis-600)", fontSize: "0.8125rem" }}>
        {filtered.length} log{filtered.length !== 1 ? "s" : ""}
      </div>

      <div ref={listRef} className={`${styles.tableContainer} ${styles.logScrollContainer}`}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 120 }}>Time</th>
              <th style={{ width: 70 }}>Level</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(entry => (
              <tr key={entry.id}>
                <td className={styles.mono} style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                  {formatTime(entry.timestamp)}
                </td>
                <td>
                  <span
                    className={styles.badge}
                    style={{ background: LEVEL_COLORS[entry.level] ?? "#666" }}
                  >
                    {entry.level}
                  </span>
                </td>
                <td className={styles.mono} style={{ fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {entry.message}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className={styles.emptyState}>
                  No logs{search ? " matching search" : " yet"}. Logs will appear here in real-time.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
