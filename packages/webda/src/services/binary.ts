"use strict";
import {
  Executor,
  Store,
  CoreModel,
  Context
} from '../index';
const fs = require("fs");
const path = require("path");
const mime = require('mime-types');
const crypto = require("crypto");


/**
 * This is a map used to retrieve binary
 *
 * @class BinaryMap
 */
class BinaryMap {
  constructor(obj) {
    for (var i in obj) {
      this[i] = obj[i];
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
class Binary extends Executor {

  _lowercaseMaps: any;
  _url: string;
  /**
   * When you store a binary to be able to retrieve it you need to store the information into another object
   *
   * If you have a User object define like this : User = {'name': 'Remi', 'uuid': 'Loopingz'}
   * You will call the store(userStore, 'Loopingz', 'images', filedata, {'type':'profile'})
   * After a successful call the object will look like User = {'name': 'Remi', 'uuid': 'Loopingz', 'images': [{'type':'profile','hash':'a12545...','size':1245,'mime':'application/octet'}]}
   *
   *
   * @param {Store} targetStore The store that handles the object to attach binary to
   * @param {String} object The object uuid to get from the store
   * @param {String} property The object property to add the file to
   * @param {Object} file The file by itself
   * @param {Object} metadatas to add to the binary object
   * @emits 'binaryCreate'
   */
  async store(targetStore, object, property, file, metadatas, index = 'add'): Promise < any > {
    throw Error("AbstractBinary has no store method");
  }

  /**
   * The store can retrieve how many time a binary has been used
   */
  getUsageCount(hash) {
    throw Error("AbstractBinary has no store method");
  }

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
  update(targetStore, object, property, index, file, metadatas): Promise < CoreModel > {
    throw Error("AbstractBinary has no update method");
  }

  /**
   * Update a binary
   *
   *
   * @param {Store} targetStore The store that handles the object to attach binary to
   * @param {String} object The object uuid to get from the store
   * @param {String} property The object property to add the file to
   * @param {Number} index The index of the file to change in the property
   * @emits 'binaryDelete'
   */
  delete(targetStore, object, property, index): Promise < CoreModel > {
    throw Error("AbstractBinary has no update method");
  }

  /**
   * Get a binary
   *
   * @param {Object} info The reference stored in your target object
   * @emits 'binaryGet'
   */
  async get(info) {
    await this.emitSync('Binary.Get', {
      'object': info,
      'service': this
    })
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
    return new Promise((resolve, reject) => {
      writeStream.on('finish', (src) => {
        return resolve();
      });
      writeStream.on('error', (src) => {
        try {
          fs.unlinkSync(filename);
        } catch (err) {
          this._webda.log('ERROR', err);
        }
        return reject();
      });
      readStream.pipe(writeStream);
    });
  }

  /** @ignore */
  async init(config): Promise < void > {
    this.initMap(this._params.map);
    if (this._params.expose) {
      this.initRoutes(config);
    }
  }

  _getUrl(info, ctx: Context) {
    return;
  }

  _get(info): ReadableStream {
    return;
  }

  initMap(map) {
    if (map == undefined || map._init) {
      return;
    }
    this._lowercaseMaps = {};
    for (var prop in map) {
      this._lowercaseMaps[prop.toLowerCase()] = prop;
      var reverseStore = this._webda.getService(prop);
      if (reverseStore === undefined || !(reverseStore instanceof Store)) {
        this._webda.log('WARN', 'Can\'t setup mapping as store ', prop, ' doesn\'t exist');
        map[prop]["-onerror"] = "NoStore";
        continue;
      }
      if (typeof(map[prop]) === "string") {
        reverseStore.addReverseMap(map[prop], {
          'store': this._name,
          'name': map[prop]
        }, this);
      } else {
        for (let i in map[prop]) {
          reverseStore.addReverseMap(map[prop][i], {
            'store': this._name,
            'name': map[prop][i]
          }, this);
        }
      }
    }
  }

  initModel(obj) {
    return new BinaryMap(obj);
  }

  _getHashes(buffer) {
    var result: any = {};
    // Using MD5 as S3 content verification use md5
    var hash = crypto.createHash('md5');
    var challenge = crypto.createHash('md5');
    challenge.update('WEBDA');
    result.hash = hash.update(buffer).digest('hex');
    result.challenge = challenge.update(buffer).digest('hex');
    return result;
  }

  _prepareInput(file) {
    if (file.path !== undefined) {
      file.buffer = fs.readFileSync(file.path);
      file.originalname = path.basename(file.path);
      file.size = fs.statSync(file.path).size;
      file.mimetype = mime.lookup(file.path) || 'application/octet-stream';
    }
  }

  _checkMap(name, property) {
    var map = this._params.map[this._lowercaseMaps[name.toLowerCase()]];
    if (map === undefined) {
      throw Error("Unknown mapping");
    }
    if (typeof(map) === "string" && map !== property) {
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

  async updateSuccess(targetStore, object, property, index, file, metadatas) {
    var fileObj = {};
    fileObj['metadatas'] = metadatas;
    fileObj['name'] = file.originalname;
    fileObj['mimetype'] = file.mimetype;
    fileObj['size'] = file.size;
    fileObj['hash'] = file.hash;
    fileObj['challenge'] = file.challenge;
    var object_uid = object.uuid;
    var info;
    var update;
    var promise;
    await this.emitSync('Binary.UploadSuccess', {
      'object': fileObj,
      'service': this,
      'target': object
    });
    if (index == "add") {
      promise = targetStore.upsertItemToCollection(object.uuid, property, fileObj);
    } else {
      promise = targetStore.upsertItemToCollection(object.uuid, property, fileObj, index, object[property][index].hash, 'hash');
      info = object[property][index];
    }
    return promise.then((updated) => {
      update = updated;
      if (info) {
        this.cascadeDelete(info, object_uid);
        return this.emitSync('Binary.Update', {
          'object': fileObj,
          'old': info,
          'service': this,
          'target': object
        });
      } else {
        return this.emitSync('Binary.Create', {
          'object': fileObj,
          'service': this,
          'target': object
        });
      }
    }).then(() => {
      return Promise.resolve(update);
    });
  }


  cascadeDelete(info, uuid) {

  }

  deleteSuccess(targetStore, object, property, index) {
    var info = object[property][index];
    var update;
    return targetStore.deleteItemFromCollection(object.uuid, property, index, info.hash, 'hash').then((updated) => {
      update = updated;
      return this.emitSync('Binary.Delete', {
        'object': info,
        'service': this
      });
    }).then(() => {
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
      file.originalname = '';
    }
    return file;
  }

  initRoutes(config) {
    let url;

    if (typeof(this._params.expose) == "boolean") {
      this._params.expose = {};
      this._params.expose.url = "/" + this._name.toLowerCase();
    } else if (typeof(this._params.expose) == "string") {
      url = this._params.expose;
      this._params.expose = {};
      this._params.expose.url = url;
    } else if (typeof(this._params.expose) == "object" && this._params.expose.url == undefined) {
      this._params.expose.url = "/" + this._name.toLowerCase();
    }
    if (this._params.expose.restrict == undefined) {
      this._params.expose.restrict = {}
    }
    this._url = this._params.expose.url;

    if (!this._params.expose.restrict.get) {
      url = this._params.expose.url + "/{store}/{uid}/{property}/{index}";
      this._addRoute(url, ["GET"], this.httpRoute);
    }

    if (!this._params.expose.restrict.create) {
      // No need the index to add file
      url = this._params.expose.url + "/{store}/{uid}/{property}";
      this._addRoute(url, ["POST"], this.httpPost);
    }

    if (!this._params.expose.restrict.create) {
      // Add file with challenge
      url = this._params.expose.url + "/upload/{store}/{uid}/{property}/{index}";
      this._addRoute(url, ["PUT"], this.httpChallenge);
    }

    if (!this._params.expose.restrict.delete) {
      // Need hash to avoid concurrent delete
      url = this._params.expose.url + "/{store}/{uid}/{property}/{index}/{hash}";
      this._addRoute(url, ["DELETE"], this.httpRoute);
    }
  }

  async httpPost(ctx: Context) {
    let targetStore = this._verifyMapAndStore(ctx);
    let object = await targetStore.get(ctx._params.uid);
    object = await this.store(targetStore, object, ctx._params.property, this._getFile(ctx), ctx.body);
    ctx.write(object);
  }

  _verifyMapAndStore(ctx: Context): Store < CoreModel > {
    // To avoid any probleme lowercase everything
    var map = this._params.map[this._lowercaseMaps[ctx._params.store.toLowerCase()]];
    if (map === undefined) {
      throw 404;
    }
    if (typeof(map) === "string" && map !== ctx._params.property) {
      throw 404;
    }
    if (Array.isArray(map) && map.indexOf(ctx._params.property) == -1) {
      throw 404;
    }
    var targetStore: Store < CoreModel > = < Store < CoreModel > > this.getService(ctx._params.store);
    if (targetStore === undefined) {
      throw 404;
    }
    return targetStore;
  }

  async putRedirectUrl(ctx: Context): Promise < string > {
    // Dont handle the redirect url
    throw 404;
  }

  async storeBinary(ctx: Context) {

  }

  async httpChallenge(ctx: Context) {
    let url = await this.putRedirectUrl(ctx);
    let base64String = new Buffer(ctx.body.hash, 'hex').toString('base64');
    ctx.write({
      url: url,
      done: !(url !== undefined),
      md5: base64String
    });
  }

  // Executor side
  async httpRoute(ctx: Context) {
    let targetStore = this._verifyMapAndStore(ctx);
    let object = await targetStore.get(ctx._params.uid);
    if (object === undefined) {
      throw 404;
    }
    if (object[ctx._params.property] !== undefined && typeof(object[ctx._params.property]) !== 'object') {
      throw 403;
    }
    if (object[ctx._params.property] === undefined || object[ctx._params.property][ctx._params.index] === undefined) {
      throw 404;
    }
    let action = 'unknown';
    if (ctx._route._http.method == "GET") {
      action = 'get_binary';
    } else if (ctx._route._http.method == "DELETE") {
      action = 'detach_binary';
    } else if (ctx._route._http.method == "PUT") {
      action = 'attach_binary';
    }
    await object.canAct(ctx, action);
    if (ctx._route._http.method == "GET") {
      var file = object[ctx._params.property][ctx._params.index];
      ctx.writeHead(200, {
        'Content-Type': file.mimetype === undefined ? 'application/octet-steam' : file.mimetype,
        'Content-Length': file.size
      });
      let readStream: any = await this.get(file);
      await new Promise((resolve, reject) => {
        // We replaced all the event handlers with a simple call to readStream.pipe()
        ctx._stream.on('finish', (src) => {
          return resolve();
        });
        ctx._stream.on('error', (src) => {
          return reject();
        });
        readStream.pipe(ctx._stream);
      });
    } else {
      if (object[ctx._params.property][ctx._params.index].hash !== ctx._params.hash) {
        throw 412;
      }
      if (ctx._route._http.method == "DELETE") {
        object = await this.delete(targetStore, object, ctx._params.property, ctx._params.index);
        ctx.write(object);
      } else if (ctx._route._http.method == "PUT") {
        object = await this.update(targetStore, object, ctx._params.property, ctx._params.index, this._getFile(ctx), ctx.body);
        ctx.write(object);
      }
    }
  }
}

export {
  Binary,
  BinaryMap
}
