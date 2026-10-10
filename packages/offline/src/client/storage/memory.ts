import { clone, type LocalRecord } from "../record.js";
import type { StorageAdapter } from "./storage.js";

/**
 * Non-persistent storage: tests, Node scripts, or apps that resync on start
 */
export class MemoryStorage implements StorageAdapter {
  protected records = new Map<string, LocalRecord>();
  protected meta = new Map<string, unknown>();

  /**
   *
   * @param id - the id
   * @returns the result
   */
  async getRecord(id: string): Promise<LocalRecord | undefined> {
    return clone(this.records.get(id));
  }
  /**
   *
   * @param records - the records
   */
  async putRecords(records: LocalRecord[]): Promise<void> {
    for (const record of records) this.records.set(record.id, clone(record));
  }
  /**
   *
   * @param ids - the ids
   */
  async deleteRecords(ids: string[]): Promise<void> {
    for (const id of ids) this.records.delete(id);
  }
  /**
   *
   * @param model - the model
   * @returns the result
   */
  async scan(model: string): Promise<LocalRecord[]> {
    return [...this.records.values()].filter(r => r.ref.model === model).map(clone);
  }
  /**
   *
   * @returns the result
   */
  async scanPending(): Promise<LocalRecord[]> {
    return [...this.records.values()].filter(r => r.state !== "synced").map(clone);
  }
  /**
   *
   * @param key - the key
   * @returns the result
   */
  async getMeta<T>(key: string): Promise<T | undefined> {
    return clone(this.meta.get(key) as T | undefined);
  }
  /**
   *
   * @param key - the key
   * @param value - the value
   */
  async setMeta<T>(key: string, value: T | undefined): Promise<void> {
    if (value === undefined) this.meta.delete(key);
    else this.meta.set(key, clone(value));
  }
  /**
   *
   */
  async clear(): Promise<void> {
    this.records.clear();
    this.meta.clear();
  }
}
