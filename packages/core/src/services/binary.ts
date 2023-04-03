"use strict";
import * as crypto from "crypto";
import * as fs from "fs";
import * as mime from "mime-types";
import * as path from "path";
import { Readable } from "stream";
import { Core, Counter, WebdaError } from "../index";
import { CoreModel, NotEnumerable } from "../models/coremodel";
import { EventStoreDeleted, MappingService, Store } from "../stores/store";
import { OperationContext, WebContext } from "../utils/context";
import { Service, ServiceParameters } from "./service";

/**
 * Represent basic EventBinary
 */
export interface EventBinary {
  object: BinaryFileInfo;
  service: BinaryService;
  /**
   * In case the Context is known
   */
  context?: OperationContext;
}

export interface EventBinaryUploadSuccess extends EventBinary {
  target: CoreModel;
}

/**
 * Sent before metadata are updated to allow alteration of the modification
 */
export interface EventBinaryMetadataUpdate extends EventBinaryUploadSuccess {
  target: CoreModel;
  metadata: BinaryMetadata;
}

/**
 * Emitted if binary does not exist
 */
export class BinaryNotFoundError extends WebdaError.CodeError {
  constructor(hash: string, storeName: string) {
    super("BINARY_NOTFOUND", `Binary not found ${hash} BinaryService(${storeName})`);
  }
}

export interface BinaryFileInfo {
  /**
   * Hash of the binary
   */
  hash?: string;
  /**
   * Will be computed by the service
   *
   * hash of the content prefixed by 'WEBDA'
   */
  challenge?: string;
  /**
   * Size of the file
   */
  size: number;
  /**
   * Name of the file
   */
  name: string;
  /**
   * Mimetype
   */
  mimetype: string;
  /**
   * Metadatas stored along with the binary
   */
  metadata?: BinaryMetadata;
}

/**
 * Represent files attached to a model
 */
export type BinaryFiles = BinaryFileInfo[];

/**
 * Represent a file to store
 */
export abstract class BinaryFile<T = any> implements BinaryFileInfo {
  /**
   * Current name
   */
  name: string;
  /**
   * Original name
   */
  originalname?: string;
  /**
   * Size of the binary
   */
  size: number;
  /**
   * Mimetype of the binary
   */
  mimetype: string;
  /**
   * Will be computed by the service
   *
   * hash of the content prefixed by 'WEBDA'
   */
  challenge?: string;
  /**
   * Will be computed by the service
   *
   * hash of the content
   */
  hash?: string;
  /**
   * Metadatas stored along with the binary
   */
  metadata?: T;

  constructor(info: BinaryFileInfo) {
    this.set(info);
  }

  /**
   * Set the information
   * @param info
   */
  set(info: BinaryFileInfo) {
    this.name = info.name;
    this.challenge = info.challenge;
    this.hash = info.hash;
    this.mimetype = info.mimetype || "application/octet-stream";
    this.metadata = info.metadata || {};
  }

  /**
   * Retrieve a plain BinaryFileInfo object
   * @returns
   */
  toBinaryFileInfo(): BinaryFileInfo {
    return {
      hash: this.hash,
      size: this.size,
      mimetype: this.mimetype,
      metadata: this.metadata,
      challenge: this.challenge,
      name: this.name
    };
  }

  abstract get(): Promise<Readable>;

  /**
   * Create hashes
   * @param buffer
   * @returns
   */
  public async getHashes(): Promise<{ hash: string; challenge: string }> {
    if (!this.hash) {
      // Using MD5 as S3 content verification use md5
      const hash = crypto.createHash("md5");
      const challenge = crypto.createHash("md5");
      const stream = await this.get();
      challenge.update("WEBDA");
      await new Promise<void>((resolve, reject) => {
        stream.on("error", err => reject(err));
        stream.on("end", () => {
          this.hash = hash.digest("hex");
          this.challenge = challenge.digest("hex");
          resolve();
        });
        stream.on("data", chunk => {
          let buffer = Buffer.from(chunk);
          hash.update(buffer);
          challenge.update(buffer);
        });
      });
    }
    return {
      hash: this.hash,
      challenge: this.challenge
    };
  }
}

export class LocalBinaryFile extends BinaryFile {
  /**
   * Path on the hard drive
   */
  path: string;

