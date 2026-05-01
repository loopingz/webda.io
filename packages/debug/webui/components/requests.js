import { h } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import htm from "htm";

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

function formatBytes(n) {
  if (n == null) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Render a request/response body in the most useful format we can:
 * - empty -> grey placeholder
 * - text -> preformatted block (pretty-printed JSON when possible)
 * - text-truncated -> same plus a [truncated] notice
 * - binary -> "Binary, N bytes (preview: 0xHEX)"
 */
function BodyView({ body }) {
  if (!body) return html`<div style="color:var(--text-muted);font-style:italic">(not captured)</div>`;
  if (body.kind === "empty") {
    return html`<div style="color:var(--text-muted);font-style:italic">(empty)</div>`;
  }
  if (body.kind === "binary") {
    return html`
      <div style="color:var(--text-muted);font-family:monospace;font-size:13px">
        Binary, ${formatBytes(body.size)} (preview: 0x${body.preview || ""})
      </div>
    `;
  }
  // text or text-truncated
  let display = body.content || "";
  // Try to pretty-print JSON
  try {
    const parsed = JSON.parse(display);
    display = JSON.stringify(parsed, null, 2);
  } catch {
    // not JSON — leave as-is
  }
  return html`
    <pre class="mono" style="background:var(--bg-secondary);padding:0.75rem;border-radius:4px;overflow:auto;max-height:400px;font-size:12px;white-space:pre-wrap;word-break:break-all">${display}</pre>
    ${body.kind === "text-truncated"
      ? html`<div style="color:var(--text-muted);font-size:12px;margin-top:0.25rem">[truncated — total ${formatBytes(body.size)}]</div>`
      : ""}
  `;
}

/**
 * Render a flat list of headers as a small two-column table.
 */
function HeadersView({ headers }) {
  const keys = headers ? Object.keys(headers) : [];
  if (keys.length === 0) {
    return html`<div style="color:var(--text-muted);font-style:italic">(none)</div>`;
  }
  return html`
    <table style="width:100%;font-size:12px">
      <tbody>
        ${keys.sort().map(
          k => html`
            <tr key=${k}>
              <td class="mono" style="color:var(--text-muted);padding:2px 8px 2px 0;vertical-align:top;white-space:nowrap">${k}</td>
              <td class="mono" style="word-break:break-all">${headers[k]}</td>
            </tr>
          `
        )}
      </tbody>
    </table>
  `;
}

/**
 * Detail panel for a single request: status line, headers, bodies, error.
 * Loads the full entry from /api/requests/:id when `id` changes.
 */
function RequestDetail({ id, onClose }) {
  const [entry, setEntry] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) {
      setEntry(null);
      return;
    }
    let cancelled = false;
    setError(null);
    fetch(`/api/requests/${encodeURIComponent(id)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => {
        if (!cancelled) setEntry(data);
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return null;
  if (error) {
    return html`
      <div style="padding:1rem;border:1px solid var(--border);border-radius:4px;margin-top:1rem;background:var(--bg-secondary)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
          <strong>Failed to load request detail</strong>
          <button onClick=${onClose} style="background:transparent;border:1px solid var(--border);color:var(--text-primary);padding:2px 8px;border-radius:4px;cursor:pointer">Close</button>
        </div>
        <div style="color:var(--text-muted)">${error}</div>
      </div>
    `;
  }
  if (!entry) {
    return html`
      <div style="padding:1rem;color:var(--text-muted)">Loading request detail...</div>
    `;
  }
  return html`
    <div style="padding:1rem;border:1px solid var(--border);border-radius:4px;margin-top:1rem;background:var(--bg-secondary)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
        <div>
          ${methodBadge(entry.method)}
          <span class="mono" style="margin-left:0.5rem">${entry.url}</span>
        </div>
        <button onClick=${onClose} style="background:transparent;border:1px solid var(--border);color:var(--text-primary);padding:2px 8px;border-radius:4px;cursor:pointer">Close</button>
      </div>
      <div style="display:flex;gap:1.5rem;font-size:12px;color:var(--text-muted);margin-bottom:1rem">
        <div>Time: ${formatTime(entry.timestamp)}</div>
        <div>Status: <span class="mono ${statusClass(entry.statusCode)}" style="font-weight:600">${entry.statusCode != null ? entry.statusCode : "pending"}</span></div>
        <div>Duration: ${entry.duration != null ? `${entry.duration}ms` : "-"}</div>
      </div>

      ${entry.error
        ? html`
          <div style="margin-bottom:1rem;padding:0.5rem 0.75rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:4px">
            <div style="color:#ef4444;font-weight:600;margin-bottom:0.25rem">Error</div>
            <div class="mono" style="font-size:12px">${entry.error.message}</div>
            ${entry.error.stack
              ? html`<pre class="mono" style="font-size:11px;color:var(--text-muted);margin-top:0.5rem;white-space:pre-wrap">${entry.error.stack}</pre>`
              : ""}
          </div>
        `
        : ""}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div>
          <h4 style="margin:0 0 0.5rem 0;font-size:13px">Request Headers</h4>
          <${HeadersView} headers=${entry.requestHeaders} />
          <h4 style="margin:1rem 0 0.5rem 0;font-size:13px">Request Body</h4>
          <${BodyView} body=${entry.requestBody} />
        </div>
        <div>
          <h4 style="margin:0 0 0.5rem 0;font-size:13px">Response Headers</h4>
          <${HeadersView} headers=${entry.responseHeaders} />
          <h4 style="margin:1rem 0 0.5rem 0;font-size:13px">Response Body</h4>
          <${BodyView} body=${entry.responseBody} />
        </div>
      </div>
    </div>
  `;
}

export function RequestsPanel({ data, wsEvents }) {
  const historical = data || [];
  const [selectedId, setSelectedId] = useState(null);

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
        ${entries.length} request${entries.length !== 1 ? "s" : ""} recorded${selectedId ? " — click a row to inspect" : ""}
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
                <tr
                  key=${r.id}
                  onClick=${() => setSelectedId(r.id === selectedId ? null : r.id)}
                  style="cursor:pointer;${r.id === selectedId ? "background:var(--bg-tertiary)" : ""}"
                >
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
      ${selectedId ? html`<${RequestDetail} id=${selectedId} onClose=${() => setSelectedId(null)} />` : ""}
    </div>
  `;
}
