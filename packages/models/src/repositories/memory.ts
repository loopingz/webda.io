import type { ArrayElement } from "@webda/tsc-esm";
import type {
  JSONed,
  SelfJSONed,
  PK,
  StorableAttributes,
  WEBDA_EVENTS,
  WEBDA_PRIMARY_KEY,
  StorableClass
} from "../storable";
import { deserialize, serialize } from "@webda/serialize";
import { AbstractRepository } from "./abstract";

/**
 * This is a simple in-memory repository implementation
 * It is used for testing purposes only
 */
export class MemoryRepository<
  T extends StorableClass,
  K extends Map<string, string> = Map<string, string>
> extends AbstractRepository<T> {
  protected storage: K;
  private events = new Map<keyof InstanceType<T>[typeof WEBDA_EVENTS], Set<(data: any) => void>>();

  /**
   *
   * @param model
   * @param pks
   * @param separator
   * @param map
   */
  constructor(model: T, pks: string[], separator?: string, map?: K) {
    super(model, pks, separator);
    this.storage = map || (new Map<string, string>() as K);
  }
  /**
   * @inheritdoc
   */
  async get(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]> | string
  ): Promise<InstanceType<T>> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const item = this.storage.get(key);
    if (!item) throw new Error(`Not found: ${key}`);
    return this.deserialize(item);
  }

  /**
   * @inheritdoc
   */
  async create(data: ConstructorParameters<T>[0], save: boolean = true): Promise<InstanceType<T>> {
    const key = this.getPrimaryKey(data).toString();
    if (this.storage.has(key)) {
      throw new Error(`Already exists: ${key}`);
    }
    const item: InstanceType<T> = new this.model(data) as InstanceType<T>;
    // @ts-ignore
    if (save !== false) {
      this.storage.set(key, this.serialize(item));
    }
    return item;
  }

  /**
   * @inheritdoc
   */
  async update<K extends StorableAttributes<InstanceType<T>, any>>(
    data: SelfJSONed<InstanceType<T>> | InstanceType<T>,
    _conditionField?: K | null,
    _condition?: InstanceType<T>[K]
  ): Promise<void> {
    const item = await this.get(this.getPrimaryKey(data));
    Object.assign(item, data as any);
    this.storage.set(this.getPrimaryKey(data).toString(), this.serialize(item));
  }

  /**
   * @inheritdoc
   */
  async patch<K extends StorableAttributes<InstanceType<T>, any>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]> | string,
    data: Partial<SelfJSONed<InstanceType<T>>>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    const item = await this.get(primaryKey);
    Object.assign(item, data as any);
    this.storage.set(item.getPrimaryKey().toString(), this.serialize(item));
  }

  /**
   * @inheritdoc
   */
  async query(_q: string): Promise<{
    results: InstanceType<T>[];
    continuationToken?: string;
  }> {
    throw new Error("Not implemented");
  }

  /**
   * Serialize the object to a string
   *
   * This method is used to allow switching between different serialization methods
   *
   * @param item to serialize
   * @returns serialized object
   */
  serialize(item: InstanceType<T>): string {
    return serialize(item);
  }

  /**
   * Unserialize the object from a string
   *
   * This method is used to allow switching between different serialization methods
   *
   * @param item
   * @returns
   */
  deserialize(item: string): InstanceType<T> {
    return deserialize(item) as InstanceType<T>;
  }

  /**
   * @inheritdoc
   */
  async *iterate(_q: string): AsyncGenerator<InstanceType<T>> {
    throw new Error("Not implemented");
  }

  /**
   * @inheritdoc
   */
  async delete<K extends StorableAttributes<InstanceType<T>, any>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    this.storage.delete(this.getPrimaryKey(primaryKey).toString());
  }

  /**
   * @inheritdoc
   */
  async exists(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]> | string
  ): Promise<boolean> {
    return this.storage.has(this.getPrimaryKey(primaryKey).toString());
  }

  /**
   * @inheritdoc
   */
  async incrementAttributes<
    K extends StorableAttributes<InstanceType<T>, any>,
    L extends StorableAttributes<InstanceType<T>, number>
  >(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]> | string,
    info: (L | { property: L; value?: number })[] | Record<L, number>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    const item = await this.get(primaryKey);
    if (Array.isArray(info)) {
      for (const entry of info) {
        const prop = typeof entry === "string" ? entry : (entry as any).property;
        const inc = typeof entry === "string" ? 1 : ((entry as any).value ?? 1);
        (item as any)[prop] = ((item as any)[prop] || 0) + inc;
      }
    } else {
      for (const prop in info) {
        (item as any)[prop] = ((item as any)[prop] || 0) + info[prop]!;
      }
    }
    this.storage.set(this.getPrimaryKey(primaryKey).toString(), this.serialize(item));
  }

  protected checkItemWriteCondition(
    item: any[],
    index: number,
    itemWriteConditionField: string,
    itemWriteCondition: any
  ): void {
    if (
      (Array.isArray(item) && index < item.length && item[index][itemWriteConditionField] === itemWriteCondition) ||
      !itemWriteCondition
    ) {
      return;
    }
    throw new Error("Item write condition failed");
  }

  /**
   * @inheritdoc
   */
  async upsertItemToCollection<
    K extends StorableAttributes<InstanceType<T>, any[]>,
    L extends keyof ArrayElement<InstanceType<T>[K]>
  >(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    collection: K,
    item: ArrayElement<InstanceType<T>[K]> | JSONed<ArrayElement<InstanceType<T>[K]>>,
    index?: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    const obj = await this.get(primaryKey);
    (obj as any)[collection] ??= [];
    this.checkItemWriteCondition(
      obj[collection] as Array<any>,
      index as number,
      itemWriteConditionField,
      itemWriteCondition
    );
    const arr = (obj as any)[collection] as Array<any>;
    if (typeof index === "number") {
      arr[index] = item;
    } else {
      arr.push(item);
    }
    this.storage.set(this.getPrimaryKey(primaryKey).toString(), this.serialize(obj));
  }

  /**
   * @inheritdoc
   */
  async deleteItemFromCollection<
    K extends StorableAttributes<InstanceType<T>, any[]>,
    L extends keyof ArrayElement<InstanceType<T>[K]>
  >(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    collection: K,
    index: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    const obj = await this.get(primaryKey);
    const arr = (obj as any)[collection] as Array<any>;
    this.checkItemWriteCondition(
      obj[collection] as Array<any>,
      index as number,
      itemWriteConditionField,
      itemWriteCondition
    );
    if (Array.isArray(arr) && index >= 0 && index < arr.length) {
      arr.splice(index, 1);
      this.storage.set(this.getPrimaryKey(primaryKey).toString(), this.serialize(obj));
    }
  }

  /**
   * @inheritdoc
   */
  async removeAttribute<
    L extends StorableAttributes<InstanceType<T>, any>,
    K extends StorableAttributes<InstanceType<T>, any>
  >(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    attribute: K,
    _conditionField?: L | null,
    _condition?: any
  ): Promise<void> {
    const obj = await this.get(primaryKey);
    delete (obj as any)[attribute as string];
    this.storage.set(this.getPrimaryKey(primaryKey).toString(), this.serialize(obj));
  }

  /**
   * @inheritdoc
   */
  on<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(
    event: K,
    listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void
  ): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(listener as any);
  }

  /**
   * @inheritdoc
   */
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

  /**
   * @inheritdoc
   */
  off<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(
    event: K,
    listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void
  ): void {
    this.events.get(event)?.delete(listener as any);
  }

  // Optional: trigger events internally
  private emit<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(
    event: K,
    data: InstanceType<T>[typeof WEBDA_EVENTS][K]
  ): void {
    this.events.get(event)?.forEach(fn => fn(data));
  }
}
