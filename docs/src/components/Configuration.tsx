import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Layout from "@theme/Layout";
import DocSidebar from "@theme/DocSidebar";
import MDXContent from "@theme/MDXContent";
import { BrowserRouter, Route } from "react-router-dom";
import WelcomeMD from "./Welcome.mdx";
import { useState } from "react";

export function ConfigurationLayout() {
  return (
    <div className="configurationMenu" style={{ display: "flex" }}>
      <DocSidebar
        onCollapse={() => {}}
        isHidden={false}
        path="./configuration"
        sidebar={[
          {
            label: "Models",
            type: "category",
            href: "/configuration/models",
            className: "models",
            collapsed: false,
            collapsible: false,
            items: [
              {
                label: "Hierarchy",
                href: "/configuration/models/hierarchy",
                type: "link"
              },
              {
                label: "Relations",
                href: "/configuration/models/relations",
                type: "link"
              },
              {
                label: "Permissions Simulator",
                href: "/configuration/models/simulator",
                type: "link"
              }
            ]
          },
          {
            label: "Services",
            type: "category",
            className: "services",
            href: "/configuration/services",
            collapsed: false,
            collapsible: false,
            items: [
              {
                label: "Configuration",
                href: "/configuration/models/hierarchy",
                type: "link"
              }
            ]
          },
          {
            label: "Deployments",
            type: "category",
            className: "deployments",
            href: "/configuration/services",
            collapsed: false,
            collapsible: false,
            items: [
              {
                label: "Configuration resolver",
                href: "/configuration/models/hierarchy",
                type: "link"
              }
            ]
          },
          {
            label: "Integration",
            type: "category",
            className: "others",
            href: "/configuration/services",
            collapsed: false,
            collapsible: false,
            items: [
              {
                label: "OpenAPI",
                href: "/configuration/models/hierarchy",
                type: "link"
              },
              {
                label: "GraphQL",
                href: "/configuration/models/hierarchy",
                type: "link"
              }
            ]
          }
        ]}
      />
      <div>
        <Route path="/configuration/models/hierarchy">
          <div>Models</div>
        </Route>
        <Route path="/configuration/welcome">
          <MDXContent>
            <WelcomeMD />
          </MDXContent>
        </Route>
      </div>
    </div>
  );
}

function NoApp() {
  const onClick = () => {
    alert("Not implemented");
  };
  return (
    <div style={{ padding: 30 }}>
      <div>
        <MDXContent>
          <WelcomeMD onClick={onClick} />
        </MDXContent>
      </div>
    </div>
  );
}

export default function Configuration() {
  const { siteConfig } = useDocusaurusContext();
  const [app, setApp] = useState();
  return (
    <Layout noFooter>
      {!app && <NoApp />}
      {app && (
        <BrowserRouter>
          <Route path=".">
            <ConfigurationLayout />
          </Route>
          <Route path="/*">
            <ConfigurationLayout />
          </Route>
        </BrowserRouter>
      )}
    </Layout>
  );
  /*
  Add a combo box to select the cloud provider
  Add some code typing example of models in left panel <-> right panel display GraphQL or REST API
  */
}
