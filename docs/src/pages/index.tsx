import React from "react";
import Layout from "@theme/Layout";
import HomeHero from "@site/src/components/HomeHero";

/**
 * Homepage of docs.webda.io
 *
 * @returns the page
 */
export default function Home(): React.JSX.Element {
  return (
    <Layout
      title="Domain-driven TypeScript framework"
      description="NodeJS framework with GraphQL, REST, AWS, GCP, Kubernetes"
    >
      <main>
        <HomeHero />
      </main>
    </Layout>
  );
}
