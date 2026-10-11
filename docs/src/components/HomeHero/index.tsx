import React, { useRef, useState } from "react";
import Link from "@docusaurus/Link";
import AssemblingLogo from "../AssemblingLogo";
import DomainCard from "../DomainCard";
import JigsawNetwork from "../JigsawNetwork";
import type { DomainKey } from "../webdaDomains";
import styles from "./styles.module.css";

/**
 * Homepage hero: the pitch on the left; on the right the logo assembles, then
 * the domain card walks through Models, Services, Deployments and Integrations
 * while the matching logo piece and network pieces light up.
 *
 * @returns the hero section
 */
export default function HomeHero(): React.JSX.Element {
  const logoRef = useRef<HTMLDivElement>(null);
  const [assembled, setAssembled] = useState(false);
  const [active, setActive] = useState<DomainKey>("models");

  return (
    <header className={styles.hero}>
      <JigsawNetwork keepOut={logoRef} active={assembled ? active : null} />
      <div className={styles.inner}>
        <div className={styles.pitch}>
          <span className={styles.eyebrow}>
            <b>v4</b> Domain-driven TypeScript framework
          </span>
          <h1 className={styles.title}>
            Every piece
            <br />
            <span className={styles.gradient}>fits together.</span>
          </h1>
          <p className={styles.lede}>
            Models, services, deployments and integrations are separate pieces that Webda wires together through
            dependency injection. You write the model and get REST, GraphQL and CLI access, then deploy to Lambda,
            Kubernetes or Docker.
          </p>
          <div className={styles.actions}>
            <Link className="button button--primary button--lg" to="/docs/QuickStart">
              Quick Start
            </Link>
            <Link className="button button--secondary button--outline button--lg" to="/docs/Concepts">
              Concepts
            </Link>
          </div>
        </div>
        <div className={styles.showcase}>
          <div className={styles.halo} aria-hidden="true" />
          <AssemblingLogo ref={logoRef} active={assembled ? active : null} onAssembled={() => setAssembled(true)} />
          <DomainCard active={active} onActiveChange={setActive} rotate={assembled} />
        </div>
      </div>
    </header>
  );
}
