import { h } from "https://esm.sh/preact@10.25.4";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(h);

/**
 * Generate form fields from a JSON Schema.
 */
export function SchemaForm({ schema, values, onChange, readOnly }) {
  if (!schema?.properties) {
    return html`<div style="color:var(--text-muted);padding:0.5rem">No fields</div>`;
  }
  const required = new Set(schema.required || []);
  return html`
    <div>
      ${Object.entries(schema.properties).map(([name, prop]) => html`
        <div class="form-group" key=${name}>
          <label>
            ${name}
            ${required.has(name) && html`<span style="color:var(--danger)"> *</span>`}
            ${prop.type && html`<span style="color:var(--text-muted);font-weight:normal"> (${prop.type}${prop.format ? `:${prop.format}` : ""})</span>`}
          </label>
          ${prop.description && html`<div style="color:var(--text-muted);font-size:0.75rem;margin-bottom:0.25rem">${prop.description}</div>`}
          ${prop.enum
            ? html`
              <select value=${values[name] ?? ""} disabled=${readOnly} onChange=${e => onChange({ ...values, [name]: e.target.value })}>
                <option value="">Select...</option>
                ${prop.enum.map(v => html`<option key=${v} value=${v}>${v}</option>`)}
              </select>`
            : prop.type === "boolean"
            ? html`
              <select value=${String(values[name] ?? "")} disabled=${readOnly} onChange=${e => onChange({ ...values, [name]: e.target.value === "true" })}>
                <option value="">Select...</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>`
            : prop.type === "number" || prop.type === "integer"
            ? html`<input type="number" value=${values[name] ?? ""} step=${prop.type === "integer" ? "1" : "any"}
                min=${prop.minimum} max=${prop.maximum} readOnly=${readOnly}
                onInput=${e => onChange({ ...values, [name]: prop.type === "integer" ? parseInt(e.target.value) : parseFloat(e.target.value) })}
                placeholder=${prop.description || name} />`
            : prop.type === "object" || prop.type === "array"
            ? html`<textarea rows="3" value=${typeof values[name] === "object" ? JSON.stringify(values[name], null, 2) : values[name] ?? ""}
                readOnly=${readOnly}
                onInput=${e => { try { onChange({ ...values, [name]: JSON.parse(e.target.value) }); } catch {} }}
                placeholder=${prop.type === "array" ? "JSON array" : "JSON object"} />`
            : html`<input type=${prop.format === "email" ? "email" : prop.format === "uri" ? "url" : "text"}
                value=${values[name] ?? ""} readOnly=${readOnly}
                onInput=${e => onChange({ ...values, [name]: e.target.value })}
                placeholder=${prop.description || (prop.pattern ? `Pattern: ${prop.pattern}` : name)}
                minlength=${prop.minLength} maxlength=${prop.maxLength} />`
          }
          ${prop.default !== undefined && html`<div style="color:var(--text-muted);font-size:0.7rem;margin-top:0.125rem">Default: ${JSON.stringify(prop.default)}</div>`}
        </div>
      `)}
    </div>
  `;
}
