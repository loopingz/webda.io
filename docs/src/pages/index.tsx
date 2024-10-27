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
        <h1 className="hero__subtitle">{siteConfig.tagline}</h1>
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
      <div style={{ paddingTop: 30 }}>
        <HomepageHeader />
      </div>
      <div className="container" style={{ paddingBottom: 60 }}>
        <p>
          A typescript framework to create applications. It provides the features we think every application should
          have: Authentication, Authorization, Logging, Monitoring, Configuration, Database Abstraction, Realtime
          events, GraphQL, REST API.
        </p>
        <WebdaPanel>This is my service description</WebdaPanel>
      </div>
    </Layout>
  );
  /*
  Add a combo box to select the cloud provider
  Add some code typing example of models in left panel <-> right panel display GraphQL or REST API
  */
}
