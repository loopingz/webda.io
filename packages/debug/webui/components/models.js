import { h } from "https://esm.sh/preact@10.25.4";
import { useState } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";

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

function ModelDetail({ model }) {
  return html`
    <div>
      <h2 style="margin-bottom: 1rem; color: var(--accent);">${model.id || model.name}</h2>

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
                    <tr key=${a.name}>
                      <td class="mono">${a.name}</td>
                      <td>
                        ${(a.methods || []).map(
                          (m) => html`<span key=${m} class="badge method-${m.toLowerCase()}" style="margin-right: 0.25rem;">${m}</span>`
                        )}
                      </td>
                      <td>${a.global ? "Yes" : "No"}</td>
                    </tr>
                  `
                )}
              </tbody>
            </table>
          </div>
        </div>
      `}

      ${model.schema && html`
        <div class="detail-section">
          <h3>Schema</h3>
          <pre class="mono" style="
            background: var(--bg-secondary);
            padding: 1rem;
            border-radius: 4px;
            overflow: auto;
            max-height: 400px;
            font-size: 0.8125rem;
            line-height: 1.5;
          ">${JSON.stringify(model.schema, null, 2)}</pre>
        </div>
      `}
    </div>
  `;
}
