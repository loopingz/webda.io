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

/** How a relation field of a GraphQL result is turned back into the attribute the REST API sends */
export interface GraphQLLink {
  /** Target model id */
  model: string;
  /** Primary key attributes of the target, selected on the relation */
  pk: string[];
  /** Separator of a composite primary key */
  separator?: string;
  /**
   * `id`: the uid (`ModelParent`, `ModelLink`, an array of uids for `ModelLinksSimpleArray`), `ref`: the reference
   * objects (`ModelLinksArray`, `ModelMaps`), `map`: the reference objects by uid (`ModelLinksMap`)
   */
  as: "id" | "ref" | "map";
}

/** A field of a GraphQL selection: `1` for a leaf, its details otherwise */
export interface GraphQLSelectionField {
  /** JSON key of the attribute, when the GraphQL name differs (`available-balance` / `availableBalance`) */
  key?: string;
  /** Sub-selection of an object, or of the items of a list */
  select?: GraphQLSelection;
  /** The field is a relation to another model */
  link?: GraphQLLink;
}

/** A GraphQL selection set: field name to `1` (leaf) or its details */
export type GraphQLSelection = Record<string, 1 | GraphQLSelectionField>;

/** Where and how GraphQL exposes an operation, read from the schema of `GraphQLService` */
export interface GraphQLExposure {
  kind: "query" | "mutation" | "subscription";
  /** Root field name */
  name: string;
  /** Arguments of the field: name to GraphQL type (`String`, `CompanyInput`, `String!`) */
  args?: Record<string, string>;
  /**
   * The argument carrying the input object (`create<Type>`, `update<Type>`, an operation's `input`); the other
   * arguments are read from the input attributes of the same name
   */
  wrap?: {
    arg: string;
    /** Fields of its input type: GraphQL name to JSON key; the other attributes are left out */
    fields?: Record<string, string>;
  };
  /** Selection set of the result, undefined for a scalar result */
  selection?: GraphQLSelection;
  /** Primary key fields of the model the result is (or lists), always kept in a projection */
  keys?: string[];
}

/** One operation of the application and every way the server exposes it */
export interface OperationDescriptor {
  id: string;
  /** Schema name of the input, `void` when none; a trailing `?` marks a partial (ignoreRequired) input */
  input: string;
  output: string;
  streaming: OperationStreaming;
  rest?: RestExposure;
  graphql?: GraphQLExposure;
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
  targetAttribute?: string;
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

/** What the application serves (`manifest.transports` and `manifest.offline`), generated as `SERVER` */
export interface ServerManifest {
  transports: {
    rest?: { url: string };
    graphql?: { url: string; subscriptions?: boolean };
    grpc?: { package: string; protoFile: string };
  };
  /** Present when a `Webda/SyncService` is configured */
  offline?: {
    /** Models the `SyncService` syncs */
    models: string[];
    /** Ids of the `Sync.*` operations */
    operations: { pull: string; push: string; snapshot: string; watch?: string };
  };
}

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
  /**
   * Attributes to fetch, dotted paths through relations (`["name", "owner.name"]`): a projection for the transports
   * that support one (GraphQL), ignored by the others. A projected object refreshes the cached entity but is not
   * cached as a whole one.
   */
  select?: string[];
}

/** Cache mode of a call, in the `fetch` vocabulary */
export type CacheMode = "default" | "no-store" | "force-cache" | "reload";

/** Options of a call through the client */
export interface CallOptions extends CallContext {
  cache?: CacheMode;
}

/** Options of a query through the client */
export interface QueryOptions extends CallOptions {
  /**
   * Also ask for the total of the query: ask on the first page only, the next pages of the same query keep the
   * cached total
   */
  count?: boolean;
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
 * A way to reach the operations of the application: REST (`HttpTransport`), GraphQL (`@webda/sdk/client/graphql`),
 * gRPC (`@webda/sdk/client/grpc`, Node only)
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
  /**
   * Total of the query, when asked with `count` and allowed by the model: with relation "gte", the total is at least
   * `value`
   */
  total?: QueryTotal;
}

/** Total of a query: `relation` "eq" for an exact total, "gte" when the server stopped counting at `value` */
export interface QueryTotal {
  value: number;
  relation: "eq" | "gte";
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
