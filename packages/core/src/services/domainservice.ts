import { JSONSchema7 } from "json-schema";
import {
  Application,
  Binary,
  BinaryFileInfo,
  BinaryMap,
  BinaryMetadata,
  BinaryService,
  Core,
  CoreModel,
  CoreModelDefinition,
  DeepPartial,
  JSONUtils,
  ModelAction,
  ModelGraphBinaryDefinition,
  OperationContext,
  OperationDefinition,
  Service,
  ServiceParameters,
  WebContext,
  WebdaError
} from "../index";
import { TransformCase, TransformCaseType } from "../utils/case";

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
    binaryGetRequest: {
      type: "object",
      properties: {
        uuid: {
          type: "string"
        },
        index: {
          type: "number"
        }
      },
      required: ["uuid", "index"]
    },
    binaryHashRequest: {
      type: "object",
      properties: {
        uuid: {
          type: "string"
        },
        hash: {
          type: "string"
        }
      },
      required: ["uuid", "hash"]
    },
    binaryIndexHashRequest: {
      type: "object",
      properties: {
        uuid: {
          type: "string"
        },
        index: {
          type: "number"
        },
        hash: {
          type: "string"
        }
      },
      required: ["uuid", "index", "hash"]
    },
    binaryAttachParameters: {
      type: "object",
      properties: {
        filename: {
          type: "string"
        },
        size: {
          type: "number"
        },
        mimetype: {
          type: "string"
        },
        uuid: {
          type: "string"
        }
      },
      required: ["uuid"]
    },
    binaryChallengeRequest: {
      type: "object",
      properties: {
        hash: {
          type: "string"
        },
        challenge: {
          type: "string"
        }
      },
      required: ["hash", "challenge"]
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
   * Load the paremeters for your service
   * @param params
   * @param name
   */
  abstract loadParameters(params: DeepPartial<DomainServiceParameters>): DomainServiceParameters;

  /**
   * Return the model name for this service
   * @param name
   * @returns
   *
   * @see https://blog.boot.dev/clean-code/casings-in-coding/#:~:text=%F0%9F%94%97%20Camel%20Case,Go
   */
  transformName(name: string): string {
    return TransformCase(name, this.parameters.nameTransfomer);
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
    const shortId = model.getIdentifier(true);
    // Overlap object are hidden by design
    if (shortId.includes("/")) {
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

  /**
   *
   * @param model
   * @param uuid
   */
  private async getModel(context: OperationContext): Promise<CoreModel> {
    const { model } = context.getExtension<{ model: CoreModelDefinition }>("operationContext");
    const { uuid } = context.getParameters();
    const object = await model.ref(uuid).get();
    if (object === undefined || object.isDeleted()) {
      await this.emitSync("Store.WebNotFound", {
        context,
        uuid
      });
      throw new WebdaError.NotFound("Object not found");
    }
    return object;
  }

  /**
   * Create a model operation implementation
   * @param context
   */
  async modelCreate(context: OperationContext) {
    const { model } = context.getExtension<{ model: CoreModelDefinition }>("operationContext");
    const object = model.factory(await context.getInput(), context);
    await object.checkAct(context, "create");
    // Enforce the UUID
    object.setUuid(object.generateUid());
    // Check for conflict
    // await object.validate(context, {});
    if (await model.ref(object.getUuid()).exists()) {
      throw new WebdaError.Conflict("Object already exists");
    }
    await object.save();
    // Set the location header to only uuid for now
    context.setHeader("Location", object.getUuid());
    context.write(object);
  }

  /**
   * Update a model operation implementation
   * @param context
   */
  async modelUpdate(context: OperationContext) {
    const object = await this.getModel(context);
    const input = await context.getInput();
    await object.checkAct(context, "update");
    object.load(input);
    await object.save(true);
    context.write(object);
  }

  /**
   * Get a model operation implementation
   * @param context
   */
  async modelGet(context: OperationContext) {
    const object = await this.getModel(context);
    await object.checkAct(context, "get");
    const evt = {
      context,
      object: object
    };
    //
    await Promise.all([this.emitSync("Store.WebGet", evt), object.__class.emitSync("Store.WebGet", <any>evt)]);
    context.write(object);
  }

  /**
   * Delete a model operation implementation
   * @param context
   */
  async modelDelete(context: OperationContext) {
    const object = await this.getModel(context);
    if (!object) {
      throw new WebdaError.NotFound("Object not found");
    }
    await object.checkAct(context, "delete");
    // Object can decide to not delete but mark as deleted
    await object.delete();
  }

  /**
   * Query models
   * @param context
   */
  async modelQuery(context: OperationContext) {
    const { model } = context.getExtension<{ model: CoreModelDefinition }>("operationContext");
    const { query } = context.getParameters();
    try {
      context.write(await model.query(query, true, context));
    } catch (err) {
      if (err instanceof SyntaxError) {
        this.log("INFO", "Query syntax error");
        throw new WebdaError.BadRequest("Query syntax error");
      }
      throw err;
    }
  }

  /**
   * Patch a model
   * @param context
   */
  async modelPatch(context: OperationContext) {
    const object = await this.getModel(context);
    const input = await context.getInput();
    await object.checkAct(context, "update");
    await object.patch(input);
    context.write(object);
  }

  /**
   * Action on a model
   * @param context
   */
  async modelAction(context: OperationContext) {
    const { model, action } = context.getExtension<{
      model: CoreModelDefinition;
      action: ModelAction & { name: string };
    }>("operationContext");
    if (!action.global) {
      const object = await model.ref(context.getParameters().uuid).get();
      if (!object || object.isDeleted()) {
        throw new WebdaError.NotFound("Object not found");
      }
      await object.checkAct(context, action.name);
      const output = await object[action.name](context);
      context.write(output);
    } else {
      model[action.name](context);
    }
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

    // Add default schemas - used for operation parameters
    for (const i in ModelsOperationsService.schemas) {
      if (app.hasSchema(i)) {
        continue;
      }
      app.registerSchema(i, ModelsOperationsService.schemas[i]);
    }

    const models = app.getModels();
    for (const modelKey in models) {
      const model = models[modelKey];
      const expose = model.Expose;
      // Skip if not exposed or not included
      if (!expose || !this.parameters.isIncluded(model.getIdentifier())) {
        continue;
      }
      const shortId = model.getIdentifier(true);
      // Overlap object are hidden by design
      if (shortId.includes("/")) {
        continue;
      }
      const plurial = app.getModelPlural(model.getIdentifier(false));
      const modelSchema = modelKey;

      ["create", "update"]
        .filter(k => !expose.restrict[k])
        .forEach(k => {
          k = k.substring(0, 1).toUpperCase() + k.substring(1);
          const id = `${shortId}.${k}`;
          this.getWebda().registerOperation(id, {
            service: this.getName(),
            method: k === "Create" ? "modelCreate" : "modelUpdate",
            input: modelSchema,
            output: modelSchema,
            parameters: k === "Create" ? undefined : "uuidRequest",
            context: {
              model
            }
          });
        });
      ["delete", "get"]
        .filter(k => !expose.restrict[k])
        .forEach(k => {
          k = k.substring(0, 1).toUpperCase() + k.substring(1);
          const id = `${shortId}.${k}`;
          const info: OperationDefinition = {
            service: this.getName(),
            method: `model${k}`,
            id,
            parameters: "uuidRequest",
            context: {
              model
            }
          };
          if (k === "Get") {
            info.output = modelSchema;
          }
          this.getWebda().registerOperation(id, info);
        });
      if (!expose.restrict.query) {
        const id = `${plurial}.Query`;
        this.getWebda().registerOperation(id, {
          service: this.getName(),
          method: "modelQuery",
          parameters: "searchRequest",
          context: {
            model
          }
        });
      }
      // Add patch
      if (!expose.restrict.update) {
        const id = `${shortId}.Patch`;
        this.getWebda().registerOperation(id, {
          service: this.getName(),
          method: "modelPatch",
          input: modelSchema + "?",
          parameters: "uuidRequest",
          context: {
            model
          }
        });
      }
      // Add all operations for Actions
      const actions = model.getActions();
      Object.keys(actions).forEach(name => {
        const id = `${shortId}.${name.substring(0, 1).toUpperCase() + name.substring(1)}`;
        const info: any = {
          service: this.getName(),
          method: `modelAction`,
          id
        };
        info.input = `${modelKey}.${name}.input`;
        info.output = `${modelKey}.${name}.output`;
        info.parameters = actions[name].global ? undefined : "uuidRequest";
        info.context = {
          model,
          action: { ...actions[name], name }
        };
        this.getWebda().registerOperation(id, info);
      });

      this.addBinaryOperations(model, shortId);
    }
  }

  addBinaryOperations(model: CoreModelDefinition, name: string) {
    (model.getRelations().binaries || []).forEach(binary => {
      const webda = Core.get();
      const attribute = binary.attribute.substring(0, 1).toUpperCase() + binary.attribute.substring(1);
      const info = {
        service: this.getName(),
        context: {
          model,
          binary,
          binaryStore: this.getWebda().getBinaryStore(model, binary.attribute)
        },
        parameters: "uuidRequest"
      };
      webda.registerOperation(`${name}.${attribute}.AttachChallenge`, {
        ...info,
        method: "binaryChallenge",
        input: "binaryChallengeRequest"
      });
      webda.registerOperation(`${name}.${attribute}.Attach`, {
        ...info,
        context: {
          ...info.context,
          action: "create"
        },
        method: "binaryPut",
        parameters: "binaryAttachParameters"
      });
      webda.registerOperation(`${name}.${attribute}.Get`, {
        ...info,
        method: "binaryGet",
        parameters: binary.cardinality === "ONE" ? "uuidRequest" : "binaryGetRequest"
      });
      webda.registerOperation(`${name}.${attribute}.Delete`, {
        ...info,
        context: {
          ...info.context,
          action: "delete"
        },
        method: "binaryAction",
        parameters: binary.cardinality === "ONE" ? "binaryHashRequest" : "binaryIndexHashRequest"
      });
      webda.registerOperation(`${name}.${attribute}.SetMetadata`, {
        ...info,
        context: {
          ...info.context,
          action: "metadata"
        },
        method: "binaryAction",
        parameters: binary.cardinality === "ONE" ? "binaryHashRequest" : "binaryIndexHashRequest"
      });
      webda.registerOperation(`${name}.${attribute}.GetUrl`, {
        ...info,
        context: {
          ...info.context,
          returnUrl: true
        },
        method: "binaryGet",
        parameters: binary.cardinality === "ONE" ? "uuidRequest" : "binaryGetRequest"
      });
    });
  }

  /**
   * Implement the binary challenge operation
   * @param context
   */
  async binaryChallenge(context: OperationContext<BinaryFileInfo & { hash: string; challenge: string }>) {
    const body = await context.getInput();
    const { model, binaryStore, binary } = context.getExtension<{
      binaryStore: BinaryService;
      model: CoreModelDefinition;
      binary: any;
    }>("operationContext");
    // First verify if map exist
    const object = await model.ref(context.parameter("uuid")).get();
    if (object === undefined || object.isDeleted()) {
      throw new WebdaError.NotFound("Object does not exist");
    }
    if (this.checkBinaryAlreadyLinked(object[binary.attribute], body.hash)) {
      return;
    }
    await object.checkAct(context, "attach_binary");
    const url = await binaryStore.putRedirectUrl(object, binary.attribute, body, context);
    const base64String = Buffer.from(body.hash, "hex").toString("base64");
    context.write({
      ...url,
      done: url === undefined,
      md5: base64String
    });
  }

  /**
   *
   * @param property
   * @param hash
   * @returns
   */
  protected checkBinaryAlreadyLinked(property: BinaryMap | BinaryMap[], hash: string): boolean {
    if (Array.isArray(property)) {
      return property.find(f => f.hash === hash) !== undefined;
    }
    return property && property.hash === hash;
  }

  /**
   * Set the binary content
   * @param context
   */
  async binaryPut(context: OperationContext) {
    const { model, binaryStore, binary } = context.getExtension<{
      binaryStore: BinaryService;
      model: CoreModelDefinition;
      binary: any;
    }>("operationContext");
    // First verify if map exist
    const object = await model.ref(context.parameter("uuid")).get();
    if (object === undefined || object.isDeleted()) {
      throw new WebdaError.NotFound("Object does not exist");
    }
    const file = await binaryStore.getFile(context);
    const { hash } = await file.getHashes();
    if (this.checkBinaryAlreadyLinked(object[binary.attribute], hash)) {
      return;
    }
    await object.checkAct(context, "attach_binary");
    await binaryStore.store(object, binary.attribute, file);
  }

  /**
   * Get the binary content
   * @param context
   */
  async binaryGet(context: OperationContext) {
    const { model, returnUrl, binaryStore, binary } = context.getExtension<{
      binaryStore: BinaryService;
      model: CoreModelDefinition;
      binary: ModelGraphBinaryDefinition;
      returnUrl: boolean;
    }>("operationContext");
    const { index, uuid } = context.getParameters();
    // First verify if map exist
    const object = await model.ref(uuid).get();
    if (object === undefined || object.isDeleted()) {
      throw new WebdaError.NotFound("Object does not exist");
    }
    const property = binary.attribute;
    if (!object || (Array.isArray(object[property]) && object[property].length <= index)) {
      throw new WebdaError.NotFound("Object does not exist or attachment does not exist");
    }
    await object.checkAct(context, "get_binary");
    const file: BinaryMap = Array.isArray(object[property]) ? object[property][index] : object[property];
    const url = await binaryStore.getRedirectUrlFromObject(file, context);
    // No url, we return the file
    if (url === null) {
      if (returnUrl) {
        // Redirect to same url without /url
        context.write({
          Location: context
            .getHttpContext()
            .getAbsoluteUrl()
            .replace(/\/url$/, ""),
          Map: file
        });
      } else {
        // Output
        context.writeHead(200, {
          "Content-Type": file.mimetype === undefined ? "application/octet-steam" : file.mimetype,
          "Content-Length": file.size
        });
        const readStream: any = await binaryStore.get(file);
        await new Promise<void>((resolve, reject) => {
          // We replaced all the event handlers with a simple call to readStream.pipe()
          context._stream.on("finish", resolve);
          context._stream.on("error", reject);
          readStream.pipe(context._stream);
        });
      }
    } else if (returnUrl) {
      context.write({ Location: url, Map: file });
    } else {
      context.writeHead(302, {
        Location: url
      });
    }
  }

  async binaryAction(context: OperationContext) {
    const { model, binaryStore, binary, action } = context.getExtension<{
      binaryStore: BinaryService;
      model: CoreModelDefinition;
      binary: ModelGraphBinaryDefinition;
      action: "delete" | "metadata" | "create";
    }>("operationContext");
    const { index, uuid, hash } = context.getParameters();
    // First verify if map exist
    const object = await model.ref(uuid).get();
    if (object === undefined || object.isDeleted()) {
      throw new WebdaError.NotFound("Object does not exist");
    }
    if (action === "create") {
      await object.checkAct(context, "attach_binary");
      await binaryStore.store(object, binary.attribute, await binaryStore.getFile(context));
      return;
    }

    // Current file - would be empty on creation
    const file = Array.isArray(object[binary.attribute]) ? object[binary.attribute][index] : object[binary.attribute];
    if (!file || file?.hash !== hash) {
      throw new WebdaError.BadRequest("Hash does not match");
    }
    if (action === "delete") {
      await object.checkAct(context, "detach_binary");
      await binaryStore.delete(object, binary.attribute, index);
    } else if (action === "metadata") {
      await object.checkAct(context, "update_binary_metadata");
      const metadata: BinaryMetadata = await context.getInput();
      // Limit metadata to 4kb
      if (JSON.stringify(metadata).length >= 4096) {
        throw new WebdaError.BadRequest("Metadata is too big: 4kb max");
      }
      file.metadata = metadata;
      await object.patch({
        [binary.attribute]: object[binary.attribute]
      });
    }
  }
}

/**
 * @WebdaModda
 */
export class ModelsOperationsService<T extends DomainServiceParameters> extends DomainService<T> {
  /**
   * Default domain
   */
  loadParameters(params: DeepPartial<DomainServiceParameters>): DomainServiceParameters {
    return new DomainServiceParameters(params);
  }

  /**
   * Do nothing here
   */
  handleModel(model: CoreModelDefinition, name: string, context: any): boolean {
    return true;
  }
}
