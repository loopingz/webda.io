import { TransformCase, TransformCaseType } from "@webda/utils";
import { Service } from "./service.js";
import { Application } from "../application/application.js";
import type { ModelAction } from "../models/types.js";
import { useLoginMfa } from "../models/mfa.model.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { UuidModel, type Model, type ModelClass } from "@webda/models";
import { runAsSystem, runWithContext, useContext } from "../contexts/execution.js";

import * as WebdaError from "../errors/errors.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { useApplication } from "../application/hooks.js";
import { useModelMetadata } from "../core/hooks.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import { ARGUMENTS_KEYWORD, registerOperation } from "../core/operations.js";
import { hasSchema, registerSchema } from "../schemas/hooks.js";
import { bindRestInput } from "../rest/binding.js";
import {
  checkModelParent,
  checkModelPermission,
  checkStaticModelPermission,
  createModel,
  getParentRelation,
  hasModelPermissionCheck,
  hasStaticPermissionCheck,
  NOT_FOUND_MESSAGE,
  QUERY_TOTAL_SCHEMA,
  queryModelWithPermissions
} from "../models/permissions.js";

/**
 * Sanitize client input before it reaches a model (REST, gRPC, MCP and GraphQL):
 * - `__`-prefixed (private) keys are removed at any depth;
 * - `_`-prefixed attributes are removed, unless the model lists them in its static `getClientWritableAttributes()`:
 *   by convention they are server-managed (`_user`, `_roles`, `_groups`, `_creationDate`...);
 * - Behavior-typed attributes (Metadata.Relations.behaviors) are removed: behavior state can only be changed through
 *   the behavior's own actions;
 * - the attributes of the model's static `getProtectedAttributes()` are removed, even when listed as writable;
 * - the attributes the model schemas mark `readOnly` (`@readOnly` on the property) are removed: they are server-managed.
 * @param model - the model class
 * @param input - the client input
 * @returns the sanitized input
 */
