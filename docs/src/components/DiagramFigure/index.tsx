import React from "react";
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

/** Theme-aware SVG artwork that scales proportionally to its container. */
export default function DiagramFigure({ src, width, height, label, alt, children }: Props) {
  const source = useBaseUrl(src);
  return (
    <figure className={styles.figure}>
      <div className={styles.viewport} role="group" aria-label={label}>
        <img className={styles.diagram} src={source} width={width} height={height} alt={alt} />
      </div>
      <figcaption className={styles.caption}>
        {children} <a href={source}>Open full-size diagram</a>.
      </figcaption>
    </figure>
  );
}
