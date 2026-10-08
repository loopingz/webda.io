import React, { useEffect, useMemo, useRef, useState } from "react";
import type { DebugModel } from "../types.js";
import { shortName } from "./ui.js";

/** Edge kinds drawn by the graph. */
export type EdgeType = "inheritance" | "parent" | "link" | "query" | "map";

/** Colours of the graph, as CSS custom properties resolved by the stylesheet. */
const COLORS: Record<EdgeType | "binary", string> = {
  inheritance: "var(--wdbg-graph-inheritance)",
  parent: "var(--wdbg-graph-parent)",
  link: "var(--wdbg-graph-link)",
  query: "var(--wdbg-graph-query)",
  map: "var(--wdbg-graph-map)",
  binary: "var(--wdbg-graph-binary)"
};

/** A positioned node. */
export interface GraphNodeLayout {
  id: string;
  shortName: string;
  x: number;
  y: number;
  w: number;
  h: number;
  model: DebugModel;
  isSelected: boolean;
}

/** A positioned edge. */
export interface GraphEdgeLayout {
  from: GraphNodeLayout;
  to: GraphNodeLayout;
  type: EdgeType;
  label?: string;
}

/** Result of {@link buildGraph}. */
export interface GraphLayout {
  nodes: GraphNodeLayout[];
  edges: GraphEdgeLayout[];
  width: number;
  height: number;
}

type ChildMap = Record<string, string[]>;

/**
 * Registered parents of a model, closest first: the server's `ancestors`
 * (4.0.0-beta.6+), else the metadata's `Ancestors`.
 *
 * @param model - the model
 * @returns the ancestor identifiers
 */
export function ancestorsOf(model: DebugModel): string[] {
  if (Array.isArray(model.ancestors) && model.ancestors.length > 0) return model.ancestors;
  return model.metadata?.Ancestors || [];
}

/**
 * Whether a model belongs to the framework rather than to the application.
 *
 * @param id - the model identifier
 * @returns `true` for `Webda/*`
 */
export function isFrameworkModel(id: string): boolean {
  return id.startsWith("Webda/");
}

const treeWidth = (nodeId: string, childMap: ChildMap): number => {
  const kids = childMap[nodeId] || [];
  if (kids.length === 0) return 1;
  return kids.reduce((sum, k) => sum + treeWidth(k, childMap), 0);
};

const treeDepth = (nodeId: string, childMap: ChildMap): number => {
  const kids = childMap[nodeId] || [];
  if (kids.length === 0) return 1;
  return 1 + Math.max(...kids.map(k => treeDepth(k, childMap)));
};

/**
 * Lay the inheritance trees out on a grid, wrapping root trees into bands that
 * fit the container width, then place the orphans and build the relation edges.
 *
 * @param models - the models
 * @param selectedId - highlighted model
 * @param containerW - available width in pixels
 * @returns nodes, edges and the canvas size
 */
