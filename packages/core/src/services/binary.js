var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var _a, _b, _c, _d;
import * as crypto from "crypto";
import * as fs from "fs";
import * as mime from "mime-types";
import * as path from "path";
import { Readable } from "stream";
import * as WebdaError from "../errors/errors.js";
import { Service } from "./service.js";
import { NotEnumerable } from "@webda/tsc-esm";
import { useCore, useModelMetadata } from "../core/hooks.js";
import { ServiceParameters } from "./serviceparameters.js";
import { Counter } from "../metrics/metrics.js";
import { WEBDA_STORAGE } from "@webda/models";
import { streamToBuffer, FileSize } from "@webda/utils";
/**
 * Emitted if binary does not exist
 */
export class BinaryNotFoundError extends WebdaError.CodeError {
    constructor(hash, storeName) {
        super("BINARY_NOTFOUND", `Binary not found ${hash} BinaryService(${storeName})`);
    }
}
/**
 * Represent a file to store
 * @WebdaSchema
 */
export class BinaryFile {
    constructor(info) {
        this.set(info);
    }
    /**
     * Set the information
     * @param info
     */
    set(info) {
        this.name = info.name;
        this.challenge = info.challenge;
        this.hash = info.hash;
        this.mimetype = info.mimetype || "application/octet-stream";
        this.metadata = info.metadata || {};
        this.size = info.size;
    }
    /**
     * Retrieve a plain BinaryFileInfo object
     * @returns
     */
    toBinaryFileInfo() {
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
    /**
     * Create hashes
     * @param buffer
     * @returns
     */
    async getHashes() {
        if (!this.hash) {
            // Using MD5 as S3 content verification use md5
            const hash = crypto.createHash("md5");
            const challenge = crypto.createHash("md5");
            const stream = await this.get();
            challenge.update("WEBDA");
            await new Promise((resolve, reject) => {
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
    constructor(filePath) {
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
    async get() {
        return fs.createReadStream(this.path);
    }
}
let MemoryBinaryFile = (() => {
    var _e;
    let _classSuper = BinaryFile;
    let _buffer_decorators;
    let _buffer_initializers = [];
    let _buffer_extraInitializers = [];
    return _e = class MemoryBinaryFile extends _classSuper {
            constructor(buffer, info = {}) {
                super({
                    ...info,
                    size: info.size || buffer.length,
                    name: info.name || "data.bin",
                    mimetype: info.mimetype || "application/octet-stream"
                });
                /**
                 * Content
                 */
                this.buffer = __runInitializers(this, _buffer_initializers, void 0);
                __runInitializers(this, _buffer_extraInitializers);
                this.buffer = typeof buffer === "string" ? Buffer.from(buffer) : buffer;
            }
            /**
             * @override
             */
            async get() {
                return Readable.from(this.buffer);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _buffer_decorators = [NotEnumerable];
            __esDecorate(null, null, _buffer_decorators, { kind: "field", name: "buffer", static: false, private: false, access: { has: obj => "buffer" in obj, get: obj => obj.buffer, set: (obj, value) => { obj.buffer = value; } }, metadata: _metadata }, _buffer_initializers, _buffer_extraInitializers);
            if (_metadata) Object.defineProperty(_e, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _e;
})();
export { MemoryBinaryFile };
/**
 * This is a map used to retrieve binary
 *
 * @class BinaryMap
 */
export class BinaryMap extends BinaryFile {
    constructor(service, obj) {
        super(obj);
        /**
         * Link to the binary store
         */
        this[_a] = {};
        this.set(obj);
        this[WEBDA_STORAGE].service = service;
    }
    /**
     * Get the binary data
     *
     * @returns
     */
    get() {
        return this[WEBDA_STORAGE].service.get(this);
    }
    /**
     * Get into a buffer
     */
    async getAsBuffer() {
        return BinaryService.streamToBuffer(await this.get());
    }
    /**
     * Download the binary to a path
     *
     * Shortcut to call {@link Binary.downloadTo} with current object
     *
     * @param filename
     */
    async downloadTo(filename) {
        return this[WEBDA_STORAGE].service.downloadTo(this, filename);
    }
}
_a = WEBDA_STORAGE;
/**
 * One Binary instance
 * @readOnly
 * @dtoIn skip
 */
export class Binary extends BinaryMap {
    constructor(attribute, model) {
        super(useCore().getBinaryStore(model, attribute), model[attribute] || {});
        this[_b] = {};
        this[WEBDA_STORAGE].empty = model[attribute] === undefined;
        this[WEBDA_STORAGE].attribute = attribute;
        this[WEBDA_STORAGE].model = model;
    }
    /**
     * isEmpty
     * @returns
     */
    isEmpty() {
        return this[WEBDA_STORAGE].empty;
    }
    /**
     * Ensure empty is set correctly
     * @param info
     */
    set(info) {
        super.set(info);
        this[WEBDA_STORAGE].empty = false;
    }
    /**
     * Replace the binary
     * @param id
     * @param ctx
     * @returns
     */
    async upload(file) {
        await this[WEBDA_STORAGE].service.store(this[WEBDA_STORAGE].model, this[WEBDA_STORAGE].attribute, file);
        this.set(file);
    }
    /**
     * Delete the binary, if you need to replace just use upload
     */
    async delete() {
        await this[WEBDA_STORAGE].service.delete(this[WEBDA_STORAGE].model, this[WEBDA_STORAGE].attribute);
        this.set({});
        this[WEBDA_STORAGE].empty = true;
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
_b = WEBDA_STORAGE;
/**
 * Define a Binary map stored in a Binaries collection
 */
export class BinariesItem extends BinaryMap {
    constructor(parent, info) {
        super(parent[WEBDA_STORAGE].service, info);
        this[_c] = {};
        this[WEBDA_STORAGE].parent = parent;
    }
    /**
     * Replace the binary
     * @param id
     * @param ctx
     * @returns
     */
    async upload(file) {
        await this[WEBDA_STORAGE].parent.upload(file, this);
        this.set(file);
    }
    /**
     * Delete the binary, if you need to replace just use upload
     */
    async delete() {
        return this[WEBDA_STORAGE].parent.delete(this);
    }
}
_c = WEBDA_STORAGE;
/**
 * Define a collection of Binary
 * @dtoIn skip
 */
export class BinariesImpl extends Array {
    constructor() {
        super(...arguments);
        this[_d] = {};
    }
    static fromDto(data) { }
    assign(model, attribute) {
        this[WEBDA_STORAGE].model = model;
        this[WEBDA_STORAGE].attribute = attribute;
        for (const binary of model[attribute] || []) {
            this.push(binary);
        }
        this[WEBDA_STORAGE].service = useCore().getBinaryStore(model, attribute);
        return this;
    }
    // Readonly methods
    pop() {
        throw new Error("Readonly");
    }
    slice() {
        throw new Error("Readonly");
    }
    unshift() {
        throw new Error("Readonly");
    }
    shift() {
        throw new Error("Readonly");
    }
    push(...args) {
        return super.push(...args.map(arg => (arg instanceof BinariesItem ? arg : new BinariesItem(this, arg))));
    }
    /**
     * Upload a file to this model
     * @param file
     */
    async upload(file, replace) {
        await this[WEBDA_STORAGE].service.store(this[WEBDA_STORAGE].model, this[WEBDA_STORAGE].attribute, file);
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
    async delete(item) {
        let itemIndex = this.indexOf(item);
        if (itemIndex === -1) {
            throw new Error("Item not found");
        }
        await this[WEBDA_STORAGE].service.delete(this[WEBDA_STORAGE].model, this[WEBDA_STORAGE].attribute, itemIndex);
        itemIndex = this.indexOf(item);
        if (itemIndex >= 0) {
            // Call store delete here
            this.splice(itemIndex, 1);
        }
    }
}
_d = WEBDA_STORAGE;
export class BinaryParameters extends ServiceParameters {
    /**
     * Define the maximum filesize to accept as direct upload
     *
     * @default 10 MB
     */
    set maxFileSize(value) {
        this._maxFileSize = new FileSize(value).valueOf();
    }
    get maxFileSize() {
        return this._maxFileSize;
    }
    load(params = {}) {
        super.load(params);
        // Store all models in it by default
        this.models ?? (this.models = {
            "*": ["*"]
        });
        this.maxFileSize = new FileSize(params.maxFileSize ?? "10 MB").valueOf();
        return this;
    }
}
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
export class BinaryService extends Service {
    /**
     * @override
     */
    initMetrics() {
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
    async getRedirectUrlFromObject(binaryMap, _context, _expires = 30) {
        return null;
    }
    /**
     * Define if binary is managed by the store
     * @param modelName
     * @param attribute
     * @returns -1 if not managed, 0 if managed but by default, 1 if managed and in the map, 2 if explicit with attribute and model
     */
    handleBinary(modelName, attribute) {
        let key = Object.keys(this.parameters.models).find(k => k === modelName);
        if (key) {
            // Explicit model
            const attributes = this.parameters.models[key];
            if (attributes.includes(attribute)) {
                return 2;
            }
            else if (attributes.includes("*")) {
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
     * Get a binary
     *
     * @param {Object} info The reference stored in your target object
     * @emits 'binaryGet'
     */
    async get(info) {
        await this.emit("Binary.Get", {
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
    async downloadTo(info, filename) {
        await this.emit("Binary.Get", {
            object: info,
            service: this
        });
        this.metrics.download.inc();
        const readStream = await this._get(info);
        const writeStream = fs.createWriteStream(filename);
        return new Promise((resolve, reject) => {
            writeStream.on("finish", () => {
                return resolve();
            });
            writeStream.on("error", src => {
                try {
                    fs.unlinkSync(filename);
                    // Stubing the fs module in ESM seems complicated for now
                    /* c8 ignore next 3 */
                }
                catch (err) {
                    this.log("ERROR", err);
                }
                return reject(src);
            });
            readStream.pipe(writeStream);
        });
    }
    /**
     * Based on the raw Map init a BinaryMap
     * @param obj
     * @returns
     */
    newModel(obj) {
        return new BinaryMap(this, obj);
    }
    /**
     * Read a stream to a buffer
     *
     * @param stream
     * @returns
     */
    static streamToBuffer(stream) {
        // codesnippet from https://stackoverflow.com/questions/14269233/node-js-how-to-read-a-stream-into-a-buffer
        return streamToBuffer(stream);
    }
    /**
     * Check if a map is defined
     *
     * @param name
     * @param property
     */
    checkMap(object, property) {
        const { Identifier } = useModelMetadata(object);
        if (this.handleBinary(Identifier, property) !== -1) {
            return;
        }
        throw new Error("Unknown mapping");
    }
    /**
     * Ensure events are sent correctly after an upload and update the BinaryFileInfo in targetted object
     */
    async uploadSuccess(object, property, fileInfo) {
        let file;
        // Ensure we do not have a full object
        if (fileInfo["toBinaryFileInfo"] && typeof fileInfo["toBinaryFileInfo"] === "function") {
            file = fileInfo["toBinaryFileInfo"]();
        }
        else {
            file = fileInfo;
        }
        let additionalAttr;
        if ((additionalAttr = Object.keys(file).filter(k => !["name", "size", "mimetype", "hash", "challenge", "metadata"].includes(k)))) {
            throw new Error("Invalid file object it should be a plain BinaryFileInfo found additional properties: " +
                additionalAttr.join(","));
        }
        const object_uid = object.getUUID();
        // Check if the file is already in the array then skip
        if (Array.isArray(object[property]) && object[property].find(i => i.hash === file.hash)) {
            return;
        }
        // await this.emit("Binary.UploadSuccess", {
        //   object: file,
        //   service: this,
        //   target: object
        // });
        // const relations = object.Class.Metadata.Relations;
        // const cardinality = (relations.binaries || []).find(p => p.attribute === property)?.cardinality || "MANY";
        // if (cardinality === "MANY") {
        //   await (<CoreModelWithBinary<any>>object).Class.ref(object_uid).upsertItemToCollection(property, file);
        // } else {
        //   await object.patch(<any>{ [property]: file });
        // }
        // await this.emit("Binary.Create", {
        //   object: file,
        //   service: this,
        //   target: object
        // });
        this.metrics.upload.inc();
    }
    /**
     *
     * @param targetStore
     * @param object
     * @param property
     * @param index
     * @returns
     */
    async deleteSuccess(object, property, index) {
        const info = (index !== undefined ? object[property][index] : object[property]);
        // TODO: Refactor
        const relations = {}; //object.Class.Metadata.Relations;
        const cardinality = (relations.binaries || []).find(p => p.attribute === property)?.cardinality || "MANY";
        let update;
        if (cardinality === "MANY") {
            update = object.Class.ref(object.getUUID()).deleteItemFromCollection(property, index, "hash", info.hash);
        }
        else {
            object.ref().removeAttribute(property);
        }
        await this.emit("Binary.Delete", {
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
    async getFile(req) {
        const { size } = req.getParameters();
        let { mimetype, name } = req.getParameters();
        if (size > this.parameters.maxFileSize) {
            throw new WebdaError.BadRequest("File too big");
        }
        const file = await req.getRawInput(size ?? this.parameters.maxFileSize);
        mimetype ?? (mimetype = "application/octet-stream");
        name ?? (name = "data.bin");
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
    getOperationName() {
        return this.name.toLowerCase() === "binary" ? "" : this.name;
    }
    /**
     * Based on the request parameter verify it match a known mapping
     * @param ctx
     * @returns
     */
    verifyMapAndStore(ctx) {
        // Check for model
        if (this.handleBinary(ctx.parameter("model"), ctx.parameter("property")) === -1) {
            throw new WebdaError.NotFound("Model not managed by this store");
        }
        // TODO: Refactor
        return null; //<IStore>useCore().getModelStore(useModel(ctx.parameter("model")));
    }
    /**
     * By default no challenge is managed so throws 404
     *
     */
    async putRedirectUrl(...args) {
        // Dont handle the redirect url
        throw new WebdaError.NotFound("No redirect url");
    }
}
//# sourceMappingURL=binary.js.map