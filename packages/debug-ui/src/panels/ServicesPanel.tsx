import React, { useState } from "react";
import { useDebugConnection } from "../connection.js";
import { SchemaForm } from "../components/SchemaForm.js";
import {
  Badge,
  EmptyState,
  Fact,
  JsonBlock,
  KeyValueTable,
  ListItem,
  SearchInput,
  SplitPanel,
  StateBadge,
  SubTabs
} from "../components/ui.js";
import type { DebugServiceInfo } from "../types.js";

const GLOBAL = "__globalParams";

/**
 * Services panel: filterable list, global parameters, and for each service its
 * configuration, a form generated from its schema, the raw schema and its metrics.
 *
 * @returns the panel element
 */
export function ServicesPanel(): React.JSX.Element {
  const { data } = useDebugConnection();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const services = data.services;
  const globalParams = (data.config?.parameters as Record<string, unknown>) || {};
  const paramKeys = Object.keys(globalParams);
  const detail = selected && selected !== GLOBAL ? services.find(s => s.name === selected) || null : null;
  const needle = filter.toLowerCase();
  const filtered = services.filter(
    s => (s.name || "").toLowerCase().includes(needle) || (s.type || "").toLowerCase().includes(needle)
  );

  return (
    <SplitPanel
      left={
        <>
          <SearchInput value={filter} placeholder="Filter services..." onChange={setFilter} />
          {paramKeys.length > 0 && (
            <ListItem active={selected === GLOBAL} onClick={() => setSelected(GLOBAL)} pinned>
              <span className="wdbg-strong">Global Parameters</span>
              <Badge>{paramKeys.length}</Badge>
            </ListItem>
          )}
          {filtered.map(s => (
            <ListItem key={s.name} active={selected === s.name} onClick={() => setSelected(s.name)}>
              <span>{s.name}</span>
              <StateBadge state={s.state} />
            </ListItem>
          ))}
          {filtered.length === 0 && <div className="wdbg-muted wdbg-pad">No services found</div>}
        </>
      }
      right={
        selected === GLOBAL ? (
          <div>
            <h2 className="wdbg-title">Global Parameters</h2>
            <KeyValueTable entries={globalParams} />
          </div>
        ) : detail ? (
          <ServiceDetail service={detail} />
        ) : (
          <EmptyState>Select a service to view details</EmptyState>
        )
      }
    />
  );
}

/**
 * Detail of one service.
 *
 * @param props - the service
 * @returns the detail element
 */
function ServiceDetail(props: { service: DebugServiceInfo }): React.JSX.Element {
  const { service } = props;
  const [activeTab, setActiveTab] = useState("config");
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const config = service.configuration || {};
  const configKeys = Object.keys(config).filter(k => !k.startsWith("_"));
  const schema = service.schema;

  const tabs = [{ id: "config", label: "Configuration" }];
  if (schema) tabs.push({ id: "schema-form", label: "Schema Form" }, { id: "schema-json", label: "Schema JSON" });
  if (service.metrics?.length) tabs.push({ id: "metrics", label: "Metrics" });
  const currentTab = tabs.some(t => t.id === activeTab) ? activeTab : tabs[0].id;

  return (
    <div>
      <h2 className="wdbg-title">{service.name}</h2>
      <div className="wdbg-facts">
        <Fact label="Type">
          <span className="wdbg-mono">{service.type || "unknown"}</span>
        </Fact>
        <Fact label="State">
          <StateBadge state={service.state} />
        </Fact>
      </div>
      {Object.keys(service.capabilities || {}).length > 0 && (
        <div className="wdbg-badges">
          {Object.keys(service.capabilities).map(c => (
            <Badge key={c} variant="purple">
              {c}
            </Badge>
          ))}
        </div>
      )}
      <SubTabs
        tabs={tabs}
        active={currentTab}
        onChange={tab => {
          setActiveTab(tab);
          if (tab === "schema-form") setFormValues({ ...config });
        }}
      />
      {currentTab === "config" &&
        (configKeys.length > 0 ? (
          <KeyValueTable entries={Object.fromEntries(configKeys.map(k => [k, config[k]]))} />
        ) : (
          <div className="wdbg-muted wdbg-pad">No configuration parameters</div>
        ))}
      {currentTab === "schema-form" && schema && (
        <div>
          <SchemaForm schema={schema} values={formValues} onChange={setFormValues} />
          {Object.keys(formValues).length > 0 && (
            <div className="wdbg-preview">
              <strong className="wdbg-preview-label">Configuration Preview</strong>
              <JsonBlock value={formValues} maxHeight={300} />
            </div>
          )}
        </div>
      )}
      {currentTab === "schema-json" && schema && <JsonBlock value={schema} maxHeight={500} />}
      {currentTab === "metrics" && service.metrics && (
        <div className="wdbg-table-container">
          <table className="wdbg-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Help</th>
                <th className="wdbg-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {service.metrics.map(m => (
                <tr key={m.name}>
                  <td className="wdbg-mono wdbg-strong">{m.name}</td>
                  <td>
                    <Badge
                      variant={
                        m.type === "counter"
                          ? "blue"
                          : m.type === "gauge"
                            ? "green"
                            : m.type === "histogram"
                              ? "purple"
                              : "muted"
                      }
                    >
                      {m.type}
                    </Badge>
                  </td>
                  <td className="wdbg-muted">{m.help || "-"}</td>
                  <td className="wdbg-mono wdbg-right wdbg-strong">
                    {m.values?.length
                      ? m.values
                          .map(v => v.value)
                          .reduce((a, b) => a + b, 0)
                          .toLocaleString()
                      : "0"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
