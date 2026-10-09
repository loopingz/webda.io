import React, { useEffect, useState } from "react";
import { useTrack } from "../analytics.js";
import { ModelGraph, ancestorsOf } from "../components/ModelGraph.js";
import {
  Badge,
  DetailSection,
  EmptyState,
  Fact,
  JsonBlock,
  ListItem,
  SearchInput,
  SplitPanel,
  SubTabs,
  shortName,
  type BadgeVariant
} from "../components/ui.js";
import { useDebugConnection } from "../connection.js";
import type { DebugModel, ModelRelations } from "../types.js";

const GRAPH = "__graph";

/**
 * Models panel: the inheritance / relation graph and, per model, its store,
 * inheritance chain, relations, actions and schemas.
 *
 * @returns the panel element
 */
export function ModelsPanel(): React.JSX.Element {
  const { data } = useDebugConnection();
  const track = useTrack();
  const [selected, setSelected] = useState<string>(GRAPH);
  const [filter, setFilter] = useState("");
  const models = data.models;
  const detail = selected !== GRAPH ? models.find(m => m.id === selected) || null : null;
  const filtered = models.filter(m => (m.id || "").toLowerCase().includes(filter.toLowerCase()));

  useEffect(() => {
    if (selected === GRAPH) track("model_graph_view");
  }, [selected, track]);

  return (
    <SplitPanel
      left={
        <>
          <SearchInput value={filter} placeholder="Filter models..." onChange={setFilter} />
          <ListItem active={selected === GRAPH} onClick={() => setSelected(GRAPH)} pinned>
            <span className="wdbg-strong">Model Graph</span>
            <Badge>{models.length}</Badge>
          </ListItem>
          {filtered.map(m => (
            <ListItem key={m.id} active={selected === m.id} onClick={() => setSelected(m.id)}>
              {m.id}
            </ListItem>
          ))}
          {filtered.length === 0 && <div className="wdbg-muted wdbg-pad">No models found</div>}
        </>
      }
      right={
        selected === GRAPH ? (
          <ModelGraph models={models} selectedId={null} onSelect={setSelected} />
        ) : detail ? (
          <ModelDetail model={detail} onSelect={setSelected} />
        ) : (
          <EmptyState>Select a model to view details</EmptyState>
        )
      }
    />
  );
}

/**
 * Link to another model.
 *
 * @param props - the model id and the select handler
 * @returns the anchor element
 */
function ModelLink(props: { id: string; onSelect: (id: string) => void }): React.JSX.Element {
  return (
    <a
      href="#"
      className="wdbg-mono wdbg-link"
      onClick={e => {
        e.preventDefault();
        props.onSelect(props.id);
      }}
    >
      {shortName(props.id)}
    </a>
  );
}

/**
 * Relations of a model as a table.
 *
 * @param props - the relations and the select handler
 * @returns the section, or null without relations
 */
