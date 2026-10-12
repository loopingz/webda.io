/**
 * Descriptors the generated SDK hands to the runtime: a trimmed `SdkManifest` the browser can carry
 */

/** HTTP verbs of a REST exposure */
export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/** How an operation streams */
export type OperationStreaming = "none" | "server" | "client" | "bidi";

/** What an operation does to its model, when it has one */
export type OperationKind =
  "create" | "get" | "query" | "update" | "patch" | "delete" | "action" | "behavior" | "service";

/** Kinds that change the model: their call invalidates the cached queries of the model and its ancestors */
export const MUTATION_KINDS: ReadonlySet<OperationKind> = new Set<OperationKind>([
  "create",
  "update",
  "patch",
  "delete",
  "action",
  "behavior"
]);

/** The REST route of an operation, as the router registered it */
export interface RestExposure {
  method: HttpMethod;
  /** Path template with `{name}` parameters, e.g. `/companies/{pid.0}/users/{uuid}` */
  path: string;
  /** Names of the `{...}` parameters of `path`, in order */
  pathParams: string[];
  /** Query-string parameters of the route template (`{?q?}`), e.g. `["q"]` for a `GET` query */
  query?: string[];
}

/** One operation of the application and every way the server exposes it */
export interface OperationDescriptor {
  id: string;
  /** Schema name of the input, `void` when none; a trailing `?` marks a partial (ignoreRequired) input */
  input: string;
  output: string;
  streaming: OperationStreaming;
  rest?: RestExposure;
  graphql?: { kind: "query" | "mutation" | "subscription"; name: string };
  grpc?: { service: string; rpc: string };
  /** Model id when the operation is CRUD, an action or a behavior of a model */
  model?: string;
  kind?: OperationKind;
  action?: { name: string; global?: boolean };
  behavior?: { attribute: string; action: string };
  permission?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
}

/** Operation id to descriptor */
export type OperationsManifest = Record<string, OperationDescriptor>;

/** A link relation of a model */
export interface ModelLinkDescriptor {
  attribute: string;
  model: string;
  type: "LINK" | "LINKS_MAP" | "LINKS_ARRAY" | "LINKS_SIMPLE_ARRAY";
}

/** A query relation of a model (`ModelRelated`) */
export interface ModelQueryDescriptor {
  attribute: string;
  model: string;
  /** Attribute of the target model holding this model's id */
  targetAttribute: string;
}

/** What the runtime needs to know about a model */
export interface ModelDescriptor {
  id: string;
  shortName: string;
  plural: string;
  primaryKey: string[];
  primaryKeySeparator?: string;
  /** Ancestor model ids, nearest first */
  ancestors: string[];
  parent?: { attribute: string; model: string };
  links: ModelLinkDescriptor[];
  queries: ModelQueryDescriptor[];
  /** Attributes with a `date-time` or `date` format, revived as `Date` */
  dates: string[];
  /** Operation ids of the model */
  operations: {
    get?: string;
    query?: string;
    create?: string;
    update?: string;
    patch?: string;
    delete?: string;
    /** Action name to operation id */
    actions: Record<string, string>;
    /** `attribute.action` to operation id */
    behaviors: Record<string, string>;
  };
}

/** Model id to descriptor */
export type ModelsManifest = Record<string, ModelDescriptor>;

/** Input and output types of one operation */
export interface OperationSignature {
  input: unknown;
  output: unknown;
}

/**
 * Type-level description of the operations, generated as `Operations` in `operations.ts`
 *
 * The constraint is written over `keyof Ops` so a generated interface (no index signature) satisfies it.
 */
export type OperationsMap<Ops = Record<string, OperationSignature>> = Record<keyof Ops, OperationSignature>;

/** Per-call context given to the transports */
export interface CallContext {
  /** Extra headers for this call */
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /**
   * Ids of the parents of a nested model, root first: they fill the `{pid.N}` path parameters of a nested REST route
   * (`/companies/{pid.0}/users/{uuid}`)
   */
  parents?: string[];
}

/** Cache mode of a call, in the `fetch` vocabulary */
export type CacheMode = "default" | "no-store" | "force-cache" | "reload";

/** Options of a call through the client */
export interface CallOptions extends CallContext {
  cache?: CacheMode;
}

/** A bidirectional stream, from `connect()` */
export interface BidiStream<I = unknown, O = unknown> extends AsyncIterable<O> {
  /** Send a message to the server */
  send(message: I): void;
  /** Close the stream */
  close(): void;
  /** Resolves when the stream is closed, rejects when it failed */
  readonly closed: Promise<void>;
}

/**
 * A way to reach the operations of the application: REST today, GraphQL and gRPC as extension points
 *
 * The client asks the transports in order and uses the first whose `supports(op)` is true.
 */
export interface Transport {
  /** Name used in errors */
  readonly name: string;
  /** Whether this transport can carry the operation (its manifest entry has the matching exposure) */
  supports(op: OperationDescriptor): boolean;
  /** Unary call */
  call(op: OperationDescriptor, input: unknown, ctx: CallContext): Promise<unknown>;
  /** Server streaming */
  stream?(op: OperationDescriptor, input: unknown, ctx: CallContext): AsyncIterable<unknown>;
  /** Bidirectional streaming */
  connect?(op: OperationDescriptor, ctx: CallContext): BidiStream;
}

/** A page of query results */
export interface QueryResult<T> {
  results: T[];
  continuationToken?: string;
}

/** A primary key: the string uid, or the key attributes of a composite key */
export type PrimaryKeyInput = string | Record<string, string | number>;

/** What changed in the cache */
export interface ChangeEvent {
  model: string;
  /** Entity uid, undefined when a whole model was invalidated */
  uid?: string;
  type: "set" | "delete" | "invalidate";
}
