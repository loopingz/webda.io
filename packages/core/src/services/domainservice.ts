import { JSONSchema7 } from "json-schema";
import {
  Application,
  Core,
  CoreModelDefinition,
  DeepPartial,
  JSONUtils,
  Methods,
  ModelAction,
  OperationDefinition,
  Service,
  ServiceParameters,
  Store,
  WebContext
} from "../index";

/**
 * @WebdaModda
 */
export class ModelsOperationsService extends Service {
  /**
   * Add operations for all exposed models
   * @returns
   */
  initOperations(): void {
    super.initOperations();

    const app = this.getWebda().getApplication();

    // Add default schemas
    if (!app.hasSchema("uuidRequest")) {
      app.registerSchema("uuidRequest", {
        type: "object",
        properties: {
          uuid: {
            type: "string"
          }
        },
        required: ["uuid"]
      });
    }
    if (!app.hasSchema("searchRequest")) {
      app.registerSchema("searchRequest", {
        type: "object",
        properties: {
          query: {
            type: "string"
          }
        }
      });
    }

    const getSchema = (id: string, input: string, params?: "uuidRequest" | "searchRequest") => {
      const schema: JSONSchema7 = {
        type: "object",
        properties: {},
        required: []
      };
      if (input && app.hasSchema(input)) {
        schema.properties["input"] = app.getSchema(input);
        schema.required.push("input");
      }
      if (params) {
        schema.properties["params"] = app.getSchema(params);
        schema.required.push("params");
      }
      app.registerSchema(id, schema);
      return id;
    };

    const models = app.getModels();
    for (let modelKey in models) {
      const model = models[modelKey];
      const expose = model.Expose;
      if (!expose) {
        continue;
      }
      const prefix = modelKey.split("/").pop();
      const modelSchema = modelKey;

      ["create", "update"]
        .filter(k => !expose.restrict[k])
        .forEach(k => {
          k = k.substring(0, 1).toUpperCase() + k.substring(1);
          const id = `${prefix}.${k}`;
          this.getWebda().registerOperation(id, {
            service: this.getName(),
            method: k === "Create" ? "httpCreate" : "operationUpdate",
            id,
            input: getSchema(id, modelSchema, k === "Update" ? "uuidRequest" : undefined),
            output: modelSchema
          });
        });
      ["delete", "get"]
        .filter(k => !expose.restrict[k])
        .forEach(k => {
          k = k.substring(0, 1).toUpperCase() + k.substring(1);
          const id = `${prefix}.${k}`;
          const info: OperationDefinition = {
            service: this.getName(),
            method: `http${k}`,
            id,
            input: getSchema(id, undefined, "uuidRequest")
          };
          if (k === "Get") {
            info.output = modelSchema;
          }
          this.getWebda().registerOperation(id, info);
        });
      if (!expose.restrict.query) {
        const id = `${prefix}.Query`;
        this.getWebda().registerOperation(id, {
          service: this.getName(),
          method: "httpQuery",
          id,
          input: getSchema(id, undefined, "searchRequest")
        });
      }
      // Add patch
      if (!expose.restrict.update) {
        const id = `${prefix}.Patch`;
        this.getWebda().registerOperation(id, {
          service: this.getName(),
          method: "operationPatch",
          id,
          input: getSchema(id, modelSchema + "?", "uuidRequest")
        });
      }
      // Add all operations for Actions
      let actions = model.getActions();
      Object.keys(actions).forEach(name => {
        const id = `${prefix}.${name.substring(0, 1).toUpperCase() + name.substring(1)}`;
        const info: any = {
          service: this.getName(),
          method: `action${name}`,
          id
        };
        info.input = getSchema(id, `${modelKey}.${name}.input`, "uuidRequest");
        info.output = `${modelKey}.${name}.output`;
        this.getWebda().registerOperation(id, info);
      });
    }
  }
}

export class DomainServiceParameters extends ServiceParameters {
  /**
   * Expose objects as operations too
   */
  operations: boolean;
  /**
   * Transform the name of the model to be used in the URL
   */
  nameTransfomer: "camelCase" | "lowercase" | "none";
  /**
   * Method used for query objects
   *
   * @default "PUT"
   */
  queryMethod: "PUT" | "GET";
  /**
   * List of models to include
   *
   * If model is prefixed with a ! it will be excluded
   *
   * @default ["*"]
   */
  models: string[];
  /**
   *
   * @SchemaIgnore
   */
  private excludedModels: string[];

  constructor(params: DeepPartial<DomainServiceParameters>) {
    super(params);
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
  }

