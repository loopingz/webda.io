import { h } from "preact";
import { useMemo, useRef } from "preact/hooks";
import htm from "htm";

const html = htm.bind(h);

const COLORS = {
  node: "#0f3460",
  nodeBorder: "#4557a4",
  nodeText: "#e0e0e0",
  selected: "#f7992c",
  inheritance: "#8892a4",
  link: "#4557a4",
  query: "#81bf6b",
  parent: "#a855f7",
  binary: "#f7992c",
  map: "#6b8fd4",
  children: "#a855f7"
};

const NODE_W = 160;
const NODE_H = 36;
const GAP_X = 60;
const GAP_Y = 50;

/**
 * Build a layout: position each model as a node, compute edges.
 */
function buildGraph(models, selectedId) {
  const byId = {};
  models.forEach(m => { byId[m.id] = m; });

  // Find root models (no ancestors in our set or ancestors[0] not in set)
  const roots = [];
  const children = new Set();
  models.forEach(m => {
    const ancestors = m.metadata?.Ancestors || [];
    if (ancestors.length === 0 || !byId[ancestors[0]]) {
      roots.push(m.id);
    } else {
      children.add(m.id);
    }
  });

  // Build tree for inheritance layout
  const childMap = {};
  models.forEach(m => {
    const ancestors = m.metadata?.Ancestors || [];
    const parentId = ancestors.length > 0 && byId[ancestors[0]] ? ancestors[0] : null;
    if (parentId) {
      childMap[parentId] ??= [];
      childMap[parentId].push(m.id);
    }
  });

  // Assign positions using a simple tree layout
  const positions = {};
  let nextX = 0;

  function layoutTree(nodeId, depth) {
    const kids = childMap[nodeId] || [];
    if (kids.length === 0) {
      positions[nodeId] = { x: nextX, y: depth };
      nextX++;
      return;
    }
    kids.forEach(kid => layoutTree(kid, depth + 1));
    // Center parent over children
    const firstChild = positions[kids[0]];
    const lastChild = positions[kids[kids.length - 1]];
    positions[nodeId] = { x: (firstChild.x + lastChild.x) / 2, y: depth };
  }

  roots.forEach(rootId => layoutTree(rootId, 0));

  // Place any orphan models that weren't laid out
  models.forEach(m => {
    if (!positions[m.id]) {
      positions[m.id] = { x: nextX, y: 0 };
      nextX++;
    }
  });

  // Convert grid positions to pixel positions
  const MARGIN = 30;
  const nodes = models.map(m => {
    const pos = positions[m.id];
    return {
      id: m.id,
      shortName: m.id.split("/").pop(),
      x: MARGIN + pos.x * (NODE_W + GAP_X),
      y: MARGIN + pos.y * (NODE_H + GAP_Y),
      model: m,
      isSelected: m.id === selectedId
    };
  });

  const nodeMap = {};
  nodes.forEach(n => { nodeMap[n.id] = n; });

  // Build edges
  const edges = [];

  models.forEach(m => {
    const src = nodeMap[m.id];
    if (!src) return;
    const relations = m.relations || {};

    // Inheritance (ancestors[0] = direct parent class)
    const ancestors = m.metadata?.Ancestors || [];
    if (ancestors[0] && nodeMap[ancestors[0]]) {
      edges.push({ from: nodeMap[ancestors[0]], to: src, type: "inheritance", label: "extends" });
    }

    // Parent relation (DDD parent model)
    if (relations.parent && nodeMap[relations.parent.model]) {
      edges.push({ from: src, to: nodeMap[relations.parent.model], type: "parent", label: relations.parent.attribute });
    }

    // Links
    (relations.links || []).forEach(link => {
      if (nodeMap[link.model]) {
        edges.push({ from: src, to: nodeMap[link.model], type: "link", label: link.attribute });
      }
    });

    // Queries
    (relations.queries || []).forEach(q => {
      if (nodeMap[q.model]) {
        edges.push({ from: src, to: nodeMap[q.model], type: "query", label: q.attribute });
      }
    });

    // Maps
    (relations.maps || []).forEach(map => {
      if (nodeMap[map.model]) {
        edges.push({ from: src, to: nodeMap[map.model], type: "map", label: map.attribute });
      }
    });
  });

  // Compute SVG size
  const maxX = Math.max(...nodes.map(n => n.x + NODE_W), 200) + MARGIN;
  const maxY = Math.max(...nodes.map(n => n.y + NODE_H), 100) + MARGIN;

  return { nodes, edges, width: maxX, height: maxY };
}

