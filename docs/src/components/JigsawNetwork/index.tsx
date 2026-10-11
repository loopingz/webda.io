import React, { useEffect, useRef } from "react";
import clsx from "clsx";
import { JIGSAW_PATH } from "../WebdaJigsaw";
import { DOMAINS, type DomainKey } from "../webdaDomains";
import styles from "./styles.module.css";

/** Pieces are 20 to 30px wide */
const MIN_SIZE = 20;
const SIZE_RANGE = 10;
/** One piece per this many px², clamped to [MIN_COUNT, MAX_COUNT] */
const AREA_PER_PIECE = 26000;
const MIN_COUNT = 10;
const MAX_COUNT = 28;
/** Pieces closer than this are linked */
const LINK_DISTANCE = 220;

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  size: number;
  domain: DomainKey;
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
  return Math.round(Math.max(MIN_COUNT, Math.min(MAX_COUNT, (width * height) / AREA_PER_PIECE)));
}

/**
 * Background of Webda jigsaw pieces in the four domain colours that drift,
 * link up when close and lean toward the pointer.
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
  // The animation loop reads these through refs so prop changes never restart it
  const activeRef = useRef(active);
  const darkRef = useRef(false);
  activeRef.current = active;
  // Still frame redraw, used when the loop is not running (reduced motion)
  const redrawRef = useRef<() => void>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const piecePath = new Path2D(JIGSAW_PATH);
    const rgb = Object.fromEntries(DOMAINS.map(d => [d.key, d.rgb])) as Record<
      DomainKey,
      { light: string; dark: string }
    >;
    const pointer = { x: -1e4, y: -1e4 };
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
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      pieces = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.004,
        size: MIN_SIZE + Math.random() * SIZE_RANGE,
        domain: DOMAINS[i % DOMAINS.length].key
      }));
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
      for (let i = 0; i < pieces.length; i++) {
        const a = pieces[i];
        if (!reduce) move(a);
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
        const lit = focus !== null && p.domain === focus;
        const on = focus === null || lit;
        ctx.fillStyle = `rgba(${color(p)}, ${on ? (dark ? 0.92 : 0.85) : dark ? 0.45 : 0.4})`;
        ctx.shadowColor = `rgba(${color(p)}, ${dark ? 0.9 : 0.5})`;
        ctx.shadowBlur = lit ? (dark ? 18 : 10) : 0;
        const scale = (p.size * (lit ? 1.12 : 1)) / 256;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.scale(scale, scale);
        ctx.translate(-128, -128);
        ctx.fill(piecePath);
        ctx.restore();
      }
      ctx.shadowBlur = 0;
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
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
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
    document.addEventListener("visibilitychange", start);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      themeObserver.disconnect();
      sizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", start);
    };
  }, [keepOut]);

  useEffect(() => {
    redrawRef.current?.();
  }, [active]);

  return <canvas ref={canvasRef} aria-hidden="true" className={clsx(styles.network, styles[variant], className)} />;
}
