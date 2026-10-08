import { TransformCase, TransformCaseType } from "@webda/utils";
import { Service } from "./service.js";
import { Application } from "../application/application.js";
import type { ModelAction } from "../models/types.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { UuidModel, type Model, type ModelClass } from "@webda/models";
import { runWithContext, useContext } from "../contexts/execution.js";

import * as WebdaError from "../errors/errors.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { useApplication } from "../application/hooks.js";
import { OperationDefinition } from "../core/icore.js";
import { useModelMetadata } from "../core/hooks.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import { registerOperation } from "../core/operations.js";
import { hasSchema, registerSchema } from "../schemas/hooks.js";
import {
  checkModelParent,
  checkModelPermission,
  checkStaticModelPermission,
  createModel,
  getParentRelation,
  hasModelPermissionCheck,
  hasStaticPermissionCheck,
  NOT_FOUND_MESSAGE,
  queryModelWithPermissions
} from "../models/permissions.js";

/**
 * Sanitize client input before it reaches a model (REST, gRPC, MCP and GraphQL):
 * - `__`-prefixed (private) keys are removed at any depth;
 * - `_`-prefixed attributes are removed, unless the model lists them in its static `getClientWritableAttributes()`:
 *   by convention they are server-managed (`_user`, `_roles`, `_groups`, `_creationDate`...);
 * - Behavior-typed attributes (Metadata.Relations.behaviors) are removed: behavior state can only be changed through
 *   the behavior's own actions;
 * - the attributes of the model's static `getProtectedAttributes()` are removed, even when listed as writable.
 * @param model - the model class
 * @param input - the client input
 * @returns the sanitized input
 */
export function sanitizeModelInput<T = any>(model: ModelClass<any>, input: T): T {
  const out: any = stripPrivateFields(input);
  if (out && typeof out === "object" && !Array.isArray(out)) {
    const writable = getClientWritableAttributes(model);
    for (const key of Object.keys(out)) {
      if (key.startsWith("_") && !writable.includes(key)) {
        delete out[key];
      }
    }
    for (const rel of useModelMetadata(model)?.Relations?.behaviors ?? []) {
      delete out[rel.attribute];
    }
    // Server-managed attributes (e.g. the owner of an OwnerModel) are never taken from client input
    for (const attribute of getProtectedAttributes(model)) {
      delete out[attribute];
    }
  }
  return out;
}

/**
 * `_`-prefixed attributes a model accepts from client input, declared by its optional static
 * `getClientWritableAttributes()`
 * @param model - the model class
 * @returns the attribute names
 */
export function getClientWritableAttributes(model: any): string[] {
  return typeof model?.getClientWritableAttributes === "function" ? (model.getClientWritableAttributes() ?? []) : [];
}

/**
 * Client input of a create (REST, gRPC, MCP and GraphQL): {@link sanitizeModelInput}, plus
 * - the parent link (`ModelParent` attribute, from the nested URL or the input) is kept even when `_`-prefixed, unless
 *   protected: the caller must then check the parent ({@link checkModelParent});
 * - a client `uuid` is dropped for `UuidModel`s: the key is always generated, so a create can neither target an
 *   existing object nor reveal that a uuid exists. Natural-key models keep the client key (an existing key is a 409).
 * @param model - the model class
 * @param input - the raw client input
 * @returns the input to load in the new object
 */
export function prepareCreateInput<T = any>(model: ModelClass<any>, input: T): T {
  const parent = getParentRelation(model);
  const parentId =
    parent && !getProtectedAttributes(model).includes(parent.attribute)
      ? (input as any)?.[parent.attribute]
      : undefined;
  const out: any = sanitizeModelInput(model, input);
  if (!out || typeof out !== "object" || Array.isArray(out)) {
    return out;
  }
  if (parentId !== undefined && parentId !== null && parentId !== "") {
    out[parent.attribute] = parentId;
  }
  if ((model as any)?.prototype instanceof UuidModel) {
    delete out.uuid;
  }
  return out;
}

/**
 * Attributes a model refuses from client input, declared by its optional static `getProtectedAttributes()`
 * @param model - the model class
 * @returns the attribute names
 */
