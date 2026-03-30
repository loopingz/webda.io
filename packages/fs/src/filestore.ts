import * as fs from "fs";
import * as path from "path";
import {
  Store,
  StoreFindResult,
  StoreNotFoundError,
  StoreParameters,
  UpdateConditionFailError,
  MemoryRepository,
  ModelClass,
  Repository,
  InstanceCache,
  useModelMetadata
} from "@webda/core";
import { JSONUtils } from "@webda/utils";
import * as WebdaQL from "@webda/ql";

export class FileStoreParameters extends StoreParameters {
  /**
   * Local path where to store all `json` files
   */
  folder: string;
  /**
   * Parameter sent to JSON.stringify when storing the json
   */
  beautify?: string | number;
}

/**
 * A Map-like storage backend backed by filesystem JSON files.
 * Keys are UUIDs; values are JSON strings of stored objects.
 */
class FileBackedMap extends Map<string, string> {
  constructor(
    private folder: string,
    private extension: string = ".json"
  ) {
    super();
  }

  private filePath(key: string): string {
    return path.join(this.folder, `${key}${this.extension}`);
  }

  has(key: string): boolean {
    return fs.existsSync(this.filePath(key));
  }

  get(key: string): string | undefined {
    const p = this.filePath(key);
    if (!fs.existsSync(p)) return undefined;
    return fs.readFileSync(p, "utf-8");
  }

  set(key: string, value: string): this {
    fs.writeFileSync(this.filePath(key), value, "utf-8");
    return this;
  }

  delete(key: string): boolean {
    const p = this.filePath(key);
    if (!fs.existsSync(p)) return false;
    fs.unlinkSync(p);
    return true;
  }

  clear(): void {
    if (fs.existsSync(this.folder)) {
      for (const f of fs.readdirSync(this.folder)) {
        if (f.endsWith(this.extension)) {
          fs.unlinkSync(path.join(this.folder, f));
        }
      }
    }
  }

  keys(): IterableIterator<string> {
    if (!fs.existsSync(this.folder)) return [][Symbol.iterator]();
    const ext = this.extension;
    const files = fs
      .readdirSync(this.folder)
      .filter(f => f.endsWith(ext))
      .map(f => f.slice(0, f.length - ext.length));
    return files[Symbol.iterator]();
  }

  [Symbol.iterator](): IterableIterator<[string, string]> {
    const keys = [...this.keys()];
    let index = 0;
    const self = this;
    return {
      next(): IteratorResult<[string, string]> {
        if (index >= keys.length) return { value: undefined as any, done: true };
        const key = keys[index++];
        return { value: [key, self.get(key)!], done: false };
      },
      [Symbol.iterator]() {
        return this;
      }
    };
  }
}

/**
 * Simple file storage of object
 *
 * Storage structure
 *   /folder/{uuid}
 *
 * Parameters:
 *  folder: to store to
 *
 * @category CoreServices
 * @WebdaModda
 */
export class FileStore<K extends FileStoreParameters = FileStoreParameters> extends Store<K> {
  static EXTENSION = ".json";

  /**
   * Load the parameters for a service
   */
  loadParameters(params: any): K {
    return <K>new FileStoreParameters().load(params);
  }

  /**
   * Create the storage folder if does not exist
   */
  computeParameters() {
    super.computeParameters();
    if (!fs.existsSync(this.parameters.folder)) {
      fs.mkdirSync(this.parameters.folder);
    }
  }

  /**
   * Get the file path of an object
   */
  file(uid) {
    return `${this.parameters.folder}/${uid}${FileStore.EXTENSION}`;
  }

  /**
   * @override
   */
  async _exists(uid) {
    return fs.existsSync(this.file(uid));
  }

  /**
   * @override
   */
  async find(query: WebdaQL.Query): Promise<StoreFindResult<any>> {
    const files = fs
      .readdirSync(this.parameters.folder)
      .filter(file => {
        return !fs.statSync(path.join(this.parameters.folder, file)).isDirectory();
      })
      .map(f => f.substring(0, f.length - FileStore.EXTENSION.length))
      .sort();

    // Use the repository for this store's model to simulate a find
    const repo = this.getRepository(this._model) as MemoryRepository<any>;
    return MemoryRepository.simulateFind(query as any, files, repo as any);
  }

  /**
   * @override
   */
  async _create(uuid: string, object: any) {
    const fh = fs.openSync(this.file(uuid), "wx");
    fs.writeSync(fh, JSON.stringify(object, undefined, this.parameters.beautify));
    fs.closeSync(fh);
    return object;
  }

  /**
   * Store in file the object
   */
  protected async persist(uuid: string, object: any) {
    fs.writeFileSync(this.file(uuid), JSON.stringify(object, undefined, this.parameters.beautify));
    return object;
  }

  /**
   * Verify optimistic locking update condition
   */
  protected checkUpdateCondition(uuid: string, stored: any, writeConditionField?: string, writeCondition?: any) {
    if (writeConditionField && stored[writeConditionField] !== writeCondition) {
      throw new UpdateConditionFailError(uuid as any, writeConditionField, writeCondition);
    }
  }

