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

/** Configuration parameters for the JSON-file-backed store. */
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
  /** Create a new FileBackedMap.
   * @param folder - the directory to store files in
   * @param extension - the file extension to use
   */
  constructor(
    private folder: string,
    private extension: string = ".json"
  ) {
    super();
  }

  /**
   * Build the full filesystem path for a given key.
   *
   * @param key - the storage key
   * @returns the full file path
   */
  private filePath(key: string): string {
    return path.join(this.folder, `${key}${this.extension}`);
  }

  /**
   * Check whether a JSON file exists for the given key.
   *
   * @param key - the storage key
   * @returns true if the file exists
   */
  has(key: string): boolean {
    return fs.existsSync(this.filePath(key));
  }

  /**
   * Read and return the JSON content for a key, or undefined if missing.
   *
   * @param key - the storage key
   * @returns the JSON content or undefined
   */
  get(key: string): string | undefined {
    const p = this.filePath(key);
    if (!fs.existsSync(p)) return undefined;
    return fs.readFileSync(p, "utf-8");
  }

  /**
   * Write a JSON string value to the file for the given key.
   *
   * @param key - the storage key
   * @param value - the JSON string to write
   * @returns this map for chaining
   */
  set(key: string, value: string): this {
    fs.writeFileSync(this.filePath(key), value, "utf-8");
    return this;
  }

  /**
   * Remove the JSON file for the given key, returning true if it existed.
   *
   * @param key - the storage key
   * @returns true if the file was deleted
   */
  delete(key: string): boolean {
    const p = this.filePath(key);
    if (!fs.existsSync(p)) return false;
    fs.unlinkSync(p);
    return true;
  }

  /** Delete all JSON files in the backing folder. */
  clear(): void {
    if (fs.existsSync(this.folder)) {
      for (const f of fs.readdirSync(this.folder)) {
        if (f.endsWith(this.extension)) {
          fs.unlinkSync(path.join(this.folder, f));
        }
      }
    }
  }

  /**
   * Iterate over all stored keys by listing JSON files in the folder.
   *
   * @returns an iterator of storage keys
   */
  keys(): MapIterator<string> {
    if (!fs.existsSync(this.folder)) return [].values();
    const ext = this.extension;
    const files = fs
      .readdirSync(this.folder)
      .filter(f => f.endsWith(ext))
      .map(f => f.slice(0, f.length - ext.length));
    return files.values();
  }

  /**
   * Iterate over all key-value pairs stored in the folder.
   *
   * @returns an iterator of key-value pairs
   */
  [Symbol.iterator](): MapIterator<[string, string]> {
    const entries = [...this.keys()].map(key => [key, this.get(key)!] as [string, string]);
    return entries.values();
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
   *
   * @param params - raw parameter values
   * @returns the loaded parameters
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
   *
   * @param uid - the object unique identifier
   * @returns the file path
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
   *
   * @param uuid - the object unique identifier
   * @param object - the object to persist
   * @returns the persisted object
   */
  protected async persist(uuid: string, object: any) {
    fs.writeFileSync(this.file(uuid), JSON.stringify(object, undefined, this.parameters.beautify));
    return object;
  }

  /**
   * Verify optimistic locking update condition
   *
   * @param uuid - the object unique identifier
   * @param stored - the currently stored object
   * @param writeConditionField - field to check for condition
   * @param writeCondition - expected value of the field
   */
  protected checkUpdateCondition(uuid: string, stored: any, writeConditionField?: string, writeCondition?: any) {
    if (writeConditionField && stored[writeConditionField] !== writeCondition) {
      throw new UpdateConditionFailError(uuid as any, writeConditionField, writeCondition);
    }
  }

  /**
   * Verify collection item update condition
   *
   * @param stored - the currently stored object
   * @param prop - the collection property name
   * @param itemWriteConditionField - field to check on the item
   * @param itemWriteCondition - expected value of the field
   * @param index - index of the item in the collection
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
      throw new UpdateConditionFailError(
        stored.uuid || stored._id || ("unknown" as any),
        itemWriteConditionField,
        itemWriteCondition
      );
    }
  }

  /**
   * @override
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
   * @override
   */
  async _removeAttribute(uuid: string, attribute: string, writeCondition?: any, writeConditionField?: string) {
    const res = await this._get(uuid, true);
    this.checkUpdateCondition(uuid, res, writeConditionField, writeCondition);
    delete res[attribute];
    await this.persist(uuid, res);
  }

  /**
   * @override
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
   * @override
   */
  async _delete(uid: string) {
    const filePath = this.file(uid);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * @override
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
