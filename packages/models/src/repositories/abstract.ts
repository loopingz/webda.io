import type { PK, PrimaryKey, PrimaryKeyAttributes, PrimaryKeyType, ModelClass } from "../storable";
import type { Helpers, JSONed, NumericPropertyPaths, PropertyPaths, PropertyPathType, SelfJSONed } from "../types";
import { WEBDA_PRIMARY_KEY, WEBDA_EVENTS } from "../storable";
import { ModelRefWithCreate } from "../relations";
import { Repository } from "./repository";
import type { ArrayElement } from "@webda/tsc-esm";

/**
 * Base repository implementation providing shared logic for key management,
 * event handling, and default method implementations.
 *
 * Concrete repositories (MemoryRepository, etc.) extend this class and
 * implement the abstract storage methods.
 *
 * @typeParam T - The ModelClass this repository manages
 */
export abstract class AbstractRepository<T extends ModelClass> implements Repository<T> {
  /** Registered event listeners keyed by event name */
  protected events: Map<keyof InstanceType<T>[typeof WEBDA_EVENTS], Set<(data: any) => void>> = new Map();

  /**
   * @param model - The model class constructor
   * @param pks - Array of primary key field names
   * @param separator - Separator used when joining composite key fields into a string (default: "_")
   */
  constructor(
    protected model: T,
    protected pks: string[],
    protected separator: string = "_"
  ) {}
  /** @override */
  getRootModel(): T {
    return this.model;
  }

  /**
   * Return a ref from the uuid
   * @param uid - the serialized primary key
   * @returns a model reference with create capability
   */
  fromUID(uid: string): ModelRefWithCreate<InstanceType<T>> {
    return this.ref(this.parseUID(uid));
  }

  /** @override */
  parseUID(uid: string, forceObject?: boolean): PrimaryKeyType<InstanceType<T>> | PrimaryKey<InstanceType<T>> {
    if (this.pks.length === 1) {
      return forceObject
        ? ({ [this.pks[0]]: uid } as PrimaryKey<InstanceType<T>>)
        : (uid as PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>);
    }
    const parts = uid.split(this.separator);
    if (parts.length !== this.pks.length) {
      throw new Error(`Invalid UID: ${uid}`);
    }
    const result = {} as PrimaryKey<InstanceType<T>>;
    for (let i = 0; i < this.pks.length; i++) {
      result[this.pks[i] as keyof InstanceType<T>] = parts[i] as any;
    }
    return result;
  }

  /** @override */
  excludePrimaryKey(object: any): any {
    const pkFields = (object.PrimaryKey || this.pks || []) as Array<keyof T>;
    const result = { ...object };
    for (const field of pkFields) {
      delete result[field];
    }
    return result;
  }

  /** Get the primary key value for an object as a scalar or string. */
  getPrimaryKey(object: any, forceObject?: false): PrimaryKeyType<InstanceType<T>>;
  /** Get the primary key value for an object as a structured key object. */
  getPrimaryKey(object: any, forceObject: true): PrimaryKey<InstanceType<T>>;
  /** @override */
  getPrimaryKey(object: any, forceObject?: boolean): PrimaryKeyType<InstanceType<T>> | PrimaryKey<InstanceType<T>> {
    if (object === undefined || object === null) {
      throw new Error("Cannot get primary key of undefined/null");
    }
    const pkFields = (object[WEBDA_PRIMARY_KEY] || this.pks || []) as Array<keyof InstanceType<T>>;
    if (pkFields.length === 0) {
      throw new Error("No primary key defined on model " + this.model?.name);
    }
    // Scalar value (string or number) — treat as the PK value directly
    if (typeof object === "string" || typeof object === "number") {
      if (pkFields.length === 1) {
        if (forceObject) {
          return { [pkFields[0]]: object, toString: () => object.toString() } as PK<T, any>;
        }
        return object as any;
      }
      // Composite key passed as string — parse it
      object = this.parseUID(object as string);
    }
    // Single PK field
    if (pkFields.length === 1) {
      const field = pkFields[0];
      const value = object[field];
      if (value !== undefined) {
        if (forceObject) {
          return { [field]: value, toString: () => value.toString() } as PK<T, any>;
        }
        return value as any;
      }
      // Value not found — try constructing the model to extract it
      if (this.model) {
        const instance = new this.model(object) as any;
        instance.load?.(object);
        const extracted = instance[field];
        if (extracted !== undefined) {
          if (forceObject) {
            return { [field]: extracted, toString: () => extracted.toString() } as PK<T, any>;
          }
          return extracted as any;
        }
      }
      throw new Error(`Missing primary key field '${String(field)}' on object`);
    }
    // Composite key — extract each field
    if (pkFields.some(f => object[f] === undefined) && this.model) {
      const instance = new this.model(object) as InstanceType<T>;
      (instance as any).load?.(object);
      object = instance;
    }
    if (pkFields.some(f => object[f] === undefined)) {
      throw new Error(`Missing primary key fields: ${pkFields.filter(f => object[f] === undefined).join(", ")}`);
    }

    // Build composite key object
    const key = pkFields.reduce((acc, field) => {
      (acc as any)[field] = object[field];
      return acc;
    }, {} as any);
    key.toString = () => {
      return Object.values(key)
        .filter(v => typeof v !== "function")
        .join(this.separator);
    };
    return key;
  }

