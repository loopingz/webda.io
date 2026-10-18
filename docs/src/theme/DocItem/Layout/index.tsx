/**
 * Swizzled DocItem/Layout (wrap mode): adds a faint jigsaw network band behind
 * the title of every docs page, fading out before the content.
 */
import React from "react";
import Layout from "@theme-original/DocItem/Layout";
import type LayoutType from "@theme/DocItem/Layout";
import type { WrapperProps } from "@docusaurus/types";
import JigsawNetwork from "@site/src/components/JigsawNetwork";
import styles from "./styles.module.css";

type Props = WrapperProps<typeof LayoutType>;

/**
 * Docs page layout with the network band.
 *
 * @param props - original layout props
 * @returns the wrapped layout
 */
export default function LayoutWrapper(props: Props): React.JSX.Element {
  return (
    <div className={styles.wrapper}>
      <JigsawNetwork variant="band" className={styles.band} />
      <Layout {...props} />
    </div>
  );
}
