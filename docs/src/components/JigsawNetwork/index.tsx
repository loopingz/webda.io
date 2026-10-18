import React, { useEffect, useRef } from "react";
import clsx from "clsx";
import { LOGO_CLOUD, LOGO_FRAME, LOGO_PIECES, type LogoPath } from "../AssemblingLogo/logoLayers";
import { DOMAINS, type DomainKey } from "../webdaDomains";
import styles from "./styles.module.css";

/** Scale of the 256px logo box: an assembled group is about 61px wide, each piece about 30px */
const SCALE = 0.24;
/** One piece per this many px², clamped to [MIN_COUNT, MAX_COUNT], rounded to whole groups of four */
const AREA_PER_PIECE = 26000;
const MIN_COUNT = 12;
const MAX_COUNT = 28;
/** Pieces closer than this are linked */
const LINK_DISTANCE = 220;
/** Top speed of a gathering piece, in px per frame: a slow glide, a few times the drift speed */
const GATHER_SPEED = 1.2;
/** Pieces farther away may glide faster, up to this many px per frame, so the four arrive close together */
const MAX_GATHER_SPEED = 2.5;
/** Share of the gap between its current and wanted velocity a gathering piece closes each frame */
const STEER = 0.16;
/** How long the mouse must rest before a group gathers under it, in ms */
const REST_MS = 500;
/** Pointer moves smaller than this, in px, still count as resting */
const JITTER = 3;
/** Share of the full colour the interlocked logo fades in by each frame */
const FADE = 0.08;
/** Centre of each piece's quadrant in the 256px logo box */
const HOME: Record<DomainKey, { x: number; y: number }> = {
  models: { x: 64, y: 64 },
  deployments: { x: 192, y: 64 },
  services: { x: 64, y: 192 },
  integrations: { x: 192, y: 192 }
};

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  domain: DomainKey;
  /** Index of the logo this piece belongs to; each group has one piece per domain */
  group: number;
}

/**
 * CSS cursor showing the logo cloud, sized to sit on an assembled group with
 * its hotspot at the logo centre.
 *
 * @returns the cursor declaration
 */
