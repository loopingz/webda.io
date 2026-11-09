import type { LocalRecord } from "../record.js";

/**
 * Where the OfflineClient keeps its records and metadata (cursor, scopes)
 */
export interface StorageAdapter {
  /**
   * Get the record
   */
  getRecord(id: string): Promise<LocalRecord | undefined>;
  /** Write several records atomically */
  putRecords(records: LocalRecord[]): Promise<void>;
  /**
   * Delete records
   */
  deleteRecords(ids: string[]): Promise<void>;
  /** Every record of a model */
  scan(model: string): Promise<LocalRecord[]>;
  /** Every record whose state is not "synced" */
  scanPending(): Promise<LocalRecord[]>;
  /**
   * Get the meta
   */
  getMeta<T>(key: string): Promise<T | undefined>;
  /** `undefined` removes the key */
  setMeta<T>(key: string, value: T | undefined): Promise<void>;
  /**
   * Clear operation
   */
  clear(): Promise<void>;
}
