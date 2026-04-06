import * as crypto from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { open } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import { createGzip } from "node:zlib";
import { GunzipConditional } from "@webda/utils";
import { Store, StoreParameters } from "./store.js";
import { MemoryRepository, type ModelClass, type Repository } from "@webda/models";
import { InstanceCache } from "../cache/cache.js";
import { useModelMetadata } from "../core/hooks.js";

export interface StorageMap {
  [key: string]: string;
}

/**
 * Memory store
 */
export class MemoryStoreParameters extends StoreParameters {
  /**
   * Persist the data in a file
   */
  persistence?: {
    /**
     * File path to save to
     */
    path: string;
    /**
     * Encryption key for AES encryption
     */
    key?: string;
    /**
     * By default only save once every 1s if modified
     *
     * @default 1000
     */
    delay?: number;
    /**
     * cipher to use
     */
    cipher?: string;
    /**
     * Compression level to use
     * @default 9
     * @max 9
     * @min 0
     */
    compressionLevel?: number;
  };

  /**
   * Load parameters with persistence defaults and force noCache for memory stores
   * @param params - the service parameters
   * @returns this for chaining
   */
  load(params: any = {}): this {
    super.load(params);
    if (this.persistence) {
      this.persistence.delay ??= 1000;
      this.persistence.cipher ??= "aes-256-ctr";
      this.persistence.compressionLevel ??= 9;
    }
    // Memory store cannot be cached
    this.noCache = true;
    return this;
  }
}

/** Readable stream that serializes a MemoryModelMap to line-delimited JSON */
class LDJSONMemoryStreamWriter extends Readable {
  private data: any[];
  private index: number = 0;

  /** Create a new LDJSONMemoryStreamWriter
   * @param storage - the memory model map to serialize
   */
  constructor(protected storage: MemoryModelMap) {
    super();
    this.data = [...storage.keys()];
  }

  /** Push the next key-value line or signal end of stream */
  _read() {
    if (this.index >= this.data.length) {
      this.push(null);
      return;
    }
    const key = this.data[this.index++];
    this.push(key + "\t" + this.storage.get(key) + "\n");
  }
}

/** Writable stream that parses line-delimited JSON or legacy JSON format into a Map */
class LDJSONMemoryStreamReader extends Writable {
  current: string = "";
  oldFormat: string = undefined;
  firstBytes: boolean = true;
  /** Create a new LDJSONMemoryStreamReader
   * @param data - the map to populate from the stream
   */
  constructor(protected data: Map<string, string>) {
    super();
  }

  /**
   * Handle old format by storing it to memory to JSON.parse it later
   * Or read the new format to avoid parsing
   *
   * @param chunk - the data chunk
   * @param encoding - the encoding to use
   * @param callback - the callback function
   * @returns the result
   */
  _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error) => void): void {
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
      this.data.set(info.substring(0, split), info.substring(split + 1));
    }
    this.current = res[res.length - 1];

    callback();
  }

  /**
   * Finalize parsing, handling legacy JSON format conversion
   * @param callback - the callback function
   */
  _final(callback: (error?: Error) => void): void {
    // Parse the content if old format
    if (this.oldFormat !== undefined) {
      const data = JSON.parse(this.oldFormat);
      for (const i in data) {
        this.data.set(i, data[i]);
      }
    }
    callback();
  }
}

/** Map subclass that triggers persistence on every write */
class MemoryModelMap extends Map<string, string> {
  persistence: () => void;
  /**
   * Set a value and trigger persistence callback
   * @param key - the key
   * @param object - the target object
   * @returns the result
   */
  set(key: string, object: string) {
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
export class MemoryStore<K extends MemoryStoreParameters = MemoryStoreParameters> extends Store<K> {
  /**
   * Inmemory storage
   */
  storage: MemoryModelMap = new MemoryModelMap();
  /**
   * Persistence timeout id
   */
  private persistenceTimeout;
  /**
   * Current persistence
   */
  persistencePromise = null;
  /**
   * AES encryption key
   */
  private key: Buffer;

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
    let pipeline: Readable = source;
    if (this.parameters.persistence.compressionLevel > 0) {
      pipeline = pipeline.pipe(
        createGzip({
          level: this.parameters.persistence.compressionLevel
        })
      );
    }

    const dest = createWriteStream(this.parameters.persistence.path);
    if (this.key) {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.parameters.persistence.cipher, new Uint8Array(this.key), new Uint8Array(iv));
      pipeline = pipeline.pipe(cipher);
      dest.write(iv);
    }
    pipeline.pipe(dest);
    await new Promise<void>((resolve, reject) => {
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
    let pipeline: Readable;
    if (this.key) {
      const fh = await open(this.parameters.persistence.path, "r");
      const ivBuf = Buffer.alloc(16);
      await fh.read(new Uint8Array(ivBuf.buffer, ivBuf.byteOffset, ivBuf.byteLength), 0, 16);
      const iv = new Uint8Array(ivBuf);
      const decipher = crypto.createDecipheriv(this.parameters.persistence.cipher, new Uint8Array(this.key), new Uint8Array(iv));
      pipeline = fh.createReadStream({ start: 16 }).pipe(decipher);
    } else {
      pipeline = createReadStream(this.parameters.persistence.path);
    }
    // Uncompress if needed
    pipeline = pipeline.pipe(new GunzipConditional());

    const dest = new LDJSONMemoryStreamReader(this.storage);
    pipeline.pipe(dest);
    await new Promise<void>((resolve, reject) => {
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
  async init(): Promise<this> {
    if (this.parameters.persistence) {
      if (this.parameters.persistence.key) {
        this.key = crypto.createHash("sha256").update(this.parameters.persistence.key).digest();
      }
      try {
        if (existsSync(this.parameters.persistence.path)) {
          await this.load();
        }
      } catch (err) {
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
            this.persistenceTimeout ??= setTimeout(timeout, this.parameters.persistence.delay);
            return;
          }
          this.persistencePromise = this.persist();
          await this.persistencePromise;
          this.persistencePromise = null;
        };
        this.persistenceTimeout ??= setTimeout(timeout, this.parameters.persistence.delay);
      };
      const originalSet = this.storage.set;
      this.storage.set = (key: string, object: string) => {
        const res = originalSet.call(this.storage, key, object);
        this.storage.persistence();
        return res;
      };
    }
  }

  /**
   * Ensure the store is saved if persistence is on
   */
  async stop(): Promise<void> {
    if (this.parameters.persistence) {
      await this.persist();
    }
  }

  /**
   * Get or create a MemoryRepository for the given model, using the shared storage map
   * @param model - the model to use
   * @returns the result
   */
  @InstanceCache()
  getRepository<T extends ModelClass>(model: T): Repository<T> {
    // Use our own storage to allow persistence
    return new MemoryRepository<T>(model, useModelMetadata(model).PrimaryKey, undefined, this.storage);
  }
}