export function getProtectedAttributes(model: any): string[] {
  return typeof model?.getProtectedAttributes === "function" ? (model.getProtectedAttributes() ?? []) : [];
}

/**
 * Remove `__`-prefixed keys at any depth from client-supplied input, so private fields
 * (such as a password hash) can never be set through the REST/operations surface
 * @param input - the client input
 * @returns a sanitized deep copy (non plain-object/array values are returned as is)
 */
export function stripPrivateFields<T = any>(input: T): T {
  if (Array.isArray(input)) {
    return input.map(i => stripPrivateFields(i)) as any;
  }
  if (input && typeof input === "object" && Object.getPrototypeOf(input) === Object.prototype) {
    // Object.fromEntries defines own properties: no dynamic assignment can reach a prototype
    return Object.fromEntries(
      Object.entries(input)
        .filter(([k]) => !k.startsWith("__") && k !== "constructor" && k !== "prototype")
        .map(([k, v]) => [k, stripPrivateFields(v)])
    ) as any;
  }
  return input;
}

/**
 * Models that hold authentication state: never exposed by a DomainService (REST, GraphQL, operations), nor any of
 * their subclasses, unless explicitly listed in its `models` parameter
 */
export const INTERNAL_MODELS: readonly string[] = ["Webda/Ident", "Webda/RefreshToken"];

/**
 * @param model - a model class
 * @returns true when the model is, or descends from, one of {@link INTERNAL_MODELS}
 */
export function isInternalModel(model: any): boolean {
  for (let clazz = model; clazz && clazz !== Function.prototype; clazz = Object.getPrototypeOf(clazz)) {
    if (INTERNAL_MODELS.includes(clazz.Metadata?.Identifier)) {
      return true;
    }
  }
  return false;
}

/** Parameters for DomainService, controlling model exposure, URL naming, and query methods */
export class DomainServiceParameters extends ServiceParameters {
  /**
   * Expose objects as operations too
   *
   * @default true
   */
  operations?: boolean;
  /**
   * Transform the name of the model to be used in the URL
   *
   * @see https://blog.boot.dev/clean-code/casings-in-coding/#:~:text=%F0%9F%94%97%20Camel%20Case,Go
   * @default camelCase
   */
  nameTransfomer?: TransformCaseType;
  /**
   * Method used for query objects
   *
   * @default "PUT"
   */
  queryMethod?: "PUT" | "GET";
  /**
   * List of models to include
   *
   * If model is prefixed with a ! it will be excluded
   *
   * @default ["*"]
   */
  models?: string[];
  /**
   * Used to store the excluded models
   * @SchemaIgnore
   */
  private excludedModels: string[];

  /**
   * Load parameters with defaults for operations, naming, and query method
   * @param params - the service parameters
   * @returns this for chaining
   */
  load(params: any = {}): this {
    super.load(params);
    // Init default here
    this.operations ??= true;
    this.nameTransfomer ??= "camelCase";
    this.queryMethod ??= "PUT";
    this.models ??= ["*"];
    this.excludedModels = this.models.filter(i => i.startsWith("!")).map(i => i.substring(1));
    // Only contains excluded models so a wildcard is implied
    if (this.models.length === this.excludedModels.length) {
      this.models = ["*"];
    }
    return this;
  }

  /**
   * Is a model is included in the service
   * @param model - the model to use
   * @returns the result
   */
  isIncluded(model: string) {
    return !this.isExcluded(model) && (this.models.includes("*") || this.models.includes(model));
  }

  /**
   * Is a model explicitly listed (not through the wildcard) in `models`
   * @param model - the model identifier
   * @returns the result
   */
  isExplicitlyIncluded(model: string) {
    return !this.isExcluded(model) && this.models.includes(model);
  }

  /**
   * Is a model excluded from the service
   * @param model - the model to use
   * @returns the result
   */
  isExcluded(model: string) {
    return this.excludedModels.includes(model);
  }
}

