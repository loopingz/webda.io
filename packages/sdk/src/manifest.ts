import {
  RESTOperationsTransport,
  getOperationStreaming,
  listFullOperations,
  useApplication,
  useCore,
  useRouter,
  type OperationDefinition
} from "@webda/core";
import type { ModelGraph } from "@webda/compiler";
import type { JSONSchema7 } from "json-schema";
import type { HttpMethod, OperationKind, OperationStreaming } from "./client/types.js";

/** A method marked `@Shared()` on a model, as the compiler recorded it */
export interface SharedMethod {
  /** Static method */
  static?: boolean;
  /** The method declaration, decorators removed, type annotations kept */
  source: string;
  /** Identifiers it uses from the allowlisted modules, by module */
  imports?: Record<string, string[]>;
}

/** An operation of the manifest */
export interface SdkManifestOperation {
  id: string;
  /** Schema ref or `void`; `<ref>?` is a partial input (ignoreRequired) */
  input: string;
  output: string;
  streaming: OperationStreaming;
  rest?: { method: HttpMethod; path: string; pathParams: string[]; query?: string[] };
  graphql?: { kind: "query" | "mutation" | "subscription"; name: string };
  grpc?: { service: string; rpc: string };
  /** Model id when the operation is CRUD, an action or a behavior of a model */
  model?: string;
  kind?: OperationKind;
  action?: { name: string; global?: boolean };
  behavior?: { attribute: string; action: string };
  /** WebdaQL on the session, informational */
  permission?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
}

/** A model of the manifest */
export interface SdkManifestModel {
  id: string;
  shortName: string;
  plural: string;
  primaryKey: string[];
  primaryKeySeparator?: string;
  /** Ref into `schemas` of what the server sends (`Metadata.Schemas.Output ?? Input`) */
  schema: string;
  /** Ref into `schemas` of what the server accepts (`Metadata.Schemas.Input`) */
  inputSchema: string;
  /** From the compiler, untouched */
  relations: ModelGraph;
  /** Ancestor model ids, nearest first */
  ancestors: string[];
  /** Ids of the operations attached to this model */
  operations: string[];
  /** `@Shared` methods, the inherited ones included */
  shared: Record<string, SharedMethod>;
}

/**
 * The contract between the application and the generator: every operation with every way the server exposes it,
 * the models, their schemas and what the application serves
 */
export interface SdkManifest {
  version: 1;
  /** Application namespace, e.g. `WebdaDemo` */
  namespace: string;
  operations: Record<string, SdkManifestOperation>;
  models: Record<string, SdkManifestModel>;
  /** Every referenced schema, local `definitions` hoisted */
  schemas: Record<string, JSONSchema7>;
  /** What the application serves, so `createClient()` can pick defaults */
  transports: {
    rest?: { url: string };
    graphql?: { url: string; subscriptions?: boolean };
    grpc?: { package: string; protoFile: string };
  };
  /** Present when a `Webda/SyncService` is configured */
  offline?: {
    models: string[];
    operations: { pull: string; push: string; snapshot: string; watch?: string };
  };
}

/** Options of the manifest builder */
export interface SdkManifestBuilderOptions {
  /** Operation id globs to include (`Task.*`, `*.Query`) @default every operation */
  include?: string[];
  /** Operation id globs to exclude */
  exclude?: string[];
  /** Exposures to describe @default every configured transport */
  transports?: Array<"rest" | "graphql" | "grpc">;
  /** Describe the `SyncService` @default true when one is configured */
  offline?: boolean;
}

/**
 * @param pattern - a glob with `*`
 * @returns the matching regular expression
 */
export function globToRegExp(pattern: string): RegExp {
  return new RegExp(
    `^${pattern
      .split("*")
      .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`
  );
}

/**
 * @param include - include globs, every id when empty
 * @param exclude - exclude globs
 * @returns a filter on operation ids
 */
