import { h } from "https://esm.sh/preact@10.25.4";
import { useState, useEffect } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { audit } from "../api.js";
import { useDebounced } from "../hooks.js";

const html = htm.bind(h);

/** Table of audit entries, newest first. */
export function AuditTable({ entries, showSubject = true }) {
  return html`
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Operation</th>
          ${showSubject && html`<th>Subject</th>`}
          <th>Result</th>
          <th>User</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map(e => html`
          <tr key=${e.uuid}>
            <td>${new Date(e.timestamp).toLocaleString()}</td>
            <td>${e.operationId}</td>
            ${showSubject && html`<td>${e.subjectModel ? `${e.subjectModel.split("/").pop()} ${e.subjectKey}` : "-"}</td>`}
            <td>
              ${e.success
                ? html`<span class="badge badge-green">success</span>`
                : html`<span class="badge badge-red">failed</span> <span class="audit-error">${e.error || ""}</span>`}
            </td>
            <td>${e.userId || "anonymous"}</td>
          </tr>
        `)}
      </tbody>
    </table>
  `;
}

/** Row action: opens the object's audit history in a modal. */
export function HistoryButton({ model, objectKey, notify }) {
  const [entries, setEntries] = useState(null);

  const open = async () => {
    try {
      const res = await audit.subject(model, objectKey);
      setEntries(res?.results || []);
    } catch (e) {
      notify(e.message, "error");
    }
  };

  return html`
    <button class="btn btn-ghost btn-sm" style="margin-left:4px" onClick=${open}>History</button>
    ${entries !== null && html`
      <div class="modal-overlay" onClick=${(e) => e.target === e.currentTarget && setEntries(null)}>
        <div class="modal modal-wide">
          <h2>History</h2>
          ${entries.length === 0
            ? html`<div class="empty">No audit entries yet.</div>`
            : html`<${AuditTable} entries=${entries} showSubject=${false} />`}
          <div class="modal-actions">
            <button class="btn btn-ghost" onClick=${() => setEntries(null)}>Close</button>
          </div>
        </div>
      </div>
    `}
  `;
}

/** Audit tab: the global log, searchable. */
export function AuditPanel({ notify }) {
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState("");
  const filter = useDebounced(search);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await audit.query(filter);
      setEntries(res?.results || []);
    } catch (e) {
      notify(e.message, "error");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  return html`
    <div>
      <div class="toolbar">
        <input placeholder="Search audit..." value=${search} onInput=${(e) => setSearch(e.target.value)} />
        <button class="btn btn-ghost" onClick=${load}>Refresh</button>
      </div>
      ${entries.length === 0
        ? html`<div class="empty">${loading ? "Loading..." : "No audit entries yet."}</div>`
        : html`<${AuditTable} entries=${entries} />`}
    </div>
  `;
}
