"use strict";

/**
 * ModelsPanel — displays all registered Webda models.
 *
 * Shows a filterable list on the left; clicking an entry reveals detail
 * (relations, actions, schemas) on the right. Ported from the Preact
 * webui/components/models.js with a React + CSS Modules re-implementation.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useDebugConnection } from "../useDebugConnection";
import { fetchApi, type DebugModel } from "../debugClient";
import styles from "./panels.module.css";

// ---------------------------------------------------------------------------
// Disconnected state (shared pattern)
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
// Relations table
// ---------------------------------------------------------------------------

interface RelationRow {
  name: string;
  type: string;
  target: string;
}

function RelationsTable({ relations, onSelect }: { relations: any; onSelect: (id: string) => void }) {
  const rows: RelationRow[] = [];
  if (relations.parent) {
    rows.push({ name: relations.parent.attribute ?? "", type: "parent", target: relations.parent.model ?? "" });
  }
  (relations.links ?? []).forEach((l: any) => rows.push({ name: l.attribute, type: l.type ?? "link", target: l.model }));
  (relations.queries ?? []).forEach((q: any) => rows.push({ name: q.attribute, type: "query", target: q.model }));
  (relations.maps ?? []).forEach((m: any) => rows.push({ name: m.attribute, type: "map", target: m.model }));
  (relations.children ?? []).forEach((c: string) => rows.push({ name: "", type: "child", target: c }));
  (relations.binaries ?? []).forEach((b: any) => rows.push({ name: b.attribute, type: `binary (${b.cardinality})`, target: "" }));

  if (rows.length === 0) return null;

  function badgeClass(type: string) {
    if (type === "parent" || type === "child") return styles.badgePurple;
    if (type === "query") return styles.badgeGreen;
    if (type.startsWith("binary")) return styles.badgeOrange;
    return styles.badgeBlue;
  }

  return (
    <div className={styles.detailSection}>
      <h3>Relations</h3>
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr><th>Attribute</th><th>Type</th><th>Target</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className={styles.mono}>{r.name || "-"}</td>
                <td><span className={`${styles.badge} ${badgeClass(r.type)}`}>{r.type}</span></td>
                <td>
                  {r.target ? (
                    <a
                      href="#"
                      className={styles.mono}
                      style={{ color: "var(--ifm-color-primary)", textDecoration: "none" }}
                      onClick={e => { e.preventDefault(); onSelect(r.target); }}
                    >
                      {r.target.split("/").pop()}
                    </a>
                  ) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schema tabs
// ---------------------------------------------------------------------------

function SchemaTab({ schemas }: { schemas: Record<string, unknown> }) {
  const tabs = (["Input", "Output", "Stored"] as const).filter(t => schemas?.[t]);
  const [activeTab, setActiveTab] = useState(tabs[0] ?? "Input");
  const current = tabs.includes(activeTab as any) ? activeTab : tabs[0];

  if (tabs.length === 0) {
    return <div style={{ color: "var(--ifm-color-emphasis-500)", padding: "0.5rem" }}>No schemas available</div>;
  }

  return (
    <div>
      <div className={styles.tabBar}>
        {tabs.map(tab => (
          <button
            key={tab}
            className={`${styles.tab} ${current === tab ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <pre className={`${styles.codeBlock} ${styles.mono}`}>
        {JSON.stringify(schemas[current], null, 2)}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model detail
// ---------------------------------------------------------------------------

function ModelDetail({ model, onSelect }: { model: DebugModel; onSelect: (id: string) => void }) {
  const ancestors: string[] = (model.metadata as any)?.Ancestors ?? [];
  const subclasses: string[] = (model.metadata as any)?.Subclasses ?? [];

  return (
    <div>
      <h2 style={{ marginBottom: "0.5rem", color: "var(--ifm-color-primary)" }}>
        {model.id?.split("/").pop()}
      </h2>
      <div className={styles.mono} style={{ fontSize: "0.75rem", color: "var(--ifm-color-emphasis-600)", marginBottom: "1rem" }}>
        {model.id}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {model.store && (
          <div className={styles.chip}>
            <span className={styles.chipLabel}>Store:</span>
            <span className={styles.mono}>{model.store}</span>
            {model.storeType && <span className={styles.chipLabel}> ({model.storeType})</span>}
          </div>
        )}
        {model.plural && (
          <div className={styles.chip}>
            <span className={styles.chipLabel}>Plural:</span>
            <span className={styles.mono}>{model.plural}</span>
          </div>
        )}
      </div>

      {ancestors.length > 0 && (
        <div className={styles.detailSection}>
          <h3>Inheritance</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap", fontSize: "0.8125rem" }}>
            {[...ancestors].reverse().map(a => (
              <React.Fragment key={a}>
                <a
                  href="#"
                  className={styles.mono}
                  style={{ color: "var(--ifm-color-primary)", textDecoration: "none" }}
                  onClick={e => { e.preventDefault(); onSelect(a); }}
                >
                  {a.split("/").pop()}
                </a>
                <span style={{ color: "var(--ifm-color-emphasis-500)" }}>→</span>
              </React.Fragment>
            ))}
            <span className={styles.mono} style={{ fontWeight: 600, color: "var(--ifm-color-primary)" }}>
              {model.id?.split("/").pop()}
            </span>
            {subclasses.length > 0 && (
              <>
                <span style={{ color: "var(--ifm-color-emphasis-500)" }}>→</span>
                {subclasses.map((s, i) => (
                  <React.Fragment key={s}>
                    <a
                      href="#"
                      className={styles.mono}
                      style={{ color: "var(--ifm-color-primary)", textDecoration: "none" }}
                      onClick={e => { e.preventDefault(); onSelect(s); }}
                    >
                      {s.split("/").pop()}
                    </a>
                    {i < subclasses.length - 1 && <span style={{ color: "var(--ifm-color-emphasis-500)" }}>,</span>}
                  </React.Fragment>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      <RelationsTable relations={model.relations ?? {}} onSelect={onSelect} />

      {model.actions && model.actions.length > 0 && (
        <div className={styles.detailSection}>
          <h3>Actions</h3>
          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
            {model.actions.map(a => (
              <span key={typeof a === "string" ? a : (a as any).name} className={`${styles.badge} ${styles.badgeBlue}`}>
                {typeof a === "string" ? a : (a as any).name}
              </span>
            ))}
          </div>
        </div>
      )}

      {model.schemas && (
        <div className={styles.detailSection}>
          <h3>Schemas</h3>
          <SchemaTab schemas={model.schemas as Record<string, unknown>} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function ModelsPanel() {
  const { connected } = useDebugConnection();
  const [models, setModels] = useState<DebugModel[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(function fetchModels() {
    if (!connected) return;
    fetchApi<DebugModel[]>("/api/models")
      .then(data => setModels(data))
      .catch(() => {/* ignore */});
  }, [connected]);

  if (!connected) return <DisconnectedState />;

  const filtered = models.filter(m =>
    (m.id ?? "").toLowerCase().includes(filter.toLowerCase())
  );

  const detail = selected ? models.find(m => m.id === selected) ?? null : null;

  return (
    <div className={styles.splitPanel}>
      <div className={styles.splitLeft}>
        <input
          className={styles.searchInput}
          placeholder="Filter models..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        {filtered.map(m => (
          <div
            key={m.id}
            className={`${styles.listItem} ${selected === m.id ? styles.listItemActive : ""}`}
            onClick={() => setSelected(m.id)}
          >
            {m.id}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className={styles.emptyState}>No models found</div>
        )}
      </div>
      <div className={styles.splitRight}>
        {detail ? (
          <ModelDetail model={detail} onSelect={setSelected} />
        ) : (
          <div className={styles.emptyState}>
            {models.length === 0 ? "Loading models…" : "Select a model to view details"}
          </div>
        )}
      </div>
    </div>
  );
}
