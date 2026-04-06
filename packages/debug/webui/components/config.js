import { h } from "https://esm.sh/preact@10.25.4";
import { useState, useEffect, useCallback } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(h);

export function ConfigPanel({ fetchApi, dataVersion }) {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    fetchApi("/api/config").then(setConfig).catch(() => {});
  }, [dataVersion]);

  if (!config) {
    return html`<div style="color: var(--text-muted); padding: 2rem;">Loading configuration...</div>`;
  }

  return html`
    <div class="json-tree">
      <${JsonNode} value=${config} depth=${0} defaultOpen=${true} />
    </div>
  `;
}

function JsonNode({ keyName, value, depth, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen || depth < 1);

  const toggle = useCallback(() => setOpen((o) => !o), []);

  if (value === null) {
    return html`<span>${keyName !== undefined ? html`<span class="json-key">"${keyName}"</span>: ` : ""}
      <span class="json-null">null</span></span>`;
  }

  if (typeof value === "boolean") {
    return html`<span>${keyName !== undefined ? html`<span class="json-key">"${keyName}"</span>: ` : ""}
      <span class="json-boolean">${String(value)}</span></span>`;
  }

  if (typeof value === "number") {
    return html`<span>${keyName !== undefined ? html`<span class="json-key">"${keyName}"</span>: ` : ""}
      <span class="json-number">${value}</span></span>`;
  }

  if (typeof value === "string") {
    return html`<span>${keyName !== undefined ? html`<span class="json-key">"${keyName}"</span>: ` : ""}
      <span class="json-string">"${value}"</span></span>`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return html`<span>${keyName !== undefined ? html`<span class="json-key">"${keyName}"</span>: ` : ""}[]</span>`;
    }
    return html`
      <div>
        <span class="json-toggle" onClick=${toggle}>
          ${keyName !== undefined ? html`<span class="json-key">"${keyName}"</span>: ` : ""}
          ${open ? "[-]" : `[+] (${value.length} items)`}
        </span>
        ${open && html`
          <div class="json-indent">
            ${value.map((item, i) => html`
              <div key=${i}><${JsonNode} keyName=${i} value=${item} depth=${depth + 1} />${i < value.length - 1 ? "," : ""}</div>
            `)}
          </div>
        `}
        ${open && "]"}
      </div>
    `;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return html`<span>${keyName !== undefined ? html`<span class="json-key">"${keyName}"</span>: ` : ""}{}</span>`;
    }
    return html`
      <div>
        <span class="json-toggle" onClick=${toggle}>
          ${keyName !== undefined ? html`<span class="json-key">"${keyName}"</span>: ` : ""}
          ${open ? "{" : `{+} (${keys.length} keys)`}
        </span>
        ${open && html`
          <div class="json-indent">
            ${keys.map((k, i) => html`
              <div key=${k}><${JsonNode} keyName=${k} value=${value[k]} depth=${depth + 1} />${i < keys.length - 1 ? "," : ""}</div>
            `)}
          </div>
        `}
        ${open && "}"}
      </div>
    `;
  }

  return html`<span>${String(value)}</span>`;
}
