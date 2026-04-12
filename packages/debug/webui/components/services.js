import { h } from "https://esm.sh/preact@10.25.4";
import { useState } from "https://esm.sh/preact@10.25.4/hooks";
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

export function ServicesPanel({ data }) {
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("");
  const services = data || [];
  const detail = selected ? services.find((s) => s.name === selected) || null : null;

  const filtered = services.filter(
    (s) =>
      (s.name || "").toLowerCase().includes(filter.toLowerCase()) ||
      (s.type || "").toLowerCase().includes(filter.toLowerCase())
  );

  return html`
    <div class="split-panel">
      <div class="split-left">
        <input
          class="search-input"
          placeholder="Filter services..."
          value=${filter}
          onInput=${(e) => setFilter(e.target.value)}
        />
        ${filtered.map(
          (s) => html`
            <div
              key=${s.name}
              class="list-item ${selected === s.name ? "active" : ""}"
              onClick=${() => setSelected(s.name)}
              style="display: flex; justify-content: space-between; align-items: center;"
            >
              <span>${s.name}</span>
              ${stateBadge(s.state)}
            </div>
          `
        )}
        ${filtered.length === 0 && html`<div style="color: var(--text-muted); padding: 0.5rem;">No services found</div>`}
      </div>
      <div class="split-right">
        ${detail ? html`<${ServiceDetail} service=${detail} />` : html`
          <div style="color: var(--text-muted); padding: 2rem; text-align: center;">
            Select a service to view details
          </div>
        `}
      </div>
    </div>
  `;
}

function ServiceDetail({ service }) {
  // Filter out internal/noise keys from configuration
  const config = service.configuration || {};
  const configKeys = Object.keys(config).filter((k) => !k.startsWith("_"));

  return html`
    <div>
      <h2 style="margin-bottom: 0.5rem; color: var(--accent);">${service.name}</h2>

      <div style="display: flex; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap;">
        <div style="background: var(--bg-tertiary); padding: 0.5rem 0.75rem; border-radius: 4px; font-size: 0.875rem;">
          <span style="color: var(--text-muted);">Type: </span>
          <span class="mono">${service.type || "unknown"}</span>
        </div>
        <div style="background: var(--bg-tertiary); padding: 0.5rem 0.75rem; border-radius: 4px; font-size: 0.875rem;">
          <span style="color: var(--text-muted);">State: </span>
          ${stateBadge(service.state)}
        </div>
      </div>

      ${Object.keys(service.capabilities || {}).length > 0 && html`
        <div class="detail-section">
          <h3>Capabilities</h3>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            ${Object.keys(service.capabilities).map(
              (c) => html`<span key=${c} class="badge badge-purple">${c}</span>`
            )}
          </div>
        </div>
      `}

      ${configKeys.length > 0 && html`
        <div class="detail-section">
          <h3>Configuration</h3>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th style="width: 200px;">Parameter</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                ${configKeys.map(
                  (key) => html`
                    <tr key=${key}>
                      <td class="mono" style="font-weight: 500;">${key}</td>
                      <td class="mono" style="font-size: 0.8125rem; word-break: break-all;">
                        ${typeof config[key] === "object"
                          ? html`<pre style="margin: 0; white-space: pre-wrap; font-size: 0.8125rem;">${JSON.stringify(config[key], null, 2)}</pre>`
                          : String(config[key])}
                      </td>
                    </tr>
                  `
                )}
              </tbody>
            </table>
          </div>
        </div>
      `}

      ${configKeys.length === 0 && html`
        <div class="detail-section">
          <h3>Configuration</h3>
          <div style="color: var(--text-muted); padding: 0.5rem;">No configuration parameters</div>
        </div>
      `}
    </div>
  `;
}
