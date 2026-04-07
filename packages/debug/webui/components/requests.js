import { h } from "https://esm.sh/preact@10.25.4";
import { useMemo } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(h);

function statusClass(code) {
  if (!code) return "status-pending";
  if (code < 300) return "status-2xx";
  if (code < 400) return "status-3xx";
  if (code < 500) return "status-4xx";
  return "status-5xx";
}

function methodBadge(method) {
  if (!method) return "";
  const m = method.toUpperCase();
  return html`<span class="badge method-${m.toLowerCase()}">${m}</span>`;
}

function formatTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

export function RequestsPanel({ data, wsEvents }) {
  const historical = data || [];

  // Merge websocket events with historical data
  // wsEvents are newest-first; historical may be oldest-first or newest-first
  const entries = useMemo(() => {
    // Build a map of all requests by ID
    const map = new Map();

    // Add historical entries
    for (const entry of historical) {
      if (entry.id) map.set(entry.id, { ...entry });
    }

    // Apply websocket events (they update existing or add new)
    for (const evt of [...wsEvents].reverse()) {
      if (!evt.id) continue;
      const existing = map.get(evt.id) || {};

      if (evt.type === "request") {
        map.set(evt.id, { ...existing, id: evt.id, method: evt.method, url: evt.url, timestamp: evt.timestamp });
      } else if (evt.type === "result") {
        map.set(evt.id, { ...existing, id: evt.id, statusCode: evt.statusCode, duration: evt.duration });
      } else if (evt.type === "404") {
        map.set(evt.id, { ...existing, id: evt.id, method: evt.method, url: evt.url, statusCode: 404 });
      }
    }

    // Sort by timestamp, newest first
    return Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [historical, wsEvents]);

  return html`
    <div>
      <div style="margin-bottom: 0.75rem; color: var(--text-muted); font-size: 0.8125rem;">
        ${entries.length} request${entries.length !== 1 ? "s" : ""} recorded
      </div>
      <div class="table-container">
        <table>
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
            ${entries.map(
              (r) => html`
                <tr key=${r.id}>
                  <td style="white-space: nowrap;">${formatTime(r.timestamp)}</td>
                  <td>${methodBadge(r.method)}</td>
                  <td class="mono" style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.url || "-"}</td>
                  <td>
                    ${r.statusCode != null
                      ? html`<span class="mono ${statusClass(r.statusCode)}" style="font-weight: 600;">${r.statusCode}</span>`
                      : html`<span class="status-pending">pending...</span>`}
                  </td>
                  <td class="mono" style="color: var(--text-muted);">
                    ${r.duration != null ? `${r.duration}ms` : "-"}
                  </td>
                </tr>
              `
            )}
            ${entries.length === 0 && html`
              <tr><td colspan="5" style="color: var(--text-muted); text-align: center; padding: 2rem;">No requests yet. Requests will appear here in real-time.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