export function buildGraph(models: DebugModel[], selectedId: string | null, containerW: number): GraphLayout {
  const byId: Record<string, DebugModel> = {};
  models.forEach(m => {
    byId[m.id] = m;
  });

  const childMap: ChildMap = {};
  const roots: string[] = [];
  models.forEach(m => {
    // Closest registered ancestor that is part of the graph
    const parentId = ancestorsOf(m).find(a => byId[a]) ?? null;
    if (parentId) {
      childMap[parentId] ??= [];
      childMap[parentId].push(m.id);
    } else {
      roots.push(m.id);
    }
  });

  const MARGIN = 20;
  const nodeW = Math.max(80, Math.min(140, (containerW - MARGIN * 2) / 6));
  const nodeH = Math.max(26, Math.min(36, nodeW * 0.25));
  const gapX = Math.max(12, nodeW * 0.2);
  const gapY = Math.max(16, nodeH * 0.6);
  const cellW = nodeW + gapX;
  const cellH = nodeH + gapY;
  const maxCols = Math.max(1, Math.floor((containerW - MARGIN * 2 + gapX) / cellW));

  const bands: { id: string; colStart: number; width: number }[][] = [];
  let curBandRoots: { id: string; colStart: number; width: number }[] = [];
  let curBandCols = 0;
  roots.forEach(r => {
    const w = treeWidth(r, childMap);
    if (curBandCols > 0 && curBandCols + w > maxCols) {
      bands.push(curBandRoots);
      curBandRoots = [];
      curBandCols = 0;
    }
    curBandRoots.push({ id: r, colStart: curBandCols, width: w });
    curBandCols += w;
  });
  if (curBandRoots.length) bands.push(curBandRoots);

  const grid: Record<string, { col: number; row: number }> = {};
  let bandRowOffset = 0;
  bands.forEach(band => {
    let bandMaxDepth = 0;
    band.forEach(entry => {
      bandMaxDepth = Math.max(bandMaxDepth, treeDepth(entry.id, childMap));
      let nextCol = entry.colStart;
      const layoutTree = (nodeId: string, depth: number): void => {
        const kids = childMap[nodeId] || [];
        if (kids.length === 0) {
          grid[nodeId] = { col: nextCol, row: bandRowOffset + depth };
          nextCol++;
          return;
        }
        kids.forEach(kid => layoutTree(kid, depth + 1));
        const first = grid[kids[0]];
        const last = grid[kids[kids.length - 1]];
        grid[nodeId] = { col: (first.col + last.col) / 2, row: bandRowOffset + depth };
      };
      layoutTree(entry.id, 0);
    });
    bandRowOffset += bandMaxDepth;
  });

  let orphanCol = 0;
  models.forEach(m => {
    if (!grid[m.id]) {
      grid[m.id] = { col: orphanCol, row: bandRowOffset };
      orphanCol++;
    }
  });

  const nodes: GraphNodeLayout[] = models.map(m => {
    const g = grid[m.id];
    return {
      id: m.id,
      shortName: shortName(m.id),
      x: MARGIN + g.col * cellW,
      y: MARGIN + g.row * cellH,
      w: nodeW,
      h: nodeH,
      model: m,
      isSelected: m.id === selectedId
    };
  });
  const nodeMap: Record<string, GraphNodeLayout> = {};
  nodes.forEach(n => {
    nodeMap[n.id] = n;
  });

  const edges: GraphEdgeLayout[] = [];
  models.forEach(m => {
    const src = nodeMap[m.id];
    if (!src) return;
    const relations = m.relations || {};
    const parentId = ancestorsOf(m).find(a => nodeMap[a]);
    if (parentId) {
      edges.push({ from: nodeMap[parentId], to: src, type: "inheritance" });
    }
    if (relations.parent && nodeMap[relations.parent.model]) {
      edges.push({ from: src, to: nodeMap[relations.parent.model], type: "parent", label: relations.parent.attribute });
    }
    (relations.links || []).forEach(link => {
      if (nodeMap[link.model]) edges.push({ from: src, to: nodeMap[link.model], type: "link", label: link.attribute });
    });
    (relations.queries || []).forEach(q => {
      if (nodeMap[q.model]) edges.push({ from: src, to: nodeMap[q.model], type: "query", label: q.attribute });
    });
    (relations.maps || []).forEach(map => {
      if (nodeMap[map.model]) edges.push({ from: src, to: nodeMap[map.model], type: "map", label: map.attribute });
    });
  });

  const maxX = Math.max(...nodes.map(n => n.x + nodeW), 200) + MARGIN;
  const maxY = Math.max(...nodes.map(n => n.y + nodeH), 100) + MARGIN;
  return { nodes, edges, width: maxX, height: maxY };
}

/**
 * One edge, attached to the node borders, with an arrow head and an optional label.
 *
 * @param props - the edge
 * @returns the SVG group
 */
