import type { DeepPartial } from "@webda/tsc-esm";
import { TransformCase, TransformCaseType } from "@webda/utils";
import { Service } from "./service.js";
import { Application } from "../application/application.js";
import type { ModelAction } from "../models/types.js";
import { OperationContext } from "../contexts/operationcontext.js";
import type { Model, ModelClass } from "@webda/models";
import { runWithContext } from "../contexts/execution.js";

import { BinaryFileInfo, BinaryMap, BinaryMetadata, BinaryService } from "./binary.js";
import * as WebdaError from "../errors/errors.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { useApplication } from "../application/hooks.js";
import { OperationDefinition } from "../core/icore.js";
import { ModelGraphBinaryDefinition } from "@webda/compiler";
import { useCore, useModelMetadata } from "../core/hooks.js";
import { registerOperation } from "../core/operations.js";
import { WebContext } from "../contexts/webcontext.js";
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
   * Load the parameters for your service
   * @param params - the service parameters
   * @returns the loaded parameters
   */
  loadParameters(params: DeepPartial<DomainServiceParameters>): T {
    return <T>new DomainServiceParameters().load(params);
  }

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
   * Retrieve a model instance by uuid from the operation context
   * @param context - the execution context
   * @returns the model instance
   */
  private async getModel(context: OperationContext): Promise<Model> {
    const { model } = context.getExtension<{ model: ModelClass<Model> }>("operationContext");
    const { uuid } = context.getParameters();
    let object: Model | undefined;
    try {
      object = await model.ref(uuid).get();
    } catch {
      // Repository may throw when the object does not exist
    }
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
   * @param context - the execution context
   */
  async modelCreate(context: OperationContext) {
    const { model } = context.getExtension<{ model: ModelClass<Model> }>("operationContext");
    await runWithContext(context, async () => {
      //const object = (await model.create({}, false)).fromDTO(await context.getInput());
      const object : any = {};
      await object.checkAct(context, "create");
      // Check for conflict
      // await object.validate(context, {});
      if (await model.ref(object.getPrimaryKey()).exists()) {
        throw new WebdaError.Conflict("Object already exists");
      }
      await object.save();
      // Set the location header to only uuid for now
      context.setHeader("Location", object.getUUID());
      context.write(object);
    });
  }

  /**
   * Update a model operation implementation
   * @param context - the execution context
   */
  async modelUpdate(context: OperationContext) {
    const object = await this.getModel(context);
    const input = await context.getInput();
    //await object.checkAct(context, "update");
    // By pass load for now
    object["load"](input);
    //context.write((await object.save()).toDTO());
  }

  /**
   * Get a model operation implementation
   * @param context - the execution context
   */
  async modelGet(context: OperationContext) {
    const object = await this.getModel(context);
    //await object.checkAct(context, "get");
    //context.write(object.toDTO());
  }

  /**
   * Delete a model operation implementation
   * @param context - the execution context
   */
  async modelDelete(context: OperationContext) {
    const object = await this.getModel(context);
    if (!object) {
      throw new WebdaError.NotFound("Object not found");
    }
    //await object.checkAct(context, "delete");
    // Object can decide to not delete but mark as deleted
    await object.delete();
  }

  /**
   * Query models
   * @param context - the execution context
   */
  async modelQuery(context: OperationContext) {
    const { model } = context.getExtension<{ model: ModelClass }>("operationContext");
    const { query } = context.getParameters();
    await runWithContext(context, async () => {
      try {
        context.write(await model.query(query));
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
   * @param context - the execution context
   */
  async modelPatch(context: OperationContext) {
    const object = await this.getModel(context);
    const input = await context.getInput();
    //await object.checkAct(context, "update");
    await object.patch(input);
    context.write(object);
  }

  /**
   * Action on a model
   * @param context - the execution context
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
      //await object.checkAct(context, action.name as ActionsEnum<Model>);
      const output = await object[action.name](context);
      context.write(output);
    } else {
      model[action.name](context);
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

    // Add default schemas - used for operation parameters
    for (const i in DomainService.schemas) {
      if (hasSchema(i)) {
        continue;
      }
      registerSchema(i, DomainService.schemas[i]);
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

      ["create", "update"]
        .filter(k => !actionsName.includes(k))
        .forEach(k => {
          k = k.substring(0, 1).toUpperCase() + k.substring(1);
          const id = `${shortId}.${k}`;
          registerOperation(id, {
            service: this.getName(),
            method: k === "Create" ? "modelCreate" : "modelUpdate",
            input: modelSchema,
            output: modelSchema,
            parameters: k === "Create" ? undefined : "uuidRequest",
            summary: k === "Create" ? `Create a new ${shortId}` : `Update a ${shortId}`,
            tags: [shortId],
            rest: { method: k === "Create" ? "post" : "put", path: k === "Create" ? "" : "{uuid}" },
            context: {
              model
            }
          });
        });
      ["delete", "get"]
        .filter(k => !actionsName.includes(k))
        .forEach(k => {
          k = k.substring(0, 1).toUpperCase() + k.substring(1);
          const id = `${shortId}.${k}`;
          const info: OperationDefinition = {
            service: this.getName(),
            method: `model${k}`,
            id,
            parameters: "uuidRequest",
            summary: `${k === "Delete" ? "Delete" : "Retrieve"} a ${shortId}`,
            tags: [shortId],
            rest: { method: k === "Delete" ? "delete" : "get", path: "{uuid}" },
            context: {
              model
            }
          };
          if (k === "Get") {
            info.output = modelSchema;
          }
          registerOperation(id, info);
        });
      if (!actionsName.includes("query")) {
        const id = `${plural}.Query`;
        registerOperation(id, {
          service: this.getName(),
          method: "modelQuery",
          parameters: "searchRequest",
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
          parameters: "uuidRequest",
          summary: `Patch a ${shortId}`,
          tags: [shortId],
          rest: { method: "patch", path: "{uuid}" },
          context: {
            model
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
          info.input = `${modelKey}.${name}.input`;
          info.output = `${modelKey}.${name}.output`;
          info.parameters = actions[name].global ? undefined : "uuidRequest";
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

      this.addBinaryOperations(model as any, Metadata, shortId);
    }
  }

  /**
   * Register upload, download, delete, and metadata operations for binary attributes
   * @param model - the model to use
   * @param Metadata - the model metadata
   * @param name - the name to use
   */
  addBinaryOperations(model: ModelClass<Model>, Metadata: any, name: string) {
    (Metadata.Relations.binaries || []).forEach(binary => {
      const attribute = binary.attribute.substring(0, 1).toUpperCase() + binary.attribute.substring(1);
      // Do not resolve binaryStore eagerly - it may not exist yet during resolve()
      const baseContext = {
        model,
        binary
      };
      const info = {
        service: this.getName(),
        context: baseContext,
        parameters: "uuidRequest"
      };
      registerOperation(`${name}.${attribute}.AttachChallenge`, {
        ...info,
        method: "binaryChallenge",
        input: "binaryChallengeRequest",
        summary: `Upload ${binary.attribute} of ${name} after challenge`,
        tags: [name],
        rest: { method: "put", path: `{uuid}/${binary.attribute}` }
      });
      registerOperation(`${name}.${attribute}.Attach`, {
        ...info,
        context: {
          ...info.context,
          action: "create"
        },
        method: "binaryPut",
        parameters: "binaryAttachParameters",
        summary: `Upload ${binary.attribute} of ${name} directly`,
        tags: [name],
        rest: { method: "post", path: `{uuid}/${binary.attribute}` }
      });
      registerOperation(`${name}.${attribute}.Get`, {
        ...info,
        method: "binaryGet",
        parameters: binary.cardinality === "ONE" ? "uuidRequest" : "binaryGetRequest",
        summary: `Download ${binary.attribute} of ${name}`,
        tags: [name],
        rest: {
          method: "get",
          path:
            binary.cardinality === "ONE" ? `{uuid}/${binary.attribute}` : `{uuid}/${binary.attribute}/{index}`
        }
      });
      registerOperation(`${name}.${attribute}.Delete`, {
        ...info,
        context: {
          ...info.context,
          action: "delete"
        },
        method: "binaryAction",
        parameters: binary.cardinality === "ONE" ? "binaryHashRequest" : "binaryIndexHashRequest",
        summary: `Delete ${binary.attribute} of ${name}`,
        tags: [name],
        rest: {
          method: "delete",
          path:
            binary.cardinality === "ONE"
              ? `{uuid}/${binary.attribute}/{hash}`
              : `{uuid}/${binary.attribute}/{index}/{hash}`
        }
      });
      registerOperation(`${name}.${attribute}.SetMetadata`, {
        ...info,
        context: {
          ...info.context,
          action: "metadata"
        },
        method: "binaryAction",
        parameters: binary.cardinality === "ONE" ? "binaryHashRequest" : "binaryIndexHashRequest",
        summary: `Update metadata of ${binary.attribute} of ${name}`,
        tags: [name],
        rest: {
          method: "put",
          path:
            binary.cardinality === "ONE"
              ? `{uuid}/${binary.attribute}/{hash}`
              : `{uuid}/${binary.attribute}/{index}/{hash}`
        }
      });
      registerOperation(`${name}.${attribute}.GetUrl`, {
        ...info,
        context: {
          ...info.context,
          returnUrl: true
        },
        method: "binaryGet",
        parameters: binary.cardinality === "ONE" ? "uuidRequest" : "binaryGetRequest",
        summary: `Get signed URL for ${binary.attribute} of ${name}`,
        tags: [name],
        rest: {
          method: "get",
          path:
            binary.cardinality === "ONE"
              ? `{uuid}/${binary.attribute}/url`
              : `{uuid}/${binary.attribute}/{index}/url`
        }
      });
    });
  }

  /**
   * Resolve the binary store for a given context, looking it up lazily if not already set
   * @param context - the execution context
   * @returns the binary store, model, and binary definition
   */
  private resolveBinaryContext(context: OperationContext) {
    const ext = context.getExtension<{
      binaryStore?: BinaryService;
      model: ModelClass<Model>;
      binary: any;
    }>("operationContext");
    if (!ext.binaryStore) {
      ext.binaryStore = <BinaryService>useCore().getBinaryStore(ext.model as any, ext.binary.attribute);
    }
    return ext as { binaryStore: BinaryService; model: ModelClass<Model>; binary: any } & Record<string, any>;
  }

  /**
   * Implement the binary challenge operation
   * @param context - the execution context
   */
  async binaryChallenge(context: OperationContext<BinaryFileInfo & { hash: string; challenge: string }>) {
    const body = await context.getInput();
    const { model, binaryStore, binary } = this.resolveBinaryContext(context);
    // First verify if map exist
    const object = await model.ref(context.parameter("uuid")).get();
    if (object === undefined || object.isDeleted()) {
      throw new WebdaError.NotFound("Object does not exist");
    }
    if (this.checkBinaryAlreadyLinked(object[binary.attribute], body.hash)) {
      return;
    }
    //await object.checkAct(context, "attach_binary" as ActionsEnum<Model>);
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
   * @param property - the property name
   * @param hash - the hash value
   * @returns true if the condition is met
   */
  protected checkBinaryAlreadyLinked(property: BinaryMap | BinaryMap[], hash: string): boolean {
    if (Array.isArray(property)) {
      return property.find(f => f.hash === hash) !== undefined;
    }
    return property && property.hash === hash;
  }

  /**
   * Set the binary content
   * @param context - the execution context
   */
  async binaryPut(context: OperationContext) {
    const { model, binaryStore, binary } = this.resolveBinaryContext(context);
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
    //await object.checkAct(context, "attach_binary" as ActionsEnum<Model>);
    await binaryStore.store(object, binary.attribute, file);
  }

  /**
   * Get the binary content
   * @param context - the execution context
   */
  async binaryGet(context: OperationContext) {
    const ext = this.resolveBinaryContext(context);
    const { model, binaryStore, binary } = ext;
    const returnUrl = ext.returnUrl as boolean;
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
    //await object.checkAct(context, "get_binary" as ActionsEnum<Model>);
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

  /**
   * Execute a binary operation (create, delete, or metadata update) on a model's binary attribute
   * @param context - the execution context
   */
  async binaryAction(context: OperationContext) {
    const ext = this.resolveBinaryContext(context);
    const { model, binaryStore, binary } = ext;
    const action = ext.action as "delete" | "metadata" | "create";
    const { index, uuid, hash } = context.getParameters();
    // First verify if map exist
    const object = await model.ref(uuid).get();
    if (object === undefined || object.isDeleted()) {
      throw new WebdaError.NotFound("Object does not exist");
    }
    if (action === "create") {
      //await object.checkAct(context, "attach_binary" as ActionsEnum<Model>);
      await binaryStore.store(object, binary.attribute, await binaryStore.getFile(context));
      return;
    }

    // Current file - would be empty on creation
    const file = Array.isArray(object[binary.attribute]) ? object[binary.attribute][index] : object[binary.attribute];
    if (!file || file?.hash !== hash) {
      throw new WebdaError.BadRequest("Hash does not match");
    }
    if (action === "delete") {
      //await object.checkAct(context, "detach_binary" as ActionsEnum<Model>);
      await binaryStore.delete(object, binary.attribute, index);
    } else if (action === "metadata") {
      //await object.checkAct(context, "update_binary_metadata" as ActionsEnum<Model>);
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
