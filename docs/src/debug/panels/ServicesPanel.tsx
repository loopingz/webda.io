"use strict";

/**
 * ServicesPanel — displays all registered Webda services.
 *
 * Shows a filterable list on the left; clicking an entry reveals its
 * configuration, optional JSON schema form, and metrics on the right.
 * Ported from webui/components/services.js.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useDebugConnection } from "../useDebugConnection";
import { fetchApi, type DebugService } from "../debugClient";
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
// State badge
// ---------------------------------------------------------------------------

function StateBadge({ state }: { state?: string }) {
  if (!state) return <span className={`${styles.badge} ${styles.badgeMuted}`}>unknown</span>;
  const s = state.toLowerCase();
  let cls = styles.badgeMuted;
  if (s === "running" || s === "resolved") cls = styles.badgeGreen;
  else if (s === "stopped" || s === "error" || s === "failed") cls = styles.badgeRed;
  else if (s === "initializing" || s === "created") cls = styles.badgeYellow;
  return <span className={`${styles.badge} ${cls}`}>{state}</span>;
}

// ---------------------------------------------------------------------------
// Global parameters detail
// ---------------------------------------------------------------------------

function GlobalParamsDetail({ params }: { params: Record<string, unknown> }) {
  const keys = Object.keys(params);
  return (
    <div>
      <h2 style={{ marginBottom: "1rem", color: "var(--ifm-color-primary)" }}>Global Parameters</h2>
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr><th style={{ width: 200 }}>Parameter</th><th>Value</th></tr>
          </thead>
          <tbody>
            {keys.map(key => (
              <tr key={key}>
                <td className={styles.mono} style={{ fontWeight: 500 }}>{key}</td>
                <td className={styles.mono} style={{ fontSize: "0.8125rem", wordBreak: "break-all" }}>
                  {typeof params[key] === "object"
                    ? <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "0.8125rem" }}>{JSON.stringify(params[key], null, 2)}</pre>
                    : String(params[key])}
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
// Service detail
// ---------------------------------------------------------------------------

function ServiceDetail({ service }: { service: DebugService }) {
  const [activeTab, setActiveTab] = useState("config");
  const config = service.configuration ?? {};
  const configKeys = Object.keys(config).filter(k => !k.startsWith("_"));
  const tabs = ["config"];
  if (service.schema) tabs.push("schema-json");
  if (service.metrics?.length) tabs.push("metrics");

  const currentTab = tabs.includes(activeTab) ? activeTab : tabs[0];

  const tabLabel = (t: string) => {
    if (t === "config") return "Configuration";
    if (t === "schema-json") return "Schema JSON";
    if (t === "metrics") return "Metrics";
    return t;
  };

  return (
    <div>
      <h2 style={{ marginBottom: "0.5rem", color: "var(--ifm-color-primary)" }}>{service.name}</h2>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div className={styles.chip}>
          <span className={styles.chipLabel}>Type:</span>
          <span className={styles.mono}>{service.type ?? "unknown"}</span>
        </div>
        <div className={styles.chip}>
          <span className={styles.chipLabel}>State:</span>
          <StateBadge state={service.state} />
        </div>
      </div>

      {Object.keys(service.capabilities ?? {}).length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {Object.keys(service.capabilities).map(c => (
            <span key={c} className={`${styles.badge} ${styles.badgePurple}`}>{c}</span>
          ))}
        </div>
      )}

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

      {currentTab === "config" && (
        <div>
          {configKeys.length > 0 ? (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead><tr><th style={{ width: 200 }}>Parameter</th><th>Value</th></tr></thead>
                <tbody>
                  {configKeys.map(key => (
                    <tr key={key}>
                      <td className={styles.mono} style={{ fontWeight: 500 }}>{key}</td>
                      <td className={styles.mono} style={{ fontSize: "0.8125rem", wordBreak: "break-all" }}>
                        {typeof config[key] === "object"
                          ? <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: "0.8125rem" }}>{JSON.stringify(config[key], null, 2)}</pre>
                          : String(config[key])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ color: "var(--ifm-color-emphasis-500)", padding: "0.5rem" }}>No configuration parameters</div>
          )}
        </div>
      )}

      {currentTab === "schema-json" && service.schema && (
        <pre className={`${styles.codeBlock} ${styles.mono}`}>
          {JSON.stringify(service.schema, null, 2)}
        </pre>
      )}

      {currentTab === "metrics" && service.metrics && (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Help</th><th style={{ textAlign: "right" }}>Value</th></tr>
            </thead>
            <tbody>
              {service.metrics.map(m => {
                const metricTypeCls =
                  m.type === "counter" ? styles.badgeBlue
                  : m.type === "gauge" ? styles.badgeGreen
                  : m.type === "histogram" ? styles.badgePurple
                  : styles.badgeMuted;
                const total = m.values?.reduce((acc, v) => acc + v.value, 0) ?? 0;
                return (
                  <tr key={m.name}>
                    <td className={styles.mono} style={{ fontWeight: 500 }}>{m.name}</td>
                    <td><span className={`${styles.badge} ${metricTypeCls}`}>{m.type}</span></td>
                    <td style={{ color: "var(--ifm-color-emphasis-600)", fontSize: "0.8125rem" }}>{m.help ?? "-"}</td>
                    <td className={styles.mono} style={{ textAlign: "right", fontWeight: 500 }}>{total.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function ServicesPanel() {
  const { connected } = useDebugConnection();
  const [services, setServices] = useState<DebugService[]>([]);
  const [config, setConfig] = useState<{ parameters?: Record<string, unknown> } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(function fetchData() {
    if (!connected) return;
    fetchApi<DebugService[]>("/api/services").then(setServices).catch(() => {});
    fetchApi<any>("/api/config").then(setConfig).catch(() => {});
  }, [connected]);

  if (!connected) return <DisconnectedState />;

  const filtered = services.filter(s =>
    s.name.toLowerCase().includes(filter.toLowerCase()) ||
    (s.type ?? "").toLowerCase().includes(filter.toLowerCase())
  );

  const globalParams = config?.parameters ?? {};
  const hasGlobalParams = Object.keys(globalParams).length > 0;
  const detail = selected && selected !== "__globalParams"
    ? services.find(s => s.name === selected) ?? null
    : null;

  return (
    <div className={styles.splitPanel}>
      <div className={styles.splitLeft}>
        <input
          className={styles.searchInput}
          placeholder="Filter services..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        {hasGlobalParams && (
          <div
            className={`${styles.listItem} ${selected === "__globalParams" ? styles.listItemActive : ""}`}
            onClick={() => setSelected("__globalParams")}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--ifm-color-emphasis-300)", marginBottom: "0.5rem", paddingBottom: "0.625rem" }}
          >
            <span style={{ fontWeight: 500 }}>Global Parameters</span>
            <span className={styles.countBadge}>{Object.keys(globalParams).length}</span>
          </div>
        )}
        {filtered.map(s => (
          <div
            key={s.name}
            className={`${styles.listItem} ${selected === s.name ? styles.listItemActive : ""}`}
            onClick={() => setSelected(s.name)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <span>{s.name}</span>
            <StateBadge state={s.state} />
          </div>
        ))}
        {filtered.length === 0 && (
          <div className={styles.emptyState}>No services found</div>
        )}
      </div>
      <div className={styles.splitRight}>
        {selected === "__globalParams"
          ? <GlobalParamsDetail params={globalParams} />
          : detail
            ? <ServiceDetail service={detail} />
            : <div className={styles.emptyState}>
                {services.length === 0 ? "Loading services…" : "Select a service to view details"}
              </div>
        }
      </div>
    </div>
  );
}
