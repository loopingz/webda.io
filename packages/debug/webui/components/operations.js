import { h } from "https://esm.sh/preact@10.25.4";
import { useState } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(h);

export function OperationsPanel({ data }) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState(null);
  const operations = data || [];

  const filtered = operations.filter(
    (o) => (o.id || o.operationId || "").toLowerCase().includes(filter.toLowerCase())
  );

  const toggle = (id) => setExpanded(expanded === id ? null : id);

  return html`
    <div>
      <input
        class="search-input"
        style="max-width: 400px; margin-bottom: 1rem;"
        placeholder="Filter operations..."
        value=${filter}
        onInput=${(e) => setFilter(e.target.value)}
      />
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Operation ID</th>
              <th>Input Schema</th>
              <th>Output Schema</th>
              <th>Parameters</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((o) => {
              const id = o.id || o.operationId || "unknown";
              const isExpanded = expanded === id;
              return html`
                <tr key=${id} style="cursor: pointer;" onClick=${() => toggle(id)}>
                  <td class="mono">${id}</td>
                  <td>
                    ${o.input
                      ? html`<span class="badge badge-blue">defined</span>`
                      : html`<span style="color: var(--text-muted);">-</span>`}
                  </td>
                  <td>
                    ${o.output
                      ? html`<span class="badge badge-green">defined</span>`
                      : html`<span style="color: var(--text-muted);">-</span>`}
                  </td>
                  <td>
                    ${o.parameters && Object.keys(o.parameters).length > 0
                      ? html`<span class="badge badge-purple">${Object.keys(o.parameters).length} params</span>`
                      : html`<span style="color: var(--text-muted);">-</span>`}
                  </td>
                </tr>
                ${isExpanded && html`
                  <tr key="${id}-detail">
                    <td colspan="4" style="padding: 1rem;">
                      ${o.input && html`
                        <div style="margin-bottom: 0.75rem;">
                          <strong style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">Input Schema</strong>
                          <pre class="mono" style="
                            background: var(--bg-secondary);
                            padding: 0.75rem;
                            border-radius: 4px;
                            margin-top: 0.25rem;
                            font-size: 0.8125rem;
                            overflow: auto;
                            max-height: 200px;
                          ">${JSON.stringify(o.input, null, 2)}</pre>
                        </div>
                      `}
                      ${o.output && html`
                        <div style="margin-bottom: 0.75rem;">
                          <strong style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">Output Schema</strong>
                          <pre class="mono" style="
                            background: var(--bg-secondary);
                            padding: 0.75rem;
                            border-radius: 4px;
                            margin-top: 0.25rem;
                            font-size: 0.8125rem;
                            overflow: auto;
                            max-height: 200px;
                          ">${JSON.stringify(o.output, null, 2)}</pre>
                        </div>
                      `}
                      ${o.parameters && Object.keys(o.parameters).length > 0 && html`
                        <div>
                          <strong style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">Parameters</strong>
                          <pre class="mono" style="
                            background: var(--bg-secondary);
                            padding: 0.75rem;
                            border-radius: 4px;
                            margin-top: 0.25rem;
                            font-size: 0.8125rem;
                            overflow: auto;
                            max-height: 200px;
                          ">${JSON.stringify(o.parameters, null, 2)}</pre>
                        </div>
                      `}
                    </td>
                  </tr>
                `}
              `;
            })}
            ${filtered.length === 0 && html`
              <tr><td colspan="4" style="color: var(--text-muted); text-align: center; padding: 2rem;">No operations found</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
