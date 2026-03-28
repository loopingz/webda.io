var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
import * as crypto from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { open } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import { createGzip } from "node:zlib";
import { GunzipConditional } from "@webda/utils";
import { Store, StoreParameters } from "./store.js";
import { MemoryRepository } from "@webda/models";
import { InstanceCache } from "../cache/cache.js";
import { useModelMetadata } from "../core/hooks.js";
/**
 * Memory store
 */
export class MemoryStoreParameters extends StoreParameters {
    load(params = {}) {
        var _a, _b, _c;
        super.load(params);
        if (this.persistence) {
            (_a = this.persistence).delay ?? (_a.delay = 1000);
            (_b = this.persistence).cipher ?? (_b.cipher = "aes-256-ctr");
            (_c = this.persistence).compressionLevel ?? (_c.compressionLevel = 9);
        }
        // Memory store cannot be cached
        this.noCache = true;
        return this;
    }
}
class LDJSONMemoryStreamWriter extends Readable {
    constructor(storage) {
        super();
        this.storage = storage;
        this.index = 0;
        this.data = [...storage.keys()];
    }
    _read() {
        if (this.index >= this.data.length) {
            this.push(null);
            return;
        }
        const key = this.data[this.index++];
        this.push(key + "\t" + this.storage.get(key) + "\n");
    }
}
class LDJSONMemoryStreamReader extends Writable {
    constructor(data) {
        super();
        this.data = data;
        this.current = "";
        this.oldFormat = undefined;
        this.firstBytes = true;
    }
    /**
     * Handle old format by storing it to memory to JSON.parse it later
     * Or read the new format to avoid parsing
     *
     * @returns
     */
    _write(chunk, encoding, callback) {
        if (this.firstBytes) {
            this.firstBytes = false;
            if (chunk[0] === "{".charCodeAt(0)) {
                this.oldFormat = "";
            }
        }
        if (this.oldFormat !== undefined) {
            this.oldFormat += chunk.toString();
            callback();
            return;
        }
        // Split by new line
        const res = chunk.toString().split("\n");
        // First chunk is the end of the last line
        res[0] = this.current + res[0];
        for (let i = 0; i < res.length - 1; i++) {
            const info = res[i];
            const split = info.indexOf("\t");
            this.data[info.substring(0, split)] = info.substring(split + 1);
        }
        this.current = res[res.length - 1];
        callback();
    }
    _final(callback) {
        // Parse the content if old format
        if (this.oldFormat !== undefined) {
            const data = JSON.parse(this.oldFormat);
            for (const i in data) {
                this.data[i] = data[i];
            }
        }
        callback();
    }
}
class MemoryModelMap extends Map {
    set(key, object) {
        super.set(key, object);
        this.persistence?.();
        return this;
    }
}
/**
 * Store in Memory
 *
 * @category CoreServices
 * @WebdaModda
 */
