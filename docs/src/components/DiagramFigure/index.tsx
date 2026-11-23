import React, { useId, useRef, useState } from "react";
import useBaseUrl from "@docusaurus/useBaseUrl";
import styles from "./styles.module.css";

type Props = {
  src: string;
  width: number;
  height: number;
  label: string;
  alt: string;
  children: React.ReactNode;
};

/** Responsive artwork with a keyboard-accessible, zoomable native dialog. */
export default function DiagramFigure({ src, width, height, label, alt, children }: Props) {
  const source = useBaseUrl(src);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [zoom, setZoom] = useState(1);
  const open = () => {
    setZoom(1);
    dialog.current?.showModal();
  };
  return (
    <figure className={styles.figure}>
      <button
        className={styles.viewport}
        type="button"
        onClick={open}
        aria-label={`Enlarge ${label}`}
        aria-haspopup="dialog"
      >
        <img className={styles.diagram} src={source} width={width} height={height} alt={alt} />
        <span className={styles.enlarge}>⤢ Enlarge diagram</span>
      </button>
      <figcaption className={styles.caption}>
        {children} <a href={source}>Open full-size diagram</a>.
      </figcaption>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId}>
        <div className={styles.toolbar}>
          <strong id={titleId}>{label}</strong>
          <div className={styles.controls}>
            <button
              type="button"
              onClick={() => setZoom(z => Math.max(1, z - 0.5))}
              disabled={zoom === 1}
              aria-label="Zoom out"
            >
              −
            </button>
            <button type="button" onClick={() => setZoom(1)}>
              Fit width
            </button>
            <button
              type="button"
              onClick={() => setZoom(z => Math.min(4, z + 0.5))}
              disabled={zoom === 4}
              aria-label="Zoom in"
            >
              +
            </button>
            <button type="button" onClick={() => dialog.current?.close()} autoFocus>
              Close
            </button>
          </div>
        </div>
        <p className={styles.help}>Zoom in for details, then scroll or swipe to explore. Press Escape to close.</p>
        <div className={styles.canvas} tabIndex={0} role="region" aria-label="Zoomed diagram, scroll to explore">
          <img
            className={styles.diagram}
            style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
            src={source}
            width={width}
            height={height}
            alt={alt}
          />
        </div>
        <span className={styles.zoomStatus} role="status">
          Zoom {Math.round(zoom * 100)}%
        </span>
      </dialog>
    </figure>
  );
}
