import { h, render } from "preact";
import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import htm from "htm";

import { ModelsPanel } from "./components/models.js";
import { ServicesPanel } from "./components/services.js";
import { OperationsPanel } from "./components/operations.js";
import { ConfigPanel } from "./components/config.js";
import { RequestsPanel } from "./components/requests.js";
import { LogsPanel } from "./components/logs.js";

const html = htm.bind(h);

const TABS = [
  { id: "logs", label: "Logs", color: "#f7992c" },
  { id: "models", label: "Models", color: "#81bf6b" },
  { id: "services", label: "Services", color: "#6b8fd4" },
  { id: "operations", label: "Operations", color: "#f4f4f4" },
  { id: "config", label: "Config", color: "#81bf6b" },
  { id: "requests", label: "Requests", color: "#6b8fd4" }
];

/**
 * Fetch JSON from the debug API.
 * @param {string} path
 * @returns {Promise<any>}
 */
async function fetchApi(path) {
  const res = await fetch(path);
  return res.json();
}

function App() {
  const [tab, setTab] = useState("logs");
  const [wsConnected, setWsConnected] = useState(false);
  const [wsEvents, setWsEvents] = useState([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [cache, setCache] = useState({});
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  // Load all data upfront and on rebuild (restart event)
  useEffect(() => {
    Promise.all([
      fetchApi("/api/info").catch(() => null),
      fetchApi("/api/models").catch(() => []),
      fetchApi("/api/services").catch(() => []),
      fetchApi("/api/operations").catch(() => []),
      fetchApi("/api/config").catch(() => {}),
      fetchApi("/api/requests").catch(() => []),
      fetchApi("/api/logs").catch(() => [])
    ]).then(([info, models, services, operations, config, requests, logs]) => {
      setCache({ info, models, services, operations, config, requests, logs });
    });
  }, [dataVersion]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setTab((prev) => {
          const idx = TABS.findIndex((t) => t.id === prev);
          return TABS[(idx - 1 + TABS.length) % TABS.length].id;
        });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setTab((prev) => {
          const idx = TABS.findIndex((t) => t.id === prev);
          return TABS[(idx + 1) % TABS.length].id;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const connectWs = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      setWsConnected(true);
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    });

    ws.addEventListener("message", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "restart") {
          // Trigger data refetch across all panels
          setDataVersion((v) => v + 1);
          return;
        }
        // Dispatch custom event so individual panels can listen
        window.dispatchEvent(new CustomEvent("debug-ws-event", { detail: data }));
        setWsEvents((prev) => [data, ...prev].slice(0, 500));
      } catch {
        // ignore parse errors
      }
    });

    ws.addEventListener("close", () => {
      setWsConnected(false);
      wsRef.current = null;
      // Auto-reconnect after 2 seconds
      reconnectTimer.current = setTimeout(connectWs, 2000);
    });

    ws.addEventListener("error", () => {
      ws.close();
    });
  }, []);

  useEffect(() => {
    connectWs();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connectWs]);

  const renderPanel = () => {
    switch (tab) {
      case "models":
        return html`<${ModelsPanel} data=${cache.models} fetchApi=${fetchApi} dataVersion=${dataVersion} />`;
      case "services":
        return html`<${ServicesPanel} data=${cache.services} fetchApi=${fetchApi} dataVersion=${dataVersion} />`;
      case "operations":
        return html`<${OperationsPanel} data=${cache.operations} fetchApi=${fetchApi} dataVersion=${dataVersion} />`;
      case "config":
        return html`<${ConfigPanel} data=${cache.config} fetchApi=${fetchApi} dataVersion=${dataVersion} />`;
      case "requests":
        return html`<${RequestsPanel} data=${cache.requests} fetchApi=${fetchApi} dataVersion=${dataVersion} wsEvents=${wsEvents} />`;
      case "logs":
        return html`<${LogsPanel} data=${cache.logs} fetchApi=${fetchApi} dataVersion=${dataVersion} />`;
      default:
        return null;
    }
  };

  return html`
    <div class="header ${wsConnected ? "" : "disconnected"}">
      <div class="header-logo">
        <img src="/logo.svg" alt="Webda" />
        <div class="header-title">web<span>da</span> debug</div>
        ${cache.info && html`<div class="header-app-info">
          <div class="header-app-name">${cache.info.package?.name || "unknown"}</div>
          <div class="header-cwd">${(cache.info.workingDirectory || "").replace(/^\/(Users|home)\/[^/]+\//, "~/")}</div>
        </div>`}
      </div>
      <nav class="nav-tabs">
        ${TABS.map(
          (t) => html`
            <button
              key=${t.id}
              class="nav-tab ${tab === t.id ? "active" : ""}"
              style="${tab === t.id ? `color:${t.color};border-bottom-color:${t.color}` : ""}"
              onClick=${() => setTab(t.id)}
            >
              ${t.label}
            </button>
          `
        )}
      </nav>
      <div class="ws-indicator">
        <span class="ws-dot ${wsConnected ? "" : "disconnected"}"></span>
        <span>${wsConnected ? "Connected" : "Reconnecting..."}</span>
      </div>
    </div>
    <div class="content">${renderPanel()}</div>
  `;
}

render(html`<${App} />`, document.getElementById("app"));
