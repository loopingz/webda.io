import React from "react";

/** Colour variants of a badge. */
export type BadgeVariant = "green" | "yellow" | "red" | "blue" | "purple" | "orange" | "muted";

/**
 * Small coloured label.
 *
 * @param props - variant, optional class and children
 * @returns the badge element
 */
export function Badge(props: {
  variant?: BadgeVariant;
  className?: string;
  title?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}): React.JSX.Element {
  const { variant = "muted", className = "", title, style, children } = props;
  return (
    <span className={`wdbg-badge wdbg-badge-${variant} ${className}`.trim()} title={title} style={style}>
      {children}
    </span>
  );
}

/**
 * Badge coloured after a service lifecycle state.
 *
 * @param props - the state
 * @returns the badge element
 */
export function StateBadge(props: { state?: string }): React.JSX.Element {
  const state = props.state;
  if (!state) return <Badge>unknown</Badge>;
  const s = state.toLowerCase();
  const variant: BadgeVariant =
    s === "running" || s === "resolved"
      ? "green"
      : s === "stopped" || s === "error" || s === "failed"
        ? "red"
        : s === "initializing" || s === "created"
          ? "yellow"
          : "muted";
  return <Badge variant={variant}>{state}</Badge>;
}

/**
 * Badge coloured after an HTTP method.
 *
 * @param props - the method and an optional size
 * @returns the badge element, or null without a method
 */
export function MethodBadge(props: { method?: string; small?: boolean }): React.JSX.Element | null {
  if (!props.method) return null;
  const m = props.method.toUpperCase();
  return (
    <span className={`wdbg-badge wdbg-method-${m.toLowerCase()} ${props.small ? "wdbg-badge-small" : ""}`}>{m}</span>
  );
}

/**
 * CSS class for an HTTP status code.
 *
 * @param code - the status code
 * @returns a `wdbg-status-*` class
 */
export function statusClass(code?: number): string {
  if (!code) return "wdbg-status-pending";
  if (code < 300) return "wdbg-status-2xx";
  if (code < 400) return "wdbg-status-3xx";
  if (code < 500) return "wdbg-status-4xx";
  return "wdbg-status-5xx";
}

/**
 * Time of day of a timestamp.
 *
 * @param ts - epoch milliseconds
 * @returns `HH:MM:SS.mmm` in UTC, or `-`
 */
export function formatTime(ts?: number): string {
  if (!ts) return "-";
  return new Date(ts).toISOString().substring(11, 23);
}

/**
 * Human readable byte count.
 *
 * @param n - number of bytes
 * @returns `12 B`, `1.5 KB`, `2.00 MB`
 */
export function formatBytes(n?: number | null): string {
  if (n == null) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Secondary tab strip used inside the detail views.
 *
 * @param props - the tabs, the active id and the change handler
 * @returns the tab strip
 */
export function SubTabs(props: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}): React.JSX.Element {
  return (
    <div className="wdbg-subtabs" role="tablist">
      {props.tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={props.active === tab.id}
          className={`wdbg-subtab ${props.active === tab.id ? "wdbg-subtab-active" : ""}`}
          onClick={() => props.onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Pretty-printed JSON block.
 *
 * @param props - the value and an optional max height
 * @returns the preformatted element
 */
export function JsonBlock(props: {
  value: unknown;
  maxHeight?: number | string;
  className?: string;
}): React.JSX.Element {
  return (
    <pre className={`wdbg-pre wdbg-mono ${props.className ?? ""}`} style={{ maxHeight: props.maxHeight ?? 400 }}>
      {JSON.stringify(props.value, null, 2)}
    </pre>
  );
}

/**
 * Two-column table of keys and values; objects are pretty-printed.
 *
 * @param props - the record and the column headings
 * @returns the table
 */
export function KeyValueTable(props: {
  entries: Record<string, unknown>;
  keyLabel?: string;
  valueLabel?: string;
}): React.JSX.Element {
  const keys = Object.keys(props.entries);
  return (
    <div className="wdbg-table-container">
      <table className="wdbg-table">
        <thead>
          <tr>
            <th style={{ width: 200 }}>{props.keyLabel ?? "Parameter"}</th>
            <th>{props.valueLabel ?? "Value"}</th>
          </tr>
        </thead>
        <tbody>
          {keys.map(key => {
            const value = props.entries[key];
            return (
              <tr key={key}>
                <td className="wdbg-mono wdbg-strong">{key}</td>
                <td className="wdbg-mono wdbg-break">
                  {typeof value === "object" && value !== null ? (
                    <pre className="wdbg-pre-inline">{JSON.stringify(value, null, 2)}</pre>
                  ) : (
                    String(value)
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Centered muted placeholder.
 *
 * @param props - children
 * @returns the placeholder element
 */
export function EmptyState(props: { children: React.ReactNode }): React.JSX.Element {
  return <div className="wdbg-empty">{props.children}</div>;
}

/**
 * Small labelled fact (`Type: Webda/Router`).
 *
 * @param props - label and children
 * @returns the chip element
 */
export function Fact(props: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="wdbg-fact">
      <span className="wdbg-muted">{props.label}: </span>
      {props.children}
    </div>
  );
}

/**
 * Section of a detail view with an uppercase heading.
 *
 * @param props - title and children
 * @returns the section element
 */
export function DetailSection(props: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="wdbg-detail-section">
      <h3>{props.title}</h3>
      {props.children}
    </div>
  );
}

/**
 * Filter input of a list.
 *
 * @param props - value, placeholder and change handler
 * @returns the input element
 */
export function SearchInput(props: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <input
      type="search"
      className={`wdbg-search ${props.mono ? "wdbg-mono" : ""}`}
      placeholder={props.placeholder}
      aria-label={props.placeholder}
      value={props.value}
      onChange={e => props.onChange(e.target.value)}
    />
  );
}

/**
 * Entry of the list on the left of a split panel.
 *
 * @param props - selection state, click handler, children
 * @returns the list item
 */
export function ListItem(props: {
  active: boolean;
  onClick: () => void;
  pinned?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      role="option"
      aria-selected={props.active}
      className={`wdbg-list-item ${props.active ? "wdbg-list-item-active" : ""} ${props.pinned ? "wdbg-list-item-pinned" : ""}`}
      onClick={props.onClick}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onClick();
        }
      }}
      tabIndex={0}
    >
      {props.children}
    </div>
  );
}

/**
 * Two-pane layout: a list on the left, a detail view on the right.
 *
 * @param props - the two panes
 * @returns the layout element
 */
export function SplitPanel(props: { left: React.ReactNode; right: React.ReactNode }): React.JSX.Element {
  return (
    <div className="wdbg-split">
      <div className="wdbg-split-left" role="listbox">
        {props.left}
      </div>
      <div className="wdbg-split-right">{props.right}</div>
    </div>
  );
}

/**
 * Short name of a fully qualified identifier (`MyApp/Task` → `Task`).
 *
 * @param id - the identifier
 * @returns the last segment
 */
export function shortName(id: string | undefined): string {
  return (id ?? "").split("/").pop() ?? "";
}
