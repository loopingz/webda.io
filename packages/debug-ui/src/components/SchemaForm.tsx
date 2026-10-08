import React, { useState } from "react";
import type { JsonSchema } from "../types.js";

type Definitions = Record<string, JsonSchema> | undefined;

/**
 * Resolve a `$ref` against the definitions map, keeping sibling properties
 * (description, default...) on top of the referenced schema.
 *
 * @param prop - the property schema
 * @param definitions - `#/definitions/*` map
 * @returns the resolved schema, carrying the merged definitions
 */
export function resolveRef(prop: JsonSchema | undefined, definitions: Definitions): JsonSchema | undefined {
  if (!prop) return prop;
  if (prop.$ref) {
    const refName = prop.$ref.replace("#/definitions/", "");
    const resolved = definitions?.[refName] || definitions?.[decodeURIComponent(refName)];
    if (resolved) {
      const siblings = Object.fromEntries(Object.entries(prop).filter(([k]) => k !== "$ref"));
      return { ...resolved, ...siblings, definitions: { ...resolved.definitions, ...definitions } };
    }
  }
  return { ...prop, definitions: { ...prop.definitions, ...definitions } };
}

/**
 * Collapsible section.
 *
 * @param props - title, badge, default state and children
 * @returns the section element
 */
function Collapsible(props: {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  return (
    <div className="wdbg-sf-collapsible">
      <div className="wdbg-sf-collapsible-header" onClick={() => setOpen(!open)}>
        <span className={`wdbg-sf-chevron ${open ? "wdbg-sf-open" : ""}`}>{"▶"}</span>
        <span className="wdbg-sf-collapsible-title">{props.title}</span>
        {props.badge && <span className="wdbg-sf-badge">{props.badge}</span>}
      </div>
      {open && <div className="wdbg-sf-collapsible-body">{props.children}</div>}
    </div>
  );
}

interface FieldProps {
  name: string;
  prop: JsonSchema;
  value: unknown;
  onChangeValue: (value: unknown) => void;
  readOnly?: boolean;
  definitions: Definitions;
  path: (string | number)[];
}

/**
 * Input for one property, chosen from its schema type.
 *
 * @param props - the property, its value and the change handler
 * @returns the input element
 */
function SchemaField(props: FieldProps): React.JSX.Element | null {
  const { name, prop, value, onChangeValue, readOnly, definitions, path } = props;
  const resolved = resolveRef(prop, definitions);
  if (!resolved) return null;
  const defs = resolved.definitions || definitions;

  if (resolved.type === "object" && resolved.properties) {
    const objValue = (value as Record<string, unknown>) || {};
    return (
      <Collapsible title={name} badge="object" defaultOpen={Object.keys(objValue).length > 0}>
        <SchemaFields
          schema={resolved}
          definitions={defs}
          values={objValue}
          onChange={onChangeValue}
          readOnly={readOnly}
          path={path}
        />
      </Collapsible>
    );
  }

  if (resolved.type === "array") {
    return <ArrayField {...props} prop={resolved} definitions={defs} />;
  }

  if (resolved.enum) {
    return (
      <select
        className="wdbg-sf-input"
        value={value == null ? "" : String(value)}
        disabled={readOnly}
        onChange={e => onChangeValue(e.target.value || undefined)}
      >
        <option value="">Select...</option>
        {resolved.enum.map(v => (
          <option key={String(v)} value={String(v)}>
            {String(v)}
          </option>
        ))}
      </select>
    );
  }

  if (resolved.type === "boolean") {
    return (
      <select
        className="wdbg-sf-input"
        value={value == null ? "" : String(value)}
        disabled={readOnly}
        onChange={e => onChangeValue(e.target.value === "" ? undefined : e.target.value === "true")}
      >
        <option value="">-</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (resolved.type === "number" || resolved.type === "integer") {
    return (
      <input
        className="wdbg-sf-input"
        type="number"
        value={value == null ? "" : String(value)}
        step={resolved.type === "integer" ? "1" : "any"}
        min={resolved.minimum}
        max={resolved.maximum}
        readOnly={readOnly}
        onChange={e => {
          const v = e.target.value;
          onChangeValue(v === "" ? undefined : resolved.type === "integer" ? parseInt(v, 10) : parseFloat(v));
        }}
        placeholder={resolved.default != null ? `Default: ${resolved.default}` : name}
      />
    );
  }

  if (resolved.type === "object") {
    return (
      <textarea
        className="wdbg-sf-input wdbg-sf-textarea"
        rows={3}
        defaultValue={
          typeof value === "object" && value !== null ? JSON.stringify(value, null, 2) : ((value as string) ?? "")
        }
        readOnly={readOnly}
        onChange={e => {
          try {
            onChangeValue(JSON.parse(e.target.value));
          } catch {
            // keep typing
          }
        }}
        placeholder="JSON object"
      />
    );
  }

  const inputType =
    resolved.format === "email"
      ? "email"
      : resolved.format === "uri" || resolved.format === "url"
        ? "url"
        : resolved.format === "password"
          ? "password"
          : "text";
  return (
    <input
      className="wdbg-sf-input"
      type={inputType}
      value={value == null ? "" : String(value)}
      readOnly={readOnly}
      onChange={e => onChangeValue(e.target.value || undefined)}
      placeholder={
        resolved.default != null
          ? `Default: ${resolved.default}`
          : resolved.pattern
            ? `Pattern: ${resolved.pattern}`
            : name
      }
      minLength={resolved.minLength}
      maxLength={resolved.maxLength}
    />
  );
}

/**
 * Array property with add / remove controls.
 *
 * @param props - the property, its value and the change handler
 * @returns the field element
 */
function ArrayField(props: FieldProps): React.JSX.Element {
  const { name, prop, value, onChangeValue, readOnly, definitions, path } = props;
  const items = Array.isArray(value) ? (value as unknown[]) : [];
  const itemSchema = resolveRef(prop.items, definitions) || { type: "string" };
  const isSimple = itemSchema.type === "string" || itemSchema.type === "number" || itemSchema.type === "integer";

  return (
    <Collapsible title={name} badge={`array[${items.length}]`} defaultOpen={items.length > 0}>
      <div className="wdbg-sf-array">
        {items.map((item, i) => (
          <div className="wdbg-sf-array-item" key={i}>
            <div className="wdbg-sf-array-item-content">
              {isSimple ? (
                <input
                  className="wdbg-sf-input"
                  type={itemSchema.type === "string" ? "text" : "number"}
                  value={item == null ? "" : String(item)}
                  readOnly={readOnly}
                  onChange={e => {
                    const v = e.target.value;
                    const next = [...items];
                    next[i] =
                      itemSchema.type === "string"
                        ? v
                        : itemSchema.type === "integer"
                          ? parseInt(v, 10)
                          : parseFloat(v);
                    onChangeValue(next);
                  }}
                  placeholder={`Item ${i + 1}`}
                />
              ) : itemSchema.type === "object" && itemSchema.properties ? (
                <SchemaFields
                  schema={itemSchema}
                  definitions={definitions}
                  values={(item as Record<string, unknown>) || {}}
                  onChange={v => {
                    const next = [...items];
                    next[i] = v;
                    onChangeValue(next);
                  }}
                  readOnly={readOnly}
                  path={[...path, i]}
                />
              ) : (
                <textarea
                  className="wdbg-sf-input wdbg-sf-textarea"
                  rows={2}
                  defaultValue={typeof item === "object" ? JSON.stringify(item, null, 2) : String(item ?? "")}
                  readOnly={readOnly}
                  onChange={e => {
                    try {
                      const next = [...items];
                      next[i] = JSON.parse(e.target.value);
                      onChangeValue(next);
                    } catch {
                      // keep typing
                    }
                  }}
                  placeholder="JSON"
                />
              )}
            </div>
            {!readOnly && (
              <button
                type="button"
                className="wdbg-sf-btn wdbg-sf-btn-remove"
                title="Remove item"
                onClick={() => {
                  const next = items.filter((_, j) => j !== i);
                  onChangeValue(next.length ? next : undefined);
                }}
              >
                {"×"}
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button
            type="button"
            className="wdbg-sf-btn wdbg-sf-btn-add"
            onClick={() => {
              const empty = isSimple ? (itemSchema.type === "string" ? "" : 0) : {};
              onChangeValue([...items, empty]);
            }}
          >
            + Add item
          </button>
        )}
      </div>
    </Collapsible>
  );
}

/**
 * All the properties of an object schema.
 *
 * @param props - the schema, the values and the change handler
 * @returns the fields element
 */
function SchemaFields(props: {
  schema: JsonSchema;
  definitions: Definitions;
  values: Record<string, unknown>;
  onChange: (values: unknown) => void;
  readOnly?: boolean;
  path: (string | number)[];
}): React.JSX.Element {
  const { schema, definitions, values, onChange, readOnly, path } = props;
  const defs = { ...definitions, ...schema.definitions };
  const required = new Set(schema.required || []);
  const properties = schema.properties || {};

  return (
    <div className="wdbg-sf-fields">
      {Object.entries(properties).map(([name, prop]) => {
        const resolved = resolveRef(prop, defs);
        if (!resolved) return null;
        const hasValue = values[name] !== undefined && values[name] !== null && values[name] !== "";
        return (
          <div className={`wdbg-sf-field ${hasValue ? "wdbg-sf-has-value" : ""}`} key={name}>
            <div className="wdbg-sf-label-row">
              <label className="wdbg-sf-label">
                {name}
                {required.has(name) && <span className="wdbg-sf-required">*</span>}
              </label>
              <span className="wdbg-sf-type">
                {resolved.type || "ref"}
                {resolved.format ? `:${resolved.format}` : ""}
              </span>
            </div>
            {resolved.description && <div className="wdbg-sf-description">{resolved.description}</div>}
            <SchemaField
              name={name}
              prop={prop}
              value={values[name]}
              definitions={defs}
              readOnly={readOnly}
              path={[...path, name]}
              onChangeValue={v => {
                const next = { ...values };
                if (v === undefined || v === null || v === "") delete next[name];
                else next[name] = v;
                onChange(next);
              }}
            />
            {resolved.default !== undefined && !hasValue && (
              <div className="wdbg-sf-default">
                Default: <code>{JSON.stringify(resolved.default)}</code>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Props of {@link SchemaForm}. */
export interface SchemaFormProps {
  /** JSON Schema of the object to edit */
  schema?: JsonSchema;
  /** Current values */
  values?: Record<string, unknown>;
  /** Called with the updated values */
  onChange: (values: Record<string, unknown>) => void;
  /** Disable every input */
  readOnly?: boolean;
  /** External definitions for `$ref` resolution */
  definitions?: Record<string, JsonSchema>;
}

/**
 * Form generated from a JSON Schema (objects, arrays, enums, booleans, numbers, strings, `$ref`).
 *
 * @param props - schema, values and change handler
 * @returns the form element
 */
export function SchemaForm(props: SchemaFormProps): React.JSX.Element {
  const { schema, values, onChange, readOnly, definitions } = props;
  if (!schema?.properties) {
    return <div className="wdbg-sf-empty">No fields defined in schema</div>;
  }
  const allDefs = { ...definitions, ...schema.definitions };
  return (
    <div className="wdbg-sf-root">
      {schema.title && <div className="wdbg-sf-title">{schema.title}</div>}
      {schema.description && <div className="wdbg-sf-schema-desc">{schema.description}</div>}
      <SchemaFields
        schema={schema}
        definitions={allDefs}
        values={values || {}}
        onChange={v => onChange(v as Record<string, unknown>)}
        readOnly={readOnly}
        path={[]}
      />
    </div>
  );
}