  /**
   * Is a model is included in the service
   * @param model
   * @returns
   */
  isIncluded(model: string) {
    return !this.isExcluded(model) && (this.models.includes("*") || this.models.includes(model));
  }

  /**
   * Is a model excluded from the service
   * @param model
   * @returns
   */
  isExcluded(model: string) {
    return this.excludedModels.includes(model);
  }
}

/**
 * Domain Service expose all the models as Route and Operations
 *
 * Model are exposed if they have a Expose decorator
 *
 * Children models Exposed should be under the first ModelRelated targetting them or the segment endpoint of Expose
 *
 * Other relations (ModelLinks, ModelParent) should only display their information but not be exposed
 * ModelRelated should be ignored
 */
export abstract class DomainService<T extends DomainServiceParameters = DomainServiceParameters> extends Service<T> {
  app: Application;
  /**
   * Load the paremeters for your service
   * @param params
   * @param name
   */
  loadParameters(params: DeepPartial<DomainServiceParameters>): DomainServiceParameters {
    return new DomainServiceParameters(params);
  }

  /**
   * Return the model name for this service
   * @param name
   * @returns
   */
  transformName(name: string): string {
    if (this.parameters.nameTransfomer === "camelCase") {
      return name.substring(0, 1).toLowerCase() + name.substring(1).replace(/_(.)/g, (match, p1) => p1.toUpperCase());
    } else if (this.parameters.nameTransfomer === "lowercase") {
      return name.toLowerCase();
    }
    return name;
  }

  /**
   * Handle one model and expose it based on the service
   * @param model
   * @param name
   * @param context
   * @returns
   */
  abstract handleModel(model: CoreModelDefinition, name: string, context: any): boolean;

  /**
   * Explore the models
   * @param model
   * @param name
   * @param depth
   * @param modelContext
   * @returns
   */
  walkModel(model: CoreModelDefinition, name: string, depth: number = 0, modelContext: any = {}) {
    // If not expose or not in the list of models
    if (!model.Expose || (model.getIdentifier && !this.parameters.isIncluded(model.getIdentifier()))) {
      return;
    }
    const context = JSONUtils.duplicate(modelContext);
    context.depth = depth;
    if (!this.handleModel(model, name, context)) {
      return;
    }

    const queries = this.app.getRelations(model).queries || [];
    // Get the children now
    (this.app.getRelations(model).children || []).forEach(name => {
      const childModel = this.app.getModel(name);
      const parentAttribute = this.app.getRelations(childModel)?.parent?.attribute;
      const segment =
        queries.find(q => q.model === name && q.targetAttribute === parentAttribute)?.attribute ||
        this.app.getModelPlural(name);
      this.walkModel(childModel, segment, depth + 1, context);
    });
  }

  /**
   * Your service is now created as all the other services
   */
  resolve(): this {
    super.resolve();

    this.app = this.getWebda().getApplication();
    // Add all routes per model
    this.app.getRootExposedModels().forEach(name => {
      const model = this.app.getModel(name);
      this.walkModel(model, this.app.getModelPlural(name));
    });

    return this;
  }
}

/**
 * Expose all models via a REST API
 * @WebdaModda
 */