export type DomainServiceEvents = {
  "Store.WebNotFound": { context: OperationContext; uuid: string };
};
/**
 * Domain Service expose all the models as Operations
 *
 * Model are exposed if they have a Expose decorator
 *
 * Children models Exposed should be under the first ModelRelated targetting them or the segment endpoint of Expose
 *
 * Other relations (ModelLinks, ModelParent) should only display their information but not be exposed
 * ModelRelated should be ignored
 *
 * @WebdaModda
 */
export class DomainService<
  T extends DomainServiceParameters = DomainServiceParameters,
  E extends DomainServiceEvents = DomainServiceEvents
> extends Service<T, E> {
  app: Application;
  static schemas = {
    uuidRequest: {
      type: "object",
      properties: {
        uuid: {
          type: "string"
        }
      },
      required: ["uuid"]
    },
    searchRequest: {
      type: "object",
      properties: {
        query: {
          type: "string"
        }
      }
    }
  };

  /**
   * Return the model name for this service
   * @param name - the name to use
   * @returns the result string
   *
   * @see https://blog.boot.dev/clean-code/casings-in-coding/#:~:text=%F0%9F%94%97%20Camel%20Case,Go
   */
  transformName(name: string): string {
    return TransformCase(name, this.parameters.nameTransfomer);
  }

  /**
   * Retrieve a model instance by uuid, throwing NotFound if missing or deleted
   * @param model - the model class to query
   * @param uuid - the primary key
   * @returns the model instance
   */
  private async loadModel(model: ModelClass<Model>, uuid: string | Record<string, any>): Promise<Model> {
    let object: Model | undefined;
    try {
      object = await model.ref(uuid as any).get();
    } catch {
      // Repository may throw when the object does not exist
    }
    if (object === undefined || object.isDeleted()) {
      const context = useContext<OperationContext>();
      await this.emit("Store.WebNotFound", {
        context,
        uuid: typeof uuid === "string" ? uuid : JSON.stringify(uuid)
      });
      throw new WebdaError.NotFound(NOT_FOUND_MESSAGE);
    }
    return object;
  }

  /**
   * {@link checkModelPermission}, emitting `Store.WebNotFound` when the refusal looks like a missing object, exactly
   * like {@link loadModel} does for a missing key
   * @param object - the model instance
   * @param context - the caller context
   * @param action - the action
   * @param model - the model class (the static `canAct` asked)
   */
  protected async checkPermission(
    object: Model,
    context: OperationContext,
    action: string,
    model?: ModelClass<Model>
  ): Promise<void> {
    try {
      await checkModelPermission(object, context, action, model);
    } catch (err) {
      if (err instanceof WebdaError.NotFound) {
        const uuid: any = object.getPrimaryKey?.();
        await this.emit("Store.WebNotFound", {
          context,
          uuid: typeof uuid === "string" ? uuid : JSON.stringify(uuid)
        });
      }
      throw err;
    }
  }

  /**
   * Create a model operation implementation
   * @param input - the model data to create
   * @returns the created model instance
   */
  async modelCreate(input: any): Promise<Model> {
    const context = useContext<OperationContext>();
    const { model } = context.getExtension<{ model: ModelClass<Model> }>("operationContext");
    // resolveArguments spreads the model schema's properties into positional args,
    // so what lands here as `input` may be a single property value (e.g. slug string)
    // rather than the full body. Also handles the no-schema fallback where the
    // OperationContext itself is passed. In all non-object cases, read the raw input.
    if (typeof input !== "object" || input === null || input instanceof OperationContext) {
      input = await context.getInput();
    }
    input = prepareCreateInput(model, input);
    return runWithContext(context, async () => {
      // Instantiate the model from raw input, load data, then save
      const object = new (model as any)() as Model;
      (object as any).load(input);
      // The parent link (nested URL or input) must point to a parent the caller may read
      await this.checkParent(model, input?.[getParentRelation(model)?.attribute ?? ""], context);
      // Let the model set its server-managed fields (e.g. the owner) from the caller
      await (object as any).prepareCreate?.(context);
      await this.checkPermission(object, context, "create", model);
      // Create, never upsert: an existing key is a 409, not an overwrite
      await createModel(object);
      return object;
    });
  }

  /**
   * {@link checkModelParent}, emitting `Store.WebNotFound` when the parent is missing or unreadable, like any missing
   * object
   * @param model - the child model class
   * @param parentId - the parent primary key
   * @param context - the caller context
   */
  protected async checkParent(model: ModelClass<Model>, parentId: any, context: OperationContext): Promise<void> {
    try {
      await checkModelParent(model, parentId, context);
    } catch (err) {
      if (err instanceof WebdaError.NotFound) {
        await this.emit("Store.WebNotFound", {
          context,
          uuid: typeof parentId === "string" ? parentId : JSON.stringify(parentId)
        });
      }
      throw err;
    }
  }

  /**
   * Resolve the primary key of an update or patch: the URL parameters win over the body, and a body carrying another
   * key is refused, so an update can never be redirected to another object
   * @param input - the sanitized input, its primary-key fields are removed
   * @param pkFields - the primary-key fields
   * @param params - the URL parameters
   * @returns the primary key
   * @throws BadRequest when the body key differs from the URL key
   */
  protected resolveUpdateKey(input: any, pkFields: string[] | undefined, params: Record<string, any>): any {
    const fields = pkFields?.length ? pkFields : ["uuid"];
    const key: Record<string, unknown> = {};
    for (const f of fields) {
      const fromUrl = params[f];
      const fromBody = input?.[f];
      if (fromUrl !== undefined && fromBody !== undefined && String(fromUrl) !== String(fromBody)) {
        throw new WebdaError.BadRequest("Primary key mismatch");
      }
      key[f] = fromUrl ?? fromBody;
      if (input && typeof input === "object") {
        delete input[f];
      }
    }
    return fields.length === 1 ? key[fields[0]] : key;
  }

  /**
   * When an update moves an object to another parent, the caller must be able to read the new parent
   * @param model - the model class
   * @param object - the stored object
   * @param input - the sanitized input
   * @param context - the caller context
   */
  protected async checkReparent(model: ModelClass<Model>, object: Model, input: any, context: OperationContext) {
    const parent = getParentRelation(model);
    const value = parent ? input?.[parent.attribute] : undefined;
    if (value === undefined || value === null || String(value) === String(object[parent.attribute] ?? "")) {
      return;
    }
    await this.checkParent(model, value, context);
  }

  /**
   * Update a model operation implementation
   * @param uuid - the model primary key
   * @param input - the update data (may be undefined if schema was not resolvable)
   * @returns the updated model instance
   */
  async modelUpdate(input?: any): Promise<Model> {
    const context = useContext<OperationContext>();
    const { model, pkFields } = context.getExtension<{
      model: ModelClass<Model>;
      pkFields?: string[];
    }>("operationContext");
    // resolveArguments spreads all model schema properties as positional args.
    // The first arg becomes the first property value (often the PK value).
    // Fall back to context for both PK and input when needed.
    if (typeof input !== "object" || input === null) {
      input = await context.getInput();
    }
    input = sanitizeModelInput(model, input);
    // Resolve the PK from the URL params (or the body) using the model's actual PK fields;
    // fall back to "uuid" for legacy operations without pkFields in the context.
    const pk = this.resolveUpdateKey(input, pkFields, context.getParameters() ?? {});
    const object = await this.loadModel(model, pk);
    // Check on the stored object, before any client input is applied
    await this.checkPermission(object, context, "update", model);
    await this.checkReparent(model, object, input, context);
    object["load"](input);
    await object.save();
    return object;
  }

  /**
   * Get a model operation implementation
   * @param uuid - the model primary key
   * @returns the model instance
   */
  async modelGet(uuid: string): Promise<Model> {
    const context = useContext<OperationContext>();
    const { model } = context.getExtension<{ model: ModelClass<Model> }>("operationContext");
    const object = await this.loadModel(model, uuid);
    await this.checkPermission(object, context, "get", model);
    return object;
  }

  /**
   * Delete a model operation implementation
   * @param uuid - the model primary key
   */
  async modelDelete(uuid: string): Promise<void> {
    const context = useContext<OperationContext>();
    const { model } = context.getExtension<{ model: ModelClass<Model> }>("operationContext");
    const object = await this.loadModel(model, uuid);
    await this.checkPermission(object, context, "delete", model);
    // Object can decide to not delete but mark as deleted
    await object.delete();
  }

  /**
   * Query models
   * @param query - the query string
   * @returns the query results
   */
  async modelQuery(query: string): Promise<any> {
    const context = useContext<OperationContext>();
    const { model } = context.getExtension<{ model: ModelClass }>("operationContext");
    if (query !== undefined && query !== null && typeof query !== "string") {
      throw new WebdaError.BadRequest("Query must be a string");
    }
    return runWithContext(context, async () => {
      try {
        return await queryModelWithPermissions(model, query, context);
      } catch (err) {
        if (err instanceof SyntaxError) {
          this.log("INFO", "Query syntax error");
          throw new WebdaError.BadRequest("Query syntax error");
        }
        throw err;
      }
    });
  }

  /**
   * Patch a model
   * @param uuid - the model primary key
   * @param input - the partial update data (may be undefined if schema was not resolvable)
   * @returns the patched model instance
   */
  async modelPatch(input?: any): Promise<Model> {
    const context = useContext<OperationContext>();
    const { model, pkFields } = context.getExtension<{
      model: ModelClass<Model>;
      pkFields?: string[];
    }>("operationContext");
    if (typeof input !== "object" || input === null) {
      input = await context.getInput();
    }
    input = sanitizeModelInput(model, input);
    // Build the PK from the model's real primary-key fields (same logic as modelUpdate).
    const pk = this.resolveUpdateKey(input, pkFields, context.getParameters() ?? {});
    const object = await this.loadModel(model, pk);
    // Check on the stored object, before any client input is applied
    await this.checkPermission(object, context, "update", model);
    await this.checkReparent(model, object, input, context);
    await object.patch(input);
    return object;
  }

  /**
   * Action on a model
   * @param args - arguments forwarded to the action method
   * @returns the action result
   */
  async modelAction(...args: any[]): Promise<any> {
    const context = useContext<OperationContext>();
    const { model, action } = context.getExtension<{
      model: ModelClass<Model>;
      action: ModelAction & { name: string };
    }>("operationContext");
    // The action can be exposed under another name than its method
    const handler = action.handler || action.name;
    if (!action.global) {
      // First arg is uuid when the action is instance-level
      const uuid = args[0];
      // A missing object and an object the caller cannot read answer the same NotFound
      const object = await this.loadModel(model, uuid);
      await this.checkPermission(object, context, action.name, model);
      return object[handler](context);
    } else {
      // Static action: the model's static canAct is asked without object
      await checkStaticModelPermission(model, context, action.name);
      // With an input schema the arguments are resolved from it (`callOperation`); without one the context is passed
      const resolved = args.length > 0 && !(args[0] instanceof OperationContext);
      return model[handler](...(resolved ? args : [context]));
    }
  }

  /**
   * Whether a model may be exposed: models of {@link INTERNAL_MODELS} and their subclasses need an explicit listing
   * in the `models` parameter
   * @param model - model class
   * @param identifier - model identifier
   * @returns true when the model may be exposed
   */
  isExposable(model: any, identifier: string): boolean {
    return !isInternalModel(model) || this.parameters.isExplicitlyIncluded(identifier);
  }

  /**
   * Add operations for all exposed models
   * @returns the result
   */
  initOperations(): void {
    super.initOperations();

    if (!this.parameters.operations) {
      return;
    }

    const app = (this.app = <Application>(<any>useApplication()));

    // Add default schemas - used for operation parameters validation
    const appSchemas = app.getSchemas();
    for (const i in DomainService.schemas) {
      if (hasSchema(i)) {
        continue;
      }
      registerSchema(i, DomainService.schemas[i]);
    }
    // Register schemas in application schema registry so that
    // resolveArguments can find them for typed parameter extraction.
    for (const name of Object.keys(DomainService.schemas)) {
      appSchemas[name] ??= DomainService.schemas[name];
    }

    const models = app.getModels();
    for (const modelKey in models) {
      const model = models[modelKey];
      if (!model) {
        continue;
      }
      const Metadata = useModelMetadata(model);
      if (!Metadata) {
        continue;
      }
      // Skip if not exposed or not included
      if (!this.parameters.isIncluded(Metadata.Identifier)) {
        continue;
      }

      // Overlap object are hidden by design
      if (!this.app.isFinalModel(Metadata.Identifier)) {
        continue;
      }
      // Authentication state models (and subclasses) are internal unless explicitly listed
      if (!this.isExposable(model, Metadata.Identifier)) {
        continue;
      }
      if (!hasModelPermissionCheck(model)) {
        this.log(
          "WARN",
          `${Metadata.Identifier} is exposed but denies every request: define static canAct (or the instance canAct)`
        );
      } else if (!hasStaticPermissionCheck(model)) {
        // Instance form only: static actions are asked without object, so the base static refuses them all
        const statics = Object.keys(Metadata.Actions ?? {}).filter(name => Metadata.Actions[name]?.global);
        if (statics.length) {
          this.log(
            "WARN",
            `${Metadata.Identifier} defines only the instance canAct: its static actions (${statics.join(", ")}) are always refused, define static canAct`
          );
        }
      }
      const shortId = Metadata.Identifier.split("/").pop();
      const plural = Metadata.Plural;
      const modelSchema = modelKey;
      const actionsName = Object.keys(Metadata.Actions);

      // Build primary key schema for this model
      const pkSchemaName = `${modelKey}.primaryKey`;
      const pkFields = Metadata.PrimaryKey || ["uuid"];
      const pkSchema: any = { type: "object", properties: {}, required: pkFields };
      for (const field of pkFields) {
        pkSchema.properties[field] = { type: "string" };
      }
      if (!hasSchema(pkSchemaName)) {
        registerSchema(pkSchemaName, pkSchema);
      }
      // Always register in the app schema map (the global registry is process-wide) so getSchema() finds it
      appSchemas[pkSchemaName] ??= pkSchema;

      // Build query result schema for this model
      const queryResultSchemaName = `${modelKey}.queryResult`;
      const queryResultSchema: any = {
        type: "object",
        properties: {
          continuationToken: { type: "string" },
          results: { type: "array", items: { $ref: `#/definitions/${modelKey}` } }
        }
      };
      if (!hasSchema(queryResultSchemaName)) {
        registerSchema(queryResultSchemaName, queryResultSchema);
      }
      appSchemas[queryResultSchemaName] ??= queryResultSchema;

      // URL path segments for the model's primary key (e.g. "{slug}" or
      // "{follower}/{following}"). Named after the real PK fields so the router
      // exposes them in context.getParameters() under matching names, which is
      // what the pkSchema validation and modelGet/Update/Delete expect.
      const pkPath = pkFields.map(f => `{${String(f)}}`).join("/");

      // CRUD operations
      ["create", "update"]
        .filter(k => !actionsName.includes(k))
        .forEach(k => {
          k = k.substring(0, 1).toUpperCase() + k.substring(1);
          const id = `${shortId}.${k}`;
          registerOperation(id, {
            service: this.getName(),
            method: k === "Create" ? "modelCreate" : "modelUpdate",
            input: modelSchema + "?",
            output: modelSchema,
            summary: k === "Create" ? `Create a new ${shortId}` : `Update a ${shortId}`,
            tags: [shortId],
            rest: { method: k === "Create" ? "post" : "put", path: k === "Create" ? "" : pkPath },
            context: {
              model,
              pkFields
            }
          });
        });
      ["delete", "get"]
        .filter(k => !actionsName.includes(k))
        .forEach(k => {
          k = k.substring(0, 1).toUpperCase() + k.substring(1);
          const id = `${shortId}.${k}`;
          registerOperation(id, {
            service: this.getName(),
            method: `model${k}`,
            input: pkSchemaName,
            output: k === "Get" ? modelSchema : "void",
            summary: `${k === "Delete" ? "Delete" : "Retrieve"} a ${shortId}`,
            tags: [shortId],
            rest: { method: k === "Delete" ? "delete" : "get", path: pkPath },
            context: {
              model,
              pkFields
            }
          });
        });
      if (!actionsName.includes("query")) {
        const id = `${plural}.Query`;
        registerOperation(id, {
          service: this.getName(),
          method: "modelQuery",
          input: "searchRequest",
          output: queryResultSchemaName,
          summary: `Query ${plural}`,
          tags: [shortId],
          rest: { method: this.parameters.queryMethod.toLowerCase() as "put" | "get", path: "" },
          context: {
            model
          }
        });
      }
      // Add patch
      if (!actionsName.includes("update")) {
        const id = `${shortId}.Patch`;
        registerOperation(id, {
          service: this.getName(),
          method: "modelPatch",
          input: modelSchema + "?",
          output: modelSchema,
          summary: `Patch a ${shortId}`,
          tags: [shortId],
          rest: { method: "patch", path: pkPath },
          context: {
            model,
            pkFields
          }
        });
      }
      // Add all operations for Actions
      const actions = Metadata.Actions;
      Object.keys(actions)
        .filter(k => !["create", "update", "delete", "get", "query"].includes(k))
        .forEach(name => {
          const id = `${shortId}.${name.substring(0, 1).toUpperCase() + name.substring(1)}`;
          const info: any = {
            service: this.getName(),
            method: `modelAction`,
            id
          };
          info.input = actions[name].global ? `${modelKey}.${name}.input` : "uuidRequest";
          info.output = `${modelKey}.${name}.output`;
          info.context = {
            model,
            action: { ...actions[name], name }
          };
          info.summary = `${name.substring(0, 1).toUpperCase() + name.substring(1)} on ${shortId}`;
          info.tags = [shortId];
          info.rest = {
            method: (actions[name].method || "PUT").toLowerCase(),
            path: actions[name].global ? name : `{uuid}/${name}`
          };
          registerOperation(id, info);
        });

      this.addBehaviorOperations(model as any, Metadata, shortId);
    }
  }

  /**
   * Register one operation per declared action on every Behavior attribute of
   * the model. Operation ids follow the `<Model>.<Attribute>.<Action>` shape
   * so transports can discover them with the same lookup logic used for
   * model-level operations.
   *
   * The actual dispatch is deferred to `modelBehaviorAction`. This method
   * only wires the registry entries — it does not invoke behaviors.
   *
   * @param model - the model class owning the behavior attribute
   * @param Metadata - the model metadata blob (with Relations.behaviors)
   * @param name - the model's short identifier (e.g. "User")
   */
  addBehaviorOperations(model: ModelClass<Model>, Metadata: any, name: string) {
    const app = useApplication<Application>();
    (Metadata.Relations?.behaviors || []).forEach((behaviorRel: { attribute: string; behavior: string }) => {
      const behaviorMeta = app.getBehaviorMetadata(behaviorRel.behavior);
      if (!behaviorMeta) {
        return;
      }
      const attributeCap = behaviorRel.attribute.substring(0, 1).toUpperCase() + behaviorRel.attribute.substring(1);
      Object.keys(behaviorMeta.Actions || {}).forEach(actionName => {
        const actionCap = actionName.substring(0, 1).toUpperCase() + actionName.substring(1);
        const id = `${name}.${attributeCap}.${actionCap}`;
        const inputSchema = `${behaviorRel.behavior}.${actionName}.input`;
        const outputSchema = `${behaviorRel.behavior}.${actionName}.output`;
        const actionMeta = (behaviorMeta.Actions || {})[actionName] || {};
        const restHint = actionMeta.rest ?? {};
        const route = restHint.route;
        const method = (restHint.method ?? "PUT").toLowerCase() as "get" | "post" | "put" | "delete" | "patch";
        let path: string;
        if (route === ".") {
          path = `{uuid}/${behaviorRel.attribute}`;
        } else if (route !== undefined && route !== "") {
          path = `{uuid}/${behaviorRel.attribute}/${route}`;
        } else {
          path = `{uuid}/${behaviorRel.attribute}.${actionName}`;
        }
        registerOperation(id, {
          service: this.getName(),
          method: "modelBehaviorAction",
          input: hasSchema(inputSchema) ? inputSchema : "uuidRequest",
          output: hasSchema(outputSchema) ? outputSchema : "void",
          summary: `${actionCap} on ${name}.${behaviorRel.attribute}`,
          tags: [name],
          rest: {
            method,
            path
          },
          context: {
            model,
            attribute: behaviorRel.attribute,
            behavior: behaviorRel.behavior,
            action: actionName
          }
        });
      });
    });
  }

  /**
   * Dispatcher for a behavior-attribute action registered by
   * `addBehaviorOperations`. Mirrors the shape of `modelAction`:
   *
   *   1. read the parent model class + attribute/action names off
   *      `operationContext` (set up by `callOperation`),
   *   2. take `args[0]` as the parent UUID (Behavior actions are always
   *      instance-scoped per the spec),
   *   3. load the parent via `model.ref(uuid).get()` — `NotFound` if missing
   *      or soft-deleted,
   *   4. ask the model whether the action is allowed via
   *      `canAct(ctx, "<attribute>.<action>")` — anything but `true` (or the
   *      instance itself, the convention some models use to say "yes, on this
   *      object") is treated as a denial,
   *   5. read `instance[attribute]` — already a hydrated Behavior instance
   *      thanks to `CoreModel.deserialize` (Task 7),
   *   6. call `behaviorInstance[action](...args.slice(1))` and let
   *      `callOperation` write the result onto the context.
   *
   * @param args - resolved arguments from `resolveArguments`; the first is
   * always the parent UUID, the rest come from the request body / query
   * params depending on the registered input schema.
   * @returns the Behavior method's return value (callOperation writes it to
   * the context output if non-undefined).
   */
  async modelBehaviorAction(...args: any[]): Promise<any> {
    const context = useContext<OperationContext>();
    const { model, attribute, action, behavior } = context.getExtension<{
      model: ModelClass<Model>;
      attribute: string;
      behavior: string;
      action: string;
    }>("operationContext");

    // `args` was built by `resolveArguments` from the operation's input
    // schema. Two schema shapes coexist:
    //   1. Auto-generated from the method signature (`exploreBehaviorsAction`
    //      in the compiler) — e.g. `setMetadata(hash, metadata)` produces
    //      `{ hash, metadata }`. No `uuid` property.
    //   2. Legacy `uuidRequest` fallback (and hand-crafted test schemas) —
    //      starts with `{ uuid, ... }`. The `uuid` slot exists only so the
    //      validator accepts the URL param.
    // When the schema starts with `uuid`, drop it before forwarding to the
    // behavior method (whose signature never includes uuid). When it
    // doesn't, forward as-is.
    const operationId = context.getExtension<string>("operation");
    const opInput = operationId ? useInstanceStorage().operations?.[operationId]?.input : undefined;
    const inputSchema = typeof opInput === "string" ? useApplication().getSchema(opInput) : undefined;
    const propNames = inputSchema?.properties ? Object.keys(inputSchema.properties) : [];
    const passArgs = propNames[0] === "uuid" ? args.slice(1) : args;

    // Parent uuid comes from the URL (`/posts/{uuid}/mainImage/...`) on REST; transports without URL parameters
    // (gRPC, MCP) carry it in the input, as the uuidRequest schema declares
    let uuid = (context.getParameters() || {}).uuid;
    if (uuid === undefined) {
      uuid = propNames[0] === "uuid" ? args[0] : (await context.getInput().catch(() => undefined))?.uuid;
    }
    // A missing parent and a parent the caller cannot read answer the same NotFound
    const instance: any = await this.loadModel(model, uuid);

    await this.checkPermission(instance, context, `${attribute}.${action}`, model);

    const behaviorInstance = instance[attribute];
    if (!behaviorInstance || typeof behaviorInstance[action] !== "function") {
      throw new WebdaError.NotFound(`Behavior method ${attribute}.${action} not found`);
    }

    void behavior; // tagged in operationContext for future use
    return behaviorInstance[action](...passArgs);
  }
}
