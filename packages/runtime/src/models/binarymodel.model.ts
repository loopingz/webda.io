import { Binary, CoreModel, MemoryBinaryFile } from "@webda/core";

/**
 * Mark a property as non-enumerable (compile-time hint for schema generation)
 * @param _target - the property being decorated
 * @param _context - decorator context
 */
function NotEnumerable(_target: any, _context: any) {
  // No-op at runtime — used by the compiler for schema generation
}
import { gunzipSync, gzipSync } from "zlib";

/**
 * Binary Model is a model that store its data in a binary file
 */
export class BinaryModel<T = any> extends CoreModel {
  @NotEnumerable
  __data: T;

  __binary: Binary;

  @NotEnumerable
  __dataUpdated: boolean = false;

  /**
   * Proxied accessor that marks the model as dirty on any mutation
   * @returns a Proxy wrapping the underlying data that tracks writes
   */
  public get data(): T {
    const subProxier = prop => {
      return {
        set: (target: this, p: string | symbol, value) => {
          this.__dataUpdated = true;
          target[p] = value;
          return true;
        },
        get: (target: this, p: string | symbol) => {
          if (Array.isArray(target[p]) || target[p] instanceof Object) {
            return new Proxy(target[p], subProxier(prop));
          }
          return target[p];
        },
        deleteProperty: (t, property) => {
          delete t[property];
          this.__dataUpdated = true;
          return true;
        }
      };
    };
    const proxier = {
      deleteProperty: (t, property) => {
        delete t[property];
        this.__dataUpdated = true;
        return true;
      },
      set: (target: this, p: string | symbol, value) => {
        this.__dataUpdated = true;
        target[p] = value;
        return true;
      },
      get: (target: this, p: string | symbol) => {
        if (Array.isArray(target[p]) || target[p] instanceof Object) {
          return new Proxy(target[p], subProxier(p));
        }
        return target[p];
      }
    };
    return new Proxy(this.__data, proxier);
  }

  /**
   * Replace the underlying data and mark it for upload
   */
  public set data(data: T) {
    this.__data = data;
    this.__dataUpdated = true;
  }

  /**
   * Check whether the in-memory data has been modified and needs to be persisted
   * @returns true if data was mutated since last upload
   */
  needsUpload(): boolean {
    return this.__dataUpdated;
  }

  /**
   * Load and decompress the JSON data from the binary attachment
   * @param force - reload even if data is already in memory
   */
  async loadData(force: boolean = false) {
    if (this.__data && !force) {
      return;
    }
    this.__data = JSON.parse(gunzipSync(await this.__binary.getAsBuffer()).toString());
  }

  /**
   * Persist the model and upload the binary data if it was modified
   * @returns this instance for chaining
   */
  async save() {
    await super.save();
    await this.updateBinary();
    return this;
  }

  /**
   *
   */
  async updateBinary() {
    if (!this.__dataUpdated) {
      return;
    }
    await this.__binary.upload(
      new MemoryBinaryFile(gzipSync(Buffer.from(JSON.stringify(this.__data))), {
        name: `data.json.gz`
      })
    );
    this.__dataUpdated = false;
  }
}
