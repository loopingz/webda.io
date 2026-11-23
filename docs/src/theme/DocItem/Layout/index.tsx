import React from "react";
import Layout from "@theme-original/DocItem/Layout";
import type LayoutType from "@theme/DocItem/Layout";
import type { WrapperProps } from "@docusaurus/types";
import styles from "./styles.module.css";

type Props = WrapperProps<typeof LayoutType>;

/** A quiet reading surface; decorative networks remain on the landing pages. */
export default function LayoutWrapper(props: Props): React.JSX.Element {
  return (
    <div className={styles.wrapper}>
      <Layout {...props} />
    </div>
  );
}