export function createIdFilter(include: string[] = [], exclude: string[] = []): (id: string) => boolean {
  const includes = (include.length ? include : ["*"]).map(globToRegExp);
  const excludes = exclude.map(globToRegExp);
  return id => includes.some(re => re.test(id)) && !excludes.some(re => re.test(id));
}

/** The method names `DomainService` registers, to the kind of operation */
const KIND_BY_METHOD: Record<string, OperationKind> = {
  modelCreate: "create",
  modelGet: "get",
  modelQuery: "query",
  modelUpdate: "update",
  modelPatch: "patch",
  modelDelete: "delete",
  modelAction: "action",
  modelBehaviorAction: "behavior"
};

/** REST transports whose routes this builder registered itself (resolved phase, see `ensureRoutes`) */
const initialized = new WeakSet<object>();

/**
 * Build the `SdkManifest` of the current application: needs a resolved `Core`
 *
 * REST routes are read from the router, so nested models, custom primary keys, `queryMethod` and `nameTransformer`
 * are honoured without duplicating the transport's logic. At the `resolved` phase (build hooks) the REST transport
 * has not registered its routes yet: the builder asks it to, which only touches the in-memory router.
 */
export class SdkManifestBuilder {
  /**
   * @param options - what to describe
   */
  constructor(protected options: SdkManifestBuilderOptions = {}) {}

  /**
   * @returns the configured services, by constructor name
   */
  protected services(): Record<string, any> {
    return useCore().getServices();
  }

  /**
   * @param name - constructor name (`GraphQLService`, `GrpcService`, `SyncService`)
   * @returns the first configured service of that class, by duck typing on the class chain
   */
  protected serviceOf(name: string): any | undefined {
    return Object.values(this.services()).find(service => {
      for (
        let proto = Object.getPrototypeOf(service);
        proto && proto !== Object.prototype;
        proto = Object.getPrototypeOf(proto)
      ) {
        if (proto.constructor?.name === name) return true;
      }
      return false;
    });
  }

  /**
   * @returns the REST transport, when configured
   */
  protected restTransport(): RESTOperationsTransport | undefined {
    return Object.values(this.services()).find(service => service instanceof RESTOperationsTransport) as
      RESTOperationsTransport | undefined;
  }

  /**
   * Make sure the REST routes are registered: at the `resolved` phase the transport has not run `init()` yet
   * @param rest - the REST transport
   */
  protected ensureRoutes(rest: RESTOperationsTransport): void {
    if (rest.getState() === "running" || initialized.has(rest)) return;
    initialized.add(rest);
    (rest as any).initTransport();
  }

