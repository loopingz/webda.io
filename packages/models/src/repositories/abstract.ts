import type {
  JSONed,
  SelfJSONed,
  PK,
  PrimaryKey,
  PrimaryKeyType,
  StorableAttributes,
  StorableClass
} from "../storable";
import { WEBDA_PRIMARY_KEY, WEBDA_EVENTS } from "../storable";
import { ModelRefWithCreate } from "../relations";
import { Repository } from "./repository";
import type { ArrayElement, ReadonlyKeys } from "@webda/tsc-esm";

export abstract class AbstractRepository<T extends StorableClass> implements Repository<T> {
  protected events: Map<keyof InstanceType<T>[typeof WEBDA_EVENTS], Set<(data: any) => void>> = new Map();

  constructor(
    protected model: T,
    protected pks: string[],
    protected separator: string = "_"
  ) {}
  /**
   * @inheritdoc
   */
  getRootModel(): T {
    return this.model;
  }

  /**
   * Return a ref from the uuid
   * @param uid
   * @returns
   */
  fromUID(uid: string): ModelRefWithCreate<InstanceType<T>> {
    return this.ref(this.parseUID(uid));
  }

  /**
   * @inheritdoc
   */
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
    const result = {} as PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>;
    for (let i = 0; i < this.pks.length; i++) {
      result[this.pks[i] as keyof InstanceType<T>] = parts[i] as any;
    }
    return result;
  }

  /**
   * @inheritdoc
   */
  excludePrimaryKey(object: any): any {
    const pkFields = (object.PrimaryKey || this.pks || []) as Array<keyof T>;
    const result = { ...object };
    for (const field of pkFields) {
      delete result[field];
    }
    return result;
  }

  getPrimaryKey(object: any, forceObject?: false): PrimaryKeyType<InstanceType<T>>;
  getPrimaryKey(object: any, forceObject: true): PrimaryKey<InstanceType<T>>;
  /**
   * @inheritdoc
   */
  getPrimaryKey(object: any, forceObject?: boolean): PrimaryKeyType<InstanceType<T>> | PrimaryKey<InstanceType<T>> {
    const pkFields = (object[WEBDA_PRIMARY_KEY] || this.pks || []) as Array<keyof InstanceType<T>>;
    if (pkFields.length === 0) {
      throw new Error("No primary key defined on model " + this.model.name);
    }
    // If non-composed it
    if (pkFields.length === 1) {
      if (forceObject) {
        return typeof object === "object"
          ? object
          : ({ [pkFields[0]]: object, toString: () => object.toString() } as PK<T, any>);
      } else {
        return typeof object === "object" ? (new this.model(object) as any)[pkFields[0]] : object;
      }
    }
    if (typeof object === "string") {
      object = this.parseUID(object);
    }
    if (pkFields.some(f => object[f] === undefined)) {
      object = new this.model(object) as InstanceType<T>;
    }
    if (pkFields.some(f => object[f] === undefined)) {
      throw new Error(`Missing primary key fields: ${pkFields.filter(f => object[f] === undefined).join(", ")}`);
    }

    // composite key
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

  /**
   * @inheritdoc
   */
  getUID(object: any): string {
    return this.getPrimaryKey(object).toString();
  }

  /**
   * @inheritdoc
   */
  async upsert(data: ConstructorParameters<T>[0]): Promise<InstanceType<T>> {
    const key = this.getPrimaryKey(data);
    if (await this.exists(key)) {
      await this.patch(key, data);
      return this.get(key);
    }
    return this.create(data);
  }

  /**
   * @inheritdoc
   */
  async setAttribute<
    K extends StorableAttributes<InstanceType<T>, any>,
    L extends StorableAttributes<InstanceType<T>, any>
  >(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]> | string,
    attribute: K,
    value: InstanceType<T>[K],
    conditionField?: L | null,
    condition?: any
  ): Promise<void> {
    return this.patch(this.getPrimaryKey(primaryKey), { [attribute]: value } as any, conditionField, condition);
  }

  /**
   * @inheritdoc
   */
  public ref(
    key: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>
  ): ModelRefWithCreate<InstanceType<T>> {
    return new ModelRefWithCreate<InstanceType<T>>(key, this as any);
  }

  /**
   * @inheritdoc
   */
  async incrementAttribute<
    K extends StorableAttributes<InstanceType<T>, any>,
    L extends StorableAttributes<InstanceType<T>, number>
  >(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    info: L | { property: L; value?: number },
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    await this.incrementAttributes(primaryKey, [info as any]);
  }

  abstract incrementAttributes<
    K extends StorableAttributes<InstanceType<T>, any>,
    L extends StorableAttributes<InstanceType<T>, number>
  >(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    info: (L | { property: L; value?: number })[] | Record<L, number>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void>;

  abstract query(query: string): Promise<{ results: InstanceType<T>[]; continuationToken?: string }>;
  abstract iterate(query: string): AsyncGenerator<InstanceType<T>, any, any>;
  abstract deleteItemFromCollection<
    K extends StorableAttributes<InstanceType<T>, any[]>,
    L extends keyof ArrayElement<InstanceType<T>[K]>
  >(
    uuid: PrimaryKeyType<InstanceType<T>>,
    collection: K,
    index: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: ArrayElement<InstanceType<T>[K]>[L]
  ): Promise<void>;
  abstract upsertItemToCollection<
    K extends StorableAttributes<InstanceType<T>, any[]>,
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
  abstract removeAttribute<
    L extends StorableAttributes<InstanceType<T>>,
    K extends Exclude<
      StorableAttributes<InstanceType<T>, any>,
      ReadonlyKeys<InstanceType<T>> | "toString" | InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]
    >
  >(
    uuid: PrimaryKeyType<InstanceType<T>>,
    attribute: K,
    conditionField?: L | null,
    condition?: InstanceType<T>[L] | JSONed<InstanceType<T>[L]>
  ): Promise<void>;
  abstract get(primaryKey: PrimaryKeyType<InstanceType<T>>): Promise<InstanceType<T>>;
  abstract create(data: ConstructorParameters<T>[0], save?: boolean): Promise<InstanceType<T>>;
  abstract patch<K extends StorableAttributes<InstanceType<T>, any>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    data: Partial<SelfJSONed<InstanceType<T>>>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void>;
  abstract update<K extends StorableAttributes<InstanceType<T>>>(
    data: InstanceType<T> | SelfJSONed<InstanceType<T>>,
    conditionField?: K | null,
    condition?: InstanceType<T>[K]
  ): Promise<void>;
  abstract delete<K extends StorableAttributes<InstanceType<T>>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    conditionField?: K | null,
    condition?: InstanceType<T>[K] | JSONed<InstanceType<T>[K]>
  ): Promise<void>;
  abstract exists(uuid: PrimaryKeyType<InstanceType<T>>): Promise<boolean>;

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
  protected async emit<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(
    event: K,
    data: InstanceType<T>[typeof WEBDA_EVENTS][K]
  ): Promise<void> {
    if (!this.events.has(event)) {
      return;
    }
    await Promise.all([...this.events.get(event)!].map(fn => fn(data)));
  }
}
