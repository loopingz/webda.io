import { h } from "preact";
import { useState } from "preact/hooks";
import htm from "htm";

const html = htm.bind(h);

export function ModelsPanel({ data }) {
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("");
  const models = data || [];
  const detail = selected ? models.find((m) => m.id === selected) || null : null;

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
        ${detail ? html`<${ModelDetail} model=${detail} />` : html`
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

function ModelDetail({ model }) {
  return html`
    <div>
      <h2 style="margin-bottom: 1rem; color: var(--accent);">${model.id || model.name}</h2>

      <div style="display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap;">
        ${model.store && html`
          <div style="background: var(--bg-tertiary); padding: 0.5rem 0.75rem; border-radius: 4px; font-size: 0.875rem;">
            <span style="color: var(--text-muted);">Store: </span>
            <span class="mono" style="color: var(--text-primary);">${model.store}</span>
            ${model.storeType && html`
              <span style="color: var(--text-muted);"> (${model.storeType})</span>
            `}
          </div>
        `}
        ${model.plural && html`
          <div style="background: var(--bg-tertiary); padding: 0.5rem 0.75rem; border-radius: 4px; font-size: 0.875rem;">
            <span style="color: var(--text-muted);">Plural: </span>
            <span class="mono">${model.plural}</span>
          </div>
        `}
      </div>

      ${model.parent && html`
        <div class="detail-section">
          <h3>Parent</h3>
          <span class="mono" style="color: var(--text-muted);">${model.parent}</span>
        </div>
      `}

      ${model.relations && Object.keys(model.relations).length > 0 && html`
        <div class="detail-section">
          <h3>Relations</h3>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(model.relations).map(
                  ([name, rel]) => html`
                    <tr key=${name}>
                      <td class="mono">${name}</td>
                      <td><span class="badge badge-blue">${rel.type || "unknown"}</span></td>
                      <td class="mono">${rel.model || rel.target || "-"}</td>
                    </tr>
                  `
                )}
              </tbody>
            </table>
          </div>
        </div>
      `}

      ${model.actions && model.actions.length > 0 && html`
        <div class="detail-section">
          <h3>Actions</h3>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Methods</th>
                  <th>Global</th>
                </tr>
              </thead>
              <tbody>
                ${model.actions.map(
                  (a) => html`
                    <tr key=${typeof a === "string" ? a : a.name}>
                      <td class="mono">${typeof a === "string" ? a : a.name}</td>
                      <td>
                        ${typeof a === "object" && (a.methods || []).map(
                          (m) => html`<span key=${m} class="badge method-${m.toLowerCase()}" style="margin-right: 0.25rem;">${m}</span>`
                        )}
                      </td>
                      <td>${typeof a === "object" ? (a.global ? "Yes" : "No") : "-"}</td>
                    </tr>
                  `
                )}
              </tbody>
            </table>
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
