import { Binary, CoreModel, MemoryBinaryFile, NotEnumerable } from "@webda/core";
import { gunzipSync, gzipSync } from "zlib";
export class BinaryModel<T = any> extends CoreModel {
  @NotEnumerable
  __data: T;

  __binary: Binary;

  @NotEnumerable
  __dataUpdated: boolean = false;

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

  public set data(data: T) {
    this.__data = data;
    this.__dataUpdated = true;
  }

  needsUpload(): boolean {
    return this.__dataUpdated;
  }

  async loadData(force: boolean = false) {
    if (this.__data && !force) {
      return;
    }
    this.__data = JSON.parse(gunzipSync(await this.__binary.getAsBuffer() as Uint8Array<ArrayBuffer>).toString());
  }

  async save() {
    await super.save();
    await this.updateBinary();
    return this;
  }

  async updateBinary() {
    if (!this.__dataUpdated) {
      return;
    }
    await this.__binary.upload(
      new MemoryBinaryFile(gzipSync(Buffer.from(JSON.stringify(this.__data)) as Uint8Array<ArrayBuffer>), {
        name: `data.json.gz`
      })
    );
    this.__dataUpdated = false;
  }
}
