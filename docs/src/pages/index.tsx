import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import React from "react";
import Panel from "@site/src/components/Panel";
import WebdaPanel from "../components/WebdaPanel";

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header>
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
      </div>
    </header>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`Hello from ${siteConfig.title}`}
      description="NodeJS framework with GraphQL, REST, AWS, GCP, Kubernetes"
    >
      <HomepageHeader />
      <div className="container">
        <WebdaPanel>This is my service description</WebdaPanel>
      </div>
    </Layout>
  );
  /*
  Add a combo box to select the cloud provider
  Add some code typing example of models in left panel <-> right panel display GraphQL or REST API
  */
}
