import { QueryValidator } from "@webda/ql";
import { clone, type LocalRecord } from "./record.js";
import type { OfflineClient } from "./client.js";
import type { ChangeEvent } from "./client.js";

/**
 * Local, offline-first access to the objects of one model
 */
export class Collection<T = any> {
  /**
   * @param client - the owning client
   * @param model - model identifier, e.g. `MyApp/Task`
   */
  constructor(
    protected client: OfflineClient,
    readonly model: string
  ) {}

  /**
   * @param key - scalar key or key object
   * @returns the stored record id
   */
  protected id(key: unknown): string {
    return `${this.model}|${this.client.keyOf(this.model, key)}`;
  }

  /**
   * Create an object locally; a `uuid` key is generated when missing
   * @param data - the object
   * @returns the created object
   */
  async create(data: Partial<T>): Promise<T> {
    const fields = this.client.pkFields(this.model);
    const object: any = clone(data);
    if (fields.length === 1 && fields[0] === "uuid" && !object.uuid) {
      object.uuid = globalThis.crypto.randomUUID();
    }
    const key = this.client.keyOf(this.model, object);
    const id = `${this.model}|${key}`;
    const existing = await this.client.storage.getRecord(id);
    let record: LocalRecord;
    if (existing && existing.state !== "deleted") {
      throw new Error(`Object ${id} already exists`);
    } else if (existing) {
      // Re-creating a locally deleted server object is an update of it
      record = {
        ...existing,
        current: object,
        state: existing.base === null ? "created" : "dirty",
        // pendingMutationId / sent are kept: the delete may be in flight or already applied, its result must still be matched
        error: undefined
      };
    } else {
      record = { id, ref: { model: this.model, key }, base: null, baseRev: 0, current: object, state: "created" };
    }
    await this.client.storage.putRecords([record]);
    this.client.notify({ ref: record.ref, object: clone(object), origin: "local" });
    return clone(object);
  }

  /**
   * Merge fields into an object locally
   * @param key - the object key
   * @param data - the fields to set
   * @returns the updated object
   */
  async patch(key: unknown, data: Partial<T>): Promise<T> {
    const record = await this.client.storage.getRecord(this.id(key));
    if (!record || record.current === null) {
      throw new Error(`Object ${this.id(key)} not found`);
    }
    if (record.state === "conflict") {
      throw new Error(`Object ${record.id} has an open conflict: resolve it first`);
    }
    record.current = { ...record.current, ...clone(data) };
    if (record.base === null) {
      // Never confirmed by the server: still a create
      record.state = "created";
      record.error = undefined;
    } else if (record.state === "synced" || record.state === "error") {
      record.state = "dirty";
      record.error = undefined;
    }
    await this.client.storage.putRecords([record]);
    this.client.notify({ ref: record.ref, object: clone(record.current), origin: "local" });
    return clone(record.current);
  }

  /**
   * Delete an object locally
   * @param key - the object key
   */
  async delete(key: unknown): Promise<void> {
    const record = await this.client.storage.getRecord(this.id(key));
    if (!record || record.current === null) return;
    if (record.base === null && record.pendingMutationId === undefined) {
      // Never sent: the server cannot have it
      await this.client.storage.deleteRecords([record.id]);
    } else {
      // A create in flight (or whose response was lost) may already exist on the server: keep a tombstone,
      // the next push replays the create then deletes the object
      await this.client.storage.putRecords([{ ...record, current: null, state: "deleted", conflict: undefined }]);
    }
    this.client.notify({ ref: record.ref, object: null, origin: "local" });
  }

  /**
   * @param key - the object key
   * @returns the local value, undefined when missing or deleted
   */
  async get(key: unknown): Promise<T | undefined> {
    const record = await this.client.storage.getRecord(this.id(key));
    return record?.current ?? undefined;
  }

  /**
   * Filter the local objects with a WebdaQL expression
   * @param filter - the filter, every object when empty
   * @returns the matching objects
   */
  async query(filter: string = ""): Promise<T[]> {
    const validator = new QueryValidator(filter);
    return (await this.client.storage.scan(this.model))
      .filter(record => record.current !== null && validator.eval(record.current))
      .map(record => record.current);
  }

  /**
   * @param event - "change"
   * @param fn - listener, called for this model only
   * @returns a function removing the listener
   */
  on(event: "change", fn: (evt: ChangeEvent) => void): () => void {
    return this.client.on(event, evt => {
      if (evt.ref.model === this.model) fn(evt);
    });
  }
}
