import { h } from "https://esm.sh/preact@10.25.4";
import { useState, useEffect } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(h);

function stateBadge(state) {
  if (!state) return html`<span class="badge badge-muted">unknown</span>`;
  const s = state.toLowerCase();
  if (s === "running" || s === "resolved") return html`<span class="badge badge-green">${state}</span>`;
  if (s === "stopped" || s === "error" || s === "failed") return html`<span class="badge badge-red">${state}</span>`;
  if (s === "initializing" || s === "created") return html`<span class="badge badge-yellow">${state}</span>`;
  return html`<span class="badge badge-muted">${state}</span>`;
}

export function ServicesPanel({ fetchApi, dataVersion }) {
  const [services, setServices] = useState([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetchApi("/api/services").then(setServices).catch(() => {});
  }, [dataVersion]);

  const filtered = services.filter(
    (s) =>
      (s.name || "").toLowerCase().includes(filter.toLowerCase()) ||
      (s.type || "").toLowerCase().includes(filter.toLowerCase())
  );

  return html`
    <div>
      <input
        class="search-input"
        style="max-width: 400px; margin-bottom: 1rem;"
        placeholder="Filter services..."
        value=${filter}
        onInput=${(e) => setFilter(e.target.value)}
      />
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>State</th>
              <th>Capabilities</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(
              (s) => html`
                <tr key=${s.name}>
                  <td class="mono">${s.name}</td>
                  <td class="mono" style="color: var(--text-muted);">${s.type || "-"}</td>
                  <td>${stateBadge(s.state)}</td>
                  <td>
                    ${(s.capabilities || []).map(
                      (c) => html`<span key=${c} class="badge badge-purple" style="margin-right: 0.25rem;">${c}</span>`
                    )}
                    ${(!s.capabilities || s.capabilities.length === 0) && html`<span style="color: var(--text-muted);">-</span>`}
                  </td>
                </tr>
              `
            )}
            ${filtered.length === 0 && html`
              <tr><td colspan="4" style="color: var(--text-muted); text-align: center; padding: 2rem;">No services found</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
