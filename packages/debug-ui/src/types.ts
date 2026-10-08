/**
 * Wire types of the `@webda/debug` HTTP and websocket API.
 *
 * They mirror `packages/debug/src/introspection.ts`, `requestlog.ts` and
 * `logbuffer.ts`. They are declared here rather than imported because the
 * server package builds this UI into its bundle: a type import in the other
 * direction would make the two packages depend on each other's build output.
 */

/** Response of `GET /api/info`. */
export interface DebugInfo {
  /** Integer version of the debug API (absent on servers older than 4.0.0-beta.6) */
  debugApiVersion?: number;
  /** Version of the `@webda/debug` package serving the API */
  debugVersion?: string;
  /** Version of `@webda/core` the application runs on */
  frameworkVersion?: string;
  /** Working directory of the application */
  workingDirectory?: string;
  /** package.json of the application */
  package?: { name?: string; version?: string; [key: string]: unknown };
  /** Application name, when the project info is available */
  name?: string;
  /** Application version, when the project info is available */
  version?: string;
  /** Any other project information */
  [key: string]: unknown;
}

/** A relation declared on a model. */
export interface ModelRelations {
  parent?: { attribute: string; model: string };
  links?: { attribute: string; model: string; type?: string }[];
  queries?: { attribute: string; model: string }[];
  maps?: { attribute: string; model: string }[];
  children?: string[];
  binaries?: { attribute: string; cardinality: string }[];
  behaviors?: { attribute: string; behavior: string }[];
}

/** An entry of `GET /api/models`. */
export interface DebugModel {
  /** Fully-qualified model identifier, e.g. "MyApp/Task" */
  id: string;
  /** Plural name used in REST URLs */
  plural: string;
  /** Action names defined on the model */
  actions: (string | { name: string })[];
  /** Relation graph */
  relations: ModelRelations;
  /** Name of the store persisting the model */
  store?: string;
  /** Class name of that store */
  storeType?: string;
  /** Input / Output / Stored JSON schemas */
  schemas?: Record<string, unknown>;
  /** Raw model metadata (Ancestors, Subclasses, ...) */
  metadata?: { Ancestors?: string[]; Subclasses?: string[]; [key: string]: unknown };
}

/** A metric exposed by a service. */
export interface DebugMetric {
  name: string;
  fullName?: string;
  help?: string;
  type: string;
  labelNames?: string[];
  values?: { value: number; labels?: Record<string, string> }[];
}

/** An entry of `GET /api/services`. */
export interface DebugServiceInfo {
  name: string;
  type: string;
  state: string;
  capabilities: Record<string, unknown>;
  configuration: Record<string, unknown>;
  schema?: JsonSchema;
  metrics?: DebugMetric[];
}

/** The subset of JSON Schema the schema form understands. */
export interface JsonSchema {
  $ref?: string;
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  definitions?: Record<string, JsonSchema>;
  [key: string]: unknown;
}

/** An entry of `GET /api/operations`. */
export interface DebugOperation {
  id: string;
  input?: string;
  output?: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
  rest?: { method?: string; url?: string; path?: string };
  summary?: string;
  tags?: string[];
  implementor?: { type: "service" | "model"; name: string; method?: string; code?: string };
  [key: string]: unknown;
}

/** Body captured for a request or a response. */
export type DebugRequestBody =
  | { kind: "text"; content: string; size: number }
  | { kind: "text-truncated"; content: string; size: number }
  | { kind: "binary"; size: number; preview: string }
  | { kind: "empty" };

/** An entry of `GET /api/requests` (summary) and `GET /api/requests/:id` (full). */
export interface DebugRequest {
  id: string;
  method?: string;
  url?: string;
  timestamp?: number;
  statusCode?: number;
  duration?: number;
  requestHeaders?: Record<string, string>;
  requestBody?: DebugRequestBody;
  responseHeaders?: Record<string, string>;
  responseBody?: DebugRequestBody;
  error?: { message: string; stack?: string };
}

/** An entry of `GET /api/logs`. */
export interface DebugLogEntry {
  id: string;
  timestamp?: number;
  level: string;
  message: string;
  args?: unknown[];
}

/** Events pushed on the websocket. */
export type DebugWsEvent =
  | { type: "request"; id: string; method: string; url: string; timestamp: number }
  | { type: "result"; id: string; statusCode: number; duration: number }
  | { type: "404"; id: string; method: string; url: string }
  | { type: "log"; id: string; timestamp: number; level: string; message: string }
  | { type: "restart" };

/** Resolved application configuration (`GET /api/config`). */
export type DebugConfig = Record<string, unknown> & { parameters?: Record<string, unknown> };
