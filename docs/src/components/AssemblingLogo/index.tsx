import React, { forwardRef, useEffect, useState } from "react";
import clsx from "clsx";
import { DOMAINS, type DomainKey } from "../webdaDomains";
import { LOGO_CLOUD, LOGO_FRAME, LOGO_PIECES, type LogoPath } from "./logoLayers";
import styles from "./styles.module.css";

/** Time for the last piece to land, see the slide-in delays in styles.module.css */
export const ASSEMBLY_MS = 1900;
/** Duration of the shrink and of the grow when the active piece changes */
const SWAP_MS = 300;
/** Stacking order of the pieces before any is raised */
const ORDER: DomainKey[] = ["models", "deployments", "services", "integrations"];

interface AssemblingLogoProps {
  /** Piece to enlarge, once the logo is assembled */
  active?: DomainKey | null;
  /** Called once all the pieces have landed */
  onAssembled?: () => void;
  /** Makes the pieces buttons, once assembled: called with the clicked piece's domain */
  onPick?: (key: DomainKey) => void;
  className?: string;
}

/**
 * Render a list of logo paths.
 *
 * @param paths - layer paths
 * @returns the SVG paths
 */
function Paths({ paths }: { paths: LogoPath[] }): React.JSX.Element {
  return (
    <>
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill} opacity={p.opacity} transform={p.transform} />
      ))}
    </>
  );
}

/**
 * The Webda logo, with its four pieces sliding in underneath the cloud on
 * first render. Afterwards the `active` piece is enlarged: the previous one
 * shrinks back first, then the new one is raised above its neighbours and grows.
 * With `onPick`, each piece is then also a button that grows a little on hover.
 *
 * @param props - see AssemblingLogoProps
 * @returns the logo
 */
const AssemblingLogo = forwardRef<HTMLDivElement, AssemblingLogoProps>(function AssemblingLogo(
  { active = null, onAssembled, onPick, className },
  ref
) {
  const [assembling, setAssembling] = useState(true);
  // `shown` is the enlarged piece, `top` the piece drawn last (highest)
  const [shown, setShown] = useState<DomainKey | null>(null);
  const [top, setTop] = useState<DomainKey | null>(null);
  // Hovered piece, kept in state rather than :hover, which the browser drops when
  // raising a piece moves its node, so a clicked piece grows on from its hover size
  const [hovered, setHovered] = useState<DomainKey | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(
      () => {
        setAssembling(false);
        onAssembled?.();
      },
      reduce ? 0 : ASSEMBLY_MS
    );
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (assembling) return;
    // Shrink the current piece first. Re-ordering moves a DOM node, which
    // cancels its transition, so the next piece is raised only while at rest.
    setShown(null);
    const raise = setTimeout(() => setTop(active), shown ? SWAP_MS : 0);
    return () => clearTimeout(raise);
  }, [active, assembling]);

  useEffect(() => {
    if (top === null || top !== active) return;
    const frame = requestAnimationFrame(() => setShown(top));
    return () => cancelAnimationFrame(frame);
  }, [top, active]);

  const order = top ? [...ORDER.filter(k => k !== top), top] : ORDER;
  const interactive = !assembling && onPick !== undefined;
  return (
    <div
      ref={ref}
      className={clsx(
        styles.logo,
        assembling && styles.assembling,
        active && styles.focused,
        interactive && styles.interactive,
        className
      )}
    >
      <svg viewBox="0 0 256 256" role="img" aria-label="Webda logo">
        <g className={styles.frame}>
          <Paths paths={LOGO_FRAME} />
        </g>
        {order.map(key => (
          <g
            key={key}
            className={clsx(styles.slot, styles[key])}
            {...(interactive && {
              role: "button",
              tabIndex: 0,
              "aria-label": `Show ${DOMAINS.find(d => d.key === key)?.title}`,
              "aria-pressed": active === key,
              onPointerEnter: () => setHovered(key),
              onPointerLeave: () => setHovered(h => (h === key ? null : h)),
              onClick: () => onPick(key),
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                onPick(key);
              }
            })}
          >
            <g
              className={clsx(
                styles.piece,
                shown === key && styles.enlarged,
                interactive && hovered === key && styles.hovered
              )}
            >
              <Paths paths={LOGO_PIECES[key]} />
            </g>
          </g>
        ))}
        <path
          className={styles.cloud}
          d={LOGO_CLOUD.d}
          fill={LOGO_CLOUD.fill}
          stroke={LOGO_CLOUD.stroke}
          strokeWidth={LOGO_CLOUD.strokeWidth}
        />
      </svg>
    </div>
  );
});

export default AssemblingLogo;
