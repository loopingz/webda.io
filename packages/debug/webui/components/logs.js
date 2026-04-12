import { h } from "https://esm.sh/preact@10.25.4";
import { useState, useEffect, useRef, useMemo } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(h);

const LEVEL_COLORS = {
  ERROR: "#ef4444",
  WARN: "#eab308",
  INFO: "#22c55e",
  DEBUG: "#6b7280",
  TRACE: "#4b5563"
};

const LEVEL_ORDER = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];

function formatTime(ts) {
  if (!ts) return "-";
  return new Date(ts).toISOString().substring(11, 23);
}

export function LogsPanel({ data }) {
  const [liveEntries, setLiveEntries] = useState([]);
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [levelFilter, setLevelFilter] = useState("ALL");
  const listRef = useRef(null);


  // Merge cached + live, deduplicate by id
  const allEntries = useMemo(() => {
    const seen = new Set();
    const merged = [];
    for (const e of liveEntries) {
      if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }
    }
    for (const e of (data || [])) {
      if (!seen.has(e.id)) { seen.add(e.id); merged.push(e); }
    }
    return merged;
  }, [data, liveEntries]);

  const entries = search
    ? allEntries.filter(e => e.message?.toLowerCase().includes(search.toLowerCase()) || e.level?.toLowerCase().includes(search.toLowerCase()))
    : allEntries;

  // Listen for live log events via custom event dispatched from WebSocket handler
  useEffect(() => {
    const handler = (event) => {
      if (event.detail?.type === "log") {
        setLiveEntries((prev) => [event.detail, ...prev].slice(0, 2000));
      }
    };
    window.addEventListener("debug-ws-event", handler);
    return () => window.removeEventListener("debug-ws-event", handler);
  }, []);

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  const minLevel = LEVEL_ORDER.indexOf(levelFilter);
  const filtered = levelFilter === "ALL" ? entries : entries.filter((e) => LEVEL_ORDER.indexOf(e.level) >= minLevel);

  return html`
    <div>
      <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
        <input
          type="text"
          placeholder="Search logs..."
          value=${search}
          onInput=${(e) => setSearch(e.target.value)}
          style="flex:1;padding:6px 10px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:4px;font-family:monospace"
        />
        <select
          value=${levelFilter}
          onChange=${(e) => setLevelFilter(e.target.value)}
          style="padding:6px;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);border-radius:4px"
        >
          <option value="ALL">All levels</option>
          <option value="ERROR">ERROR only</option>
          <option value="WARN">WARN+</option>
          <option value="INFO">INFO+</option>
          <option value="DEBUG">DEBUG+</option>
          <option value="TRACE">TRACE (all)</option>
        </select>
        <label style="display:flex;align-items:center;gap:4px;color:var(--text-muted);font-size:12px">
          <input type="checkbox" checked=${autoScroll} onChange=${(e) => setAutoScroll(e.target.checked)} />
          Auto-scroll
        </label>
      </div>
      <div style="margin-bottom:0.75rem;color:var(--text-muted);font-size:0.8125rem">
        ${filtered.length} log${filtered.length !== 1 ? "s" : ""}
      </div>
      <div ref=${listRef} class="table-container" style="overflow-y:auto;max-height:calc(100vh - 200px)">
        <table>
          <thead>
            <tr>
              <th style="width:120px">Time</th>
              <th style="width:70px">Level</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(
              (entry) => html`
                <tr key=${entry.id}>
                  <td class="mono" style="white-space:nowrap;color:var(--text-muted);font-size:12px">${formatTime(entry.timestamp)}</td>
                  <td><span class="badge" style="background:${LEVEL_COLORS[entry.level] || "#666"}">${entry.level}</span></td>
                  <td class="mono" style="font-size:13px;white-space:pre-wrap;word-break:break-all">${entry.message}</td>
                </tr>
              `
            )}
            ${filtered.length === 0 &&
            html`
              <tr>
                <td colspan="3" style="color:var(--text-muted);text-align:center;padding:2rem">
                  No logs${search ? " matching search" : " yet"}. Logs will appear here in real-time.
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