export class RESTDomainService<T extends DomainServiceParameters = DomainServiceParameters> extends DomainService<T> {
  /**
   * Handle one model and expose it based on the service
   * @param model
   * @param name
   * @param context
   * @returns
   */
  handleModel(model: CoreModelDefinition, name: string, context: any): boolean {
    const depth = context.depth || 0;
    const relations = model.getRelations();
    const injectAttribute = relations?.parent?.attribute;

    const injector = (
      service: Store,
      method: Methods<Store>,
      type: "SET" | "QUERY" | "GET" | "DELETE",
      ...args: any[]
    ) => {
      return async (context: WebContext) => {
        let parentId = `pid.${depth - 1}`;
        if (type === "SET" && injectAttribute && depth > 0) {
          (await context.getInput())[injectAttribute] = context.getPathParameters()[parentId];
        } else if (type === "QUERY") {
          let input = await context.getInput({ defaultValue: { q: "" } });
          let q;
          if (context.getHttpContext().getMethod() === "GET") {
            q = context.getParameters().q;
          } else {
            q = input.q;
          }
          let query = q ? ` AND (${q})` : "";
          if (injectAttribute) {
            query = ` AND ${injectAttribute} = "${context.getPathParameters()[parentId]}"` + query;
          }
          if (args[0] !== 0) {
            query = `__types CONTAINS "${model.getIdentifier()}"` + query;
          }
          if (context.getHttpContext().getMethod() === "GET") {
            context.getParameters().q = query;
          } else {
            input.q = query;
          }
          this.log("TRACE", `Query modified to '${query}' from '${q}' ${args[0]}`);
        }
        // Complete the uuid if needed
        if (context.getParameters().uuid) {
          context.getParameters().uuid = model.completeUid(context.getParameters().uuid);
        }
        await service[method](context, ...args);
      };
    };

    // Update prefix
    const prefix = (context.prefix || this.parameters.url || "/") + this.transformName(name);
    context.prefix = prefix + `/{pid.${depth}}/`;

    model.Expose.restrict.query ||
      this.addRoute(
        `${prefix}`,
        [this.parameters.queryMethod],
        injector(model.store(), "httpQuery", "QUERY", model.store().handleModel(model))
      );
    model.Expose.restrict.create ||
      this.addRoute(`${prefix}`, ["POST"], injector(model.store(), "operationCreate", "SET", model.getIdentifier()));
    model.Expose.restrict.delete ||
      this.addRoute(`${prefix}/{uuid}`, ["DELETE"], injector(model.store(), "httpDelete", "DELETE"));
    model.Expose.restrict.update ||
      this.addRoute(`${prefix}/{uuid}`, ["PUT", "PATCH"], injector(model.store(), "httpUpdate", "SET"));
    model.Expose.restrict.get || this.addRoute(`${prefix}/{uuid}`, ["GET"], injector(model.store(), "httpGet", "GET"));

    // Add all actions
    // Actions cannot be restricted as its purpose is to be exposed
    let actions = model.getActions();
    Object.keys(actions).forEach(actionName => {
      let action: ModelAction = actions[actionName];
      this.addRoute(
        action.global ? `${prefix}/${actionName}` : `${prefix}/{uuid}/${actionName}`,
        action.methods || ["PUT"],
        ctx => {
          if (action.global) {
            model.store().httpGlobalAction(ctx, model);
          } else {
            ctx.getParameters().uuid = model.completeUid(ctx.getParameters().uuid);
            model.store().httpAction(ctx);
          }
        },
        action.openapi
      );
    });

    /*
    Binaries should expose several methods
    If cardinality is ONE
    GET to download the binary
    POST to upload a binary directly
    PUT to upload a binary with challenge
    DELETE /{hash} to delete a binary
    PUT /{hash} to update metadata

    If cardinality is MANY
    GET /{index} to download the binary
    POST to upload a binary directly
    PUT to upload a binary with challenge
    DELETE /{index}/{hash} to delete a binary
    PUT /{index}/{hash} to update metadata
    */

    (relations.binaries || []).forEach(name => {
      const store = Core.get().getBinaryStore(model, name.attribute);
      const modelInjector = async (ctx: WebContext) => {
        ctx.getParameters().model = model.getIdentifier();
        ctx.getParameters().property = name.attribute;
        await store.httpRoute(ctx);
      };
      const modelInjectorChallenge = async (ctx: WebContext) => {
        ctx.getParameters().model = model.getIdentifier();
        ctx.getParameters().property = name.attribute;
        await store.httpChallenge(ctx);
      };
      if (name.cardinality === "ONE") {
        this.addRoute(`${prefix}/{uuid}/${name.attribute}`, ["GET"], modelInjector);
        this.addRoute(`${prefix}/{uuid}/${name.attribute}`, ["PUT"], modelInjectorChallenge);
        this.addRoute(`${prefix}/{uuid}/${name.attribute}`, ["POST"], modelInjector);
        this.addRoute(`${prefix}/{uuid}/${name.attribute}/{hash}`, ["DELETE"], modelInjector);
        this.addRoute(`${prefix}/{uuid}/${name.attribute}/{hash}`, ["PUT"], modelInjector);
      } else {
        this.addRoute(`${prefix}/{uuid}/${name.attribute}/{index}`, ["GET"], modelInjector);
        this.addRoute(`${prefix}/{uuid}/${name.attribute}`, ["PUT"], modelInjectorChallenge);
        this.addRoute(`${prefix}/{uuid}/${name.attribute}`, ["POST"], modelInjector);
        this.addRoute(`${prefix}/{uuid}/${name.attribute}/{index}/{hash}`, ["DELETE"], modelInjector);
        this.addRoute(`${prefix}/{uuid}/${name.attribute}/{index}/{hash}`, ["PUT"], modelInjector);
      }
    });

    return true;
  }
}
