"use strict";
import * as crypto from "crypto";
import * as fs from "fs";
import * as mime from "mime-types";
import * as path from "path";
import { Readable } from "stream";
import { WebdaError } from "..";
import { CoreModel } from "../models/coremodel";
import { EventStoreDeleted, MappingService, Store } from "../stores/store";
import { Context } from "../utils/context";
import { Service, ServiceParameters } from "./service";

/**
 * Represent basic EventBinary
 */
export interface EventBinary {
  object: BinaryFileInfo;
  service: Binary;
  /**
   * In case the Context is known
   */
  context?: Context;
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
export class BinaryNotFoundError extends WebdaError {
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
 * Represent a file to store
 */
export abstract class BinaryFile implements BinaryFileInfo {
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
  metadata?: BinaryMetadata;

  constructor(info: BinaryFileInfo) {
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
export type BinaryMetadata = { [key: string]: any };

/**
 * This is a map used to retrieve binary
 *
 * @class BinaryMap
 */
export class BinaryMap extends BinaryFile {
  /**
   * Current context
   */
  __ctx: Context;
  /**
   * Link to the binary store
   */
  __store: Binary;

  constructor(service: Binary, obj: BinaryFileInfo) {
    super(obj);
    for (var i in obj) {
      this[i] = obj[i];
    }
    this.__store = service;
  }

  /**
   * Prevent all the attributes starting with '__' to be serialized
   * @returns
   */
  toJSON() {
    let res = {};
    Object.keys(this)
      .filter(k => !k.startsWith("__"))
      .forEach(k => {
        res[k] = this[k];
      });
    return res;
  }

  /**
   * Get the binary data
   *
   * @returns
   */
  get() {
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
  setContext(ctx: Context) {
    this.__ctx = ctx;
  }
}

export class BinaryParameters extends ServiceParameters {
  /**
   * Define the map to Object collection
   *
   * key is a Store name
   * the string[] represent all valids attributes to store files in
   */
  map: { [key: string]: string[] };
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
 * @class Binary
 */
abstract class Binary<T extends BinaryParameters = BinaryParameters, E extends BinaryEvents = BinaryEvents>
  extends Service<T, E>
  implements MappingService<BinaryMap>
{
  _lowercaseMaps: any;

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
  abstract delete(object: CoreModel, property: string, index: number): Promise<void>;

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
    var readStream: any = await this._get(info);
    var writeStream = fs.createWriteStream(filename);
    return new Promise<void>((resolve, reject) => {
      writeStream.on("finish", _src => {
        return resolve();
      });
      writeStream.on("error", src => {
        try {
          fs.unlinkSync(filename);
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
  resolve() {
    super.resolve();
    this.initMap(this.parameters.map);
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
  initModel(obj: any): BinaryMap {
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
  protected checkMap(name: string, property: string) {
    var map = this.parameters.map[this._lowercaseMaps[name.toLowerCase()]];
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
  async uploadSuccess(object: CoreModel, property: string, file: BinaryFileInfo): Promise<void> {
    var object_uid = object.getUuid();
    await this.emitSync("Binary.UploadSuccess", {
      object: file,
      service: this,
      target: object
    });
    await object.getStore().upsertItemToCollection(object_uid, property, file);
    await this.emitSync("Binary.Create", {
      object: file,
      service: this,
      target: object
    });
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
  async deleteSuccess(object: CoreModel, property: string, index: number) {
    var info: BinaryMap = object[property][index];
    let update = object.getStore().deleteItemFromCollection(object.getUuid(), property, index, info.hash, "hash");
    await this.emitSync("Binary.Delete", {
      object: info,
      service: this
    });
    return update;
  }

  /**
   * Get file either from multipart post or raw
   * @param req
   * @returns
   */
  _getFile(req: Context): BinaryFile {
    if (req.files !== undefined) {
      // TODO Map express files to BinaryFile
      return req.files[0];
    } else {
      let buffer = req.getRequestBody();
      if (typeof buffer === "string") {
        buffer = Buffer.from(buffer);
      }
      // TODO Check if we have other type
      return new MemoryBinaryFile(buffer, {
        mimetype: req.getHttpContext().getHeader("Content-Type", "application/octet-stream"),
        size: parseInt(req.getHttpContext().getHeader("Content-Length")) || req.getRequestBody().length,
        name: ""
      });
    }
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
        delete: {
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
  _verifyMapAndStore(ctx: Context): Store<CoreModel> {
    let store = ctx.parameter("store").toLowerCase();
    // To avoid any probleme lowercase everything
    var map = this.parameters.map[this._lowercaseMaps[store]];
    if (map === undefined) {
      throw 404;
    }
    if (map.indexOf(ctx.parameter("property")) == -1) {
      throw 404;
    }
    var targetStore: Store<CoreModel> = this.getService<Store<CoreModel>>(store);
    if (targetStore === undefined) {
      throw 404;
    }
    return targetStore;
  }

  /**
   * By default no challenge is managed so throws 404
   *
   * @param ctx
   */
  async putRedirectUrl(_ctx: Context): Promise<{ url: string; method?: string }> {
    // Dont handle the redirect url
    throw 404;
  }

  /**
   * Mechanism to add a data based on challenge
   */
  async httpChallenge(ctx: Context) {
    let body = ctx.getRequestBody();
    if (!body.hash || !body.challenge) {
      throw 400;
    }
    // First verify if map exist
    let targetStore = this._verifyMapAndStore(ctx);
    // Get the object
    let object = await targetStore.get(ctx.parameter("uid"), ctx);
    if (object === undefined) {
      throw 404;
    }
    await object.canAct(ctx, "attach_binary");
    let url = await this.putRedirectUrl(ctx);
    let base64String = Buffer.from(ctx.getRequestBody().hash, "hex").toString("base64");
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
  async httpRoute(ctx: Context) {
    // First verify if map exist
    let targetStore = this._verifyMapAndStore(ctx);
    // Get the object
    let object = await targetStore.get(ctx.parameter("uid"), ctx);
    if (object === undefined) {
      throw 404;
    }
    let property = ctx.parameter("property");
    let index = ctx.parameter("index");
    // Should be an array
    if (!Array.isArray(object[property]) || object[property].length <= index) {
      throw 404;
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
    await object.canAct(ctx, action);

    // Now do the action
    if (ctx.getHttpContext().getMethod() === "GET") {
      var file = object[property][index];
      ctx.writeHead(200, {
        "Content-Type": file.mimetype === undefined ? "application/octet-steam" : file.mimetype,
        "Content-Length": file.size
      });
      let readStream: any = await this.get(file);
      try {
        await new Promise<void>((resolve, reject) => {
          // We replaced all the event handlers with a simple call to readStream.pipe()
          ctx._stream.on("finish", resolve);
          ctx._stream.on("error", reject);
          readStream.pipe(ctx._stream);
        });
      } catch (err) {
        this.log("ERROR", err);
        throw 500;
      }
    } else {
      if (ctx.getHttpContext().getMethod() === "POST") {
        await this.store(object, property, this._getFile(ctx), ctx.getRequestBody());
      } else {
        if (object[property][index].hash !== ctx.parameter("hash")) {
          throw 412;
        }
        if (ctx.getHttpContext().getMethod() === "DELETE") {
          await this.delete(object, property, index);
        } else if (ctx.getHttpContext().getMethod() === "PUT") {
          let metadata: BinaryMetadata = ctx.getRequestBody();
          // Limit metadata to 4kb
          if (JSON.stringify(metadata).length >= 4096) {
            throw 400;
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
              [property]: (<BinaryMap[]>object[property]).map(b => b.toJSON())
            },
            false
          );
          await this.emitSync("Binary.MetadataUpdated", evt);
        }
      }
    }
  }
}

export { Binary };
