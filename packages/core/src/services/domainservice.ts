import { JSONSchema7 } from "json-schema";
import {
  Application,
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
  nameTransfomer: "camelCase" | "lowercase" | "none";

  constructor(params: any) {
    super(params);
    // Init default here
    this.operations ??= true;
    this.nameTransfomer ??= "camelCase";
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
    if (!model.Expose) {
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
    const injectAttribute = this.app.getRelations(model)?.parent?.attribute;

    const injector = (service: Store, method: Methods<Store>, type: "SET" | "QUERY", ...args: any[]) => {
      return async (context: WebContext) => {
        let input = await context.getInput();
        if (type === "SET" && injectAttribute && depth > 0) {
          input[injectAttribute] = context.getPathParameters()[`pid.${depth - 1}`];
        } else if (type === "QUERY") {
          input.q = input.q ? ` AND (${input.q})` : "";
          if (injectAttribute && depth > 0) {
            input.q = ` AND ${injectAttribute} = "${context.getPathParameters()[`pid.${depth - 1}`]}"` + input.q;
          }
          input.q = `__types CONTAINS "${model.getIdentifier()}"` + input.q;
        }
        await service[method](context, ...args);
      };
    };

    // Update prefix
    const prefix = (context.prefix || this.parameters.url || "/") + this.transformName(name);
    context.prefix = prefix + `/{pid.${depth}}/`;

    model.Expose.restrict.query ||
      this.addRoute(`${prefix}`, ["GET", "PUT"], injector(model.store(), "httpQuery", "QUERY"));
    model.Expose.restrict.create ||
      this.addRoute(`${prefix}`, ["POST"], injector(model.store(), "operationCreate", "SET", model.getIdentifier()));
    model.Expose.restrict.delete || this.addRoute(`${prefix}/{uuid}`, ["DELETE"], ctx => model.store().httpDelete(ctx));
    model.Expose.restrict.update ||
      this.addRoute(`${prefix}/{uuid}`, ["PUT", "PATCH"], injector(model.store(), "httpUpdate", "SET"));
    model.Expose.restrict.get || this.addRoute(`${prefix}/{uuid}`, ["GET"], ctx => model.store().httpGet(ctx));

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
            model.store().httpGlobalAction(ctx);
          } else {
            model.store().httpAction(ctx);
          }
        },
        action.openapi
      );
    });

    return true;
  }
}
