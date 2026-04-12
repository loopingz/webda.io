import { TransformCase, TransformCaseType } from "@webda/utils";
import { Service } from "./service.js";
import { Application } from "../application/application.js";
import type { ModelAction } from "../models/types.js";
import { OperationContext } from "../contexts/operationcontext.js";
import type { Model, ModelClass } from "@webda/models";
import { runWithContext, useContext } from "../contexts/execution.js";

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
    emptyParameters: {
      type: "object",
      properties: {}
    },
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
        uuid: {
          type: "string"
        },
        filename: {
          type: "string"
        },
        size: {
          type: "number"
        },
        mimetype: {
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
  private async loadModel(model: ModelClass<Model>, uuid: string): Promise<Model> {
    let object: Model | undefined;
    try {
      object = await model.ref(uuid).get();
    } catch {
      // Repository may throw when the object does not exist
    }
    if (object === undefined || object.isDeleted()) {
      const context = useContext<OperationContext>();
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
   * @param input - the model data to create
   * @returns the created model instance
   */
  async modelCreate(input: any): Promise<Model> {
    const context = useContext<OperationContext>();
    const { model } = context.getExtension<{ model: ModelClass<Model> }>("operationContext");
    // When callOperation passes [context] as fallback (no input schema),
    // the first argument is the OperationContext, not the input data.
    // Detect this and read the actual input from the context.
    if (input === undefined || input === null || input instanceof OperationContext) {
      input = await context.getInput();
    }
    return runWithContext(context, async () => {
      const object = await model.create(input, false);
      //await object.checkAct(context, "create");
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
  async modelUpdate(uuid: string, input?: any): Promise<Model> {
    const context = useContext<OperationContext>();
    const { model } = context.getExtension<{ model: ModelClass<Model> }>("operationContext");
    const object = await this.loadModel(model, uuid);
    // Fall back to context input when resolveArguments couldn't extract body
    if (input === undefined) {
      input = await context.getInput();
    }
    //await object.checkAct(context, "update");
    // By pass load for now
    object["load"](input);
    //return (await object.save()).toDTO();
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
  async modelPatch(uuid: string, input?: any): Promise<Model> {
    const context = useContext<OperationContext>();
    const { model } = context.getExtension<{ model: ModelClass<Model> }>("operationContext");
    const object = await this.loadModel(model, uuid);
    // Fall back to context input when resolveArguments couldn't extract body
    // (e.g., partial model schema not in application registry)
    if (input === undefined) {
      input = await context.getInput();
    }
    //await object.checkAct(context, "update");
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

      ["create", "update"]
        .filter(k => !actionsName.includes(k))
        .forEach(k => {
          k = k.substring(0, 1).toUpperCase() + k.substring(1);
          const id = `${shortId}.${k}`;
          // For Create, skip input schema validation — the model's full Input
          // schema may include required relation fields (e.g., BelongTo,
          // ManyToMany) that are not expected in the HTTP request body.
          // Validation is deferred to the model's own save/validate logic.
          const opInput = k === "Create" ? undefined : modelSchema;
          registerOperation(id, {
            service: this.getName(),
            method: k === "Create" ? "modelCreate" : "modelUpdate",
            input: opInput,
            output: modelSchema,
            parameters: k === "Create" ? "emptyParameters" : "uuidRequest",
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
   * @param uuid - the model primary key
   * @param body - the challenge request body containing hash, challenge, and optional file info
   * @returns the challenge result with redirect url or done flag
   */
  async binaryChallenge(uuid: string, body: BinaryFileInfo & { hash: string; challenge: string }): Promise<any> {
    const context = useContext<OperationContext>();
    const { model, binaryStore, binary } = this.resolveBinaryContext(context);
    // First verify if map exist
    const object = await model.ref(uuid).get();
    if (object === undefined || object.isDeleted()) {
      throw new WebdaError.NotFound("Object does not exist");
    }
    if (this.checkBinaryAlreadyLinked(object[binary.attribute], body.hash)) {
      return;
    }
    //await object.checkAct(context, "attach_binary" as ActionsEnum<Model>);
    const url = await binaryStore.putRedirectUrl(object, binary.attribute, body, context);
    const base64String = Buffer.from(body.hash, "hex").toString("base64");
    return {
      ...url,
      done: url === undefined,
      md5: base64String
    };
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
   * @param uuid - the model primary key
   * @param _filename - the optional filename (from headers)
   * @param _size - the optional file size (from headers)
   * @param _mimetype - the optional mime type (from headers)
   */
  async binaryPut(uuid: string, _filename?: string, _size?: number, _mimetype?: string): Promise<void> {
    const context = useContext<OperationContext>();
    const { model, binaryStore, binary } = this.resolveBinaryContext(context);
    // First verify if map exist
    const object = await model.ref(uuid).get();
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
   * Get the binary content — handles streaming/redirects directly via context
   * @param uuid - the model primary key
   * @param index - the binary index (for MANY cardinality)
   */
  async binaryGet(uuid: string, index?: number): Promise<void> {
    const context = useContext<OperationContext>();
    const ext = this.resolveBinaryContext(context);
    const { model, binaryStore, binary } = ext;
    const returnUrl = ext.returnUrl as boolean;
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
   * Execute a binary operation (delete or metadata update) on a model's binary attribute.
   *
   * Called with `(uuid, hash)` for ONE cardinality or `(uuid, index, hash)` for MANY cardinality.
   * @param uuid - the model primary key
   * @param indexOrHash - the binary index (MANY) or hash (ONE)
   * @param hash - the hash (only for MANY cardinality)
   */
  async binaryAction(uuid: string, indexOrHash: number | string, hash?: string): Promise<void> {
    const context = useContext<OperationContext>();
    const ext = this.resolveBinaryContext(context);
    const { model, binaryStore, binary } = ext;
    const action = ext.action as "delete" | "metadata";
    // Normalize: for ONE cardinality hash comes as second arg, index is undefined
    let index: number | undefined;
    let resolvedHash: string;
    if (hash !== undefined) {
      // MANY cardinality: (uuid, index, hash)
      index = indexOrHash as number;
      resolvedHash = hash;
    } else {
      // ONE cardinality: (uuid, hash)
      resolvedHash = indexOrHash as string;
    }
    // First verify if map exist
    const object = await model.ref(uuid).get();
    if (object === undefined || object.isDeleted()) {
      throw new WebdaError.NotFound("Object does not exist");
    }

    // Current file - would be empty on creation
    const file = Array.isArray(object[binary.attribute]) ? object[binary.attribute][index] : object[binary.attribute];
    if (!file || file?.hash !== resolvedHash) {
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
