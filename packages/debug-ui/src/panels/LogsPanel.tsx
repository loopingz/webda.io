import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatTime } from "../components/ui.js";
import { useDebugConnection } from "../connection.js";
import type { DebugLogEntry } from "../types.js";

const LEVEL_ORDER = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];
const LEVEL_KEY = "webda-log-level";

/**
 * Minimum level remembered for this browser.
 *
 * @returns the stored level or `INFO`
 */
function storedLevel(): string {
  try {
    return (typeof localStorage !== "undefined" && localStorage.getItem(LEVEL_KEY)) || "INFO";
  } catch {
    return "INFO";
  }
}

/**
 * Logs panel: live application logs with text search, a persisted minimum
 * level and auto-scroll.
 *
 * @returns the panel element
 */
export function LogsPanel(): React.JSX.Element {
  const { data, subscribe, dataVersion } = useDebugConnection();
  const [liveEntries, setLiveEntries] = useState<DebugLogEntry[]>([]);
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [levelFilter, setLevelFilter] = useState(storedLevel);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLiveEntries([]);
  }, [dataVersion]);

  useEffect(
    () =>
      subscribe(event => {
        if (event.type === "log") {
          setLiveEntries(prev => [event, ...prev].slice(0, 2000));
        }
      }),
    [subscribe]
  );

  const allEntries = useMemo(() => {
    const seen = new Set<string>();
    const merged: DebugLogEntry[] = [];
    for (const e of [...liveEntries, ...data.logs]) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        merged.push(e);
      }
    }
    return merged;
  }, [data.logs, liveEntries]);

  const needle = search.toLowerCase();
  const searched = search
    ? allEntries.filter(e => e.message?.toLowerCase().includes(needle) || e.level?.toLowerCase().includes(needle))
    : allEntries;
  const minLevel = LEVEL_ORDER.indexOf(levelFilter);
  const filtered = minLevel <= 0 ? searched : searched.filter(e => LEVEL_ORDER.indexOf(e.level) >= minLevel);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filtered, autoScroll]);

  return (
    <div>
      <div className="wdbg-toolbar">
        <input
          type="search"
          className="wdbg-search wdbg-mono wdbg-grow"
          placeholder="Search logs..."
          aria-label="Search logs"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="wdbg-select"
          aria-label="Minimum level"
          value={levelFilter}
          onChange={e => {
            setLevelFilter(e.target.value);
            try {
              localStorage.setItem(LEVEL_KEY, e.target.value);
            } catch {
              // storage may be unavailable
            }
          }}
        >
          <option value="ERROR">ERROR</option>
          <option value="WARN">WARN+</option>
          <option value="INFO">INFO+</option>
          <option value="DEBUG">DEBUG+</option>
          <option value="TRACE">TRACE+</option>
        </select>
        <label className="wdbg-checkbox">
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
          Auto-scroll
        </label>
      </div>
      <div className="wdbg-muted wdbg-count">
        {filtered.length} log{filtered.length !== 1 ? "s" : ""}
      </div>
      <div ref={listRef} className="wdbg-table-container wdbg-logs">
        <table className="wdbg-table">
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
                <td className="wdbg-mono wdbg-muted wdbg-nowrap wdbg-small">{formatTime(entry.timestamp)}</td>
                <td>
                  <span className={`wdbg-badge wdbg-level wdbg-level-${(entry.level || "").toLowerCase()}`}>
                    {entry.level}
                  </span>
                </td>
                <td className="wdbg-mono wdbg-pre-wrap wdbg-break">{entry.message}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="wdbg-empty">
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