  constructor(filePath: string) {
    super({
      name: path.basename(filePath),
      size: fs.statSync(filePath).size,
      mimetype: mime.lookup(filePath) || "application/octet-stream"
    });
    this.path = filePath;
  }

  /**
   * @override
   */
  async get(): Promise<Readable> {
    return fs.createReadStream(this.path);
  }
}

export class MemoryBinaryFile extends BinaryFile {
  /**
   * Content
   */
  buffer: Buffer;

  constructor(buffer: Buffer, info: BinaryFileInfo) {
    super(info);
    this.buffer = buffer;
  }

  /**
   * @override
   */
  async get(): Promise<Readable> {
    return Readable.from(this.buffer);
  }
}

/**
 * Define the metadata for a Binary
 */
export type BinaryMetadata = any;

/**
 * This is a map used to retrieve binary
 *
 * @class BinaryMap
 */
export class BinaryMap<T = any> extends BinaryFile<T> {
  /**
   * Current context
   */
  @NotEnumerable
  __ctx: OperationContext;
  /**
   * Link to the binary store
   */
  @NotEnumerable
  __store: BinaryService;

  constructor(service: BinaryService, obj: BinaryFileInfo) {
    super(obj);
    this.set(obj);
    this.__store = service;
  }

  /**
   * Get the binary data
   *
   * @returns
   */
  get(): Promise<Readable> {
    return this.__store.get(this);
  }

  /**
   * Download the binary to a path
   *
   * Shortcut to call {@link Binary.downloadTo} with current object
   *
   * @param filename
   */
  async downloadTo(filename: string): Promise<void> {
    return this.__store.downloadTo(this, filename);
  }

  /**
   * Set the http context
   * @param ctx
   */
  setContext(ctx: OperationContext) {
    this.__ctx = ctx;
  }
}

/**
 * One Binary instance
 */
export class Binary<T = any> extends BinaryMap<T> {
  @NotEnumerable
  protected model: CoreModel;
  @NotEnumerable
  protected attribute: string;
  constructor(attribute: string, model: CoreModel) {
    super(Core.get().getBinaryStore(model, attribute), model[attribute] || {});
    this.attribute = attribute;
    this.model = model;
  }
  /**
   * Replace the binary
   * @param id
   * @param ctx
   * @returns
   */
  async upload(file: BinaryFile): Promise<void> {
    await this.__store.store(this.model, this.attribute, file);
    this.set(file);
  }

  /**
   * Delete the binary, if you need to replace just use upload
   */
  async delete() {
    await this.__store.delete(this.model, this.attribute);
    this.set(<any>{});
  }

  /**
   * Return undefined if no hash
   * @returns
   */
  toJSON() {
    if (!this.hash) {
      return undefined;
    }
    return this;
  }
}

/**
 * Define a Binary map stored in a Binaries collection
 */
export class BinariesItem<T = any> extends BinaryMap<T> {
  @NotEnumerable
  protected parent: BinariesImpl;
  constructor(parent: BinariesImpl, info: BinaryFileInfo) {
    super(parent.__service, info);
    this.parent = parent;
  }
  /**
   * Replace the binary
   * @param id
   * @param ctx
   * @returns
   */
  async upload(file: BinaryFile): Promise<void> {
    await this.parent.upload(file, this);
    this.set(file);
  }

  /**
   * Delete the binary, if you need to replace just use upload
   */
  async delete() {
    return this.parent.delete(this);
  }
}
/**
 * Define a collection of Binary
 */
export class BinariesImpl<T = any> extends Array<BinariesItem<T>> {
  @NotEnumerable
  __service: BinaryService;

  @NotEnumerable
  protected model: CoreModel;

  @NotEnumerable
  protected attribute: string;

  assign(model: CoreModel, attribute: string): this {
    this.model = model;
    this.attribute = attribute;
    for (let binary of model[attribute] || []) {
      this.push(binary);
    }
    this.__service = Core.get().getBinaryStore(model, attribute);
    return this;
  }

  // Readonly methods
  pop(): BinariesItem<T> {
    throw new Error("Readonly");
  }
  slice(): BinariesItem<T>[] {
    throw new Error("Readonly");
  }
  unshift(): number {
    throw new Error("Readonly");
  }
  push(...args): number {
    return super.push(...args.map(arg => (arg instanceof BinariesItem ? arg : new BinariesItem(this, arg))));
  }

