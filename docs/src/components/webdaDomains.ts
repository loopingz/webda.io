/**
 * The four Webda domains, matching the four pieces of the logo.
 * Shared by the homepage hero: AssemblingLogo, DomainCard and JigsawNetwork.
 */

/** Key of a domain, also the name of its logo piece */
export type DomainKey = "models" | "services" | "deployments" | "integrations";

/** Description of one domain */
export interface Domain {
  key: DomainKey;
  /** Full title shown in the card */
  title: string;
  /** Short label for the card tab */
  tab: string;
  /** Colour of its logo piece */
  color: string;
  /** Colour of its network pieces, as `r, g, b`, for the light and dark themes */
  rgb: { light: string; dark: string };
  text: string;
  tags: string[];
  link: { label: string; to: string };
}

/** Rotation order of the domain card */
export const DOMAINS: Domain[] = [
  {
    key: "models",
    title: "Models",
    tab: "Models",
    color: "#4557a4",
    rgb: { light: "69, 87, 164", dark: "120, 138, 232" },
    text: "Models define your data and how it is accessed: permissions, actions and relations to other models. Webda exposes them as REST, GraphQL and CLI, and testing your models tests most of your application.",
    tags: ["@Model", "@Expose", "@ModelRelated", "Task.query()"],
    link: { label: "Read about models", to: "/docs/Concepts/Models" }
  },
  {
    key: "services",
    title: "Services",
    tab: "Services",
    color: "#7fbf6b",
    rgb: { light: "127, 191, 107", dark: "127, 191, 107" },
    text: "Services hold the behaviour that does not belong to a model: authentication, stores, queues, pub/sub, mailers. They are injected where you need them and follow the resolve, init and stop lifecycle.",
    tags: ["@Bean", "@Inject", "Queue", "Mailer"],
    link: { label: "Read about services", to: "/docs/Concepts/Services" }
  },
  {
    key: "deployments",
    title: "Deployments",
    tab: "Deploy",
    color: "#f7992c",
    rgb: { light: "247, 153, 44", dark: "247, 153, 44" },
    text: "The same application deploys as Kubernetes workloads, Lambda functions behind API Gateway, or Docker images. Each deployment overrides only the configuration it needs, and can read values from ConfigMaps.",
    tags: ["webda deploy", "Kubernetes", "Lambda", "OCI"],
    link: { label: "Read about deployments", to: "/docs/Deployments" }
  },
  {
    key: "integrations",
    title: "Integrations",
    tab: "Integrate",
    color: "#a3abbd",
    rgb: { light: "150, 158, 178", dark: "228, 230, 238" },
    text: "Reach your application over REST, GraphQL or any other entry point. Operations give every entry point one normalized way to call your application, with the same permissions and validation.",
    tags: ["REST", "GraphQL", "Operations", "gRPC", "MCP"],
    link: { label: "Read about integrations", to: "/docs/REST" }
  }
];
