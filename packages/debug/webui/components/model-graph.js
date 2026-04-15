import { h } from "preact";
import { useMemo, useRef, useState, useEffect } from "preact/hooks";
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
  map: "#6b8fd4"
};

/**
 * Compute the leaf count (width in columns) of a tree rooted at nodeId.
 */
function treeWidth(nodeId, childMap) {
  const kids = childMap[nodeId] || [];
  if (kids.length === 0) return 1;
  return kids.reduce((sum, k) => sum + treeWidth(k, childMap), 0);
}

/**
 * Compute the max depth of a tree rooted at nodeId.
 */
function treeDepth(nodeId, childMap) {
  const kids = childMap[nodeId] || [];
  if (kids.length === 0) return 1;
  return 1 + Math.max(...kids.map(k => treeDepth(k, childMap)));
}

/**
 * Build the graph layout: compute grid positions for trees, wrap rows to fit container.
 */
function buildGraph(models, selectedId, containerW) {
  const byId = {};
  models.forEach(m => { byId[m.id] = m; });

  // Build inheritance tree
  const childMap = {};
  const roots = [];
  models.forEach(m => {
    const ancestors = m.metadata?.Ancestors || [];
    const parentId = ancestors.length > 0 && byId[ancestors[0]] ? ancestors[0] : null;
    if (parentId) {
      childMap[parentId] ??= [];
      childMap[parentId].push(m.id);
    } else {
      roots.push(m.id);
    }
  });

  // Pick a reasonable node size
  const MARGIN = 20;
  const nodeW = Math.max(80, Math.min(140, (containerW - MARGIN * 2) / 6));
  const nodeH = Math.max(26, Math.min(36, nodeW * 0.25));
  const gapX = Math.max(12, nodeW * 0.2);
  const gapY = Math.max(16, nodeH * 0.6);
  const cellW = nodeW + gapX;
  const cellH = nodeH + gapY;
  const maxCols = Math.max(1, Math.floor((containerW - MARGIN * 2 + gapX) / cellW));

  // Wrap root trees into bands that fit within maxCols
  const bands = []; // each band: { roots: [...], colOffset: 0, rowOffset: 0, width, depth }
  let curBandRoots = [];
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

  // Layout each band
  const grid = {};
  let bandRowOffset = 0;

  bands.forEach(band => {
    let bandMaxDepth = 0;
    band.forEach(entry => {
      const d = treeDepth(entry.id, childMap);
      bandMaxDepth = Math.max(bandMaxDepth, d);

      let nextCol = entry.colStart;
      function layoutTree(nodeId, depth) {
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
      }
      layoutTree(entry.id, 0);
    });
    bandRowOffset += bandMaxDepth;
  });

  // Place orphans
  let orphanCol = 0;
  models.forEach(m => {
    if (!grid[m.id]) {
      grid[m.id] = { col: orphanCol, row: bandRowOffset };
      orphanCol++;
    }
  });

  // Convert to pixel positions
  const nodes = models.map(m => {
    const g = grid[m.id];
    return {
      id: m.id,
      shortName: m.id.split("/").pop(),
      x: MARGIN + g.col * cellW,
      y: MARGIN + g.row * cellH,
      w: nodeW,
      h: nodeH,
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
    const ancestors = m.metadata?.Ancestors || [];
    if (ancestors[0] && nodeMap[ancestors[0]]) {
      edges.push({ from: nodeMap[ancestors[0]], to: src, type: "inheritance" });
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

function edgeColor(type) {
  return COLORS[type] || COLORS.link;
}

function GraphEdge({ edge }) {
  const { from, to, type, label } = edge;
  const fromCx = from.x + from.w / 2;
  const fromCy = from.y + from.h / 2;
  const toCx = to.x + to.w / 2;
  const toCy = to.y + to.h / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

  // Attach to node border (simplified: use half-width/height in direction)
  const x1 = fromCx + nx * (from.w / 2) * (Math.abs(nx) > Math.abs(ny) ? 1 : Math.abs(nx / ny)) ;
  const y1 = fromCy + ny * (from.h / 2) * (Math.abs(ny) > Math.abs(nx) ? 1 : Math.abs(ny / nx));
  const x2 = toCx - nx * (to.w / 2) * (Math.abs(nx) > Math.abs(ny) ? 1 : Math.abs(nx / ny));
  const y2 = toCy - ny * (to.h / 2) * (Math.abs(ny) > Math.abs(nx) ? 1 : Math.abs(ny / nx));
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const color = edgeColor(type);
  const dashed = type === "inheritance" ? "4,3" : "none";
  const fontSize = Math.max(7, Math.min(9, from.w / 18));

  return html`
    <g>
      <line x1=${x1} y1=${y1} x2=${x2} y2=${y2}
        stroke=${color} stroke-width="1.5" stroke-dasharray=${dashed}
        marker-end="url(#arrow-${type})" />
      ${label && html`
        <text x=${mx} y=${my - 4} text-anchor="middle"
          fill=${color} font-size=${fontSize} font-family="SF Mono, Fira Code, monospace">${label}</text>
      `}
    </g>
  `;
}

function GraphNode({ node, onClick }) {
  const hasBinaries = (node.model.relations?.binaries || []).length > 0;
  const fontSize = Math.max(8, Math.min(11, node.w / 14));
  // Truncate name if too long for node width
  const maxChars = Math.floor(node.w / (fontSize * 0.6));
  const displayName = node.shortName.length > maxChars ? node.shortName.slice(0, maxChars - 1) + "\u2026" : node.shortName;

  return html`
    <g onClick=${() => onClick(node.id)} style="cursor:pointer">
      <rect x=${node.x} y=${node.y} width=${node.w} height=${node.h} rx="4"
        fill=${node.isSelected ? "#1a2744" : COLORS.node}
        stroke=${node.isSelected ? COLORS.selected : COLORS.nodeBorder}
        stroke-width=${node.isSelected ? "2" : "1"} />
      <text x=${node.x + node.w / 2} y=${node.y + node.h / 2 + fontSize * 0.35}
        text-anchor="middle" fill=${node.isSelected ? COLORS.selected : COLORS.nodeText}
        font-size=${fontSize} font-weight=${node.isSelected ? "600" : "400"}
        font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">
        ${displayName}
      </text>
      ${hasBinaries && html`
        <circle cx=${node.x + node.w - 6} cy=${node.y + 6} r="3.5"
          fill=${COLORS.binary} opacity="0.8" />
      `}
    </g>
  `;
}

export function ModelGraph({ models, selectedId, onSelect }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 500 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graph = useMemo(() => buildGraph(models, selectedId, size.w), [models, selectedId, size.w]);

  const legend = [
    { color: COLORS.inheritance, label: "Extends", dashed: true },
    { color: COLORS.parent, label: "Parent" },
    { color: COLORS.link, label: "Link" },
    { color: COLORS.query, label: "Query" },
    { color: COLORS.map, label: "Map" },
    { color: COLORS.binary, label: "Binary", circle: true }
  ];

  return html`
    <div style="display:flex;flex-direction:column;height:100%">
      <div style="display:flex;gap:1rem;margin-bottom:0.5rem;flex-wrap:wrap;align-items:center;flex-shrink:0">
        ${legend.map(l => html`
          <div key=${l.label} style="display:flex;align-items:center;gap:0.3rem;font-size:0.7rem;color:var(--text-muted)">
            ${l.circle
              ? html`<span style="width:8px;height:8px;border-radius:50%;background:${l.color};display:inline-block"></span>`
              : html`<span style="width:16px;height:0;border-top:2px ${l.dashed ? "dashed" : "solid"} ${l.color};display:inline-block"></span>`
            }
            ${l.label}
          </div>
        `)}
      </div>
      <div ref=${containerRef} style="flex:1;overflow:auto;border:1px solid var(--border);border-radius:4px;background:var(--bg);min-height:200px">
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
