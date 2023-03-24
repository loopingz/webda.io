import {
  Application,
  DeepPartial,
  Methods,
  ModelAction,
  Service,
  ServiceParameters,
  Store,
  WebContext
} from "../index";
// 147-158,169-175
class DomainServiceParameters extends ServiceParameters {
  /**
   * Expose objects as operations too
   */
  operations: boolean;
  constructor(params: any) {
    super(params);
    // Init default here
    this.operations ??= true;
  }
}

// Add @WebdaModda to the JSDocs to make it available to your other modules as a Modda
/**
 * A sample service
 *
 */
// Add @Bean to make a singleton in your applicaiton
export class DomainService<T extends DomainServiceParameters = DomainServiceParameters> extends Service<T> {
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
   * Add operations for all exposed models
   * @returns
   */
  initOperations(): void {
    super.initOperations();
    if (!this.parameters.operations) {
      return;
    }
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

    const models = app.getModels();
    for (let modelKey in models) {
      const model = models[modelKey];
      const expose = model.Expose;
      if (!expose) {
        continue;
      }
      expose.restrict ??= {};
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
            input: modelSchema,
            output: modelSchema
          });
        });
      ["delete", "get"]
        .filter(k => !expose.restrict[k])
        .forEach(k => {
          k = k.substring(0, 1).toUpperCase() + k.substring(1);
          const id = `${prefix}.${k}`;
          const output = k === "Get" && modelSchema;
          this.getWebda().registerOperation(id, {
            service: this.getName(),
            method: `http${k}`,
            id,
            input: "uuidRequest",
            output
          });
        });
      if (!expose.restrict.query) {
        const id = `${prefix}.Query`;
        this.getWebda().registerOperation(id, {
          service: this.getName(),
          method: "httpQuery",
          id,
          input: "searchRequest"
        });
      }
      // Add patch
      if (!expose.restrict.update) {
        const id = `${prefix}.Patch`;
        this.getWebda().registerOperation(id, {
          service: this.getName(),
          method: "operationPatch",
          id,
          input: modelSchema + "?"
        });
      }
      // Add all operations for Actions
      let actions = model.getActions();
      Object.keys(actions).forEach(name => {
        const id = `${prefix}.${name.substring(0, 1).toUpperCase() + name.substring(1)}`;
        const info = {
          service: this.getName(),
          method: `action${name}`,
          id
        };
        ["input", "output"]
          .filter(i => app.hasSchema(`${modelKey}.${name}.${i}`))
          .forEach(key => {
            info[key] = `${modelKey}.${name}.${key}`;
          });
        this.getWebda().registerOperation(id, info);
      });
    }
  }

  injector(
    service: Store,
    method: Methods<Store>,
    type: "SET" | "QUERY",
    injectAttribute?: string,
    depth: number = 0,
    ...args: any[]
  ) {
    return async (context: WebContext) => {
      if (!injectAttribute || depth < 1) {
        return service[method](context, ...args);
      }
      let input = await context.getInput();
      if (type === "SET") {
        input[injectAttribute] = context.getPathParameters()[`pid.${depth - 1}`];
      } else if (type === "QUERY") {
        input.q ??= "";
        input.q =
          `${injectAttribute} = "${context.getPathParameters()[`pid.${depth - 1}`]}"` +
          (input.q !== "" ? `AND (${input.q})` : "");
      }
      await service[method](context, ...args);
    };
  }

  /**
   * Add routes for a model
   * @param prefix
   * @param model
   * @param depth
   * @param injectAttribute
   * @returns
   */
  addModelRoutes(prefix: string, model: any, depth: number = 0, injectAttribute?: string) {
    if (!model?.Expose) {
      return;
    }

    this.addRoute(
      `${prefix}`,
      ["GET", "PUT"],
      this.injector(model.store(), "httpQuery", "QUERY", injectAttribute, depth)
    );
    this.addRoute(
      `${prefix}`,
      ["POST"],
      this.injector(model.store(), "operationCreate", "SET", injectAttribute, depth, model.getIdentifier())
    );
    this.addRoute(`${prefix}/{uuid}`, ["DELETE"], model.store()["httpDelete"]);
    this.addRoute(
      `${prefix}/{uuid}`,
      ["PUT", "PATCH"],
      this.injector(model.store(), "httpUpdate", "SET", injectAttribute, depth)
    );
    // Add all actions
    let actions = model.getActions();
    Object.keys(actions).forEach(actionName => {
      let action: ModelAction = actions[actionName];
      this.addRoute(
        action.global ? `${prefix}/${actionName}` : `${prefix}/{uuid}/${actionName}`,
        action.methods || ["PUT"],
        model.store()[action.global ? "httpGlobalAction" : "httpAction"],
        action.openapi
      );
    });
    // Get the children now
    (this.getWebda().getApplication().getRelations(model).children || []).forEach(name => {
      const childModel = this.app.getModel(name);
      this.addModelRoutes(
        `${prefix}/{pid.${depth}}/${this.app.getModelPlural(name).toLowerCase()}`,
        childModel,
        depth + 1,
        this.app.getRelations(childModel)?.parent?.attribute
      );
    });
  }

  /**
   * Your service is now created as all the other services
   */
  resolve(): this {
    super.resolve();

    this.app = this.getWebda().getApplication();
    // Add all routes per model
    Object.values(this.app.getRootModels()).forEach(name =>
      this.addModelRoutes(`/${this.app.getModelPlural(name).toLowerCase()}`, this.app.getModel(name))
    );

    return this;
  }

  /**
   * Init method for your service
   * @param params define in your webda.config.json
   * @returns {Promise<this>}
   */
  async init(): Promise<this> {
    await super.init();
    // You can run any async action to get your service ready
    return this;
  }
}