  /**
   * Upload a file to this model
   * @param file
   */
  async upload(file: BinaryFile, replace?: BinariesItem) {
    await this.__service.store(this.model, this.attribute, file);
    // Should call the store first
    super.push(new BinariesItem(this, file));
    if (replace) {
      await this.delete(replace);
    }
  }

  /**
   * Delete an item
   * @param item
   */
  async delete(item: BinariesItem) {
    let itemIndex = this.indexOf(item);
    if (itemIndex === -1) {
      throw new Error("Item not found");
    }
    await this.__service.delete(this.model, this.attribute, itemIndex);
    itemIndex = this.indexOf(item);
    if (itemIndex >= 0) {
      // Call store delete here
      this.splice(itemIndex, 1);
    }
  }
}

/**
 * Define a collection of Binary with a Readonly and the upload method
 */
export type Binaries = Readonly<Array<BinariesItem>> & { upload: (file: BinaryFile) => Promise<void> };

export class BinaryParameters extends ServiceParameters {
  /**
   * Define the map to Object collection
   *
   * key is a Store name
   * the string[] represent all valids attributes to store files in
   * @deprecated
   */
  map: { [key: string]: string[] };
  /**
   * Define the map of models
   * * indicates all models
   *
   * key is a Store name
   * the string[] represent all valids attributes to store files in * indicates all attributes
   */
  models: { [key: string]: string[] };
  /**
   * Expose the service to http
   */
  expose?: {
    /**
     * URL to expose the service to
     */
    url: string;
    /**
     * Restrict some APIs
     */
    restrict?: {
      /**
       * Restrict GET
       */
      get?: boolean;
      /**
       * Restrict POST
       */
      create?: boolean;
      /**
       * Restrict DELETE
       */
      delete?: boolean;
      /**
       * Restrict update of metadata
       */
      metadata?: boolean;
    };
  };

  constructor(params: any, _service: Service) {
    super(params);
    if (this.expose) {
      this.expose.restrict = this.expose.restrict || {};
    }
    this.map ??= {};
    this.models ??= {};
  }
}

export type BinaryEvents = {
  /**
   * Emitted when someone download a binary
   */
  "Binary.Get": EventBinary;
  "Binary.UploadSuccess": EventBinaryUploadSuccess;
  "Binary.MetadataUpdate": EventBinaryMetadataUpdate;
  "Binary.MetadataUpdated": EventBinaryUploadSuccess;
  "Binary.Create": EventBinaryUploadSuccess;
  "Binary.Delete": EventBinary;
};

/**
 * Define a BinaryModel with infinite field for binary map
 */
export type BinaryModel<T = { [key: string]: BinaryMap[] }> = CoreModel & T;

/**
 * This is an abstract service to represent a storage of files
 * The binary allow you to expose this service as HTTP
 *
 * It supports two modes:
 *  - attached to a CoreModel (attach, detach, reattach)
 *  - pure storage with no managed id (read, write, delete)
 *
 * As we have deduplication builtin you can get some stats
 * - getUsageCount(hash)
 * - getUsageCountForRaw()
 * - getUsageCountForMap()
 *
 * The Binary storage should store only once a binary and reference every object that are used by this binary, so it can be cleaned.
 *
 *
 * @see FileBinary
 * @see S3Binary
 *
 * @exports
 * @abstract
 * @WebdaModda Binary
 */
