import React, { useEffect, useState } from "react";
import { useTrack } from "../analytics.js";
import { EmptyState } from "../components/ui.js";
import { useDebugConnection } from "../connection.js";

/**
 * Collapsible JSON tree.
 *
 * @param props - the value, its key and the depth to open by default
 * @returns the tree element
 */
export function JsonTree(props: {
  value: unknown;
  name?: string;
  depth?: number;
  openDepth?: number;
}): React.JSX.Element {
  const { value, name, depth = 0, openDepth = 2 } = props;
  const [open, setOpen] = useState(depth < openDepth);
  const isObject = typeof value === "object" && value !== null;
  const label = name !== undefined ? <span className="wdbg-json-key">{name}: </span> : null;

  if (!isObject) {
    const cls =
      typeof value === "string"
        ? "wdbg-json-string"
        : typeof value === "number"
          ? "wdbg-json-number"
          : typeof value === "boolean"
            ? "wdbg-json-boolean"
            : "wdbg-json-null";
    return (
      <div className="wdbg-json-line">
        {label}
        <span className={cls}>{JSON.stringify(value) ?? "undefined"}</span>
      </div>
    );
  }
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  const brackets = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  return (
    <div className="wdbg-json-line">
      <span className="wdbg-json-toggle" onClick={() => setOpen(!open)} role="button" aria-expanded={open}>
        {open ? "▼" : "▶"}{" "}
      </span>
      {label}
      <span className="wdbg-muted">
        {brackets[0]}
        {!open && ` ${entries.length} ${entries.length === 1 ? "item" : "items"} `}
        {!open && brackets[1]}
      </span>
      {open && (
        <div className="wdbg-json-indent">
          {entries.map(([k, v]) => (
            <JsonTree key={k} name={k} value={v} depth={depth + 1} openDepth={openDepth} />
          ))}
        </div>
      )}
      {open && <span className="wdbg-muted">{brackets[1]}</span>}
    </div>
  );
}

/**
 * Config panel: the resolved application configuration (global, deployment
 * and element overrides merged) as a collapsible tree.
 *
 * @returns the panel element
 */
export function ConfigPanel(): React.JSX.Element {
  const { data, features } = useDebugConnection();
  const track = useTrack();
  const [view, setView] = useState<"tree" | "json">("tree");

  useEffect(() => {
    track("config_view");
  }, [track]);

  if (!features.config) {
    return (
      <EmptyState>The running @webda/debug does not expose the configuration. Update it to see this panel.</EmptyState>
    );
  }
  if (!data.config) {
    return <EmptyState>Loading configuration...</EmptyState>;
  }
  return (
    <div>
      <div className="wdbg-toolbar">
        <span className="wdbg-muted wdbg-grow">Resolved configuration of the running application</span>
        <button
          type="button"
          className={`wdbg-btn wdbg-btn-ghost ${view === "tree" ? "wdbg-btn-active" : ""}`}
          onClick={() => setView("tree")}
        >
          Tree
        </button>
        <button
          type="button"
          className={`wdbg-btn wdbg-btn-ghost ${view === "json" ? "wdbg-btn-active" : ""}`}
          onClick={() => setView("json")}
        >
          JSON
        </button>
      </div>
      {view === "tree" ? (
        <div className="wdbg-json-tree">
          <JsonTree value={data.config} />
        </div>
      ) : (
        <pre className="wdbg-pre wdbg-mono" style={{ maxHeight: "none" }}>
          {JSON.stringify(data.config, null, 2)}
        </pre>
      )}
    </div>
  );
}