function cloudCursor(): string {
  // Bounds of LOGO_CLOUD in the 256px box, with room for the stroke
  const box = { x: 44, y: 70, w: 166, h: 120 };
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(box.w * SCALE)}" height="${Math.round(box.h * SCALE)}"` +
    ` viewBox="${box.x} ${box.y} ${box.w} ${box.h}"><path d="${LOGO_CLOUD.d}" fill="${LOGO_CLOUD.fill}"` +
    ` stroke="${LOGO_CLOUD.stroke}" stroke-width="5"/></svg>`;
  const hotX = Math.round((128 - box.x) * SCALE);
  const hotY = Math.round((128 - box.y) * SCALE);
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotX} ${hotY}, auto`;
}

/**
 * Path2D of a logo layer, with its SVG `translate(x y) rotate(deg)` transform applied.
 *
 * @param layer - logo layer
 * @returns the path in the 256px logo box
 */
function layerPath(layer: LogoPath): Path2D {
  const path = new Path2D(layer.d);
  if (!layer.transform) return path;
  const [x, y, deg] = layer.transform.match(/-?[\d.]+/g)!.map(Number);
  const placed = new Path2D();
  placed.addPath(path, new DOMMatrix().translate(x, y).rotate(deg));
  return placed;
}

/**
 * Whether visible text overlaps a rectangle of the viewport. Elements whose box
 * misses the rectangle are skipped along with their content.
 *
 * @param box - rectangle in viewport coordinates
 * @returns true when some text is drawn inside it
 */
export function textUnder(box: { left: number; top: number; right: number; bottom: number }): boolean {
  const hits = (r: DOMRect) =>
    r.width > 0 && r.height > 0 && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
      const el = node as Element;
      const r = el.getBoundingClientRect();
      // `display: contents` elements have no box of their own, but their children do
      const boxless = r.width === 0 && r.height === 0 && getComputedStyle(el).display === "contents";
      return hits(r) || boxless ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_REJECT;
    }
  });
  const range = document.createRange();
  while (walker.nextNode()) {
    const text = walker.currentNode;
    if (text.parentElement?.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) === false) continue;
    range.selectNodeContents(text);
    for (const r of Array.from(range.getClientRects())) {
      if (hits(r)) return true;
    }
  }
  return false;
}

/**
 * Smallest signed rotation that brings an angle back to zero.
 *
 * @param angle - angle in radians
 * @returns the equivalent angle in [-π, π]
 */
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

interface JigsawNetworkProps {
  /** `hero` fills its container; `band` is a header strip that fades out at the bottom */
  variant?: "hero" | "band";
  /** Domain whose pieces glow and link more strongly */
  active?: DomainKey | null;
  /** Element the pieces drift away from, such as the logo */
  keepOut?: React.RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * Number of pieces for a canvas of the given size.
 *
 * @param width - canvas width in px
 * @param height - canvas height in px
 * @returns piece count
 */
export function pieceCount(width: number, height: number): number {
  const count = Math.max(MIN_COUNT, Math.min(MAX_COUNT, (width * height) / AREA_PER_PIECE));
  return Math.round(count / DOMAINS.length) * DOMAINS.length;
}

/**
 * Background of Webda jigsaw pieces in the four domain colours that drift,
 * link up when close and lean toward the pointer.
 *
 * The pieces come in groups of four, one per logo piece. When the mouse rests
 * over the canvas, away from any text, the nearest group flies under it and interlocks into the logo,
 * and the cursor turns into the logo cloud to complete it. The group scatters
 * again, and the cursor comes back, as soon as the mouse moves.
 *
 * The loop pauses while the canvas is off-screen or the tab is hidden, and
 * draws a single still frame when the reader prefers reduced motion.
 *
 * @param props - see JigsawNetworkProps
 * @returns the canvas
 */
export default function JigsawNetwork({
  variant = "hero",
  active = null,
  keepOut,
  className
}: JigsawNetworkProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Full-opacity layer for the interlocked logo, above the faint network
  const logoRef = useRef<HTMLCanvasElement>(null);
  // The animation loop reads these through refs so prop changes never restart it
  const activeRef = useRef(active);
  const darkRef = useRef(false);
  activeRef.current = active;
  // Still frame redraw, used when the loop is not running (reduced motion)
  const redrawRef = useRef<() => void>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const logo = logoRef.current;
    const lctx = logo?.getContext("2d");
    if (!canvas || !ctx || !logo || !lctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paths = Object.fromEntries(
      DOMAINS.map(d => [d.key, new Path2D(LOGO_PIECES[d.key].map(p => p.d).join(""))])
    ) as Record<DomainKey, Path2D>;
    // The interlocked logo is drawn like the hero one: faint squares, then the pieces in their own colours
    const frame = LOGO_FRAME.map(layer => ({ path: layerPath(layer), fill: layer.fill, opacity: layer.opacity ?? 1 }));
    const logoPieces = Object.fromEntries(
      DOMAINS.map(d => [d.key, LOGO_PIECES[d.key].map(layer => ({ path: layerPath(layer), fill: layer.fill }))])
    ) as Record<DomainKey, { path: Path2D; fill: string }[]>;
    const cursor = cloudCursor();
    const host = canvas.parentElement;
    const rgb = Object.fromEntries(DOMAINS.map(d => [d.key, d.rgb])) as Record<
      DomainKey,
      { light: string; dark: string }
    >;
    // Pointer in viewport coordinates, `mouse` when it can gather a group
    const client = { x: -1e4, y: -1e4, mouse: false };
    const pointer = { x: -1e4, y: -1e4 };
    // Where and since when the pointer has been resting, relative to the canvas
    const rest = { x: -1e4, y: -1e4, since: 0 };
    // Text lies under the resting point, so no group gathers there
    let blocked = false;
    // Group gathering under the mouse, and whether it has interlocked
    let captured: number | null = null;
    let assembled = false;
    // How far the interlocked logo has faded in to full colour, 0 to 1
    let glow = 0;
    let pieces: Piece[] = [];
    let width = 0;
    let height = 0;
    let avoid: { x: number; y: number; r: number } | null = null;
    let frameId = 0;
    let visible = true;

    const resize = function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      for (const [el, context] of [
        [canvas, ctx],
        [logo, lctx]
      ] as const) {
        el.width = Math.round(width * dpr);
        el.height = Math.round(height * dpr);
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      const box = keepOut?.current?.getBoundingClientRect();
      const own = canvas.getBoundingClientRect();
      avoid = box?.width
        ? {
            x: box.left - own.left + box.width / 2,
            y: box.top - own.top + box.height / 2,
            r: Math.max(box.width, box.height) / 2
          }
        : null;
      const count = pieceCount(width, height);
      if (pieces.length === count) return;
      release();
      pieces = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.004,
        domain: DOMAINS[i % DOMAINS.length].key,
        group: Math.floor(i / DOMAINS.length)
      }));
    };

    const setAssembled = function setAssembled(value: boolean) {
      if (assembled === value) return;
      assembled = value;
      if (host) host.style.cursor = value ? cursor : "";
    };

    /** Scatter the captured group back into the network */
    const release = function release() {
      if (captured === null) return;
      for (const p of pieces) {
        if (p.group !== captured) continue;
        const angle = Math.random() * Math.PI * 2;
        p.vx = Math.cos(angle) * 0.4;
        p.vy = Math.sin(angle) * 0.4;
        p.spin = (Math.random() - 0.5) * 0.004;
      }
      captured = null;
      setAssembled(false);
    };

    /**
     * Capture the group closest to the mouse once it rests over the canvas, and
     * release it as soon as the mouse moves again (scrolling counts as moving).
     */
    const track = function track() {
      const r = canvas.getBoundingClientRect();
      const now = performance.now();
      pointer.x = client.x - r.left;
      pointer.y = client.y - r.top;
      if (Math.abs(pointer.x - rest.x) > JITTER || Math.abs(pointer.y - rest.y) > JITTER) {
        rest.x = pointer.x;
        rest.y = pointer.y;
        rest.since = now;
        blocked = false;
        release();
        return;
      }
      const inside = client.mouse && pointer.x >= 0 && pointer.y >= 0 && pointer.x <= width && pointer.y <= height;
      if (!inside) {
        release();
        return;
      }
      if (captured !== null || now - rest.since < REST_MS || blocked) return;
      // Never cover text with the logo; wait for the mouse to move somewhere else
      const half = 128 * SCALE;
      if (textUnder({ left: client.x - half, top: client.y - half, right: client.x + half, bottom: client.y + half })) {
        blocked = true;
        return;
      }
      // The group whose farthest piece is closest arrives soonest
      const reach: number[] = [];
      for (const p of pieces) {
        reach[p.group] = Math.max(reach[p.group] ?? 0, (p.x - pointer.x) ** 2 + (p.y - pointer.y) ** 2);
      }
      captured = reach.indexOf(Math.min(...reach));
    };

    /**
     * Pull a captured piece toward its slot in the logo under the mouse.
     *
     * @param p - piece of the captured group
     * @returns whether the piece is in its slot
     */
    const gather = function gather(p: Piece): boolean {
      const tx = rest.x + (HOME[p.domain].x - 128) * SCALE;
      const ty = rest.y + (HOME[p.domain].y - 128) * SCALE;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const turn = wrapAngle(p.angle);
      if (assembled || (dist < 1 && Math.abs(turn) < 0.02)) {
        p.x = tx;
        p.y = ty;
        p.angle = 0;
        p.vx = 0;
        p.vy = 0;
        return true;
      }
      // Ease out of the drift toward the slot, slowing down on arrival without overshooting
      const speed = Math.min(Math.max(GATHER_SPEED, Math.min(MAX_GATHER_SPEED, dist / 150)), dist * 0.04);
      p.vx += ((dist ? (dx / dist) * speed : 0) - p.vx) * STEER;
      p.vy += ((dist ? (dy / dist) * speed : 0) - p.vy) * STEER;
      p.x += p.vx;
      p.y += p.vy;
      // Turn upright gradually, over about two seconds
      p.angle = turn * 0.95;
      return false;
    };

    const move = function move(p: Piece) {
      const dx = pointer.x - p.x;
      const dy = pointer.y - p.y;
      if (dx * dx + dy * dy < 60000) {
        p.vx += dx * 0.00003;
        p.vy += dy * 0.00003;
      }
      if (avoid) {
        const ax = p.x - avoid.x;
        const ay = p.y - avoid.y;
        const dist = Math.sqrt(ax * ax + ay * ay) || 1;
        if (dist < avoid.r * 1.3) {
          p.vx += (ax / dist) * 0.025;
          p.vy += (ay / dist) * 0.025;
        }
      }
      p.vx *= 0.994;
      p.vy *= 0.994;
      // keep a minimum drift so the network never freezes
      if (Math.abs(p.vx) + Math.abs(p.vy) < 0.12) {
        p.vx *= 1.05;
        p.vy *= 1.05;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      if (p.x < -40) p.x = width + 40;
      else if (p.x > width + 40) p.x = -40;
      if (p.y < -40) p.y = height + 40;
      else if (p.y > height + 40) p.y = -40;
    };

    const draw = function draw() {
      const dark = darkRef.current;
      const focus = activeRef.current;
      const color = (p: Piece) => (dark ? rgb[p.domain].dark : rgb[p.domain].light);
      const max2 = LINK_DISTANCE * LINK_DISTANCE;
      ctx.clearRect(0, 0, width, height);
      if (!reduce) {
        track();
        let inPlace = captured !== null;
        for (const p of pieces) {
          if (p.group === captured) inPlace = gather(p) && inPlace;
          else move(p);
        }
        setAssembled(inPlace);
      }
      for (let i = 0; i < pieces.length; i++) {
        const a = pieces[i];
        for (let j = i + 1; j < pieces.length; j++) {
          const b = pieces[j];
          const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
          if (d2 >= max2) continue;
          const hot = focus && a.domain === focus && b.domain === focus;
          const alpha = (1 - d2 / max2) * (hot ? (dark ? 0.7 : 0.55) : dark ? 0.32 : 0.22);
          const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          gradient.addColorStop(0, `rgba(${color(a)}, ${alpha})`);
          gradient.addColorStop(1, `rgba(${color(b)}, ${alpha})`);
          ctx.strokeStyle = gradient;
          ctx.lineWidth = hot ? 1.6 : 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      for (const p of pieces) {
        const held = p.group === captured;
        const lit = held || (focus !== null && p.domain === focus);
        const on = focus === null || lit;
        ctx.fillStyle = `rgba(${color(p)}, ${held ? 1 : on ? (dark ? 0.92 : 0.85) : dark ? 0.45 : 0.4})`;
        ctx.shadowColor = `rgba(${color(p)}, ${dark ? 0.9 : 0.5})`;
        ctx.shadowBlur = lit ? (dark ? 18 : 10) : 0;
        // An interlocked group keeps its real size so the pieces fit together
        const scale = SCALE * (lit && !(held && assembled) ? 1.12 : 1);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.scale(scale, scale);
        ctx.translate(-HOME[p.domain].x, -HOME[p.domain].y);
        ctx.fill(paths[p.domain]);
        ctx.restore();
      }
      ctx.shadowBlur = 0;
      drawLogo(dark);
    };

    /**
     * Fade the interlocked group in, at full opacity and in the logo colours, on its own layer.
     *
     * @param dark - whether the dark theme is on
     */
    const drawLogo = function drawLogo(dark: boolean) {
      glow = assembled ? Math.min(1, glow + FADE) : 0;
      lctx.clearRect(0, 0, width, height);
      if (!glow) return;
      lctx.save();
      lctx.globalAlpha = glow;
      lctx.translate(rest.x - 128 * SCALE, rest.y - 128 * SCALE);
      lctx.scale(SCALE, SCALE);
      for (const layer of frame) {
        lctx.globalAlpha = glow * layer.opacity * (dark ? 0.28 : 0.5);
        lctx.fillStyle = layer.fill;
        lctx.fill(layer.path);
      }
      lctx.globalAlpha = glow;
      for (const d of DOMAINS) {
        for (const layer of logoPieces[d.key]) {
          lctx.fillStyle = layer.fill;
          lctx.fill(layer.path);
        }
      }
      lctx.restore();
    };

    redrawRef.current = reduce ? draw : undefined;
    // Follow the site's colour mode, which Docusaurus sets as data-theme on <html>
    const root = document.documentElement;
    const readTheme = function readTheme() {
      darkRef.current = root.dataset.theme === "dark";
      redrawRef.current?.();
    };
    const themeObserver = new MutationObserver(readTheme);
    readTheme();
    const loop = function loop() {
      draw();
      frameId = requestAnimationFrame(loop);
    };
    const start = function start() {
      cancelAnimationFrame(frameId);
      if (reduce) draw();
      else if (visible && !document.hidden) loop();
    };

    const onPointerMove = function onPointerMove(e: PointerEvent) {
      client.x = e.clientX;
      client.y = e.clientY;
      client.mouse = e.pointerType === "mouse";
    };
    const onPointerLeave = function onPointerLeave() {
      client.x = client.y = -1e4;
    };
    const onResize = function onResize() {
      resize();
      if (reduce) draw();
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      start();
    });
    const sizeObserver = new ResizeObserver(onResize);

    resize();
    start();
    observer.observe(canvas);
    themeObserver.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    sizeObserver.observe(canvas);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    root.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", start);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      themeObserver.disconnect();
      sizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", start);
      if (host) host.style.cursor = "";
    };
  }, [keepOut]);

  useEffect(() => {
    redrawRef.current?.();
  }, [active]);

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className={clsx(styles.network, styles[variant], className)} />
      <canvas
        ref={logoRef}
        aria-hidden="true"
        className={clsx(styles.network, variant === "band" && styles.bandArea, className)}
      />
    </>
  );
}
