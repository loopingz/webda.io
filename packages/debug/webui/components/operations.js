import { h } from "https://esm.sh/preact@10.25.4";
import { useState, useMemo, useEffect, useRef } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";
import { SchemaForm } from "./schema-form.js";
import hljs from "https://esm.sh/highlight.js@11.11.1/lib/core";
import javascript from "https://esm.sh/highlight.js@11.11.1/lib/languages/javascript";
hljs.registerLanguage("javascript", javascript);

const html = htm.bind(h);

/**
 * Generate a random example value from a JSON Schema property.
 */
function randomValue(schema, name) {
  if (!schema) return null;
  if (schema.enum) return schema.enum[Math.floor(Math.random() * schema.enum.length)];
  if (schema.const) return schema.const;
  switch (schema.type) {
    case "string":
      if (schema.format === "email") return "user@example.com";
      if (schema.format === "uri" || schema.format === "url") return "https://example.com";
      if (schema.format === "date-time") return new Date().toISOString();
      if (schema.format === "date") return new Date().toISOString().split("T")[0];
      if (schema.format === "uuid") return crypto.randomUUID();
      if (schema.pattern) return `match-${name || "value"}`;
      if (schema.minLength) return (name || "text").padEnd(schema.minLength, "x");
      return name || "string-value";
    case "number":
    case "integer":
      const min = schema.minimum ?? 0;
      const max = schema.maximum ?? 100;
      return schema.type === "integer" ? Math.floor(Math.random() * (max - min) + min) : +(Math.random() * (max - min) + min).toFixed(2);
    case "boolean":
      return Math.random() > 0.5;
    case "array":
      const item = schema.items ? randomValue(schema.items, name) : "item";
      return [item, randomValue(schema.items, name)].filter(Boolean);
    case "object":
      if (!schema.properties) return {};
      const obj = {};
      for (const [k, v] of Object.entries(schema.properties)) {
        obj[k] = randomValue(v, k);
      }
      return obj;
    default:
      return null;
  }
}

export function OperationsPanel({ data }) {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState("form");
  const [formValues, setFormValues] = useState({});
  const operations = data || [];

  const filtered = operations.filter(
    (o) => (o.id || "").toLowerCase().includes(filter.toLowerCase())
  );

  const detail = selected ? operations.find(o => o.id === selected) : null;

  const exampleOutput = useMemo(() => {
    if (!detail?.outputSchema) return null;
    return randomValue(detail.outputSchema, "result");
  }, [detail?.id, detail?.outputSchema]);

  return html`
    <div class="split-panel">
      <div class="split-left">
        <input
          class="search-input"
          placeholder="Filter operations..."
          value=${filter}
          onInput=${(e) => setFilter(e.target.value)}
        />
        ${filtered.map(o => html`
          <div
            key=${o.id}
            class="list-item ${selected === o.id ? "active" : ""}"
            onClick=${() => { setSelected(o.id); setFormValues({}); setActiveTab("form"); }}
          >
            <div>${o.id}</div>
            <div style="font-size:0.6875rem;color:var(--text-muted)">
              ${o.input && o.input !== "void" ? o.input.split("/").pop().split(".").pop() : "void"}
              ${" → "}
              ${o.output && o.output !== "void" ? o.output.split("/").pop().split(".").pop() : "void"}
            </div>
            ${o.rest?.method && html`
              <div style="font-size:0.625rem;margin-top:0.125rem;display:flex;align-items:center;gap:0.25rem;min-width:0">
                <span class="badge method-${o.rest.method.toLowerCase()}" style="font-size:0.5625rem;padding:0.0625rem 0.25rem;flex-shrink:0">${o.rest.method.toUpperCase()}</span>
                <span class="mono" style="color:var(--text-muted);opacity:0.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.rest.url || o.rest.path || "/"}</span>
              </div>
            `}
          </div>
        `)}
        ${filtered.length === 0 && html`<div style="color:var(--text-muted);padding:0.5rem">No operations found</div>`}
      </div>
      <div class="split-right">
        ${detail ? html`<${OperationDetail}
          op=${detail}
          activeTab=${activeTab}
          setActiveTab=${setActiveTab}
          formValues=${formValues}
          setFormValues=${setFormValues}
          exampleOutput=${exampleOutput}
        />` : html`
          <div style="color:var(--text-muted);padding:2rem;text-align:center">
            Select an operation to view details
          </div>
        `}
      </div>
    </div>
  `;
}

function CodeBlock({ code }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.textContent = code;
      hljs.highlightElement(ref.current);
    }
  }, [code]);
  return html`<pre class="code-block"><code ref=${ref} class="language-javascript">${code}</code></pre>`;
}

