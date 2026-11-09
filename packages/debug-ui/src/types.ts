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
  /**
   * Parent
   */
  parent?: { attribute: string; model: string };
  /**
   * Links
   */
  links?: { attribute: string; model: string; type?: string }[];
  /**
   * Queries
   */
  queries?: { attribute: string; model: string }[];
  /**
   * Maps
   */
  maps?: { attribute: string; model: string }[];
  /**
   * Children
   */
  children?: string[];
  /**
   * Binaries
   */
  binaries?: { attribute: string; cardinality: string }[];
  /**
   * Behaviors
   */
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
  /** Registered parent models, closest first (servers ≥ 4.0.0-beta.6) */
  ancestors?: string[];
  /** Registered models extending this one directly */
  subclasses?: string[];
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
  /**
   * Name
   */
  name: string;
  /**
   * Full name
   */
  fullName?: string;
  /**
   * Help
   */
  help?: string;
  /**
   * Type
   */
  type: string;
  /**
   * Label names
   */
  labelNames?: string[];
  /**
   * Values
   */
  values?: { value: number; labels?: Record<string, string> }[];
}

/** An entry of `GET /api/services`. */
export interface DebugServiceInfo {
  /**
   * Name
   */
  name: string;
  /**
   * Type
   */
  type: string;
  /**
   * State
   */
  state: string;
  /**
   * Capabilities
   */
  capabilities: Record<string, unknown>;
  /**
   * Configuration
   */
  configuration: Record<string, unknown>;
  /**
   * Schema
   */
  schema?: JsonSchema;
  /**
   * Metrics
   */
  metrics?: DebugMetric[];
}

/** The subset of JSON Schema the schema form understands. */
export interface JsonSchema {
  /**
   * $ref
   */
  $ref?: string;
  /**
   * Type
   */
  type?: string;
  /**
   * Title
   */
  title?: string;
  /**
   * Description
   */
  description?: string;
  /**
   * Properties
   */
  properties?: Record<string, JsonSchema>;
  /**
   * Required
   */
  required?: string[];
  /**
   * Items
   */
  items?: JsonSchema;
  /**
   * Enum
   */
  enum?: unknown[];
  /**
   * Const
   */
  const?: unknown;
  /**
   * Default
   */
  default?: unknown;
  /**
   * Format
   */
  format?: string;
  /**
   * Pattern
   */
  pattern?: string;
  /**
   * Minimum
   */
  minimum?: number;
  /**
   * Maximum
   */
  maximum?: number;
  /**
   * Min length
   */
  minLength?: number;
  /**
   * Max length
   */
  maxLength?: number;
  /**
   * Definitions
   */
  definitions?: Record<string, JsonSchema>;
  [key: string]: unknown;
}

/** An entry of `GET /api/operations`. */
export interface DebugOperation {
  /**
   * Unique identifier
   */
  id: string;
  /**
   * Input
   */
  input?: string;
  /**
   * Output
   */
  output?: string;
  /**
   * Input schema
   */
  inputSchema?: JsonSchema;
  /**
   * Output schema
   */
  outputSchema?: JsonSchema;
  /**
   * REST
   */
  rest?: { method?: string; url?: string; path?: string };
  /**
   * Summary
   */
  summary?: string;
  /**
   * Tags
   */
  tags?: string[];
  /**
   * Implementor
   */
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
  /**
   * Unique identifier
   */
  id: string;
  /**
   * Method
   */
  method?: string;
  /**
   * URL
   */
  url?: string;
  /**
   * Timestamp
   */
  timestamp?: number;
  /**
   * Status code
   */
  statusCode?: number;
  /**
   * Duration
   */
  duration?: number;
  /**
   * Request headers
   */
  requestHeaders?: Record<string, string>;
  /**
   * Request body
   */
  requestBody?: DebugRequestBody;
  /**
   * Response headers
   */
  responseHeaders?: Record<string, string>;
  /**
   * Response body
   */
  responseBody?: DebugRequestBody;
  /**
   * Error
   */
  error?: { message: string; stack?: string };
}

/** An entry of `GET /api/logs`. */
export interface DebugLogEntry {
  /**
   * Unique identifier
   */
  id: string;
  /**
   * Timestamp
   */
  timestamp?: number;
  /**
   * Level
   */
  level: string;
  /**
   * Message
   */
  message: string;
  /**
   * Args
   */
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
