"use strict";
import * as crypto from "crypto";
import * as fs from "fs";
import * as mime from "mime-types";
import * as path from "path";
import { Readable } from "stream";
import { CoreModel } from "../models/coremodel";
import { Store } from "../stores/store";
import { Context } from "../utils/context";
import { Service, ServiceParameters } from "./service";

export interface EventBinary {
  object: BinaryMap;
  service: Binary;
}
export interface EventBinaryGet extends EventBinary {}
export interface EventBinaryUploadSuccess extends EventBinary {
  target: CoreModel;
}
export interface EventBinaryDelete extends EventBinary {}
export interface EventBinaryCreate extends EventBinaryUploadSuccess {}
export interface EventBinaryUpdate extends EventBinaryUploadSuccess {
  old: BinaryMap;
}

/**
 * This is a map used to retrieve binary
 *
 * @class BinaryMap
 */
export class BinaryMap {
  __ctx: Context;
  __store: Binary;
  /**
   * Hash of the binary
   */
  hash: string;

  constructor(service, obj) {
    for (var i in obj) {
      this[i] = obj[i];
    }
    this.__store = service;
  }

  /**
   * Get the CoreModel
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
   * @returns
   */
  downloadTo(filename: string) {
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
    };
  };

  constructor(params: any, service: Service) {
    super(params);
    if (this.expose) {
      this.expose.restrict = this.expose.restrict || {};
    }
  }
}
/**
 * This is an abstract service to represent a storage of files
 * The binary allow you to expose this service as HTTP ( therefore is an executor )
 * It needs an object to attach the binary too
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
abstract class Binary<T extends BinaryParameters = BinaryParameters> extends Service<T> {
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
   * @param {Store} targetStore The store that handles the object to attach binary to
   * @param {CoreModel} object The object uuid to get from the store
   * @param {String} property The object property to add the file to
   * @param {Object} file The file by itself
   * @param {Object} metadatas to add to the binary object
   * @emits 'binaryCreate'
   */

  abstract store(
    targetStore: Store<CoreModel>,
    object: CoreModel,
    property: string,
    file,
    metadatas: any,
    index?: number
  ): Promise<any>;

  /**
   * The store can retrieve how many time a binary has been used
   */
  abstract getUsageCount(hash): Promise<number>;

  /**
   * Update a binary
   *
   *
   * @param {Store} targetStore The store that handles the object to attach binary to
   * @param {String} object The object uuid to get from the store
   * @param {String} property The object property to add the file to
   * @param {Number} index The index of the file to change in the property
   * @param {Object} file The file by itself
   * @param {Object} metadatas to add to the binary object
   * @emits 'binaryUpdate'
   */
  abstract update(targetStore, object, property, index, file, metadatas): Promise<CoreModel>;

  /**
   * Update a binary
   *
   *
   * @param {Store} targetStore The store that handles the object to attach binary to
   * @param {CoreModel} object The object uuid to get from the store
   * @param {String} property The object property to add the file to
   * @param {Number} index The index of the file to change in the property
   * @emits 'binaryDelete'
   */
  abstract delete(
    targetStore: Store<CoreModel>,
    object: CoreModel,
    property: string,
    index: number
  ): Promise<CoreModel>;

  /**
   * Get a binary
   *
   * @param {Object} info The reference stored in your target object
   * @emits 'binaryGet'
   */
  async get(info: BinaryMap) {
    await this.emitSync("Binary.Get", <EventBinaryGet>{
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
  downloadTo(info, filename) {
    var readStream: any = this._get(info);
    var writeStream = fs.createWriteStream(filename);
    return new Promise<void>((resolve, reject) => {
      writeStream.on("finish", src => {
        return resolve();
      });
      writeStream.on("error", src => {
        try {
          fs.unlinkSync(filename);
        } catch (err) {
          this._webda.log("ERROR", err);
        }
        return reject();
      });
      readStream.pipe(writeStream);
    });
  }

  /** @ignore */
  async init(): Promise<void> {
    this.initMap(this.parameters.map);
  }

  /**
   * Return a direct access url
   * @param info
   * @param ctx
   */
  _getUrl(info: BinaryMap, ctx: Context) {}

  abstract _get(info: BinaryMap): Readable;

  initMap(map) {
    if (map == undefined || map._init) {
      return;
    }
    this._lowercaseMaps = {};
    for (var prop in map) {
      this._lowercaseMaps[prop.toLowerCase()] = prop;
      var reverseStore = this._webda.getService(prop);
      if (reverseStore === undefined || !(reverseStore instanceof Store)) {
        this._webda.log("WARN", "Can't setup mapping as store ", prop, " doesn't exist");
        map[prop]["-onerror"] = "NoStore";
        continue;
      }
      if (typeof map[prop] === "string") {
        reverseStore.addReverseMap(
          map[prop],
          {
            store: this._name,
            name: map[prop]
          },
          this
        );
      } else {
        for (let i in map[prop]) {
          reverseStore.addReverseMap(
            map[prop][i],
            {
              store: this._name,
              name: map[prop][i]
            },
            this
          );
        }
      }
    }
  }

  initModel(obj) {
    return new BinaryMap(this, obj);
  }

  _getHashes(buffer) {
    var result: any = {};
    // Using MD5 as S3 content verification use md5
    var hash = crypto.createHash("md5");
    var challenge = crypto.createHash("md5");
    challenge.update("WEBDA");
    result.hash = hash.update(buffer).digest("hex");
    result.challenge = challenge.update(buffer).digest("hex");
    return result;
  }

  _prepareInput(file) {
    if (file.path !== undefined) {
      file.buffer = fs.readFileSync(file.path);
      file.originalname = path.basename(file.path);
      file.name = file.name || file.originalname;
      file.size = fs.statSync(file.path).size;
      file.mimetype = mime.lookup(file.path) || "application/octet-stream";
    }
  }

  _checkMap(name, property) {
    var map = this.parameters.map[this._lowercaseMaps[name.toLowerCase()]];
    if (map === undefined) {
      throw Error("Unknown mapping");
    }
    if (typeof map === "string" && map !== property) {
      throw Error("Unknown mapping");
    }
    if (Array.isArray(map) && map.indexOf(property) === -1) {
      throw Error("Unknown mapping");
    }
  }

  _validChallenge(challenge) {
    var re = /[0-9A-Fa-f]{64}/g;
    return re.test(challenge);
  }

  challenge(hash, challenge) {
    return false;
  }

  async updateSuccess(
    targetStore: Store,
    object: CoreModel,
    property: string,
    index: number,
    file: any,
    metadatas: any
  ) {
    var fileObj: BinaryMap = {
      ...file,
      metadatas
    };
    var object_uid = object[targetStore.getUuidField()];
    var info;
    var update;
    var promise;
    await this.emitSync("Binary.UploadSuccess", <EventBinaryUploadSuccess>{
      object: fileObj,
      service: this,
      target: object
    });
    if (index === undefined || index < 0) {
      promise = targetStore.upsertItemToCollection(object_uid, property, fileObj);
    } else {
      promise = targetStore.upsertItemToCollection(
        object_uid,
        property,
        fileObj,
        index,
        object[property][index].hash,
        "hash"
      );
      info = object[property][index];
    }
    let updated = await promise;
    update = updated;
    if (info) {
      if (info.hash !== file.hash) {
        await this.cascadeDelete(info, object_uid);
      }
      await this.emitSync("Binary.Update", <EventBinaryUpdate>{
        object: fileObj,
        old: info,
        service: this,
        target: object
      });
    } else {
      await this.emitSync("Binary.Create", <EventBinaryCreate>{
        object: fileObj,
        service: this,
        target: object
      });
    }
    return update;
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
  deleteSuccess(targetStore: Store, object: CoreModel, property: string, index: number) {
    var info: BinaryMap = object[property][index];
    var update;
    return targetStore
      .deleteItemFromCollection(object[targetStore.getUuidField()], property, index, info.hash, "hash")
      .then(updated => {
        update = updated;
        return this.emitSync("Binary.Delete", <EventBinaryDelete>{
          object: info,
          service: this
        });
      })
      .then(() => {
        return Promise.resolve(update);
      });
  }

  _getFile(req) {
    var file;
    if (req.files !== undefined) {
      file = req.files[0];
    } else {
      file = {};
      file.buffer = req.body;
      file.mimetype = req.headers.contentType;
      file.size = req.body.length;
      file.originalname = "";
    }
    return file;
  }

  /**
   * Init the Binary system routes
   */
  initRoutes() {
    // Use a private method with boolean
    this._initRoutes();
  }

  /**
   * This is used to allow subclasses to add more route
   */
  _initRoutes(): boolean {
    let url;
    if (!this.parameters.expose) {
      return false;
    }

    let name = this._name;
    if (name === "Binary") {
      name = "";
    }

    if (!this.parameters.expose.url) {
      return false;
    }

    if (!this.parameters.expose.restrict.get) {
      url = this.parameters.expose.url + "/{store}/{uid}/{property}/{index}";
      this.addRoute(url, ["GET"], this.httpRoute, {
        get: {
          operationId: `get${name}Binary`,
          description: "Download a binary linked to an object",
          summary: "Download a binary",
          responses: {
            "200": "Binary stream",
            "403": "You don't have permissions",
            "404": "Object does not exist or attachment does not exist",
            "412": "Provided hash does not match"
          }
        }
      });
    }

    if (!this.parameters.expose.restrict.create) {
      // No need the index to add file
      url = this.parameters.expose.url + "/{store}/{uid}/{property}";
      this.addRoute(url, ["POST"], this.httpPost, {
        post: {
          operationId: `add${name}Binary`,
          description: "Add a binary linked to an object",
          summary: "Add a binary",
          responses: {
            "200": {
              schema: {
                type: "object"
              }
            },
            "403": "You don't have permissions",
            "404": "Object does not exist or attachment does not exist",
            "412": "Provided hash does not match"
          }
        }
      });
    }

    if (!this.parameters.expose.restrict.create) {
      // Add file with challenge
      url = this.parameters.expose.url + "/upload/{store}/{uid}/{property}/{index}";
      this.addRoute(url, ["PUT"], this.httpChallenge, {
        put: {
          operationId: `put${name}Binary`,
          description: "Add a binary to an object after challenge",
          summary: "Add a binary",
          responses: {
            "204": "",
            "403": "You don't have permissions",
            "404": "Object does not exist or attachment does not exist",
            "412": "Provided hash does not match"
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
            "204": "",
            "403": "You don't have permissions",
            "404": "Object does not exist or attachment does not exist",
            "412": "Provided hash does not match"
          }
        }
      });
    }
    return true;
  }

  async httpPost(ctx: Context) {
    let targetStore = this._verifyMapAndStore(ctx);
    let object = await targetStore.get(ctx.parameter("uid"));
    object = await this.store(targetStore, object, ctx.parameter("property"), this._getFile(ctx), ctx.getRequestBody());
    ctx.write(object);
  }

  _verifyMapAndStore(ctx: Context): Store<CoreModel> {
    let store = ctx.parameter("store").toLowerCase();
    // To avoid any probleme lowercase everything
    var map = this.parameters.map[this._lowercaseMaps[store]];
    if (map === undefined) {
      throw 404;
    }
    let property = ctx.parameter("property");
    if (typeof map === "string" && map !== property) {
      throw 404;
    }
    if (Array.isArray(map) && map.indexOf(property) == -1) {
      throw 404;
    }
    var targetStore: Store<CoreModel> = this.getService<Store<CoreModel>>(store);
    if (targetStore === undefined) {
      throw 404;
    }
    return targetStore;
  }

  async putRedirectUrl(ctx: Context): Promise<string> {
    // Dont handle the redirect url
    throw 404;
  }

  async httpChallenge(ctx: Context) {
    let url = await this.putRedirectUrl(ctx);
    let base64String = Buffer.from(ctx.getRequestBody().hash, "hex").toString("base64");
    ctx.write({
      url: url,
      done: url === undefined,
      md5: base64String
    });
  }

  // Executor side
  async httpRoute(ctx: Context) {
    let targetStore = this._verifyMapAndStore(ctx);
    let uid = ctx.parameter("uid");
    let object = await targetStore.get(uid);
    if (object === undefined) {
      throw 404;
    }
    let property = ctx.parameter("property");
    let index = ctx.parameter("index");
    if (object[property] !== undefined && typeof object[property] !== "object") {
      throw 403;
    }
    if (object[property] === undefined || object[property][index] === undefined) {
      throw 404;
    }
    let action = "unknown";
    if (ctx.getHttpContext().getMethod() === "GET") {
      action = "get_binary";
    } else if (ctx.getHttpContext().getMethod() === "DELETE") {
      action = "detach_binary";
    } else if (ctx.getHttpContext().getMethod() === "PUT") {
      action = "attach_binary";
    }
    await object.canAct(ctx, action);
    if (ctx.getHttpContext().getMethod() === "GET") {
      var file = object[property][index];
      ctx.writeHead(200, {
        "Content-Type": file.mimetype === undefined ? "application/octet-steam" : file.mimetype,
        "Content-Length": file.size
      });
      let readStream: any = await this.get(file);
      await new Promise<void>((resolve, reject) => {
        // We replaced all the event handlers with a simple call to readStream.pipe()
        ctx._stream.on("finish", src => {
          return resolve();
        });
        ctx._stream.on("error", src => {
          return reject();
        });
        readStream.pipe(ctx._stream);
      });
    } else {
      if (object[property][index].hash !== ctx.parameter("hash")) {
        throw 412;
      }
      if (ctx.getHttpContext().getMethod() === "DELETE") {
        object = await this.delete(targetStore, object, property, index);
        ctx.write(object);
      } else if (ctx.getHttpContext().getMethod() === "PUT") {
        object = await this.update(targetStore, object, property, index, this._getFile(ctx), ctx.getRequestBody());
        ctx.write(object);
      }
    }
  }
}

export { Binary };
