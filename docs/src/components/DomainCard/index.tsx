import React, { useEffect, useState } from "react";
import clsx from "clsx";
import Link from "@docusaurus/Link";
import { JIGSAW_PATH } from "../WebdaJigsaw";
import { DOMAINS, type DomainKey } from "../webdaDomains";
import styles from "./styles.module.css";

/** Time each domain stays on screen while rotating */
export const ROTATION_MS = 8000;

interface DomainCardProps {
  active: DomainKey;
  onActiveChange: (key: DomainKey) => void;
  /** Rotate through the domains; false until the logo has assembled */
  rotate: boolean;
  className?: string;
}

/**
 * One card describing a single Webda domain, with a tab per domain.
 *
 * It rotates every ROTATION_MS, pauses while the pointer is over it, and stops
 * rotating once the reader picks a tab.
 *
 * @param props - see DomainCardProps
 * @returns the card
 */
export default function DomainCard({ active, onActiveChange, rotate, className }: DomainCardProps): React.JSX.Element {
  const [picked, setPicked] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [reduce, setReduce] = useState(false);
  // Bumped to restart the progress bar
  const [cycle, setCycle] = useState(0);
  const running = rotate && !picked && !hovering && !reduce;
  const domain = DOMAINS.find(d => d.key === active) ?? DOMAINS[0];

  useEffect(() => {
    setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => {
      const index = DOMAINS.findIndex(d => d.key === active);
      onActiveChange(DOMAINS[(index + 1) % DOMAINS.length].key);
    }, ROTATION_MS);
    return () => clearTimeout(timer);
  }, [running, active, cycle, onActiveChange]);

  const pick = function pick(key: DomainKey) {
    setPicked(true);
    onActiveChange(key);
  };
  const onKeyDown = function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const index = DOMAINS.findIndex(d => d.key === active);
    const next = DOMAINS[(index + (e.key === "ArrowRight" ? 1 : DOMAINS.length - 1)) % DOMAINS.length].key;
    pick(next);
    document.getElementById(`domain-tab-${next}`)?.focus();
  };

  return (
    <div
      className={clsx(styles.card, className)}
      style={{ "--rotation": `${ROTATION_MS}ms` } as React.CSSProperties}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => {
        setHovering(false);
        setCycle(c => c + 1);
      }}
    >
      <div className={styles.tabs} role="tablist" aria-label="Webda domains">
        {DOMAINS.map(d => (
          <button
            key={d.key}
            id={`domain-tab-${d.key}`}
            type="button"
            role="tab"
            aria-selected={d.key === active}
            aria-controls="domain-panel"
            tabIndex={d.key === active ? 0 : -1}
            className={styles.tab}
            style={{ "--domain-color": d.color } as React.CSSProperties}
            onClick={() => pick(d.key)}
            onKeyDown={onKeyDown}
          >
            <i aria-hidden="true" />
            {d.tab}
            <span
              key={`${active}-${cycle}`}
              aria-hidden="true"
              className={clsx(styles.progress, running && styles.running)}
            />
          </button>
        ))}
      </div>
      <div
        key={active}
        id="domain-panel"
        role="tabpanel"
        aria-labelledby={`domain-tab-${active}`}
        className={styles.panel}
        style={{ "--domain-color": domain.color } as React.CSSProperties}
      >
        <h3>
          <svg viewBox="0 0 256 256" aria-hidden="true">
            <path d={JIGSAW_PATH} fill={domain.color} />
          </svg>
          {domain.title}
        </h3>
        <p>{domain.text}</p>
        <div className={styles.tags}>
          {domain.tags.map(tag => (
            <code key={tag}>{tag}</code>
          ))}
        </div>
        <Link to={domain.link.to} className={clsx(styles.more, styles[domain.key])}>
          {domain.link.label} →
        </Link>
      </div>
    </div>
  );
}