export function sanitizeModelInput<T = any>(model: ModelClass<any>, input: T): T {
  const out: any = stripPrivateFields(input);
  if (!out || typeof out !== "object" || Array.isArray(out)) {
    return out;
  }
  const writable = getClientWritableAttributes(model);
  const removed = new Set<string>([
    ...getReadOnlyAttributes(model),
    ...(useModelMetadata(model)?.Relations?.behaviors ?? []).map(rel => rel.attribute),
    // Server-managed attributes (e.g. the owner of an OwnerModel) are never taken from client input
    ...getProtectedAttributes(model)
  ]);
  // Object.fromEntries defines own properties: no client-chosen key is ever written or deleted dynamically
  return Object.fromEntries(
    Object.entries(out).filter(([key]) => !removed.has(key) && (!key.startsWith("_") || writable.includes(key)))
  ) as T;
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
 * Attributes the model schemas (Input, Output, Stored) mark `readOnly`: server-managed, never taken from client input
 * @param model - the model class
 * @returns the attribute names
 */
export function getReadOnlyAttributes(model: any): string[] {
  let schemas: Record<string, any> | undefined;
  try {
    schemas = useModelMetadata(model)?.Schemas;
  } catch {
    return [];
  }
  const names = new Set<string>();
  for (const schema of Object.values(schemas ?? {})) {
    for (const [name, property] of Object.entries((schema as any)?.properties ?? {})) {
      if ((property as any)?.readOnly === true || (property as any)?.readonly === true) {
        names.add(name);
      }
    }
  }
  return [...names];
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
export const INTERNAL_MODELS: readonly string[] = [
  "Webda/Ident",
  "Webda/RefreshToken",
  "Webda/RevokedAccess",
  // Owned by @webda/oauth
  "Webda/OAuthCode",
  "Webda/OAuthDeviceCode",
  "Webda/OAuthGrant",
  "Webda/OAuthRegisteredClient"
];

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
        },
        count: {
          type: "boolean"
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
   * The model input of a create, update or patch: always the full request body
   *
   * The CRUD methods take no argument: resolveArguments spreads the model schema's properties into positional args, so
   * the first one is only the value of the first property, which may itself be an object or an array (#911).
   *
   * An empty body (undefined) is accepted as "no fields"; any other body that is not a plain object (array, string,
   * number, boolean or null) is refused.
   * @param context - the operation context
   * @returns the request body
   * @throws BadRequest when the body is not an object
   */
  protected async getModelInput(context: OperationContext): Promise<any> {
    const input = await context.getInput();
    if (input !== undefined && (typeof input !== "object" || input === null || Array.isArray(input))) {
      throw new WebdaError.BadRequest("Model input must be an object");
    }
    return input;
  }

  /**
   * Create a model operation implementation
   *
   * The model data is the request body ({@link getModelInput})
   * @returns the created model instance
   */
  async modelCreate(): Promise<Model> {
    const context = useContext<OperationContext>();
    const { model } = context.getExtension<{ model: ModelClass<Model> }>("operationContext");
    const input = prepareCreateInput(model, await this.getModelInput(context));
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
   *
   * The update data is the request body ({@link getModelInput})
   * @returns the updated model instance
   */
  async modelUpdate(): Promise<Model> {
    const context = useContext<OperationContext>();
    const { model, pkFields } = context.getExtension<{
      model: ModelClass<Model>;
      pkFields?: string[];
    }>("operationContext");
    const input = sanitizeModelInput(model, await this.getModelInput(context));
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
   * @param count - also return the total of the query (`total`), when the model allows it
   * @returns the query results
   */
  async modelQuery(query: string, count?: boolean): Promise<any> {
    const context = useContext<OperationContext>();
    const { model } = context.getExtension<{ model: ModelClass }>("operationContext");
    if (query !== undefined && query !== null && typeof query !== "string") {
      throw new WebdaError.BadRequest("Query must be a string");
    }
    return runWithContext(context, async () => {
      try {
        return await queryModelWithPermissions(model, query, context, { count: count === true });
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
   *
   * The partial update data is the request body ({@link getModelInput})
   * @returns the patched model instance
   */
  async modelPatch(): Promise<Model> {
    const context = useContext<OperationContext>();
    const { model, pkFields } = context.getExtension<{
      model: ModelClass<Model>;
      pkFields?: string[];
    }>("operationContext");
    const input = sanitizeModelInput(model, await this.getModelInput(context));
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
   * Whether an action has an input schema, so it receives its parameters rather than the context
   * @param model - the model class
   * @param action - the action
   * @param action.name - the action name
   * @returns true when `<model>.<action>.input` exists
   */
  protected hasActionInput(model: ModelClass<Model>, action: { name: string }): boolean {
    return !!this.actionInput(`${useModelMetadata(model)?.Identifier}`, action.name);
  }

  /**
   * The `.input` schema of an action, when it describes its parameters
   *
   * A module built before `x-webda-context` expanded an `OperationContext` parameter into the schema: such an
   * action is treated as taking the context only, as before.
   * @param modelKey - model identifier
   * @param name - action name
   * @returns the input schema, undefined when the action takes no input or has an old-style schema
   */
  protected actionInput(modelKey: string, name: string): any {
    const input: any = useApplication().getSchema(`${modelKey}.${name}.input`);
    if (!input || input[ARGUMENTS_KEYWORD]) {
      return input;
    }
    // The expanded OperationContext carries its internal fields
    const expanded = Object.values<any>(input.properties ?? {}).some(
      property => property?.properties?._promises !== undefined
    );
    if (expanded) {
      this.log("WARN", `${modelKey}.${name}.input expands an OperationContext: rebuild the module with webdac`);
      return undefined;
    }
    return input;
  }

  /**
   * Action on a model
   *
   * An instance action receives the primary key fields first (to load the object), then its parameters; a static action its
   * parameters. Actions without an input schema receive the context.
   * @param args - arguments forwarded to the action method
   * @returns the action result
   */
  async modelAction(...args: any[]): Promise<any> {
    const context = useContext<OperationContext>();
    const {
      model,
      action,
      pkFields = ["uuid"]
    } = context.getExtension<{
      model: ModelClass<Model>;
      action: ModelAction & { name: string };
      pkFields?: string[];
    }>("operationContext");
    // The action can be exposed under another name than its method
    const handler = action.handler || action.name;
    if (!action.global) {
      // The key fields precede the declared action arguments
      const uuid = pkFields.length === 1 ? args[0] : Object.fromEntries(pkFields.map((field, i) => [field, args[i]]));
      // A missing object and an object the caller cannot read answer the same NotFound
      const object = await this.loadModel(model, uuid);
      await this.checkPermission(object, context, action.name, model);
      // With an input schema the arguments follow the uuid (the context included where a parameter asks for it)
      return this.hasActionInput(model, action)
        ? object[handler](...args.slice(pkFields.length))
        : object[handler](context);
    } else {
      // Static action: the model's static canAct is asked without object
      await checkStaticModelPermission(model, context, action.name);
      // With an input schema the arguments are resolved from it (`callOperation`), the context included where a
      // parameter asks for it; without one the body is passed, sanitized like model input (`__`, `_`, protected
      // and read-only attributes removed); no body: the context
      if (this.hasActionInput(model, action)) {
        return model[handler](...args);
      }
      const resolved = args.length > 0 && !(args[0] instanceof OperationContext);
      return model[handler](...(resolved ? [sanitizeModelInput(model, args[0]), ...args.slice(1)] : [context]));
    }
  }

  /**
   * Register the input schema of an instance action operation: the primary key and action parameters
   *
   * The key fields come first in `x-webda-arguments`: `modelAction` loads the object with them and passes the rest
   * to the action method.
   * @param modelKey - model identifier
   * @param name - action name
   * @param input - the action `.input` schema (its parameters)
   * @param pkFields - implicit primary key fields
   * @returns the registered schema name, `<modelKey>.<name>.request`
   * @throws Error when an action parameter conflicts with a primary key field
   */
  protected actionRequestSchema(modelKey: string, name: string, input: any, pkFields: string[] = ["uuid"]): string {
    const conflict = pkFields.find(field => input.properties?.[field] !== undefined);
    if (conflict) {
      // The uuid identifies the object: a parameter with the same name would receive it, or break the schema
      throw new Error(
        `${modelKey}.${name}: parameter "${conflict}" conflicts with the object primary key, rename the action parameter`
      );
    }
    const schemaName = `${modelKey}.${name}.request`;
    const request: any = {
      ...input,
      type: "object",
      properties: { ...Object.fromEntries(pkFields.map(field => [field, { type: "string" }])), ...input.properties },
      required: [...pkFields, ...(input.required ?? [])],
      [ARGUMENTS_KEYWORD]: [...pkFields, ...(input[ARGUMENTS_KEYWORD] ?? Object.keys(input.properties ?? {}))]
    };
    registerSchema(schemaName, request, true);
    // Always register in the app schema map (the global registry is process-wide) so getSchema() finds it
    useApplication().getSchemas()[schemaName] = request;
    return schemaName;
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
          results: { type: "array", items: { $ref: `#/definitions/${modelKey}` } },
          total: structuredClone(QUERY_TOTAL_SCHEMA)
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
          // An instance action with parameters receives them after the object uuid; without schema: the context
          const actionInput = this.actionInput(modelKey, name);
          info.input = actions[name].global
            ? actionInput
              ? `${modelKey}.${name}.input`
              : "void"
            : actionInput
              ? this.actionRequestSchema(modelKey, name, actionInput, pkFields)
              : pkSchemaName;
          info.output = `${modelKey}.${name}.output`;
          info.context = {
            model,
            pkFields,
            action: { ...actions[name], name }
          };
          info.summary =
            actions[name].summary ?? `${name.substring(0, 1).toUpperCase() + name.substring(1)} on ${shortId}`;
          info.description = actions[name].description;
          info.tags = [shortId];
          if (actions[name].maxMfaAge !== undefined) {
            info.maxMfaAge = actions[name].maxMfaAge;
          }
          const hint = actions[name].rest ?? {};
          const method = (hint.method || actions[name].methods?.[0] || actions[name].method || "PUT").toLowerCase();
          let path = hint.path ?? (actions[name].global ? name : `${pkPath}/${name}`);
          if (!actions[name].global && hint.path !== undefined) {
            const missing = pkFields.filter(field => !path.includes(`{${field}}`));
            if (missing.length) path = missing.map(field => `{${field}}`).join("/") + "/" + path;
          }
          info.context.restPath = path;
          info.rest = {
            method,
            path: bindRestInput(path, method, app.getSchema(info.input), hint.body).path,
            ...(hint.body ? { body: hint.body } : {})
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
    const pkFields: string[] = Metadata.PrimaryKey?.length ? Metadata.PrimaryKey : ["uuid"];
    const pkPath = pkFields.map(field => `{${field}}`).join("/");
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
        const route = restHint.path ?? restHint.route;
        const method = (restHint.method ?? actionMeta.methods?.[0] ?? "PUT").toLowerCase() as
          "get" | "post" | "put" | "delete" | "patch";
        let path: string;
        if (route === ".") {
          path = `${pkPath}/${behaviorRel.attribute}`;
        } else if (route !== undefined && route !== "") {
          path = `${pkPath}/${behaviorRel.attribute}/${route}`;
        } else {
          path = `${pkPath}/${behaviorRel.attribute}.${actionName}`;
        }
        let input: any = hasSchema(inputSchema) ? app.getSchema(inputSchema) : undefined;
        // Older hand-written behavior schemas included the implicit parent uuid themselves.
        if (input?.properties?.uuid && pkFields.length === 1 && pkFields[0] === "uuid") {
          input = {
            ...input,
            properties: { ...input.properties },
            required: input.required?.filter((p: string) => p !== "uuid")
          };
          delete input.properties.uuid;
          if (input[ARGUMENTS_KEYWORD])
            input[ARGUMENTS_KEYWORD] = input[ARGUMENTS_KEYWORD].filter((p: string) => p !== "uuid");
        }
        const requestSchema = this.actionRequestSchema(
          `${Metadata.Identifier}.${behaviorRel.attribute}`,
          actionName,
          input ?? { type: "object", properties: {} },
          pkFields
        );
        registerOperation(id, {
          service: this.getName(),
          method: "modelBehaviorAction",
          input: requestSchema,
          output: hasSchema(outputSchema) ? outputSchema : "void",
          summary: `${actionCap} on ${name}.${behaviorRel.attribute}`,
          tags: [name],
          rest: {
            method,
            path: bindRestInput(path, method, app.getSchema(requestSchema), restHint.body).path,
            ...(restHint.body ? { body: restHint.body } : {})
          },
          context: {
            model,
            pkFields,
            restPath: path,
            attribute: behaviorRel.attribute,
            behavior: behaviorRel.behavior,
            action: actionName
          },
          ...(actionMeta.maxMfaAge !== undefined ? { maxMfaAge: actionMeta.maxMfaAge } : {})
        });
      });
    });
  }

  /**
   * Load the parent by its resolved key, check the dotted behavior permission, and forward the typed arguments.
   * Login MFA keeps its own pending-session lifecycle checks.
   * @param args - parent key fields followed by method parameters in declaration order
   * @returns the behavior method's return value
   */
  async modelBehaviorAction(...args: any[]): Promise<any> {
    const context = useContext<OperationContext>();
    const {
      model,
      attribute,
      action,
      behavior,
      pkFields = ["uuid"]
    } = context.getExtension<{
      model: ModelClass<Model>;
      attribute: string;
      behavior: string;
      action: string;
      pkFields?: string[];
    }>("operationContext");

    // Registered requests put the key fields first. Keep accepting direct/legacy calls that carry only the
    // method arguments and supply the parent uuid through the context.
    const operationId = context.getExtension<string>("operation");
    const opInput = operationId ? useInstanceStorage().operations?.[operationId]?.input : undefined;
    const inputSchema = typeof opInput === "string" ? useApplication().getSchema(opInput) : undefined;
    const propNames = inputSchema?.properties ? Object.keys(inputSchema.properties) : [];
    const hasKeyArguments = pkFields.every((field, index) => propNames[index] === field);
    const passArgs = hasKeyArguments ? args.slice(pkFields.length) : args;

    // Every transport carries the key in the registered request; legacy direct calls may put it in parameters.
    let uuid: any = pkFields.length === 1 ? (context.getParameters() || {})[pkFields[0]] : undefined;
    if (uuid === undefined) {
      uuid = hasKeyArguments
        ? pkFields.length === 1
          ? args[0]
          : Object.fromEntries(pkFields.map((field, i) => [field, args[i]]))
        : (await context.getInput().catch(() => undefined))?.uuid;
    }
    // A missing parent and a parent the caller cannot read answer the same NotFound
    const loginMfa = useLoginMfa(useModelMetadata(model).Identifier, attribute);
    let instance: any;
    if (loginMfa) {
      // Pending sessions may access only their own configured login attribute. Its lifecycle checks the action.
      const session = context.getSession();
      if (!session.userId || (uuid !== undefined && uuid !== session.userId)) {
        throw new WebdaError.Unauthorized("Own login MFA required");
      }
      instance = await runAsSystem(() => model.ref(session.userId).get());
    } else {
      instance = await this.loadModel(model, uuid);
      await this.checkPermission(instance, context, `${attribute}.${action}`, model);
    }

    const behaviorInstance = instance[attribute];
    if (!behaviorInstance || typeof behaviorInstance[action] !== "function") {
      throw new WebdaError.NotFound(`Behavior method ${attribute}.${action} not found`);
    }

    void behavior; // tagged in operationContext for future use
    return behaviorInstance[action](...passArgs);
  }
}