export abstract class BinaryService<
    T extends BinaryParameters = BinaryParameters,
    E extends BinaryEvents = BinaryEvents
  >
  extends Service<T, E>
  implements MappingService<BinaryMap>
{
  _lowercaseMaps: any;

  metrics: {
    upload: Counter;
    download: Counter;
    delete: Counter;
    metadataUpdate: Counter;
  };

  /**
   * @override
   */
  initMetrics(): void {
    super.initMetrics();
    this.metrics.upload = this.getMetric(Counter, {
      name: "binary_upload",
      help: "Number of binary upload"
    });
    this.metrics.delete = this.getMetric(Counter, {
      name: "binary_delete",
      help: "Number of binary deleted"
    });
    this.metrics.download = this.getMetric(Counter, {
      name: "binary_download",
      help: "Number of binary upload"
    });
    this.metrics.metadataUpdate = this.getMetric(Counter, {
      name: "binary_metadata_update",
      help: "Number of binary metadata updated"
    });
  }

  /**
   * Define if binary is managed by the store
   * @param modelName
   * @param attribute
   * @returns -1 if not managed, 0 if managed but by default, 1 if managed and in the map, 2 if explicit with attribute and model
   */
  handleBinary(modelName: string, attribute: string): -1 | 0 | 1 | 2 {
    let score = 0;
    let key = Object.keys(this.parameters.models).find(k => k === modelName);
    if (key) {
      // Explicit model
      score = 1;
    } else {
      // Default to all model
      key = Object.keys(this.parameters.models).find(k => k === "*");
    }
    if (key) {
      let attributes = this.parameters.models[key];
      if (attributes.includes(attribute)) {
        return <any>score + 1;
      }
      if (attributes.includes("*")) {
        return <any>score;
      }
    }
    return -1;
  }

  /**
   * When you store a binary to be able to retrieve it you need to store the information into another object
   *
   * If you have a User object define like this : User = {'name': 'Remi', 'uuid': 'Loopingz'}
   * You will call the `store(userStore, 'Loopingz', 'images', filedata, {'type':'profile'})`
   * After a successful call the object will look like
   * ```
   * User = {
   *  'name': 'Remi',
   *  'uuid': 'Loopingz',
   *  'images': [
   *    {'type':'profile','hash':'a12545...','size':1245,'mime':'application/octet'}
   *   ]
   * }
   * ```
   *
   *
   * @param {CoreModel} object The object uuid to get from the store
   * @param {String} property The object property to add the file to
   * @param {Object} file The file by itself
   * @param {Object} metadata to add to the binary object
   * @emits 'binaryCreate'
   */

  abstract store(object: CoreModel, property: string, file: BinaryFile, metadata?: BinaryMetadata): Promise<void>;

  /**
   * The store can retrieve how many time a binary has been used
   */
  abstract getUsageCount(hash: string): Promise<number>;

  /**
   * Delete a binary
   *
   * @param {CoreModel} object The object uuid to get from the store
   * @param {String} property The object property to add the file to
   * @param {Number} index The index of the file to change in the property
   * @emits 'binaryDelete'
   */
  abstract delete(object: CoreModel, property: string, index?: number): Promise<void>;

  /**
   * Get a binary
   *
   * @param {Object} info The reference stored in your target object
   * @emits 'binaryGet'
   */
  async get(info: BinaryMap): Promise<Readable> {
    await this.emitSync("Binary.Get", {
      object: info,
      service: this
    });
    this.metrics.download.inc();
    return this._get(info);
  }

  /**
   * Download a binary to a file
   *
   * @param {Object} info The reference stored in your target object
   * @param {String} filepath to save the binary to
   */
  async downloadTo(info: BinaryMap, filename): Promise<void> {
    await this.emitSync("Binary.Get", {
      object: info,
      service: this
    });
    this.metrics.download.inc();
    let readStream: any = await this._get(info);
    let writeStream = fs.createWriteStream(filename);
    return new Promise<void>((resolve, reject) => {
      writeStream.on("finish", _src => {
        return resolve();
      });
      writeStream.on("error", src => {
        try {
          fs.unlinkSync(filename);
          // Stubing the fs module in ESM seems complicated for now
          /* c8 ignore next 3 */
        } catch (err) {
          this._webda.log("ERROR", err);
        }
        return reject(src);
      });
      readStream.pipe(writeStream);
    });
  }

  /**
   * @override
   */
  resolve(): this {
    super.resolve();
    this.initMap(this.parameters.map);
    return this;
  }

  abstract _get(info: BinaryMap): Promise<Readable>;

  /**
   * Init the declared maps, adding reverse maps
   *
   * @param map
   */
  initMap(map): void {
    if (map == undefined || map._init) {
      return;
    }
    this._lowercaseMaps = {};
    Object.keys(map).forEach(prop => {
      this._lowercaseMaps[prop.toLowerCase()] = prop;
      let reverseStore = this._webda.getService(prop);
      if (reverseStore === undefined || !(reverseStore instanceof Store)) {
        this._webda.log("WARN", "Can't setup mapping as store ", prop, " doesn't exist");
        map[prop]["-onerror"] = "NoStore";
        return;
      }
      for (let i in map[prop]) {
        reverseStore.addReverseMap(map[prop][i], this);
      }
      // Cascade delete
      reverseStore.on("Store.Deleted", async (evt: EventStoreDeleted) => {
        let infos = [];
        if (evt.object[map[prop]]) {
          infos.push(...evt.object[map[prop]]);
        }
        await Promise.all(infos.map(info => this.cascadeDelete(info, evt.object.getUuid())));
      });
    });
  }

  /**
   * Based on the raw Map init a BinaryMap
   * @param obj
   * @returns
   */
  newModel(obj: any): BinaryMap {
    return new BinaryMap(this, obj);
  }

  /**
   * Read a stream to a buffer
   *
   * @param stream
   * @returns
   */
  static streamToBuffer(stream: Readable): Promise<Buffer> {
    // codesnippet from https://stackoverflow.com/questions/14269233/node-js-how-to-read-a-stream-into-a-buffer
    const chunks = [];
    return new Promise((resolve, reject) => {
      stream.on("data", chunk => chunks.push(Buffer.from(chunk)));
      stream.on("error", err => reject(err));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  }

  /**
   * Check if a map is defined
   *
   * @param name
   * @param property
   */
  protected checkMap(name: string, property: string, modelName?: string) {
    if (modelName && this.handleBinary(modelName, property) !== -1) {
      return;
    }
    let map = this.parameters.map[this._lowercaseMaps[name.toLowerCase()]];
    if (map === undefined) {
      throw Error("Unknown mapping");
    }
    if (Array.isArray(map) && map.indexOf(property) === -1) {
      throw Error("Unknown mapping");
    }
  }

  /**
   * Ensure events are sent correctly after an upload and update the BinaryFileInfo in targetted object
   */
  async uploadSuccess(object: BinaryModel, property: string, file: BinaryFileInfo): Promise<void> {
    let object_uid = object.getUuid();
    await this.emitSync("Binary.UploadSuccess", {
      object: file,
      service: this,
      target: object
    });
    const relations = this.getWebda().getApplication().getRelations(object);
    const cardinality = (relations.binaries || []).find(p => p.attribute === property)?.cardinality || "MANY";
    if (cardinality === "MANY") {
      await object.getStore().upsertItemToCollection(object_uid, property, file);
    } else {
      await object.getStore().setAttribute(object_uid, property, file);
    }
    await this.emitSync("Binary.Create", {
      object: file,
      service: this,
      target: object
    });
    this.metrics.upload.inc();
  }

  /**
   * Cascade delete the object
   *
   * @param info of the map
   * @param uuid of the object
   */
  abstract cascadeDelete(info: BinaryMap, uuid: string): Promise<void>;

  /**
   *
   * @param targetStore
   * @param object
   * @param property
   * @param index
   * @returns
   */
  async deleteSuccess(object: BinaryModel, property: string, index?: number) {
    let info: BinaryMap = <BinaryMap>(index !== undefined ? object[property][index] : object[property]);
    const relations = this.getWebda().getApplication().getRelations(object);
    const cardinality = (relations.binaries || []).find(p => p.attribute === property)?.cardinality || "MANY";
    let update;
    if (cardinality === "MANY") {
      update = object.getStore().deleteItemFromCollection(object.getUuid(), property, index, info.hash, "hash");
    } else {
      object.getStore().removeAttribute(object.getUuid(), property);
    }
    await this.emitSync("Binary.Delete", {
      object: info,
      service: this
    });
    this.metrics.delete.inc();
    return update;
  }

  /**
   * Get file either from multipart post or raw
   * @param req
   * @returns
   */
  async _getFile(req: WebContext): Promise<BinaryFile> {
    let file = await req.getHttpContext().getRawBody(10 * 1024 * 1024);
    // TODO Check if we have other type
    return new MemoryBinaryFile(Buffer.from(file), {
      mimetype: req.getHttpContext().getUniqueHeader("Content-Type", "application/octet-stream"),
      size: parseInt(req.getHttpContext().getUniqueHeader("Content-Length")) || file.length,
      name: ""
    });
  }

  /**
   * @override
   */
  initRoutes() {
    if (!this.parameters.expose) {
      return;
    }
    this._initRoutes();
  }

  /**
   * Init the Binary system routes
   *
   * Making sure parameters.expose exists prior
   */
  _initRoutes() {
    let url;
    let name = this.getOperationName();

    if (!this.parameters.expose.restrict.get) {
      url = this.parameters.expose.url + "/{store}/{uid}/{property}/{index}";
      this.addRoute(url, ["GET"], this.httpRoute, {
        get: {
          operationId: `get${name}Binary`,
          description: "Download a binary linked to an object",
          summary: "Download a binary",
          responses: {
            "200": {
              description: "Binary stream"
            },
            "403": {
              description: "You don't have permissions"
            },
            "404": {
              description: "Object does not exist or attachment does not exist"
            },
            "412": {
              description: "Provided hash does not match"
            }
          }
        }
      });
    }

    if (!this.parameters.expose.restrict.create) {
      // No need the index to add file
      url = this.parameters.expose.url + "/{store}/{uid}/{property}";
      this.addRoute(url, ["POST"], this.httpRoute, {
        post: {
          operationId: `add${name}Binary`,
          description: "Add a binary linked to an object",
          summary: "Add a binary",
          responses: {
            "200": {
              description: ""
            },
            "403": {
              description: "You don't have permissions"
            },
            "404": {
              description: "Object does not exist or attachment does not exist"
            },
            "412": {
              description: "Provided hash does not match"
            }
          }
        }
      });
    }

    if (!this.parameters.expose.restrict.create) {
      // Add file with challenge
      url = this.parameters.expose.url + "/upload/{store}/{uid}/{property}";
      this.addRoute(url, ["PUT"], this.httpChallenge, {
        put: {
          operationId: `put${name}Binary`,
          description: "Add a binary to an object after challenge",
          summary: "Add a binary",
          responses: {
            "204": {
              description: ""
            },
            "403": {
              description: "You don't have permissions"
            },
            "404": {
              description: "Object does not exist or attachment does not exist"
            },
            "412": {
              description: "Provided hash does not match"
            }
          }
        }
      });
    }

    if (!this.parameters.expose.restrict.delete) {
      // Need hash to avoid concurrent delete
      url = this.parameters.expose.url + "/{store}/{uid}/{property}/{index}/{hash}";
      this.addRoute(url, ["DELETE"], this.httpRoute, {
        delete: {
          operationId: `delete${name}Binary`,
          description: "Delete a binary linked to an object",
          summary: "Delete a binary",
          responses: {
            "204": {
              description: ""
            },
            "403": {
              description: "You don't have permissions"
            },
            "404": {
              description: "Object does not exist or attachment does not exist"
            },
            "412": {
              description: "Provided hash does not match"
            }
          }
        }
      });
    }

    if (!this.parameters.expose.restrict.metadata) {
      // Need hash to avoid concurrent delete
      url = this.parameters.expose.url + "/{store}/{uid}/{property}/{index}/{hash}";
      this.addRoute(url, ["PUT"], this.httpRoute, {
        put: {
          operationId: `update${name}BinaryMetadata`,
          description: "Update a binary metadata linked to an object",
          summary: "Update a binary metadata",
          responses: {
            "204": {
              description: ""
            },
            "403": {
              description: "You don't have permissions"
            },
            "404": {
              description: "Object does not exist or attachment does not exist"
            },
            "412": {
              description: "Provided hash does not match"
            }
          }
        }
      });
    }
  }

  /**
   * Return the name of the service for OpenAPI
   * @returns
   */
  protected getOperationName(): string {
    return this._name.toLowerCase() === "binary" ? "" : this._name;
  }

  /**
   * Based on the request parameter verify it match a known mapping
   * @param ctx
   * @returns
   */
  _verifyMapAndStore(ctx: WebContext): Store<CoreModel> {
    let store = ctx.parameter("store").toLowerCase();
    // To avoid any problem lowercase everything
    let map = this.parameters.map[this._lowercaseMaps[store]];
    if (map === undefined) {
      throw new WebdaError.NotFound("Unknown map");
    }
    if (!map.includes(ctx.parameter("property"))) {
      throw new WebdaError.NotFound("Unknown property");
    }
    let targetStore: Store<CoreModel> = this.getService<Store<CoreModel>>(this._lowercaseMaps[store]);
    if (targetStore === undefined) {
      throw new WebdaError.NotFound("Unknown store");
    }
    return targetStore;
  }

  /**
   * By default no challenge is managed so throws 404
   *
   * @param ctx
   */
  async putRedirectUrl(_ctx: WebContext): Promise<{ url: string; method?: string }> {
    // Dont handle the redirect url
    throw new WebdaError.NotFound("No redirect url");
  }

  /**
   * Mechanism to add a data based on challenge
   */
  async httpChallenge(ctx: WebContext<BinaryFile>) {
    let body = await ctx.getRequestBody();
    if (!body.hash || !body.challenge) {
      throw new WebdaError.BadRequest("Missing hash or challenge");
    }
    // First verify if map exist
    let targetStore = this._verifyMapAndStore(ctx);
    // Get the object
    let object = await targetStore.get(ctx.parameter("uid"), ctx);
    if (object === undefined) {
      throw new WebdaError.NotFound("Object does not exist");
    }
    await object.checkAct(ctx, "attach_binary");
    let url = await this.putRedirectUrl(ctx);
    let base64String = Buffer.from(body.hash, "hex").toString("base64");
    ctx.write({
      ...url,
      done: url === undefined,
      md5: base64String
    });
  }

  /**
   * Manage the different routes
   * @param ctx
   */
  async httpRoute(ctx: WebContext) {
    // First verify if map exist
    let targetStore = this._verifyMapAndStore(ctx);
    // Get the object
    let object = await targetStore.get(ctx.parameter("uid"), ctx);
    if (object === undefined) {
      throw new WebdaError.NotFound("Object does not exist");
    }
    let property = ctx.parameter("property");
    let index = ctx.parameter("index");
    // Should be an array
    if (!Array.isArray(object[property]) || object[property].length <= index) {
      throw new WebdaError.NotFound("Object property is invalid");
    }
    // Check permissions
    let action = "unknown";
    if (ctx.getHttpContext().getMethod() === "GET") {
      action = "get_binary";
    } else if (ctx.getHttpContext().getMethod() === "DELETE") {
      action = "detach_binary";
    } else if (ctx.getHttpContext().getMethod() === "POST") {
      action = "attach_binary";
    } else if (ctx.getHttpContext().getMethod() === "PUT") {
      action = "update_binary_metadata";
    }
    await object.checkAct(ctx, action);

    // Now do the action
    if (ctx.getHttpContext().getMethod() === "GET") {
      // Most implementation override this to do a REDIRECT to a GET url
      let file = object[property][index];
      ctx.writeHead(200, {
        "Content-Type": file.mimetype === undefined ? "application/octet-steam" : file.mimetype,
        "Content-Length": file.size
      });
      let readStream: any = await this.get(file);
      await new Promise<void>((resolve, reject) => {
        // We replaced all the event handlers with a simple call to readStream.pipe()
        ctx._stream.on("finish", resolve);
        ctx._stream.on("error", reject);
        readStream.pipe(ctx._stream);
      });
    } else {
      if (ctx.getHttpContext().getMethod() === "POST") {
        await this.store(object, property, await this._getFile(ctx), await ctx.getRequestBody());
      } else {
        if (object[property][index].hash !== ctx.parameter("hash")) {
          throw new WebdaError.BadRequest("Hash does not match");
        }
        if (ctx.getHttpContext().getMethod() === "DELETE") {
          await this.delete(object, property, index);
        } else if (ctx.getHttpContext().getMethod() === "PUT") {
          let metadata: BinaryMetadata = await ctx.getRequestBody();
          // Limit metadata to 4kb
          if (JSON.stringify(metadata).length >= 4096) {
            throw new WebdaError.BadRequest("Metadata is too big: 4kb max");
          }
          let evt = {
            service: this,
            object: object[property][index],
            target: object
          };
          await this.emitSync("Binary.MetadataUpdate", {
            ...evt,
            metadata
          });
          object[property][index].metadata = metadata;
          // Update mapper on purpose
          await object.getStore().patch(
            {
              [object.__class.getUuidField()]: object.getUuid(),
              [property]: object[property]
            },
            false
          );
          this.metrics.metadataUpdate.inc();
          await this.emitSync("Binary.MetadataUpdated", evt);
        }
      }
    }
  }
}
