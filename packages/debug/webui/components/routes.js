import { h } from "https://esm.sh/preact@10.25.4";
import { useState } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(h);

function methodBadge(method) {
  const m = method.toUpperCase();
  return html`<span class="badge method-${m.toLowerCase()}" style="margin-right: 0.25rem;">${m}</span>`;
}

export function RoutesPanel({ data }) {
  const [filter, setFilter] = useState("");
  const routes = data || [];

  const filtered = routes.filter(
    (r) =>
      (r.path || r.url || "").toLowerCase().includes(filter.toLowerCase()) ||
      (r.executor || "").toLowerCase().includes(filter.toLowerCase())
  );

  return html`
    <div>
      <input
        class="search-input"
        style="max-width: 400px; margin-bottom: 1rem;"
        placeholder="Filter routes..."
        value=${filter}
        onInput=${(e) => setFilter(e.target.value)}
      />
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Path</th>
              <th>Methods</th>
              <th>Executor</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(
              (r, i) => html`
                <tr key=${i}>
                  <td class="mono">${r.path || r.url || "-"}</td>
                  <td>
                    ${(r.methods || []).map((m) => methodBadge(m))}
                    ${(!r.methods || r.methods.length === 0) && html`<span style="color: var(--text-muted);">ANY</span>`}
                  </td>
                  <td class="mono" style="color: var(--text-muted);">${r.executor || "-"}</td>
                </tr>
              `
            )}
            ${filtered.length === 0 && html`
              <tr><td colspan="3" style="color: var(--text-muted); text-align: center; padding: 2rem;">No routes found</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
