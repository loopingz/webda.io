import { h } from "preact";
import { useState } from "preact/hooks";
import htm from "htm";
import { SchemaForm } from "./schema-form.js";

const html = htm.bind(h);

function stateBadge(state) {
  if (!state) return html`<span class="badge badge-muted">unknown</span>`;
  const s = state.toLowerCase();
  if (s === "running" || s === "resolved") return html`<span class="badge badge-green">${state}</span>`;
  if (s === "stopped" || s === "error" || s === "failed") return html`<span class="badge badge-red">${state}</span>`;
  if (s === "initializing" || s === "created") return html`<span class="badge badge-yellow">${state}</span>`;
  return html`<span class="badge badge-muted">${state}</span>`;
}

export function ServicesPanel({ data, config }) {
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("");
  const services = data || [];
  const detail = selected ? services.find((s) => s.name === selected) || null : null;
  const globalParams = config?.parameters || {};
  const paramKeys = Object.keys(globalParams);

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
        ${paramKeys.length > 0 && html`
          <div
            class="list-item ${selected === "__globalParams" ? "active" : ""}"
            onClick=${() => setSelected("__globalParams")}
            style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);margin-bottom:0.5rem;padding-bottom:0.625rem"
          >
            <span style="font-weight:500">Global Parameters</span>
            <span class="badge badge-muted">${paramKeys.length}</span>
          </div>
        `}
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
        ${selected === "__globalParams" ? html`<${GlobalParamsDetail} params=${globalParams} />`
        : detail ? html`<${ServiceDetail} service=${detail} />`
        : html`
          <div style="color: var(--text-muted); padding: 2rem; text-align: center;">
            Select a service to view details
          </div>
        `}
      </div>
    </div>
  `;
}

function GlobalParamsDetail({ params }) {
  const keys = Object.keys(params);
  return html`
    <div>
      <h2 style="margin-bottom:1rem;color:var(--accent)">Global Parameters</h2>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th style="width:200px">Parameter</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            ${keys.map(key => html`
              <tr key=${key}>
                <td class="mono" style="font-weight:500">${key}</td>
                <td class="mono" style="font-size:0.8125rem;word-break:break-all">
                  ${typeof params[key] === "object"
                    ? html`<pre style="margin:0;white-space:pre-wrap;font-size:0.8125rem">${JSON.stringify(params[key], null, 2)}</pre>`
                    : String(params[key])}
                </td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function ServiceDetail({ service }) {
  const [activeTab, setActiveTab] = useState("config");
  const [formValues, setFormValues] = useState({});

  const config = service.configuration || {};
  const configKeys = Object.keys(config).filter((k) => !k.startsWith("_"));
  const schema = service.schema;

  const tabs = ["config"];
  if (schema) tabs.push("schema-form", "schema-json");

  const currentTab = tabs.includes(activeTab) ? activeTab : tabs[0];

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
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
          ${Object.keys(service.capabilities).map(
            (c) => html`<span key=${c} class="badge badge-purple">${c}</span>`
          )}
        </div>
      `}

      <!-- Tabs -->
      <div style="display:flex;gap:0;margin-bottom:0.75rem;border-bottom:1px solid var(--border)">
        ${tabs.map(tab => {
          const label = tab === "config" ? "Configuration" : tab === "schema-form" ? "Schema Form" : "Schema JSON";
          return html`
            <button key=${tab} onClick=${() => { setActiveTab(tab); if (tab === "schema-form") setFormValues({...config}); }} style="
              padding:6px 16px;
              background:${currentTab === tab ? "var(--bg-tertiary)" : "transparent"};
              color:${currentTab === tab ? "var(--accent)" : "var(--text-muted)"};
              border:none;
              border-bottom:2px solid ${currentTab === tab ? "var(--accent)" : "transparent"};
              cursor:pointer;font-size:0.875rem;
              font-weight:${currentTab === tab ? "600" : "400"};
            ">${label}</button>
          `;
        })}
      </div>

      <!-- Tab Content -->
      ${currentTab === "config" && html`
        <div>
          ${configKeys.length > 0 ? html`
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
          ` : html`<div style="color: var(--text-muted); padding: 0.5rem;">No configuration parameters</div>`}
        </div>
      `}

      ${currentTab === "schema-form" && schema && html`
        <div>
          <${SchemaForm} schema=${schema} values=${formValues} onChange=${setFormValues} />
          ${Object.keys(formValues).length > 0 && html`
            <div style="margin-top:0.75rem">
              <strong style="color:var(--text-muted);font-size:0.75rem;text-transform:uppercase">Configuration Preview</strong>
              <pre class="mono" style="
                background:var(--bg-secondary);padding:0.75rem;border-radius:4px;
                margin-top:0.25rem;font-size:0.8125rem;overflow:auto;max-height:300px;
              ">${JSON.stringify(formValues, null, 2)}</pre>
            </div>
          `}
        </div>
      `}

      ${currentTab === "schema-json" && schema && html`
        <div>
          <pre class="mono" style="
            background:var(--bg-secondary);padding:1rem;border-radius:4px;
            overflow:auto;max-height:500px;font-size:0.8125rem;line-height:1.5;
          ">${JSON.stringify(schema, null, 2)}</pre>
        </div>
      `}
    </div>
  `;
}
