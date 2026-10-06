import type { Store, Transport } from "./options.js";

const MARKER = "<!-- WEBDA:APP -->";

const STORE_LINES: Record<Store, string> = {
  memory: "Store: in memory (`Webda/MemoryStore`), persisted to `.registry` between runs",
  file: "Store: JSON files (`Webda/FileStore`) in `./data`",
  mongodb: "Store: MongoDB (`Webda/MongoStore`), connection from `WEBDA_MONGO_URL`",
  postgres:
    "Store: PostgreSQL (`Webda/PostgresStore`), connection from `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`"
};

const TRANSPORT_LABELS: Record<Transport, string> = { rest: "REST", graphql: "GraphQL", grpc: "gRPC", mcp: "MCP" };

/**
 * Lines describing the generated app for the "This app" section of AGENTS.md
 * @param options - selected store and transports
 * @param options.store - selected store backend
 * @param options.transports - selected transport protocols
 * @returns one line per aspect
 */
export function describeApp(options: { store: Store; transports: Transport[] }): string[] {
  return [STORE_LINES[options.store], `Transports: ${options.transports.map(t => TRANSPORT_LABELS[t]).join(", ")}`];
}

/**
 * Fill the `<!-- WEBDA:APP -->` marker of the AGENTS.md template
 * @param template - AGENTS.md template content
 * @param appLines - bullet lines from `describeApp`
 * @param notes - overlay notes, one paragraph each
 * @returns AGENTS.md content
 */
export function renderAgentsMd(template: string, appLines: string[], notes: string[]): string {
  if (!template.includes(MARKER)) {
    throw new Error(`AGENTS.md template has no ${MARKER} marker`);
  }
  const section = [appLines.map(line => `- ${line}`).join("\n"), ...notes].join("\n\n");
  return template.replace(MARKER, section);
}
