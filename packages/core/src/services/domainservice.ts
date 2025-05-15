import type { DeepPartial } from "@webda/tsc-esm";
import { TransformCase, TransformCaseType } from "@webda/utils";
import { Service } from "./service";
import { Application } from "../application/application";
import type { ModelClass, ModelAction } from "../internal/iapplication";
import { JSONUtils } from "@webda/utils";
import { OperationContext } from "../contexts/operationcontext";
import { Model } from "../models/model";
import { runAsSystem, runWithContext } from "../contexts/execution";

import { BinaryFileInfo, BinaryMap, BinaryMetadata, BinaryService } from "./binary";
import * as WebdaError from "../errors/errors";
import { ServiceParameters } from "../interfaces";
import { useApplication } from "../application/hook";
import { OperationDefinition } from "../core/icore";
import { ModelGraphBinaryDefinition } from "../internal/iapplication";
import { useCore } from "../core/hooks";
import { registerOperation } from "../core/operations";
import { WebContext } from "../contexts/webcontext";

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

  default(): void {
    super.default();
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

export type DomainServiceEvents = {
  "Store.WebNotFound": { context: OperationContext; uuid: string };
};
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
export abstract class DomainService<
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
  abstract loadParameters(params: DeepPartial<T>): T;

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
  abstract handleModel(model: ModelClass, name: string, context: any): boolean;

  /**
   * Explore the models
   * @param model
   * @param name
   * @param depth
   * @param modelContext
   * @returns
   */
  walkModel(model: ModelClass, name: string, depth: number = 0, modelContext: any = {}) {
    // If not expose or not in the list of models
    if (
      !model.Metadata.Expose ||
      (model.Metadata.Identifier && !this.parameters.isIncluded(model.Metadata.Identifier))
    ) {
      return;
    }
    const identifier = model.Metadata.Identifier;
    // Overlap object are hidden by design
    if (!this.app.isFinalModel(identifier)) {
      return;
    }
    const context = JSONUtils.duplicate(modelContext);
    context.depth = depth;
    if (!this.handleModel(model, name, context)) {
      return;
    }

    const relations = model.Metadata.Relations;

    const queries = relations.queries || [];
    // Get the children now
    (relations.children || []).forEach(name => {
      const childModel = this.app.getModel(name);
      const parentAttribute = childModel?.Metadata?.Relations?.parent?.attribute;
      const segment =
        queries.find(q => q.model === name && q.targetAttribute === parentAttribute)?.attribute ||
        this.app.getModel(name).Metadata.Plural;
      this.walkModel(childModel, segment, depth + 1, context);
    });
  }

  /**
   * Your service is now created as all the other services
   */
  resolve(): this {
    super.resolve();
    this.app = <Application>(<any>useApplication());
    // Add all routes per model
    this.app.getRootExposedModels().forEach(name => {
      const model = this.app.getModel(name);
      this.walkModel(model, model.Metadata.Plural);
    });

    return this;
  }

  /**
   *
   * @param model
   * @param uuid
   */
  private async getModel(context: OperationContext): Promise<Model> {
    const { model } = context.getExtension<{ model: ModelClass<Model> }>("operationContext");
    const { uuid } = context.getParameters();
    const object = await model.ref(uuid).get();
    if (object === undefined || object.isDeleted()) {
      await this.emit("Store.WebNotFound", {
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
    const { model } = context.getExtension<{ model: ModelClass<Model> }>("operationContext");
    await runWithContext(context, async () => {
      const object = await model.factory(await context.getInput());
      await object.checkAct(context, "create");
      // Check for conflict
      // await object.validate(context, {});
      if (await model.ref(object.getUuid()).exists()) {
        throw new WebdaError.Conflict("Object already exists");
      }
      await object.save();
      // Set the location header to only uuid for now
      context.setHeader("Location", object.getUuid());
      context.write(object);
    });
  }

  /**
   * Update a model operation implementation
   * @param context
   */
  async modelUpdate(context: OperationContext) {
    const object = await this.getModel(context);
    const input = await context.getInput();
    await object.checkAct(context, "update");
    // By pass load for now
    object["load"](input);
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
    const { model } = context.getExtension<{ model: ModelClass }>("operationContext");
    const { query } = context.getParameters();
    await runWithContext(context, async () => {
      try {
        context.write(await model.query(query, true));
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
      model: ModelClass<Model>;
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

    const app = (this.app = <Application>(<any>useApplication()));

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
      if (!model) {
        continue;
      }
      const expose = model.Metadata.Expose;
      // Skip if not exposed or not included
      if (!expose || !this.parameters.isIncluded(model.Metadata.Identifier)) {
        continue;
      }

      // Overlap object are hidden by design
      if (!this.app.isFinalModel(model.Metadata.Identifier)) {
        continue;
      }
      const shortId = model.Metadata.ShortName;
      const plurial = model.Metadata.Plural;
      const modelSchema = modelKey;

      ["create", "update"]
        .filter(k => !expose.restrict[k])
        .forEach(k => {
          k = k.substring(0, 1).toUpperCase() + k.substring(1);
          const id = `${shortId}.${k}`;
          registerOperation(id, {
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
          registerOperation(id, info);
        });
      if (!expose.restrict.query) {
        const id = `${plurial}.Query`;
        registerOperation(id, {
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
        registerOperation(id, {
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
      const actions = model.Metadata.Actions;
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
        registerOperation(id, info);
      });

      this.addBinaryOperations(model as any, shortId);
    }
  }

  addBinaryOperations(model: ModelClass<Model>, name: string) {
    (model.Metadata.Relations.binaries || []).forEach(binary => {
      const webda = useCore();
      const attribute = binary.attribute.substring(0, 1).toUpperCase() + binary.attribute.substring(1);
      const info = {
        service: this.getName(),
        context: {
          model,
          binary,
          binaryStore: webda.getBinaryStore(model, binary.attribute)
        },
        parameters: "uuidRequest"
      };
      registerOperation(`${name}.${attribute}.AttachChallenge`, {
        ...info,
        method: "binaryChallenge",
        input: "binaryChallengeRequest"
      });
      registerOperation(`${name}.${attribute}.Attach`, {
        ...info,
        context: {
          ...info.context,
          action: "create"
        },
        method: "binaryPut",
        parameters: "binaryAttachParameters"
      });
      registerOperation(`${name}.${attribute}.Get`, {
        ...info,
        method: "binaryGet",
        parameters: binary.cardinality === "ONE" ? "uuidRequest" : "binaryGetRequest"
      });
      registerOperation(`${name}.${attribute}.Delete`, {
        ...info,
        context: {
          ...info.context,
          action: "delete"
        },
        method: "binaryAction",
        parameters: binary.cardinality === "ONE" ? "binaryHashRequest" : "binaryIndexHashRequest"
      });
      registerOperation(`${name}.${attribute}.SetMetadata`, {
        ...info,
        context: {
          ...info.context,
          action: "metadata"
        },
        method: "binaryAction",
        parameters: binary.cardinality === "ONE" ? "binaryHashRequest" : "binaryIndexHashRequest"
      });
      registerOperation(`${name}.${attribute}.GetUrl`, {
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
      model: ModelClass<Model>;
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
      model: ModelClass;
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
      model: ModelClass<Model>;
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
      if (returnUrl && context instanceof WebContext) {
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
      model: ModelClass<Model>;
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
  loadParameters(params: DeepPartial<DomainServiceParameters>): T {
    return <T>new DomainServiceParameters().load(params);
  }

  /**
   * Do nothing here
   */
  handleModel(model: ModelClass, name: string, context: any): boolean {
    return true;
  }
}
