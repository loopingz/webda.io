import { h, render } from "https://esm.sh/preact@10.25.4";
import { useState, useEffect, useRef, useCallback } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";

import { ModelsPanel } from "./components/models.js";
import { ServicesPanel } from "./components/services.js";
import { OperationsPanel } from "./components/operations.js";
import { RoutesPanel } from "./components/routes.js";
import { ConfigPanel } from "./components/config.js";
import { RequestsPanel } from "./components/requests.js";
import { OpenAPIPanel } from "./components/openapi.js";
import { LogsPanel } from "./components/logs.js";

const html = htm.bind(h);

const TABS = [
  { id: "models", label: "Models" },
  { id: "services", label: "Services" },
  { id: "operations", label: "Operations" },
  { id: "routes", label: "Routes" },
  { id: "config", label: "Config" },
  { id: "requests", label: "Requests" },
  { id: "logs", label: "Logs" },
  { id: "openapi", label: "OpenAPI" }
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
  const [tab, setTab] = useState("models");
  const [wsConnected, setWsConnected] = useState(false);
  const [wsEvents, setWsEvents] = useState([]);
  const [dataVersion, setDataVersion] = useState(0);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

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
        return html`<${ModelsPanel} fetchApi=${fetchApi} dataVersion=${dataVersion} />`;
      case "services":
        return html`<${ServicesPanel} fetchApi=${fetchApi} dataVersion=${dataVersion} />`;
      case "operations":
        return html`<${OperationsPanel} fetchApi=${fetchApi} dataVersion=${dataVersion} />`;
      case "routes":
        return html`<${RoutesPanel} fetchApi=${fetchApi} dataVersion=${dataVersion} />`;
      case "config":
        return html`<${ConfigPanel} fetchApi=${fetchApi} dataVersion=${dataVersion} />`;
      case "requests":
        return html`<${RequestsPanel} fetchApi=${fetchApi} dataVersion=${dataVersion} wsEvents=${wsEvents} />`;
      case "logs":
        return html`<${LogsPanel} fetchApi=${fetchApi} dataVersion=${dataVersion} />`;
      case "openapi":
        return html`<${OpenAPIPanel} />`;
      default:
        return null;
    }
  };

  return html`
    <div class="header">
      <div class="header-title">Webda Debug</div>
      <nav class="nav-tabs">
        ${TABS.map(
          (t) => html`
            <button
              key=${t.id}
              class="nav-tab ${tab === t.id ? "active" : ""}"
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
