import React, { useCallback, useState } from "react";
import Layout from "@theme/Layout";
import styles from "./versioning-demo.module.css";

type Obj = { title: string; body: string; tags: string[] };

const DEFAULT_BASE: Obj = {
  title: "draft",
  body: "line 1\nline 2\nline 3\n",
  tags: ["draft"]
};

export default function VersioningDemoPage(): React.JSX.Element {
  const [base, setBase] = useState<Obj>(DEFAULT_BASE);

  const onReset = useCallback(() => {
    // No-op placeholder — Task 5 wires in real reset semantics.
  }, []);

  const onReseed = useCallback(() => {
    setBase({
      title: "draft",
      body: "line 1\nline 2\nline 3\n",
      tags: ["draft"]
    });
  }, []);

  return (
    <Layout
      title="@webda/versioning demo"
      description="Interactive two-user patch/merge demo for @webda/versioning"
    >
      <div className={styles.page}>
        <header className={styles.header}>
          <h1>@webda/versioning demo</h1>
          <div className={styles.headerActions}>
            <button className={styles.btn} onClick={onReset} disabled>
              Reset
            </button>
            <button className={styles.btn} onClick={onReseed}>
              Re-seed base
            </button>
          </div>
        </header>

        <div className={styles.layout}>
          <section className={styles.panel}>
            <h2>Edit</h2>
            <pre className={styles.yaml}>{JSON.stringify(base, null, 2)}</pre>
          </section>

          <section className={styles.panel}>
            <h2>Patches</h2>
            <p>Nothing committed yet.</p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