function RelationsTable(props: {
  relations: ModelRelations;
  onSelect: (id: string) => void;
}): React.JSX.Element | null {
  const { relations, onSelect } = props;
  const rows: { name: string; type: string; target: string }[] = [];
  if (relations.parent) rows.push({ name: relations.parent.attribute, type: "parent", target: relations.parent.model });
  (relations.links || []).forEach(l => rows.push({ name: l.attribute, type: l.type || "link", target: l.model }));
  (relations.queries || []).forEach(q => rows.push({ name: q.attribute, type: "query", target: q.model }));
  (relations.maps || []).forEach(m => rows.push({ name: m.attribute, type: "map", target: m.model }));
  (relations.children || []).forEach(c => rows.push({ name: "", type: "child", target: c }));
  (relations.binaries || []).forEach(b =>
    rows.push({ name: b.attribute, type: `binary (${b.cardinality})`, target: "" })
  );
  (relations.behaviors || []).forEach(b => rows.push({ name: b.attribute, type: "behavior", target: b.behavior }));
  if (rows.length === 0) return null;
  const variant = (type: string): BadgeVariant =>
    type === "parent" || type === "child"
      ? "purple"
      : type === "query"
        ? "green"
        : type.startsWith("binary") || type === "behavior"
          ? "orange"
          : "blue";
  return (
    <DetailSection title="Relations">
      <div className="wdbg-table-container">
        <table className="wdbg-table">
          <thead>
            <tr>
              <th>Attribute</th>
              <th>Type</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="wdbg-mono">{r.name || "-"}</td>
                <td>
                  <Badge variant={variant(r.type)}>{r.type}</Badge>
                </td>
                <td>{r.target ? <ModelLink id={r.target} onSelect={onSelect} /> : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DetailSection>
  );
}

/**
 * Input / Output / Stored schema tabs.
 *
 * @param props - the schemas
 * @returns the tabs element
 */
function SchemaTabs(props: { schemas: Record<string, unknown> }): React.JSX.Element {
  const tabs = ["Input", "Output", "Stored"].filter(t => props.schemas?.[t]);
  const [activeTab, setActiveTab] = useState("Input");
  if (tabs.length === 0) return <div className="wdbg-muted wdbg-pad">No schemas available</div>;
  const current = tabs.includes(activeTab) ? activeTab : tabs[0];
  return (
    <div>
      <SubTabs tabs={tabs.map(t => ({ id: t, label: t }))} active={current} onChange={setActiveTab} />
      <JsonBlock value={props.schemas[current]} />
    </div>
  );
}

/**
 * Detail of one model.
 *
 * @param props - the model and the select handler
 * @returns the detail element
 */
function ModelDetail(props: { model: DebugModel; onSelect: (id: string) => void }): React.JSX.Element {
  const { model, onSelect } = props;
  const ancestors = ancestorsOf(model);
  const subclasses = model.subclasses?.length ? model.subclasses : model.metadata?.Subclasses || [];
  return (
    <div>
      <h2 className="wdbg-title">{shortName(model.id)}</h2>
      <div className="wdbg-mono wdbg-muted wdbg-subtitle">{model.id}</div>
      <div className="wdbg-facts">
        {model.store && (
          <Fact label="Store">
            <span className="wdbg-mono">{model.store}</span>
            {model.storeType && <span className="wdbg-muted"> ({model.storeType})</span>}
          </Fact>
        )}
        {model.plural && (
          <Fact label="Plural">
            <span className="wdbg-mono">{model.plural}</span>
          </Fact>
        )}
      </div>
      {ancestors.length > 0 && (
        <DetailSection title="Inheritance">
          <div className="wdbg-inheritance">
            {[...ancestors].reverse().map(a => (
              <React.Fragment key={a}>
                <ModelLink id={a} onSelect={onSelect} />
                <span className="wdbg-muted">{"→"}</span>
              </React.Fragment>
            ))}
            <span className="wdbg-mono wdbg-strong wdbg-accent">{shortName(model.id)}</span>
            {subclasses.length > 0 && (
              <>
                <span className="wdbg-muted">{"→"}</span>
                {subclasses.map((s, i) => (
                  <React.Fragment key={s}>
                    <ModelLink id={s} onSelect={onSelect} />
                    {i < subclasses.length - 1 && <span className="wdbg-muted">,</span>}
                  </React.Fragment>
                ))}
              </>
            )}
          </div>
        </DetailSection>
      )}
      <RelationsTable relations={model.relations || {}} onSelect={onSelect} />
      {model.actions && model.actions.length > 0 && (
        <DetailSection title="Actions">
          <div className="wdbg-badges">
            {model.actions.map(a => {
              const name = typeof a === "string" ? a : a.name;
              return (
                <Badge key={name} variant="blue">
                  {name}
                </Badge>
              );
            })}
          </div>
        </DetailSection>
      )}
      {model.schemas && (
        <DetailSection title="Schemas">
          <SchemaTabs schemas={model.schemas} />
        </DetailSection>
      )}
    </div>
  );
}
