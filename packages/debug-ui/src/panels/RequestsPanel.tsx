import React, { useEffect, useMemo, useState } from "react";
import { useTrack } from "../analytics.js";
import { DebugClientError } from "../client.js";
import { MethodBadge, formatBytes, formatTime, statusClass } from "../components/ui.js";
import { useDebugConnection } from "../connection.js";
import type { DebugRequest, DebugRequestBody, DebugWsEvent } from "../types.js";

/**
 * Merge the historical list with the websocket events (newest first).
 *
 * @param historical - `/api/requests`
 * @param events - websocket events, newest first
 * @returns the requests sorted by timestamp, newest first
 */
export function mergeRequests(historical: DebugRequest[], events: DebugWsEvent[]): DebugRequest[] {
  const map = new Map<string, DebugRequest>();
  for (const entry of historical) {
    if (entry.id) map.set(entry.id, { ...entry });
  }
  for (const evt of [...events].reverse()) {
    if (!("id" in evt) || !evt.id) continue;
    const existing = map.get(evt.id) || { id: evt.id };
    if (evt.type === "request") {
      map.set(evt.id, { ...existing, id: evt.id, method: evt.method, url: evt.url, timestamp: evt.timestamp });
    } else if (evt.type === "result") {
      map.set(evt.id, { ...existing, id: evt.id, statusCode: evt.statusCode, duration: evt.duration });
    } else if (evt.type === "404") {
      map.set(evt.id, { ...existing, id: evt.id, method: evt.method, url: evt.url, statusCode: 404 });
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

/**
 * Captured body: placeholder, pretty-printed text or a binary summary.
 *
 * @param props - the body
 * @returns the body element
 */
function BodyView(props: { body?: DebugRequestBody }): React.JSX.Element {
  const { body } = props;
  if (!body) return <div className="wdbg-muted wdbg-italic">(not captured)</div>;
  if (body.kind === "empty") return <div className="wdbg-muted wdbg-italic">(empty)</div>;
  if (body.kind === "binary") {
    return (
      <div className="wdbg-muted wdbg-mono">
        Binary, {formatBytes(body.size)} (preview: 0x{body.preview || ""})
      </div>
    );
  }
  let display = body.content || "";
  try {
    display = JSON.stringify(JSON.parse(display), null, 2);
  } catch {
    // not JSON
  }
  return (
    <>
      <pre className="wdbg-pre wdbg-mono wdbg-pre-wrap">{display}</pre>
      {body.kind === "text-truncated" && (
        <div className="wdbg-muted wdbg-small">[truncated — total {formatBytes(body.size)}]</div>
      )}
    </>
  );
}

/**
 * Captured headers as a two-column table.
 *
 * @param props - the headers
 * @returns the headers element
 */
function HeadersView(props: { headers?: Record<string, string> }): React.JSX.Element {
  const keys = props.headers ? Object.keys(props.headers).sort() : [];
  if (keys.length === 0) return <div className="wdbg-muted wdbg-italic">(none)</div>;
  return (
    <table className="wdbg-headers">
      <tbody>
        {keys.map(k => (
          <tr key={k}>
            <td className="wdbg-mono wdbg-muted">{k}</td>
            <td className="wdbg-mono wdbg-break">{props.headers![k]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Detail of one request, loaded from `/api/requests/:id`: status line, error,
 * headers and bodies. Failures to load (404 on older servers, errors) are shown in place.
 *
 * @param props - the request id and the close handler
 * @returns the detail element
 */
export function RequestDetail(props: { id: string; onClose: () => void }): React.JSX.Element | null {
  const { client } = useDebugConnection();
  const track = useTrack();
  const [entry, setEntry] = useState<DebugRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    track("request_detail_view");
  }, [props.id, track]);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    setEntry(null);
    setError(null);
    client
      .getRequestDetail(props.id)
      .then(data => {
        if (!cancelled) setEntry(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DebugClientError && err.reason === "not_found") {
          setError(
            "This request is no longer in the server buffer, or the running @webda/debug does not capture request details (update it)."
          );
        } else {
          setError((err as Error).message || "Failed to load request detail");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, props.id]);

  const close = (
    <button type="button" className="wdbg-btn wdbg-btn-ghost" onClick={props.onClose}>
      Close
    </button>
  );
  if (error) {
    return (
      <div className="wdbg-card wdbg-card-error" role="alert">
        <div className="wdbg-row-between">
          <strong>Failed to load request detail</strong>
          {close}
        </div>
        <div className="wdbg-muted">{error}</div>
      </div>
    );
  }
  if (!entry) return <div className="wdbg-muted wdbg-pad">Loading request detail...</div>;
  return (
    <div className="wdbg-card">
      <div className="wdbg-row-between">
        <div>
          <MethodBadge method={entry.method} />
          <span className="wdbg-mono wdbg-request-url">{entry.url}</span>
        </div>
        {close}
      </div>
      <div className="wdbg-request-meta">
        <div>Time: {formatTime(entry.timestamp)}</div>
        <div>
          Status:{" "}
          <span className={`wdbg-mono wdbg-strong ${statusClass(entry.statusCode)}`}>
            {entry.statusCode != null ? entry.statusCode : "pending"}
          </span>
        </div>
        <div>Duration: {entry.duration != null ? `${entry.duration}ms` : "-"}</div>
      </div>
      {entry.error && (
        <div className="wdbg-alert wdbg-alert-danger">
          <div className="wdbg-strong">Error</div>
          <div className="wdbg-mono">{entry.error.message}</div>
          {entry.error.stack && <pre className="wdbg-pre wdbg-pre-wrap wdbg-small wdbg-muted">{entry.error.stack}</pre>}
        </div>
      )}
      <div className="wdbg-request-grid">
        <div>
          <h4>Request Headers</h4>
          <HeadersView headers={entry.requestHeaders} />
          <h4>Request Body</h4>
          <BodyView body={entry.requestBody} />
        </div>
        <div>
          <h4>Response Headers</h4>
          <HeadersView headers={entry.responseHeaders} />
          <h4>Response Body</h4>
          <BodyView body={entry.responseBody} />
        </div>
      </div>
    </div>
  );
}

/**
 * Requests panel: live table of the application's requests (4xx/5xx coloured),
 * a row click opens the captured detail.
 *
 * @returns the panel element
 */
export function RequestsPanel(): React.JSX.Element {
  const { data, requestEvents } = useDebugConnection();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const entries = useMemo(() => mergeRequests(data.requests, requestEvents), [data.requests, requestEvents]);

  return (
    <div>
      <div className="wdbg-muted wdbg-count">
        {entries.length} request{entries.length !== 1 ? "s" : ""} recorded
        {selectedId ? "" : " — click a row to inspect"}
      </div>
      <div className="wdbg-table-container">
        <table className="wdbg-table">
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
              <tr
                key={r.id}
                className={`wdbg-row-clickable ${r.id === selectedId ? "wdbg-row-selected" : ""}`}
                onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
              >
                <td className="wdbg-nowrap">{formatTime(r.timestamp)}</td>
                <td>
                  <MethodBadge method={r.method} />
                </td>
                <td className="wdbg-mono wdbg-ellipsis wdbg-url-cell">{r.url || "-"}</td>
                <td>
                  {r.statusCode != null ? (
                    <span className={`wdbg-mono wdbg-strong ${statusClass(r.statusCode)}`}>{r.statusCode}</span>
                  ) : (
                    <span className="wdbg-status-pending">pending...</span>
                  )}
                </td>
                <td className="wdbg-mono wdbg-muted">{r.duration != null ? `${r.duration}ms` : "-"}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="wdbg-empty">
                  No requests yet. Requests will appear here in real-time.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selectedId && <RequestDetail id={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