function GraphEdge(props: { edge: GraphEdgeLayout }): React.JSX.Element {
  const { from, to, type, label } = props.edge;
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  const toCx = to.x + to.w / 2;
  const toCy = to.y + to.h / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  const fx = Math.abs(nx) > Math.abs(ny) ? 1 : Math.abs(nx / ny);
  const fy = Math.abs(ny) > Math.abs(nx) ? 1 : Math.abs(ny / nx);
  const x1 = fromCx + nx * (from.w / 2) * fx;
  const y1 = fromCy + ny * (from.h / 2) * fy;
  const x2 = toCx - nx * (to.w / 2) * fx;
  const y2 = toCy - ny * (to.h / 2) * fy;
  const color = COLORS[type];
  const fontSize = Math.max(7, Math.min(9, from.w / 18));
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth="1.5"
        strokeDasharray={type === "inheritance" ? "4,3" : undefined}
        markerEnd={`url(#wdbg-arrow-${type})`}
      />
      {label && (
        <text
          x={(x1 + x2) / 2}
          y={(y1 + y2) / 2 - 4}
          textAnchor="middle"
          fill={color}
          fontSize={fontSize}
          className="wdbg-graph-label"
        >
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * One node: a rounded box with the short model name and a dot when it has binaries.
 *
 * @param props - the node and its click handler
 * @returns the SVG group
 */
function GraphNode(props: { node: GraphNodeLayout; onClick: (id: string) => void }): React.JSX.Element {
  const { node, onClick } = props;
  const hasBinaries = (node.model.relations?.binaries || []).length > 0;
  const fontSize = Math.max(8, Math.min(11, node.w / 14));
  const maxChars = Math.floor(node.w / (fontSize * 0.6));
  const displayName = node.shortName.length > maxChars ? node.shortName.slice(0, maxChars - 1) + "…" : node.shortName;
  return (
    <g
      onClick={() => onClick(node.id)}
      className={`wdbg-graph-node ${node.isSelected ? "wdbg-graph-node-selected" : ""}`}
      role="button"
      aria-label={node.id}
    >
      <rect x={node.x} y={node.y} width={node.w} height={node.h} rx="4" strokeWidth={node.isSelected ? 2 : 1} />
      <text
        x={node.x + node.w / 2}
        y={node.y + node.h / 2 + fontSize * 0.35}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={node.isSelected ? 600 : 400}
      >
        {displayName}
      </text>
      {hasBinaries && <circle cx={node.x + node.w - 6} cy={node.y + 6} r="3.5" fill={COLORS.binary} opacity="0.8" />}
    </g>
  );
}

/** Props of {@link ModelGraph}. */
export interface ModelGraphProps {
  models: DebugModel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Models to draw.
 *
 * With `hideFramework`, the application's models stay, together with the
 * framework models they extend (so the inheritance tree keeps its roots);
 * framework models no application model descends from are hidden. An
 * application without models of its own shows everything.
 *
 * @param models - all models
 * @param hideFramework - hide `Webda/*` models that are not ancestors of application models
 * @returns the models to draw
 */
export function visibleModels(models: DebugModel[], hideFramework: boolean): DebugModel[] {
  if (!hideFramework) return models;
  const app = models.filter(m => !isFrameworkModel(m.id));
  if (app.length === 0) return models;
  const keep = new Set<string>(app.map(m => m.id));
  for (const m of app) {
    for (const ancestor of ancestorsOf(m)) keep.add(ancestor);
  }
  return models.filter(m => keep.has(m.id));
}

/**
 * Inheritance and relation graph of the models, re-laid out when the container resizes.
 *
 * @param props - models, selection and select handler
 * @returns the graph element
 */
export function ModelGraph(props: ModelGraphProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const hasFramework = props.models.some(m => isFrameworkModel(m.id));
  const [hideFramework, setHideFramework] = useState(true);
  const models = useMemo(() => visibleModels(props.models, hideFramework), [props.models, hideFramework]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth || 800);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graph = useMemo(() => buildGraph(models, props.selectedId, width), [models, props.selectedId, width]);

  const legend: { color: string; label: string; dashed?: boolean; circle?: boolean }[] = [
    { color: COLORS.inheritance, label: "Extends", dashed: true },
    { color: COLORS.parent, label: "Parent" },
    { color: COLORS.link, label: "Link" },
    { color: COLORS.query, label: "Query" },
    { color: COLORS.map, label: "Map" },
    { color: COLORS.binary, label: "Binary", circle: true }
  ];

  return (
    <div className="wdbg-graph">
      <div className="wdbg-graph-legend">
        {legend.map(l => (
          <div key={l.label} className="wdbg-graph-legend-item">
            {l.circle ? (
              <span className="wdbg-graph-legend-dot" style={{ background: l.color }} />
            ) : (
              <span
                className="wdbg-graph-legend-line"
                style={{ borderTopColor: l.color, borderTopStyle: l.dashed ? "dashed" : "solid" }}
              />
            )}
            {l.label}
          </div>
        ))}
        {hasFramework && (
          <label className="wdbg-checkbox wdbg-graph-toggle">
            <input type="checkbox" checked={hideFramework} onChange={e => setHideFramework(e.target.checked)} />
            Hide unused framework models (Webda/*)
          </label>
        )}
      </div>
      <div ref={containerRef} className="wdbg-graph-canvas">
        <svg width={graph.width} height={graph.height} style={{ display: "block" }} data-testid="model-graph">
          <defs>
            {(["inheritance", "parent", "link", "query", "map"] as EdgeType[]).map(type => (
              <marker
                key={type}
                id={`wdbg-arrow-${type}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS[type]} />
              </marker>
            ))}
          </defs>
          {graph.edges.map((e, i) => (
            <GraphEdge key={i} edge={e} />
          ))}
          {graph.nodes.map(n => (
            <GraphNode key={n.id} node={n} onClick={props.onSelect} />
          ))}
        </svg>
      </div>
    </div>
  );
}