let MemoryStore = (() => {
    var _a;
    let _classSuper = Store;
    let _instanceExtraInitializers = [];
    let _getRepository_decorators;
    return _a = class MemoryStore extends _classSuper {
            constructor() {
                super(...arguments);
                /**
                 * Inmemory storage
                 */
                this.storage = (__runInitializers(this, _instanceExtraInitializers), new MemoryModelMap());
                /**
                 * Current persistence
                 */
                this.persistencePromise = null;
            }
            /**
             * Persist inmemory storage to file
             *
             * Called every this.parameters.persistence.delay ms
             *
             * We use stream to avoid consuming high memory
             * The objects are already in memory the JSON.parse/stringify would duplicate memory
             */
            async persist() {
                if (this.persistenceTimeout) {
                    clearTimeout(this.persistenceTimeout);
                    this.persistenceTimeout = null;
                }
                const source = new LDJSONMemoryStreamWriter(this.storage);
                let pipeline = source;
                if (this.parameters.persistence.compressionLevel > 0) {
                    pipeline = pipeline.pipe(createGzip({
                        level: this.parameters.persistence.compressionLevel
                    }));
                }
                const dest = createWriteStream(this.parameters.persistence.path);
                if (this.key) {
                    const iv = crypto.randomBytes(16);
                    const cipher = crypto.createCipheriv(this.parameters.persistence.cipher, new Uint8Array(this.key), new Uint8Array(iv));
                    pipeline = pipeline.pipe(cipher);
                    dest.write(iv);
                }
                pipeline.pipe(dest);
                await new Promise((resolve, reject) => {
                    dest.on("finish", () => {
                        this.log("DEBUG", "Persisted memory data");
                        resolve();
                    });
                    dest.on("error", err => {
                        this.log("ERROR", "Cannot persist memory data", err);
                        reject(err);
                    });
                });
            }
            /**
             * Load a persisted memory data
             */
            async load() {
                let pipeline;
                if (this.key) {
                    const fh = await open(this.parameters.persistence.path, "r");
                    const ivBuf = Buffer.alloc(16);
                    await fh.read(new Uint8Array(ivBuf.buffer, ivBuf.byteOffset, ivBuf.byteLength), 0, 16);
                    const iv = new Uint8Array(ivBuf);
                    const decipher = crypto.createDecipheriv(this.parameters.persistence.cipher, new Uint8Array(this.key), new Uint8Array(iv));
                    pipeline = fh.createReadStream({ start: 16 }).pipe(decipher);
                }
                else {
                    pipeline = createReadStream(this.parameters.persistence.path);
                }
                // Uncompress if needed
                pipeline = pipeline.pipe(new GunzipConditional());
                const dest = new LDJSONMemoryStreamReader(this.storage);
                pipeline.pipe(dest);
                await new Promise((resolve, reject) => {
                    dest.on("finish", () => {
                        this.log("DEBUG", "Load memory data");
                        resolve();
                    });
                    dest.on("error", err => {
                        reject(err);
                    });
                });
            }
            /**
             * @override
             */
            async init() {
                if (this.parameters.persistence) {
                    if (this.parameters.persistence.key) {
                        this.key = crypto.createHash("sha256").update(this.parameters.persistence.key).digest();
                    }
                    try {
                        if (existsSync(this.parameters.persistence.path)) {
                            await this.load();
                        }
                    }
                    catch (err) {
                        this.log("INFO", "Cannot loaded persisted memory data", err);
                    }
                    this.setPersistence();
                }
                return super.init();
            }
            /**
             * Set the persistence function if needed
             */
            setPersistence() {
                // Set a proxy if we need to delay the persistence
                if (this.parameters.persistence.delay > 0) {
                    // CustomMap
                    this.storage.persistence = () => {
                        const timeout = async () => {
                            // If we are already persisting, wait for it to finish
                            if (this.persistencePromise) {
                                this.persistenceTimeout ?? (this.persistenceTimeout = setTimeout(timeout, this.parameters.persistence.delay));
                                return;
                            }
                            this.persistencePromise = this.persist();
                            await this.persistencePromise;
                            this.persistencePromise = null;
                        };
                        this.persistenceTimeout ?? (this.persistenceTimeout = setTimeout(timeout, this.parameters.persistence.delay));
                    };
                    const originalSet = this.storage.set;
                    this.storage.set = (key, object) => {
                        const res = originalSet.call(this.storage, key, object);
                        this.storage.persistence();
                        return res;
                    };
                }
            }
            /**
             * Ensure the store is saved if persistence is on
             */
            async stop() {
                if (this.parameters.persistence) {
                    await this.persist();
                }
            }
            getRepository(model) {
                // Use our own storage to allow persistence
                return new MemoryRepository(model, useModelMetadata(model).PrimaryKey, undefined, this.storage);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _getRepository_decorators = [InstanceCache()];
            __esDecorate(_a, null, _getRepository_decorators, { kind: "method", name: "getRepository", static: false, private: false, access: { has: obj => "getRepository" in obj, get: obj => obj.getRepository }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { MemoryStore };
//# sourceMappingURL=memory.js.map