function OperationDetail({ op, activeTab, setActiveTab, formValues, setFormValues, exampleOutput }) {
  const tabs = [];
  if (op.inputSchema) tabs.push("form");
  tabs.push("input-schema", "output-schema");
  if (exampleOutput !== null) tabs.push("example");
  if (op.implementor?.code) tabs.push("code");

  const currentTab = tabs.includes(activeTab) ? activeTab : tabs[0];

  const hasInput = op.input && op.input !== "void";
  const hasOutput = op.output && op.output !== "void";

  return html`
    <div>
      <h2 style="margin-bottom:0.5rem;color:var(--accent)">${op.id}</h2>

      <div style="display:flex;gap:0.75rem;margin-bottom:1rem;flex-wrap:wrap">
        ${op.summary && html`<div style="color:var(--text-muted);font-size:0.875rem">${op.summary}</div>`}
      </div>

      <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem;flex-wrap:wrap;align-items:center">
        <div style="background:var(--bg-tertiary);padding:0.375rem 0.625rem;border-radius:4px;font-size:0.8125rem">
          <span style="color:var(--text-muted)">Input: </span>
          <span class="mono">${hasInput ? op.input : "void"}</span>
        </div>
        <div style="background:var(--bg-tertiary);padding:0.375rem 0.625rem;border-radius:4px;font-size:0.8125rem">
          <span style="color:var(--text-muted)">Output: </span>
          <span class="mono">${hasOutput ? op.output : "void"}</span>
        </div>
        ${op.implementor && html`
          <div style="background:var(--bg-tertiary);padding:0.375rem 0.625rem;border-radius:4px;font-size:0.8125rem">
            <span style="color:var(--text-muted)">${op.implementor.type === "model" ? "Model" : "Service"}: </span>
            <span class="mono">${op.implementor.name}</span>
            ${op.implementor.method && html`<span class="mono" style="color:var(--text-muted)">.${op.implementor.method}()</span>`}
          </div>
        `}
        ${op.tags?.length > 0 && op.tags.map(t => html`
          <span key=${t} class="badge badge-purple">${t}</span>
        `)}
        ${op.rest && typeof op.rest === "object" && op.rest.method && html`
          <span class="badge method-${op.rest.method.toLowerCase()}" style="padding:0.125rem 0.5rem;line-height:1.2">${op.rest.method.toUpperCase()}</span>
          <span class="mono" style="font-size:0.8125rem;color:var(--text-muted)">${op.rest.url || op.rest.path || "/"}</span>
        `}
      </div>

      <!-- Tabs -->
      <div style="display:flex;gap:0;margin-bottom:0.75rem;border-bottom:1px solid var(--border)">
        ${tabs.map(tab => {
          const label = tab === "form" ? "Try It" : tab === "input-schema" ? "Input Schema" : tab === "output-schema" ? "Output Schema" : tab === "code" ? "Code" : "Example Output";
          return html`
            <button key=${tab} onClick=${() => setActiveTab(tab)} style="
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
      ${currentTab === "form" && op.inputSchema && html`
        <div>
          <${SchemaForm} schema=${op.inputSchema} values=${formValues} onChange=${setFormValues} />
          <div style="margin-top:1rem">
            <button class="btn btn-primary" disabled>Execute (coming soon)</button>
          </div>
          ${Object.keys(formValues).length > 0 && html`
            <div style="margin-top:0.75rem">
              <strong style="color:var(--text-muted);font-size:0.75rem;text-transform:uppercase">Request Body</strong>
              <pre class="mono" style="
                background:var(--bg-secondary);padding:0.75rem;border-radius:4px;
                margin-top:0.25rem;font-size:0.8125rem;overflow:auto;max-height:200px;
              ">${JSON.stringify(formValues, null, 2)}</pre>
            </div>
          `}
        </div>
      `}

      ${currentTab === "input-schema" && html`
        <div>
          ${hasInput && op.inputSchema
            ? html`<pre class="mono" style="
                background:var(--bg-secondary);padding:1rem;border-radius:4px;
                overflow:auto;max-height:400px;font-size:0.8125rem;line-height:1.5;
              ">${JSON.stringify(op.inputSchema, null, 2)}</pre>`
            : html`<div style="color:var(--text-muted);padding:0.5rem">${hasInput ? `Schema ref: ${op.input} (not resolved)` : "No input (void)"}</div>`
          }
        </div>
      `}

      ${currentTab === "output-schema" && html`
        <div>
          ${hasOutput && op.outputSchema
            ? html`<pre class="mono" style="
                background:var(--bg-secondary);padding:1rem;border-radius:4px;
                overflow:auto;max-height:400px;font-size:0.8125rem;line-height:1.5;
              ">${JSON.stringify(op.outputSchema, null, 2)}</pre>`
            : html`<div style="color:var(--text-muted);padding:0.5rem">${hasOutput ? `Schema ref: ${op.output} (not resolved)` : "No output (void)"}</div>`
          }
        </div>
      `}

      ${currentTab === "example" && html`
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
            <strong style="color:var(--text-muted);font-size:0.75rem;text-transform:uppercase">Random Example</strong>
            <button class="btn btn-ghost btn-sm" onClick=${() => { /* force re-render */ setActiveTab("input-schema"); setTimeout(() => setActiveTab("example"), 0); }}>Regenerate</button>
          </div>
          <pre class="mono" style="
            background:var(--bg-secondary);padding:1rem;border-radius:4px;
            overflow:auto;max-height:400px;font-size:0.8125rem;line-height:1.5;
          ">${JSON.stringify(exampleOutput, null, 2)}</pre>
        </div>
      `}

      ${currentTab === "code" && op.implementor?.code && html`
        <div>
          <div style="margin-bottom:0.5rem;font-size:0.8125rem;color:var(--text-muted)">
            <span class="mono">${op.implementor.name}.${op.implementor.method}()</span>
          </div>
          <${CodeBlock} code=${op.implementor.code} />
        </div>
      `}
    </div>
  `;
}
