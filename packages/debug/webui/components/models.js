import { h } from "preact";
import { useState } from "preact/hooks";
import htm from "htm";
import { ModelGraph } from "./model-graph.js";

const html = htm.bind(h);

export function ModelsPanel({ data }) {
  const [selected, setSelected] = useState("__graph");
  const [filter, setFilter] = useState("");
  const models = data || [];
  const detail = selected && selected !== "__graph" ? models.find((m) => m.id === selected) || null : null;

  const filtered = models.filter(
    (m) => (m.id || m.name || "").toLowerCase().includes(filter.toLowerCase())
  );

  return html`
    <div class="split-panel">
      <div class="split-left">
        <input
          class="search-input"
          placeholder="Filter models..."
          value=${filter}
          onInput=${(e) => setFilter(e.target.value)}
        />
        <div
          class="list-item ${selected === "__graph" ? "active" : ""}"
          onClick=${() => setSelected("__graph")}
          style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);margin-bottom:0.5rem;padding-bottom:0.625rem"
        >
          <span style="font-weight:500">Model Graph</span>
          <span class="badge badge-muted">${models.length}</span>
        </div>
        ${filtered.map(
          (m) => html`
            <div
              key=${m.id || m.name}
              class="list-item ${selected === (m.id || m.name) ? "active" : ""}"
              onClick=${() => setSelected(m.id || m.name)}
            >
              ${m.id || m.name}
            </div>
          `
        )}
        ${filtered.length === 0 && html`<div style="color: var(--text-muted); padding: 0.5rem;">No models found</div>`}
      </div>
      <div class="split-right">
        ${selected === "__graph"
          ? html`<${ModelGraph} models=${models} selectedId=${null} onSelect=${id => setSelected(id)} />`
          : detail ? html`<${ModelDetail} model=${detail} onSelect=${id => setSelected(id)} />`
          : html`
            <div style="color: var(--text-muted); padding: 2rem; text-align: center;">
              Select a model to view details
            </div>
          `}
      </div>
    </div>
  `;
}

function SchemaTab({ schemas }) {
  const [activeTab, setActiveTab] = useState("Input");
  const tabs = ["Input", "Output", "Stored"].filter((t) => schemas?.[t]);

  if (tabs.length === 0) {
    return html`<div style="color: var(--text-muted); padding: 0.5rem;">No schemas available</div>`;
  }

  // Default to first available tab if active isn't available
  const current = tabs.includes(activeTab) ? activeTab : tabs[0];

  return html`
    <div>
      <div style="display: flex; gap: 0; margin-bottom: 0.75rem; border-bottom: 1px solid var(--border);">
        ${tabs.map(
          (tab) => html`
            <button
              key=${tab}
              onClick=${() => setActiveTab(tab)}
              style="
                padding: 6px 16px;
                background: ${current === tab ? "var(--bg-tertiary)" : "transparent"};
                color: ${current === tab ? "var(--accent)" : "var(--text-muted)"};
                border: none;
                border-bottom: 2px solid ${current === tab ? "var(--accent)" : "transparent"};
                cursor: pointer;
                font-size: 0.875rem;
                font-weight: ${current === tab ? "600" : "400"};
              "
            >
              ${tab}
            </button>
          `
        )}
      </div>
      <pre class="mono" style="
        background: var(--bg-secondary);
        padding: 1rem;
        border-radius: 4px;
        overflow: auto;
        max-height: 400px;
        font-size: 0.8125rem;
        line-height: 1.5;
      ">${JSON.stringify(schemas[current], null, 2)}</pre>
    </div>
  `;
}

function ModelLink({ id, onSelect }) {
  return html`<a href="#" class="mono" style="color:var(--accent);text-decoration:none" onClick=${e => { e.preventDefault(); onSelect(id); }}>${id.split("/").pop()}</a>`;
}

