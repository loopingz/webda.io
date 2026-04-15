import { h } from "preact";
import { useState } from "preact/hooks";
import htm from "htm";

const html = htm.bind(h);

/**
 * Resolve a $ref in a schema against a definitions map.
 * Merges the referenced schema with any sibling properties (description, etc).
 */
function resolveRef(prop, definitions) {
  if (!prop) return prop;
  if (prop.$ref) {
    const refName = prop.$ref.replace("#/definitions/", "");
    const resolved = definitions?.[refName] || definitions?.[decodeURIComponent(refName)];
    if (resolved) {
      // Merge: sibling properties (like description) override the ref
      const siblings = Object.fromEntries(Object.entries(prop).filter(([k]) => k !== "$ref"));
      return { ...resolved, ...siblings, definitions: { ...resolved.definitions, ...definitions } };
    }
  }
  return { ...prop, definitions: { ...prop.definitions, ...definitions } };
}

/**
 * Collapsible section wrapper.
 */
function Collapsible({ title, badge, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return html`
    <div class="sf-collapsible">
      <div class="sf-collapsible-header" onClick=${() => setOpen(!open)}>
        <span class="sf-chevron ${open ? "sf-open" : ""}">\u25B6</span>
        <span class="sf-collapsible-title">${title}</span>
        ${badge && html`<span class="sf-badge">${badge}</span>`}
      </div>
      ${open && html`<div class="sf-collapsible-body">${children}</div>`}
    </div>
  `;
}

/**
 * Render a single field based on its schema type.
 */
function SchemaField({ name, prop, value, onChangeValue, readOnly, definitions, path }) {
  const resolved = resolveRef(prop, definitions);
  if (!resolved) return null;
  const defs = resolved.definitions || definitions;

  // Nested object with properties → recursive form
  if (resolved.type === "object" && resolved.properties) {
    const objValue = value || {};
    return html`
      <${Collapsible} title=${name} badge="object" defaultOpen=${Object.keys(objValue).length > 0}>
        <${SchemaFields}
          schema=${resolved}
          definitions=${defs}
          values=${objValue}
          onChange=${v => onChangeValue(v)}
          readOnly=${readOnly}
          path=${path}
        />
      <//>
    `;
  }

  // Array field
  if (resolved.type === "array") {
    return html`<${ArrayField}
      name=${name} prop=${resolved} value=${value} onChangeValue=${onChangeValue}
      readOnly=${readOnly} definitions=${defs} path=${path}
    />`;
  }

  // Enum → select
  if (resolved.enum) {
    return html`
      <select class="sf-input" value=${value ?? ""} disabled=${readOnly}
        onChange=${e => onChangeValue(e.target.value || undefined)}>
        <option value="">Select...</option>
        ${resolved.enum.map(v => html`<option key=${v} value=${v}>${v}</option>`)}
      </select>
    `;
  }

  // Boolean → toggle-style select
  if (resolved.type === "boolean") {
    return html`
      <select class="sf-input" value=${value == null ? "" : String(value)} disabled=${readOnly}
        onChange=${e => onChangeValue(e.target.value === "" ? undefined : e.target.value === "true")}>
        <option value="">-</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    `;
  }

  // Number / integer
  if (resolved.type === "number" || resolved.type === "integer") {
    return html`
      <input class="sf-input" type="number" value=${value ?? ""}
        step=${resolved.type === "integer" ? "1" : "any"}
        min=${resolved.minimum} max=${resolved.maximum} readOnly=${readOnly}
        onInput=${e => {
          const v = e.target.value;
          onChangeValue(v === "" ? undefined : resolved.type === "integer" ? parseInt(v) : parseFloat(v));
        }}
        placeholder=${resolved.default != null ? `Default: ${resolved.default}` : name} />
    `;
  }

  // Object without properties (map) or unknown → JSON textarea
  if (resolved.type === "object") {
    return html`
      <textarea class="sf-input sf-textarea" rows="3"
        value=${typeof value === "object" && value !== null ? JSON.stringify(value, null, 2) : value ?? ""}
        readOnly=${readOnly}
        onInput=${e => { try { onChangeValue(JSON.parse(e.target.value)); } catch {} }}
        placeholder="JSON object" />
    `;
  }

  // String (default)
  const inputType = resolved.format === "email" ? "email"
    : resolved.format === "uri" || resolved.format === "url" ? "url"
    : resolved.format === "password" ? "password"
    : "text";

  return html`
    <input class="sf-input" type=${inputType}
      value=${value ?? ""} readOnly=${readOnly}
      onInput=${e => onChangeValue(e.target.value || undefined)}
      placeholder=${resolved.default != null ? `Default: ${resolved.default}` : (resolved.pattern ? `Pattern: ${resolved.pattern}` : name)}
      minlength=${resolved.minLength} maxlength=${resolved.maxLength} />
  `;
}

/**
 * Render an array field with add/remove controls.
 */
function ArrayField({ name, prop, value, onChangeValue, readOnly, definitions, path }) {
  const items = Array.isArray(value) ? value : [];
  const itemSchema = resolveRef(prop.items, definitions) || { type: "string" };
  const isSimple = itemSchema.type === "string" || itemSchema.type === "number" || itemSchema.type === "integer";

  return html`
    <${Collapsible} title=${name} badge=${`array[${items.length}]`} defaultOpen=${items.length > 0}>
      <div class="sf-array">
        ${items.map((item, i) => html`
          <div class="sf-array-item" key=${i}>
            <div class="sf-array-item-content">
              ${isSimple
                ? html`<input class="sf-input" type=${itemSchema.type === "string" ? "text" : "number"}
                    value=${item ?? ""} readOnly=${readOnly}
                    onInput=${e => {
                      const v = e.target.value;
                      const newItems = [...items];
                      newItems[i] = itemSchema.type === "string" ? v : (itemSchema.type === "integer" ? parseInt(v) : parseFloat(v));
                      onChangeValue(newItems);
                    }}
                    placeholder=${`Item ${i + 1}`} />`
                : itemSchema.type === "object" && itemSchema.properties
                ? html`<${SchemaFields}
                    schema=${itemSchema} definitions=${definitions}
                    values=${item || {}}
                    onChange=${v => { const newItems = [...items]; newItems[i] = v; onChangeValue(newItems); }}
                    readOnly=${readOnly} path=${[...path, i]}
                  />`
                : html`<textarea class="sf-input sf-textarea" rows="2"
                    value=${typeof item === "object" ? JSON.stringify(item, null, 2) : String(item ?? "")}
                    readOnly=${readOnly}
                    onInput=${e => { try { const newItems = [...items]; newItems[i] = JSON.parse(e.target.value); onChangeValue(newItems); } catch {} }}
                    placeholder="JSON" />`
              }
            </div>
            ${!readOnly && html`
              <button class="sf-btn sf-btn-remove" onClick=${() => { const newItems = items.filter((_, j) => j !== i); onChangeValue(newItems.length ? newItems : undefined); }}
                title="Remove item">\u00D7</button>
            `}
          </div>
        `)}
        ${!readOnly && html`
          <button class="sf-btn sf-btn-add" onClick=${() => {
            const empty = isSimple ? (itemSchema.type === "string" ? "" : 0) : {};
            onChangeValue([...items, empty]);
          }}>+ Add item</button>
        `}
      </div>
    <//>
  `;
}

/**
 * Render all fields for a schema's properties.
 */
function SchemaFields({ schema, definitions, values, onChange, readOnly, path }) {
  const defs = { ...definitions, ...schema.definitions };
  const required = new Set(schema.required || []);
  const props = schema.properties || {};

  return html`
    <div class="sf-fields">
      ${Object.entries(props).map(([name, prop]) => {
        const resolved = resolveRef(prop, defs);
        if (!resolved) return null;
        const isReq = required.has(name);
        const hasValue = values[name] !== undefined && values[name] !== null && values[name] !== "";
        const fieldPath = [...(path || []), name];

        return html`
          <div class="sf-field ${hasValue ? "sf-has-value" : ""}" key=${name}>
            <div class="sf-label-row">
              <label class="sf-label">
                ${name}
                ${isReq && html`<span class="sf-required">*</span>`}
              </label>
              <span class="sf-type">${resolved.type || "ref"}${resolved.format ? `:${resolved.format}` : ""}</span>
            </div>
            ${resolved.description && html`<div class="sf-description">${resolved.description}</div>`}
            <${SchemaField}
              name=${name} prop=${prop} value=${values[name]} definitions=${defs}
              readOnly=${readOnly} path=${fieldPath}
              onChangeValue=${v => {
                const next = { ...values };
                if (v === undefined || v === null || v === "") delete next[name];
                else next[name] = v;
                onChange(next);
              }}
            />
            ${resolved.default !== undefined && !hasValue && html`
              <div class="sf-default">Default: <code>${JSON.stringify(resolved.default)}</code></div>
            `}
          </div>
        `;
      })}
    </div>
  `;
}

/**
 * Top-level SchemaForm component.
 *
 * @param {object} props
 * @param {object} props.schema - JSON Schema object
 * @param {object} props.values - current form values
 * @param {function} props.onChange - called with updated values
 * @param {boolean} props.readOnly - disable all inputs
 * @param {object} props.definitions - external definitions map for $ref resolution
 */
export function SchemaForm({ schema, values, onChange, readOnly, definitions }) {
  if (!schema?.properties) {
    return html`<div class="sf-empty">No fields defined in schema</div>`;
  }

  const allDefs = { ...definitions, ...schema.definitions };

  return html`
    <div class="sf-root">
      ${schema.title && html`<div class="sf-title">${schema.title}</div>`}
      ${schema.description && html`<div class="sf-schema-desc">${schema.description}</div>`}
      <${SchemaFields}
        schema=${schema} definitions=${allDefs}
        values=${values || {}} onChange=${onChange}
        readOnly=${readOnly} path=${[]}
      />
    </div>
  `;
}
