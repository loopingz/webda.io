import { Application, DeepPartial, ModelAction, Service, ServiceParameters, WebContext } from "../index";

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
  protected addRoute(...args: any[]) {
    args.pop();
    this.log("INFO", "AddRoute", ...args);
    // @ts-ignore
    super.addRoute(...args);
  }

  /*
  initOperations(): void {
    super.initOperations();
    if (!this.parameters.operations) {
      return;
    }
    const prefix = this.parameters.operationPrefix;
    const expose = this.parameters.expose;
    const webda = this.getWebda();
    const app = webda.getApplication();
    const modelSchema = app.hasSchema(this._modelType) && this._modelType;
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
        input: this._modelType + "?",
        output: this._modelType
      });
    }
    // Add all operations for Actions
    if (this._model && this._model.getActions) {
      let actions = this._model.getActions();
      Object.keys(actions).forEach(name => {
        const id = `${prefix}.${name}`;
        const input =
          app.hasSchema(`${this._modelType}.${name.toLowerCase()}.input`) &&
          `${this._modelType}.${name.toLowerCase()}.input`;
        const output =
          app.hasSchema(`${this._modelType}.${name.toLowerCase()}.output`) &&
          `${this._modelType}.${name.toLowerCase()}.output`;
        this.getWebda().registerOperation(id, {
          service: this.getName(),
          method: `action${name}`,
          id,
          input,
          output
        });
      });
    }
  }
  */

  addModelRoutes(prefix: string, model: any, depth: number = 0, injectAttribute?: string) {
    if (!model?.Expose) {
      return;
    }

    const injector =
      (method: (ctx: WebContext) => Promise<void>, type: "CLEAN" | "SET" | "QUERY") => async (context: WebContext) => {
        if (!injectAttribute) {
          return method(context);
        }
        let input = await context.getInput();
        if (type === "CLEAN" && input[injectAttribute]) {
          delete input[injectAttribute];
        } else if (type === "SET") {
          input[injectAttribute] = context.getParameters()[`pid.${depth}`];
        } else if (type === "QUERY") {
          input.query = `${injectAttribute} = "${context.getParameters()[`pid.${depth}`]}" AND (${input.query})`;
        }
        await method(context);
      };

    this.addRoute(`${prefix}`, ["GET", "PUT"], injector(model.store()["httpQuery"], "QUERY"));
    this.addRoute(`${prefix}`, ["POST"], injector(model.store()["httpCreate"], "SET"));
    this.addRoute(`${prefix}/{uuid}`, ["DELETE"], model.store()["httpDelete"]);
    this.addRoute(`${prefix}/{uuid}`, ["PUT"], injector(model.store()["httpUpdate"], "SET"));
    this.addRoute(`${prefix}/{uuid}`, ["PATCH"], injector(model.store()["httpPatch"], "SET"));
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