  /**
   * The REST route of every operation, from the router's `openapi.<method>.operationId`
   * @returns operation id to route
   */
  protected restRoutes(): Map<string, SdkManifestOperation["rest"]> {
    const routes = new Map<string, SdkManifestOperation["rest"]>();
    const rest = this.restTransport();
    if (!rest) return routes;
    this.ensureRoutes(rest);
    for (const [url, infos] of Object.entries(useRouter().getRoutes())) {
      // `{?q?}` lists the query-string parameters of the template
      const query = /\{\?([^}]*)\}/.exec(url)?.[1];
      const path = url.replace(/\{\?[^}]*\}/, "");
      const pathParams = [...path.matchAll(/\{([^}]+)\}/g)].map(match => match[1]);
      for (const info of infos as any[]) {
        for (const method of info.methods as string[]) {
          const operationId = info.openapi?.[method.toLowerCase()]?.operationId;
          if (!operationId || routes.has(operationId)) continue;
          routes.set(operationId, {
            method: method.toLowerCase() as HttpMethod,
            path,
            pathParams,
            ...(query ? { query: query.split(",").map(name => name.replace(/\?$/, "")) } : {})
          });
        }
      }
    }
    return routes;
  }

  /**
   * The relations of a model, with the `targetAttribute` of its queries resolved to a real attribute of the target:
   * the module metadata records the type name of `ModelRelated<Target, This, "attribute">` there (`Company` for
   * `company`, `User` for `_user`), so the back-reference is taken from the target's parent relation when it points
   * here, else matched on the target schema ignoring case
   * @param id - the model id
   * @param relations - its metadata relations (frozen)
   * @param models - every model class, by id
   * @returns a copy of the relations
   */
  protected relationsOf(id: string, relations: ModelGraph, models: Record<string, any>): ModelGraph {
    const copy: ModelGraph = JSON.parse(JSON.stringify(relations));
    for (const query of copy.queries ?? []) {
      const target = models[query.model]?.Metadata;
      if (!target) continue;
      const parent = target.Relations?.parent;
      if (parent?.model === id) {
        query.targetAttribute = parent.attribute;
        continue;
      }
      const properties = Object.keys(target.Schemas?.Output?.properties ?? target.Schemas?.Input?.properties ?? {});
      if (properties.includes(query.targetAttribute)) continue;
      const wanted = query.targetAttribute.toLowerCase();
      const match = properties.find(
        property => property.toLowerCase() === wanted || property.toLowerCase() === `_${wanted}`
      );
      if (match) query.targetAttribute = match;
    }
    return copy;
  }

  /**
   * @param op - an operation definition
   * @returns the model id the operation works on
   */
  protected modelOf(op: OperationDefinition): string | undefined {
    const app = useApplication();
    const model = op.context?.model;
    if (model) {
      return typeof model === "string" ? model : app.getModelId(model);
    }
    if (op.model) {
      return app.getModelId(app.getModel(op.model)) ?? op.model;
    }
    return undefined;
  }

  /**
   * @returns the manifest
   */
  build(): SdkManifest {
    const app = useApplication();
    const filter = createIdFilter(this.options.include, this.options.exclude);
    const describe = (name: "rest" | "graphql" | "grpc") =>
      this.options.transports === undefined || this.options.transports.includes(name);
    const rest = this.restTransport();
    const routes = describe("rest") && rest ? this.restRoutes() : new Map<string, SdkManifestOperation["rest"]>();
    const schemas: Record<string, JSONSchema7> = {};
    /**
     * @param ref - a schema ref, `void` or `<ref>?`
     * @returns the schema, recorded in the manifest with its hoisted definitions
     */
    const schemaOf = (ref: string | undefined): JSONSchema7 | undefined => {
      if (!ref || ref === "void") return undefined;
      const base = ref.endsWith("?") ? ref.slice(0, -1) : ref;
      if (schemas[base]) return schemas[base];
      const schema = app.getSchema(base) as JSONSchema7 | undefined;
      if (!schema) return undefined;
      schemas[base] = schema;
      for (const [name, definition] of Object.entries(schema.definitions ?? {})) {
        if (!(name in schemas) && typeof definition === "object") schemas[name] = definition;
      }
      return schema;
    };

    const operations: Record<string, SdkManifestOperation> = {};
    for (const [id, op] of Object.entries(listFullOperations())) {
      if (op.hidden || !filter(id)) continue;
      const model = this.modelOf(op);
      const kind: OperationKind = KIND_BY_METHOD[op.method] ?? (model ? "action" : "service");
      const entry: SdkManifestOperation = {
        id,
        input: op.input ?? "void",
        output: op.output ?? "void",
        streaming: getOperationStreaming(op)
      };
      const route = op.rest === false ? undefined : routes.get(id);
      if (route) entry.rest = route;
      if (model) {
        entry.model = model;
        entry.kind = kind;
        if (kind === "action") {
          const action = op.context?.action;
          entry.action = action
            ? { name: action.name, ...(action.global ? { global: true } : {}) }
            : { name: op.method, ...(op.static ? { global: true } : {}) };
        } else if (kind === "behavior") {
          entry.behavior = { attribute: op.context?.attribute, action: op.context?.action };
        }
      } else {
        entry.kind = "service";
      }
      if (op.permission) entry.permission = String(op.permission);
      if (op.summary) entry.summary = op.summary;
      if (op.description) entry.description = op.description;
      if (op.tags?.length) entry.tags = [...op.tags];
      if (op.deprecated) entry.deprecated = true;
      schemaOf(entry.input);
      schemaOf(entry.output);
      operations[id] = entry;
    }

    const models: Record<string, SdkManifestModel> = {};
    const allModels = app.getModels();
    for (const [key, modelClass] of Object.entries(allModels)) {
      const metadata: any = (modelClass as any)?.Metadata;
      if (!metadata || !app.isFinalModel(metadata.Identifier)) continue;
      const id: string = metadata.Identifier ?? key;
      const output = metadata.Schemas?.Output ?? metadata.Schemas?.Input;
      if (!output) continue;
      const input = metadata.Schemas?.Input ?? output;
      schemas[id] = output;
      const inputRef = input === output ? id : `${id}.input`;
      schemas[inputRef] = input;
      for (const schema of [output, input]) {
        for (const [name, definition] of Object.entries((schema as JSONSchema7).definitions ?? {})) {
          if (!(name in schemas) && typeof definition === "object") schemas[name] = definition;
        }
      }
      // The application resolves the ancestors to their classes when it loads the models
      const ancestors: string[] = (metadata.Ancestors ?? [])
        .map((ancestor: any) => (typeof ancestor === "string" ? ancestor : app.getModelId(ancestor)))
        .filter((ancestor: string | undefined): ancestor is string => ancestor !== undefined);
      const shared: Record<string, SharedMethod> = { ...(metadata.Shared ?? {}) };
      for (const ancestor of ancestors) {
        const inherited = (allModels[ancestor] as any)?.Metadata?.Shared ?? {};
        for (const [name, method] of Object.entries(inherited)) shared[name] ??= method as SharedMethod;
      }
      for (const name of Object.keys(metadata.Actions ?? {})) {
        schemaOf(`${id}.${name}.input`);
        schemaOf(`${id}.${name}.output`);
      }
      models[id] = {
        id,
        shortName: id.split("/").pop()!,
        plural: metadata.Plural,
        primaryKey: metadata.PrimaryKey?.length ? [...metadata.PrimaryKey] : ["uuid"],
        ...(metadata.PrimaryKeySeparator ? { primaryKeySeparator: metadata.PrimaryKeySeparator } : {}),
        schema: id,
        inputSchema: inputRef,
        relations: this.relationsOf(id, metadata.Relations ?? {}, allModels),
        ancestors,
        operations: Object.values(operations)
          .filter(op => op.model === id)
          .map(op => op.id),
        shared
      };
    }

    const manifest: SdkManifest = {
      version: 1,
      namespace: app.getNamespace(),
      operations,
      models,
      schemas,
      transports: {}
    };
    if (describe("rest") && rest) manifest.transports.rest = { url: rest.getParameters().url };
    const graphql = describe("graphql") ? this.serviceOf("GraphQLService") : undefined;
    if (graphql) {
      const params = graphql.getParameters();
      manifest.transports.graphql = { url: params.url ?? "/graphql", subscriptions: params.subscriptions !== false };
    }
    const grpc = describe("grpc") ? this.serviceOf("GrpcService") : undefined;
    if (grpc) {
      const params = grpc.getParameters();
      manifest.transports.grpc = { package: params.packageName ?? "webda", protoFile: params.protoFile };
    }
    const sync = this.options.offline === false ? undefined : this.serviceOf("SyncService");
    if (sync) {
      manifest.offline = {
        models: [...(sync.getParameters().models ?? [])],
        operations: {
          pull: "Sync.Pull",
          push: "Sync.Push",
          snapshot: "Sync.Snapshot",
          ...(listFullOperations()["Sync.Watch"] ? { watch: "Sync.Watch" } : {})
        }
      };
    }
    return manifest;
  }
}

/**
 * @param options - what to describe
 * @returns the manifest of the current application
 */
export function buildSdkManifest(options: SdkManifestBuilderOptions = {}): SdkManifest {
  return new SdkManifestBuilder(options).build();
}
