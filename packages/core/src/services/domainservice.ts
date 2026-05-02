import { TransformCase, TransformCaseType } from "@webda/utils";
import { Service } from "./service.js";
import { Application } from "../application/application.js";
import type { ModelAction } from "../models/types.js";
import { OperationContext } from "../contexts/operationcontext.js";
import type { Model, ModelClass } from "@webda/models";
import { runWithContext, useContext } from "../contexts/execution.js";

import * as WebdaError from "../errors/errors.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { useApplication } from "../application/hooks.js";
import { OperationDefinition } from "../core/icore.js";
import { useModelMetadata } from "../core/hooks.js";
import { registerOperation } from "../core/operations.js";
import { hasSchema, registerSchema } from "../schemas/hooks.js";

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
      throw new WebdaError.NotFound("Object not found");
    }
    return object;
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
    return runWithContext(context, async () => {
      // Instantiate the model from raw input, load data, then save
      const object = new (model as any)() as Model;
      (object as any).load(input);
      await object.save();
      return object;
    });
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
    // Resolve the PK from body or URL params using the model's actual PK fields;
    // fall back to "uuid" for legacy operations without pkFields in the context.
    const params = context.getParameters() ?? {};
    const fields = pkFields?.length ? pkFields : ["uuid"];
    const pk: any =
      fields.length === 1
        ? input?.[fields[0]] ?? params[fields[0]]
        : fields.reduce((acc, f) => {
            acc[f] = input?.[f] ?? params[f];
            return acc;
          }, {} as Record<string, unknown>);
    const object = await this.loadModel(model, pk);
    object["load"](input);
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
    //await object.checkAct(context, "get");
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
    //await object.checkAct(context, "delete");
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
    return runWithContext(context, async () => {
      try {
        return await model.query(query);
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
    // Build the PK from the model's real primary-key fields (same logic as modelUpdate).
    const params = context.getParameters() ?? {};
    const fields = pkFields?.length ? pkFields : ["uuid"];
    const pk: any =
      fields.length === 1
        ? input?.[fields[0]] ?? params[fields[0]]
        : fields.reduce((acc, f) => {
            acc[f] = input?.[f] ?? params[f];
            return acc;
          }, {} as Record<string, unknown>);
    const object = await this.loadModel(model, pk);
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
    if (!action.global) {
      // First arg is uuid when the action is instance-level
      const uuid = args[0];
      const object = await model.ref(uuid).get();
      if (!object || object.isDeleted()) {
        throw new WebdaError.NotFound("Object not found");
      }
      //await object.checkAct(context, action.name as ActionsEnum<Model>);
      return object[action.name](context);
    } else {
      return model[action.name](context);
    }
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
      const shortId = Metadata.Identifier.split("/").pop();
      const plural = Metadata.Plural;
      const modelSchema = modelKey;
      const actionsName = Object.keys(Metadata.Actions);

      // Build primary key schema for this model
      const pkSchemaName = `${modelKey}.primaryKey`;
      const pkFields = Metadata.PrimaryKey || ["uuid"];
      if (!hasSchema(pkSchemaName)) {
        const pkSchema: any = { type: "object", properties: {}, required: pkFields };
        for (const field of pkFields) {
          pkSchema.properties[field] = { type: "string" };
        }
        registerSchema(pkSchemaName, pkSchema);
        // Also register in the app schema registry so getSchema() finds it
        appSchemas[pkSchemaName] = pkSchema;
      }

      // Build query result schema for this model
      const queryResultSchemaName = `${modelKey}.queryResult`;
      if (!hasSchema(queryResultSchemaName)) {
        const queryResultSchema: any = {
          type: "object",
          properties: {
            continuationToken: { type: "string" },
            results: { type: "array", items: { $ref: `#/definitions/${modelKey}` } }
          }
        };
        registerSchema(queryResultSchemaName, queryResultSchema);
        appSchemas[queryResultSchemaName] = queryResultSchema;
      }

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
      const attributeCap =
        behaviorRel.attribute.substring(0, 1).toUpperCase() + behaviorRel.attribute.substring(1);
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
    const { model, attribute, action } = context.getExtension<{
      model: ModelClass<Model>;
      attribute: string;
      behavior: string;
      action: string;
    }>("operationContext");

    // The parent uuid lives on the URL (`/posts/{uuid}/mainImage/...`) and is
    // exposed via `context.getParameters()`. We deliberately do not consume an
    // entry from `args` because `resolveArguments` already drives `args` from
    // the behavior method's own signature (e.g. `setMetadata(hash, metadata)`),
    // which has no `uuid` parameter.
    const uuid = (context.getParameters() || {}).uuid;
    let instance: any;
    try {
      instance = await model.ref(uuid).get();
    } catch {
      // Repositories (e.g. MemoryRepository) throw a plain Error when the
      // primary key isn't in storage. Treat that the same as a "soft" miss.
    }
    if (!instance || instance.isDeleted?.()) {
      throw new WebdaError.NotFound("Object not found");
    }

    const allowed = await instance.canAct(context, `${attribute}.${action}`);
    if (allowed !== true && allowed !== instance) {
      throw new WebdaError.Forbidden(`Action ${attribute}.${action} not allowed`);
    }

    const behaviorInstance = instance[attribute];
    if (!behaviorInstance || typeof behaviorInstance[action] !== "function") {
      throw new WebdaError.NotFound(`Behavior method ${attribute}.${action} not found`);
    }

    return behaviorInstance[action](...args);
  }

}
