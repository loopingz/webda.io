"use strict";

/**
 * OperationsPanel — displays all registered Webda operations.
 *
 * Shows a filterable list on the left; clicking an entry shows its
 * input/output schemas, a try-it form, an example output, and the
 * implementor's source code. Ported from webui/components/operations.js.
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useDebugConnection } from "../useDebugConnection";
import { fetchApi, type DebugOperation } from "../debugClient";
import styles from "./panels.module.css";

// ---------------------------------------------------------------------------
// Disconnected state
// ---------------------------------------------------------------------------

function DisconnectedState() {
  const port = typeof window !== "undefined"
    ? (parseInt(localStorage.getItem("webda.debug.port") ?? "18181", 10) || 18181)
    : 18181;

  const handleConfigure = useCallback(function handleConfigure() {
    const input = window.prompt("Enter debug daemon port:", String(port));
    if (input) {
      const n = parseInt(input, 10);
      if (Number.isFinite(n) && n > 0 && n < 65536) {
        localStorage.setItem("webda.debug.port", String(n));
        window.location.reload();
      }
    }
  }, [port]);

  return (
    <div className={styles.disconnectedBox}>
      <h3>No daemon connected</h3>
      <p>Waiting for connection to <code>http://localhost:{port}</code>…</p>
      <p>Run <code>webda debug --web</code> in your application directory.</p>
      <button className={styles.configureLink} onClick={handleConfigure}>Configure port</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Method badge
// ---------------------------------------------------------------------------

function methodBadgeClass(method: string) {
  const m = method.toLowerCase();
  if (m === "get") return styles.methodGet;
  if (m === "post") return styles.methodPost;
  if (m === "put") return styles.methodPut;
  if (m === "patch") return styles.methodPatch;
  if (m === "delete") return styles.methodDelete;
  return styles.methodOptions;
}

// ---------------------------------------------------------------------------
// Lightweight JS syntax highlighter (no external deps) — ported from Preact
// ---------------------------------------------------------------------------

const JS_KEYWORDS = new Set([
  "async","await","break","case","catch","class","const","continue","debugger","default",
  "delete","do","else","export","extends","finally","for","function","if","import","in",
  "instanceof","let","new","of","return","static","super","switch","this","throw","try",
  "typeof","var","void","while","with","yield","from","true","false","null","undefined"
]);

type Token = { type: "comment" | "string" | "keyword" | "number" | "ident" | "punct"; value: string };

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < code.length) {
    if (code[i] === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i);
      tokens.push({ type: "comment", value: code.slice(i, end === -1 ? undefined : end) });
      i = end === -1 ? code.length : end;
      continue;
    }
    if (code[i] === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      tokens.push({ type: "comment", value: code.slice(i, end === -1 ? undefined : end + 2) });
      i = end === -1 ? code.length : end + 2;
      continue;
    }
    if (code[i] === '"' || code[i] === "'" || code[i] === "`") {
      const q = code[i];
      let j = i + 1;
      while (j < code.length && code[j] !== q) { if (code[j] === "\\") j++; j++; }
      tokens.push({ type: "string", value: code.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(code[i]) && (i === 0 || /[^a-zA-Z_$]/.test(code[i - 1]))) {
      let j = i;
      while (j < code.length && /[0-9a-fA-FxXoObBeE._n]/.test(code[j])) j++;
      tokens.push({ type: "number", value: code.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_$]/.test(code[i])) {
      let j = i;
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      tokens.push({ type: JS_KEYWORDS.has(word) ? "keyword" : "ident", value: word });
      i = j;
      continue;
    }
    tokens.push({ type: "punct", value: code[i] });
    i++;
  }
  return tokens;
}

function CodeBlock({ code }: { code: string }) {
  const tokens = useMemo(function computeTokens() { return tokenize(code); }, [code]);
  return (
    <pre className={styles.codeBlock}>
      <code>
        {tokens.map((t, i) => {
          if (t.type === "comment") return <span key={i} className={styles.hlComment}>{t.value}</span>;
          if (t.type === "string") return <span key={i} className={styles.hlString}>{t.value}</span>;
          if (t.type === "keyword") return <span key={i} className={styles.hlKeyword}>{t.value}</span>;
          if (t.type === "number") return <span key={i} className={styles.hlNumber}>{t.value}</span>;
          return t.value;
        })}
      </code>
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Random value generator from JSON Schema (for example output)
// ---------------------------------------------------------------------------

function randomValue(schema: any, name?: string): unknown {
  if (!schema) return null;
  if (schema.enum) return schema.enum[Math.floor(Math.random() * schema.enum.length)];
  if (schema.const !== undefined) return schema.const;
  switch (schema.type) {
    case "string":
      if (schema.format === "email") return "user@example.com";
      if (schema.format === "uri" || schema.format === "url") return "https://example.com";
      if (schema.format === "date-time") return new Date().toISOString();
      if (schema.format === "date") return new Date().toISOString().split("T")[0];
      if (schema.format === "uuid") return crypto.randomUUID?.() ?? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
      return name ?? "string-value";
    case "number":
    case "integer": {
      const min = schema.minimum ?? 0;
      const max = schema.maximum ?? 100;
      return schema.type === "integer"
        ? Math.floor(Math.random() * (max - min) + min)
        : +(Math.random() * (max - min) + min).toFixed(2);
    }
    case "boolean":
      return Math.random() > 0.5;
    case "array": {
      const item = schema.items ? randomValue(schema.items, name) : "item";
      return [item, randomValue(schema.items, name)].filter(Boolean);
    }
    case "object": {
      if (!schema.properties) return {};
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(schema.properties)) {
        obj[k] = randomValue(v, k);
      }
      return obj;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Operation detail
// ---------------------------------------------------------------------------

function OperationDetail({ op }: { op: DebugOperation }) {
  const [activeTab, setActiveTab] = useState("input-schema");
  const [exampleSeed, setExampleSeed] = useState(0);

  const hasInput = op.input && op.input !== "void";
  const hasOutput = op.output && op.output !== "void";

  const tabs: string[] = [];
  if (hasInput && op.inputSchema) tabs.push("form");
  tabs.push("input-schema", "output-schema");
  if (hasOutput && op.outputSchema) tabs.push("example");
  if (op.implementor?.code) tabs.push("code");

  const currentTab = tabs.includes(activeTab) ? activeTab : tabs[0] ?? "input-schema";

  const exampleOutput = useMemo(
    function computeExample() {
      if (!op.outputSchema) return null;
      return randomValue(op.outputSchema, "result");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [op.id, exampleSeed]
  );

  const tabLabel = (t: string) => {
    if (t === "form") return "Try It";
    if (t === "input-schema") return "Input Schema";
    if (t === "output-schema") return "Output Schema";
    if (t === "example") return "Example Output";
    if (t === "code") return "Code";
    return t;
  };

  return (
    <div>
      <h2 style={{ marginBottom: "0.5rem", color: "var(--ifm-color-primary)" }}>{op.id}</h2>

      {op.summary && (
        <div style={{ color: "var(--ifm-color-emphasis-600)", fontSize: "0.875rem", marginBottom: "1rem" }}>
          {op.summary}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <div className={styles.chip}>
          <span className={styles.chipLabel}>Input:</span>
          <span className={styles.mono}>{hasInput ? op.input : "void"}</span>
        </div>
        <div className={styles.chip}>
          <span className={styles.chipLabel}>Output:</span>
          <span className={styles.mono}>{hasOutput ? op.output : "void"}</span>
        </div>
        {op.implementor && (
          <div className={styles.chip}>
            <span className={styles.chipLabel}>{op.implementor.type === "model" ? "Model" : "Service"}:</span>
            <span className={styles.mono}>{op.implementor.name}</span>
            {op.implementor.method && (
              <span className={styles.mono} style={{ color: "var(--ifm-color-emphasis-600)" }}>.{op.implementor.method}()</span>
            )}
          </div>
        )}
        {op.tags?.map(t => (
          <span key={t} className={`${styles.badge} ${styles.badgePurple}`}>{t}</span>
        ))}
        {op.rest && typeof op.rest === "object" && op.rest.method && (
          <>
            <span className={`${styles.badge} ${methodBadgeClass(op.rest.method)}`} style={{ padding: "0.125rem 0.5rem" }}>
              {op.rest.method.toUpperCase()}
            </span>
            <span className={styles.mono} style={{ fontSize: "0.8125rem", color: "var(--ifm-color-emphasis-600)" }}>
              {op.rest.url ?? op.rest.path ?? "/"}
            </span>
          </>
        )}
      </div>

      <div className={styles.tabBar}>
        {tabs.map(tab => (
          <button
            key={tab}
            className={`${styles.tab} ${currentTab === tab ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tabLabel(tab)}
          </button>
        ))}
      </div>

      {currentTab === "form" && op.inputSchema && (
        <div>
          <div style={{ color: "var(--ifm-color-emphasis-500)", padding: "0.5rem" }}>
            Interactive form coming soon. See Input Schema tab for the schema definition.
          </div>
        </div>
      )}

      {currentTab === "input-schema" && (
        <div>
          {hasInput && op.inputSchema
            ? <pre className={`${styles.codeBlock} ${styles.mono}`}>{JSON.stringify(op.inputSchema, null, 2)}</pre>
            : <div style={{ color: "var(--ifm-color-emphasis-500)", padding: "0.5rem" }}>
                {hasInput ? `Schema ref: ${op.input} (not resolved)` : "No input (void)"}
              </div>
          }
        </div>
      )}

      {currentTab === "output-schema" && (
        <div>
          {hasOutput && op.outputSchema
            ? <pre className={`${styles.codeBlock} ${styles.mono}`}>{JSON.stringify(op.outputSchema, null, 2)}</pre>
            : <div style={{ color: "var(--ifm-color-emphasis-500)", padding: "0.5rem" }}>
                {hasOutput ? `Schema ref: ${op.output} (not resolved)` : "No output (void)"}
              </div>
          }
        </div>
      )}

      {currentTab === "example" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <strong style={{ color: "var(--ifm-color-emphasis-600)", fontSize: "0.75rem", textTransform: "uppercase" }}>
              Random Example
            </strong>
            <button
              style={{ background: "none", border: "1px solid var(--ifm-color-emphasis-300)", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: "0.8125rem" }}
              onClick={() => setExampleSeed(s => s + 1)}
            >
              Regenerate
            </button>
          </div>
          <pre className={`${styles.codeBlock} ${styles.mono}`}>
            {JSON.stringify(exampleOutput, null, 2)}
          </pre>
        </div>
      )}

      {currentTab === "code" && op.implementor?.code && (
        <div>
          <div style={{ marginBottom: "0.5rem", fontSize: "0.8125rem", color: "var(--ifm-color-emphasis-600)" }}>
            <span className={styles.mono}>
              {op.implementor.name}.{op.implementor.method}()
            </span>
          </div>
          <CodeBlock code={op.implementor.code} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function OperationsPanel() {
  const { connected } = useDebugConnection();
  const [operations, setOperations] = useState<DebugOperation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(function fetchOperations() {
    if (!connected) return;
    fetchApi<DebugOperation[]>("/api/operations").then(setOperations).catch(() => {});
  }, [connected]);

  if (!connected) return <DisconnectedState />;

  const filtered = operations.filter(o =>
    (o.id ?? "").toLowerCase().includes(filter.toLowerCase())
  );

  const detail = selected ? operations.find(o => o.id === selected) ?? null : null;

  return (
    <div className={styles.splitPanel}>
      <div className={styles.splitLeft}>
        <input
          className={styles.searchInput}
          placeholder="Filter operations..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        {filtered.map(o => (
          <div
            key={o.id}
            className={`${styles.listItem} ${selected === o.id ? styles.listItemActive : ""}`}
            onClick={() => { setSelected(o.id); }}
          >
            <div>{o.id}</div>
            <div style={{ fontSize: "0.6875rem", color: "var(--ifm-color-emphasis-600)" }}>
              {o.input && o.input !== "void" ? o.input.split("/").pop()?.split(".").pop() : "void"}
              {" → "}
              {o.output && o.output !== "void" ? o.output.split("/").pop()?.split(".").pop() : "void"}
            </div>
            {o.rest?.method && (
              <div style={{ fontSize: "0.625rem", marginTop: "0.125rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <span className={`${styles.badge} ${methodBadgeClass(o.rest.method)}`} style={{ fontSize: "0.5625rem", padding: "0.0625rem 0.25rem" }}>
                  {o.rest.method.toUpperCase()}
                </span>
                <span className={styles.mono} style={{ color: "var(--ifm-color-emphasis-600)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.rest.url ?? o.rest.path ?? "/"}
                </span>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className={styles.emptyState}>
            {operations.length === 0 ? "Loading operations…" : "No operations found"}
          </div>
        )}
      </div>
      <div className={styles.splitRight}>
        {detail
          ? <OperationDetail op={detail} />
          : <div className={styles.emptyState}>Select an operation to view details</div>
        }
      </div>
    </div>
  );
}