function RelationsTable({ relations, onSelect }) {
  const rows = [];
  if (relations.parent) {
    rows.push({ name: relations.parent.attribute, type: "parent", target: relations.parent.model });
  }
  (relations.links || []).forEach(l => rows.push({ name: l.attribute, type: l.type || "link", target: l.model }));
  (relations.queries || []).forEach(q => rows.push({ name: q.attribute, type: "query", target: q.model }));
  (relations.maps || []).forEach(m => rows.push({ name: m.attribute, type: "map", target: m.model }));
  (relations.children || []).forEach(c => rows.push({ name: "", type: "child", target: c }));
  (relations.binaries || []).forEach(b => rows.push({ name: b.attribute, type: `binary (${b.cardinality})`, target: "" }));
  (relations.behaviors || []).forEach(b => rows.push({ name: b.attribute, type: "behavior", target: b.behavior }));
  if (rows.length === 0) return null;
  return html`
    <div class="detail-section">
      <h3>Relations</h3>
      <div class="table-container">
        <table>
          <thead><tr><th>Attribute</th><th>Type</th><th>Target</th></tr></thead>
          <tbody>
            ${rows.map((r, i) => html`
              <tr key=${i}>
                <td class="mono">${r.name || "-"}</td>
                <td><span class="badge ${r.type === "parent" ? "badge-purple" : r.type === "child" ? "badge-purple" : r.type === "query" ? "badge-green" : r.type.startsWith("binary") ? "badge-orange" : r.type === "behavior" ? "badge-orange" : "badge-blue"}">${r.type}</span></td>
                <td>${r.target ? html`<${ModelLink} id=${r.target} onSelect=${onSelect} />` : "-"}</td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function ModelDetail({ model, onSelect }) {
  const ancestors = model.metadata?.Ancestors || [];
  const subclasses = model.metadata?.Subclasses || [];

  return html`
    <div>
      <h2 style="margin-bottom:0.5rem;color:var(--accent)">${model.id?.split("/").pop()}</h2>
      <div class="mono" style="font-size:0.75rem;color:var(--text-muted);margin-bottom:1rem">${model.id}</div>

      <div style="display:flex;gap:0.5rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center">
        ${model.store && html`
          <div style="background:var(--bg-tertiary);padding:0.375rem 0.625rem;border-radius:4px;font-size:0.8125rem">
            <span style="color:var(--text-muted)">Store: </span>
            <span class="mono">${model.store}</span>
            ${model.storeType && html`<span style="color:var(--text-muted)"> (${model.storeType})</span>`}
          </div>
        `}
        ${model.plural && html`
          <div style="background:var(--bg-tertiary);padding:0.375rem 0.625rem;border-radius:4px;font-size:0.8125rem">
            <span style="color:var(--text-muted)">Plural: </span>
            <span class="mono">${model.plural}</span>
          </div>
        `}
      </div>

      ${ancestors.length > 0 && html`
        <div class="detail-section">
          <h3>Inheritance</h3>
          <div style="display:flex;align-items:center;gap:0.375rem;flex-wrap:wrap;font-size:0.8125rem">
            ${[...ancestors].reverse().map(a => html`
              <${ModelLink} key=${a} id=${a} onSelect=${onSelect} />
              <span style="color:var(--text-muted)">\u2192</span>
            `)}
            <span class="mono" style="font-weight:600;color:var(--accent)">${model.id?.split("/").pop()}</span>
            ${subclasses.length > 0 && html`
              <span style="color:var(--text-muted)">\u2192</span>
              ${subclasses.map((s, i) => html`
                <${ModelLink} key=${s} id=${s} onSelect=${onSelect} />
                ${i < subclasses.length - 1 && html`<span style="color:var(--text-muted)">,</span>`}
              `)}
            `}
          </div>
        </div>
      `}

      <${RelationsTable} relations=${model.relations || {}} onSelect=${onSelect} />

      ${model.actions && model.actions.length > 0 && html`
        <div class="detail-section">
          <h3>Actions</h3>
          <div style="display:flex;gap:0.375rem;flex-wrap:wrap">
            ${model.actions.map(a => html`
              <span key=${typeof a === "string" ? a : a.name} class="badge badge-blue">${typeof a === "string" ? a : a.name}</span>
            `)}
          </div>
        </div>
      `}

      ${model.schemas && html`
        <div class="detail-section">
          <h3>Schemas</h3>
          <${SchemaTab} schemas=${model.schemas} />
        </div>
      `}
    </div>
  `;
}