function edgeColor(type) {
  return COLORS[type] || COLORS.link;
}

/**
 * Draw an edge between two nodes with an optional label.
 */
function GraphEdge({ edge }) {
  const { from, to, type, label } = edge;
  const fromCx = from.x + NODE_W / 2;
  const fromCy = from.y + NODE_H / 2;
  const toCx = to.x + NODE_W / 2;
  const toCy = to.y + NODE_H / 2;

  // Compute attach points on node borders
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

  const x1 = fromCx + nx * (NODE_W / 2);
  const y1 = fromCy + ny * (NODE_H / 2);
  const x2 = toCx - nx * (NODE_W / 2);
  const y2 = toCy - ny * (NODE_H / 2);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const color = edgeColor(type);
  const dashed = type === "inheritance" ? "4,3" : "none";

  return html`
    <g>
      <line x1=${x1} y1=${y1} x2=${x2} y2=${y2}
        stroke=${color} stroke-width="1.5"
        stroke-dasharray=${dashed}
        marker-end="url(#arrow-${type})" />
      ${label && html`
        <text x=${mx} y=${my - 5} text-anchor="middle"
          fill=${color} font-size="9" font-family="SF Mono, Fira Code, monospace">${label}</text>
      `}
    </g>
  `;
}

/**
 * Draw a model node.
 */
function GraphNode({ node, onClick }) {
  const hasBinaries = (node.model.relations?.binaries || []).length > 0;
  return html`
    <g onClick=${() => onClick(node.id)} style="cursor:pointer">
      <rect x=${node.x} y=${node.y} width=${NODE_W} height=${NODE_H} rx="4"
        fill=${node.isSelected ? "#1a2744" : COLORS.node}
        stroke=${node.isSelected ? COLORS.selected : COLORS.nodeBorder}
        stroke-width=${node.isSelected ? "2" : "1"} />
      <text x=${node.x + NODE_W / 2} y=${node.y + NODE_H / 2 + 4}
        text-anchor="middle" fill=${node.isSelected ? COLORS.selected : COLORS.nodeText}
        font-size="11" font-weight=${node.isSelected ? "600" : "400"}
        font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">
        ${node.shortName}
      </text>
      ${hasBinaries && html`
        <circle cx=${node.x + NODE_W - 6} cy=${node.y + 6} r="4"
          fill=${COLORS.binary} opacity="0.8" />
      `}
    </g>
  `;
}

/**
 * Full model graph rendered as SVG.
 */
export function ModelGraph({ models, selectedId, onSelect }) {
  const graph = useMemo(() => buildGraph(models, selectedId), [models, selectedId]);
  const containerRef = useRef(null);

  // Legend items
  const legend = [
    { color: COLORS.inheritance, label: "Extends", dashed: true },
    { color: COLORS.parent, label: "Parent" },
    { color: COLORS.link, label: "Link" },
    { color: COLORS.query, label: "Query" },
    { color: COLORS.map, label: "Map" },
    { color: COLORS.binary, label: "Binary", circle: true }
  ];

  return html`
    <div>
      <div style="display:flex;gap:1rem;margin-bottom:0.75rem;flex-wrap:wrap;align-items:center">
        ${legend.map(l => html`
          <div key=${l.label} style="display:flex;align-items:center;gap:0.3rem;font-size:0.75rem;color:var(--text-muted)">
            ${l.circle
              ? html`<span style="width:8px;height:8px;border-radius:50%;background:${l.color};display:inline-block"></span>`
              : html`<span style="width:16px;height:2px;background:${l.color};display:inline-block;${l.dashed ? "border-top:2px dashed " + l.color + ";background:none" : ""}"></span>`
            }
            ${l.label}
          </div>
        `)}
      </div>
      <div ref=${containerRef} style="overflow:auto;border:1px solid var(--border);border-radius:4px;background:var(--bg);max-height:calc(100vh - 170px)">
        <svg width=${graph.width} height=${graph.height} style="display:block">
          <defs>
            ${["inheritance", "parent", "link", "query", "map"].map(type => html`
              <marker key=${type} id="arrow-${type}" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill=${edgeColor(type)} />
              </marker>
            `)}
          </defs>
          ${graph.edges.map((e, i) => html`<${GraphEdge} key=${i} edge=${e} />`)}
          ${graph.nodes.map(n => html`<${GraphNode} key=${n.id} node=${n} onClick=${onSelect} />`)}
        </svg>
      </div>
    </div>
  `;
}
