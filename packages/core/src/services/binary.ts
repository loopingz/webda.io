import * as crypto from "crypto";
import * as fs from "fs";
import * as mime from "mime-types";
import * as path from "path";
import { Readable } from "stream";
import { Core, Counter, WebdaError } from "../index";
import { CoreModel, NotEnumerable } from "../models/coremodel";
import { EventStoreDeleted, MappingService, Store } from "../stores/store";
import { OperationContext } from "../utils/context";
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
 * @WebdaSchema
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
      // Fallback on original name
      name: this.name || this.originalname
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
          const buffer = Buffer.from(chunk);
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

  constructor(buffer: Buffer | string, info: Partial<BinaryFileInfo> = {}) {
    super({
      ...info,
      size: info.size || buffer.length,
      name: info.name || "data.bin",
      mimetype: info.mimetype || "application/octet-stream"
    });
    this.buffer = typeof buffer === "string" ? Buffer.from(buffer) : buffer;
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
   * Get into a buffer
   */
  async getAsBuffer(): Promise<Buffer> {
    return BinaryService.streamToBuffer(await this.get());
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
  @NotEnumerable
  protected empty: boolean;
  constructor(attribute: string, model: CoreModel) {
    super(Core.get().getBinaryStore(model, attribute), model[attribute] || {});
    this.empty = model[attribute] === undefined;
    this.attribute = attribute;
    this.model = model;
  }

  /**
   * isEmpty
   * @returns
   */
  isEmpty() {
    return this.empty;
  }

  /**
   * Ensure empty is set correctly
   * @param info
   */
  set(info: BinaryFileInfo): void {
    super.set(info);
    this.empty = false;
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
    this.empty = true;
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
    for (const binary of model[attribute] || []) {
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
  shift(): BinariesItem<T> {
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
export type Binaries<T = any> = Readonly<Array<BinariesItem<T>>> & { upload: (file: BinaryFile) => Promise<void> };

export class BinaryParameters extends ServiceParameters {
  /**
   * Define the map of models
   * * indicates all models
   *
   * key is a Store name
   * the string[] represent all valids attributes to store files in * indicates all attributes
   */
  models: { [key: string]: string[] };

  /**
   * Define the maximum filesize to accept as direct upload
   *
   * @default 10*1024*1024
   */
  maxFileSize?: number;

  constructor(params: any, _service: Service) {
    super(params);
    // Store all models in it by default
    this.models ??= {
      "*": ["*"]
    };
    this.maxFileSize ??= 10 * 1024 * 1024;
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
   * Get a UrlFromObject
   *
   */
  async getRedirectUrlFromObject(
    binaryMap: BinaryMap,
    _context: OperationContext,
    _expires: number = 30
  ): Promise<null | string> {
    return null;
  }

  /**
   * Define if binary is managed by the store
   * @param modelName
   * @param attribute
   * @returns -1 if not managed, 0 if managed but by default, 1 if managed and in the map, 2 if explicit with attribute and model
   */
  handleBinary(modelName: string, attribute: string): -1 | 0 | 1 | 2 {
    let key = Object.keys(this.parameters.models).find(k => k === modelName);
    if (key) {
      // Explicit model
      const attributes = this.parameters.models[key];
      if (attributes.includes(attribute)) {
        return 2;
      } else if (attributes.includes("*")) {
        return 1;
      }
    }
    // Default to all model - 593-594,598-599
    key = Object.keys(this.parameters.models).find(k => k === "*");
    if (!key) {
      return -1;
    }
    const attributes = this.parameters.models[key];
    if (attributes.includes(attribute)) {
      return 1;
    }
    if (attributes.includes("*")) {
      return 0;
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
    const readStream: any = await this._get(info);
    const writeStream = fs.createWriteStream(filename);
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

  abstract _get(info: BinaryMap): Promise<Readable>;

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
  protected checkMap(object: CoreModel, property: string) {
    if (this.handleBinary(object.__type, property) !== -1) {
      return;
    }
    throw new Error("Unknown mapping");
  }

  /**
   * Ensure events are sent correctly after an upload and update the BinaryFileInfo in targetted object
   */
  async uploadSuccess(object: BinaryModel, property: string, file: BinaryFileInfo): Promise<void> {
    const object_uid = object.getUuid();
    // Check if the file is already in the array then skip
    if (Array.isArray(object[property]) && object[property].find(i => i.hash === file.hash)) {
      return;
    }
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
    const info: BinaryMap = <BinaryMap>(index !== undefined ? object[property][index] : object[property]);
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
  async getFile(req: OperationContext): Promise<BinaryFile> {
    const { size } = req.getParameters();
    let { mimetype, name } = req.getParameters();
    if (size > this.parameters.maxFileSize) {
      throw new WebdaError.BadRequest("File too big");
    }
    const file = await req.getRawInput(size ?? this.parameters.maxFileSize);
    mimetype ??= "application/octet-stream";
    name ??= "data.bin";
    return new MemoryBinaryFile(Buffer.from(file), {
      mimetype,
      size,
      name: name,
      hash: crypto.createHash("md5").update(file).digest("hex"),
      challenge: crypto
        .createHash("md5")
        .update("WEBDA" + file)
        .digest("hex")
    });
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
  protected verifyMapAndStore(ctx: OperationContext): Store<CoreModel> {
    // Check for model
    if (this.handleBinary(ctx.parameter("model"), ctx.parameter("property")) === -1) {
      throw new WebdaError.NotFound("Model not managed by this store");
    }
    return this.getWebda().getModelStore(this.getWebda().getModel(ctx.parameter("model")));
  }

  /**
   * By default no challenge is managed so throws 404
   *
   */
  async putRedirectUrl(...args: any): Promise<{ url: string; method?: string; headers?: { [key: string]: string } }> {
    // Dont handle the redirect url
    throw new WebdaError.NotFound("No redirect url");
  }
}