  /** @override */
  getUID(object: any): string {
    return this.getPrimaryKey(object).toString();
  }

  /** @override */
  async upsert(data: Helpers<InstanceType<T>>): Promise<InstanceType<T>> {
    const key = this.getPrimaryKey(data);
    if (await this.exists(key)) {
      await this.patch(key, data as InstanceType<T>);
      return this.get(key) as InstanceType<T>;
    }
    return this.create(data);
  }

  /** @override */
  async setAttribute<K extends PropertyPaths<InstanceType<T>>, L extends PropertyPaths<InstanceType<T>>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]> | string,
    attribute: K,
    value: PropertyPathType<InstanceType<T>, K>,
    conditionField?: L | null,
    condition?: PropertyPathType<InstanceType<T>, L> | JSONed<PropertyPathType<InstanceType<T>, L>>
  ): Promise<void> {
    return this.patch(this.getPrimaryKey(primaryKey), { [attribute]: value } as any, conditionField, condition);
  }

  /** @override */
  public ref(
    key: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>
  ): ModelRefWithCreate<InstanceType<T>> {
    return new ModelRefWithCreate<InstanceType<T>>(key, this as any);
  }

  /** @override */
  async incrementAttribute<K extends PropertyPaths<InstanceType<T>>, L extends NumericPropertyPaths<InstanceType<T>>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    info: L | { property: L; value?: number },
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    await this.incrementAttributes(primaryKey, [info as any]);
  }

  abstract incrementAttributes<
    K extends PropertyPaths<InstanceType<T>>,
    L extends NumericPropertyPaths<InstanceType<T>>
  >(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    info: (L | { property: L; value?: number })[] | Record<L, number>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void>;

  abstract query(query: string): Promise<{ results: InstanceType<T>[]; continuationToken?: string }>;
  abstract iterate(query: string): AsyncGenerator<InstanceType<T>, any, any>;
  abstract deleteItemFromCollection<
    K extends Extract<PropertyPaths<InstanceType<T>, any[]>, keyof InstanceType<T>>,
    L extends keyof ArrayElement<InstanceType<T>[K]>
  >(
    uuid: PrimaryKeyType<InstanceType<T>>,
    collection: K,
    index: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: ArrayElement<InstanceType<T>[K]>[L]
  ): Promise<void>;
  abstract upsertItemToCollection<
    K extends Extract<PropertyPaths<InstanceType<T>, any[]>, keyof InstanceType<T>>,
    L extends keyof ArrayElement<InstanceType<T>[K]>
  >(
    uuid: PrimaryKeyType<InstanceType<T>>,
    collection: K,
    item: ArrayElement<InstanceType<T>[K]> | JSONed<ArrayElement<InstanceType<T>[K]>>,
    index?: number,
    itemWriteConditionField?: ArrayElement<InstanceType<T>[K]> extends object ? L : never,
    itemWriteCondition?: ArrayElement<InstanceType<T>[K]> extends object
      ? (object & ArrayElement<InstanceType<T>[K]>)[L]
      : ArrayElement<InstanceType<T>[K]>
  ): Promise<void>;
  abstract removeAttribute<L extends PropertyPaths<InstanceType<T>>, K extends PropertyPaths<InstanceType<T>>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    attribute: K,
    conditionField?: L | null,
    condition?: PropertyPathType<InstanceType<T>, L> | JSONed<PropertyPathType<InstanceType<T>, L>>
  ): Promise<void>;
  abstract get(primaryKey: PrimaryKeyType<InstanceType<T>>): Promise<Helpers<InstanceType<T>>>;
  abstract create(data: Helpers<InstanceType<T>>, save?: boolean): Promise<InstanceType<T>>;
  abstract patch<K extends PropertyPaths<InstanceType<T>>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    data: Partial<InstanceType<T>>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void>;
  abstract update<K extends PropertyPaths<InstanceType<T>>>(
    data: Helpers<InstanceType<T>>,
    conditionField?: K | null,
    condition?: PropertyPathType<InstanceType<T>, K>
  ): Promise<void>;
  abstract delete<K extends PropertyPaths<InstanceType<T>>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    conditionField?: K | null,
    condition?: PropertyPathType<InstanceType<T>, K> | JSONed<PropertyPathType<InstanceType<T>, K>>
  ): Promise<void>;
  abstract exists(uuid: PrimaryKeyType<InstanceType<T>>): Promise<boolean>;

  /** @override */
  on<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(
    event: K,
    listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void
  ): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(listener as any);
  }

  /** @override */
  once<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(
    event: K,
    listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void
  ): void {
    const wrapper = (d: any) => {
      listener(d);
      this.off(event, wrapper as any);
    };
    this.on(event, wrapper as any);
  }

  /** @override */
  off<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(
    event: K,
    listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void
  ): void {
    this.events.get(event)?.delete(listener as any);
  }

  /**
   * Emit an event to all registered listeners and await their completion.
   * @param event - The event name to emit
   * @param data - The event payload
   */
  async emit<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(
    event: K,
    data: InstanceType<T>[typeof WEBDA_EVENTS][K]
  ): Promise<void> {
    if (!this.events.has(event)) {
      return;
    }
    await Promise.all([...this.events.get(event)!].map(fn => fn(data)));
  }
}