  /**
   * Verify collection item update condition
   */
  protected checkCollectionUpdateCondition(
    stored: any,
    prop: string,
    itemWriteConditionField: string,
    itemWriteCondition: any,
    index: number
  ) {
    if (
      itemWriteCondition !== undefined &&
      Array.isArray(stored[prop]) &&
      index < stored[prop].length &&
      stored[prop][index][itemWriteConditionField] !== itemWriteCondition
    ) {
      throw new UpdateConditionFailError(stored.uuid || stored._id || "unknown" as any, itemWriteConditionField, itemWriteCondition);
    }
  }

  /**
   * @inheritdoc
   */
  async _upsertItemToCollection(
    uid: string,
    prop: string,
    item: any,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ) {
    let data: any;
    try {
      data = JSONUtils.loadFile(this.file(uid));
    } catch (err) {
      throw new StoreNotFoundError(uid as any, this.getName());
    }
    if (data === undefined) {
      throw new StoreNotFoundError(uid as any, this.getName());
    }
    this.checkCollectionUpdateCondition(data, prop, itemWriteConditionField, itemWriteCondition, index);
    data[prop] ??= [];
    if (typeof index === "number") {
      data[prop][index] = item;
    } else {
      data[prop].push(item);
    }
    data._lastUpdate = updateDate;
    return this.persist(uid, data);
  }

  /**
   * @inheritdoc
   */
  async _removeAttribute(uuid: string, attribute: string, writeCondition?: any, writeConditionField?: string) {
    const res = await this._get(uuid, true);
    this.checkUpdateCondition(uuid, res, writeConditionField, writeCondition);
    delete res[attribute];
    await this.persist(uuid, res);
  }

  /**
   * @inheritdoc
   */
  async _deleteItemFromCollection(
    uid: string,
    prop: string,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ) {
    const res = await this._get(uid, true);
    this.checkCollectionUpdateCondition(res, prop, itemWriteConditionField, itemWriteCondition, index);
    res[prop].splice(index, 1);
    res._lastUpdate = updateDate;
    return this.persist(uid, res);
  }

  /**
   * @inheritdoc
   */
  async _delete(uid: string) {
    const filePath = this.file(uid);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * @inheritdoc
   */
  async _patch(object: any, uid: string, writeCondition?: any, writeConditionField?: string): Promise<any> {
    const stored = await this._get(uid, true);
    this.checkUpdateCondition(uid, stored, writeConditionField, writeCondition);
    for (const prop in object) {
      stored[prop] = object[prop];
    }
    return this.persist(uid, stored);
  }

  /**
   * @override
   */
  async _update(object: any, uid: string, writeCondition?: any, writeConditionField?: string): Promise<any> {
    const stored = await this._get(uid, true);
    this.checkUpdateCondition(uid, stored, writeConditionField, writeCondition);
    return this.persist(uid, object);
  }

  /**
   * @override
   */
  async getAll(uids?: string[]): Promise<any> {
    if (!uids) {
      uids = [];
      const files = fs.readdirSync(this.parameters.folder);
      for (const file in files) {
        uids.push(files[file].substring(0, files[file].length - FileStore.EXTENSION.length));
      }
    }
    const result = [];
    for (const i in uids) {
      const model = this._get(uids[i]);
      result.push(model);
    }
    return (await Promise.all(result)).filter(f => f !== undefined);
  }

  /**
   * @override
   */
  async _get(uid: string, raiseIfNotFound: boolean = false): Promise<any> {
    const res = await this._exists(uid);
    if (res) {
      const data = JSON.parse(fs.readFileSync(this.file(uid)).toString());
      if (data.__type !== this._modelType && this.parameters.strict) {
        return undefined;
      }
      return data;
    } else if (raiseIfNotFound) {
      throw new StoreNotFoundError(uid as any, this.getName());
    }
  }

  /**
   * @override
   */
  async _incrementAttributes(
    uid: string,
    params: { property: string; value: number }[],
    updateDate: Date
  ): Promise<any> {
    const stored = await this._get(uid, true);
    params.forEach(({ property: prop, value }) => {
      if (stored[prop] === undefined) {
        stored[prop] = 0;
      }
      stored._lastUpdate = updateDate;
      stored[prop] += value;
    });
    stored._lastUpdate = updateDate;
    return this.persist(uid, stored);
  }

  /**
   * @override
   */
  @InstanceCache()
  getRepository<T extends ModelClass>(model: T): Repository<T> {
    const meta = useModelMetadata(model);
    const storage = new FileBackedMap(this.parameters.folder, FileStore.EXTENSION);
    return new MemoryRepository<T>(model, meta.PrimaryKey, undefined, storage as any) as Repository<T>;
  }

  /**
   * @override
   */
  async __clean(): Promise<void> {
    (await import("fs-extra")).emptyDirSync(this.parameters.folder);
  }
}
