import type { ArrayElement } from "@webda/tsc-esm";
import type { PK, StorableAttributes, WEBDA_EVENTS, WEBDA_PRIMARY_KEY, ModelClass } from "../storable";
import type { Helpers, JSONed, SelfJSONed } from "../types";
import { deserialize, serialize } from "@webda/serialize";
import { AbstractRepository } from "./abstract";
import { Repository, WEBDA_TEST } from "./repository";

/**
 * Redefine what we expect from the WebdaQL parser
 */
export type Query = {
  limit: number;
  orderBy?: { field: string; direction: "ASC" | "DESC" }[];
  continuationToken?: string;
  filter: {
    eval: (item: any) => boolean;
  };
};

// Lazy load WebdaQL
let WebdaQL: any & {
  parse: (query: string) => Query;
} = null;

export type FindResult<T> = {
  results: T[];
  continuationToken?: string;
  filter: boolean;
};
/**
 * This is a simple in-memory repository implementation
 * It is used for testing purposes only
 */
export class MemoryRepository<
  T extends ModelClass,
  K extends Map<string, string> = Map<string, string>
> extends AbstractRepository<T> {
  protected storage: K;

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
  ): Promise<Helpers<InstanceType<T>>> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const item = this.storage.get(key);
    if (!item) throw new Error(`Not found: ${key}`);
    return this.deserialize(item) as Helpers<InstanceType<T>>;
  }

  /**
   * @inheritdoc
   */
  async create(data: Helpers<InstanceType<T>>, save: boolean = true): Promise<InstanceType<T>> {
    const key = this.getPrimaryKey(data).toString();
    if (this.storage.has(key)) {
      throw new Error(`Already exists: ${key}`);
    }
    const item: InstanceType<T> = new this.model(data) as InstanceType<T>;
    if (save !== false) {
      this.storage.set(key, this.serialize(item));
    }
    return item;
  }

  /**
   * @inheritdoc
   */
  async update<K extends StorableAttributes<InstanceType<T>, any>>(
    data: Helpers<InstanceType<T>>,
    conditionField?: K | null,
    condition?: InstanceType<T>[K]
  ): Promise<void> {
    const item = await this.get(this.getPrimaryKey(data)) as InstanceType<T>;
    this.checkCondition(item, conditionField, condition);
    this.storage.set(this.getPrimaryKey(data).toString(), this.serialize(new this.model(data) as InstanceType<T>));
  }

  protected checkCondition<K extends StorableAttributes<InstanceType<T>>>(
    item: InstanceType<T>,
    conditionField?: K | null,
    condition?: InstanceType<T>[K]
  ) {
    if (conditionField) {
      if (item[conditionField] !== condition) {
        throw new Error(`Condition failed: ${conditionField as string} !== ${condition}`);
      }
    }
  }
  /**
   * @inheritdoc
   */
  async patch<K extends StorableAttributes<InstanceType<T>, any>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]> | string,
    data: Partial<InstanceType<T>>,
    conditionField?: K | null,
    condition?: any
  ): Promise<void> {
    const item = await this.get(primaryKey)as InstanceType<T>;
    this.checkCondition(item, conditionField, condition);
    // @ts-ignore
    console.log('patch', item.createdAt);
    item.load(data);
    // @ts-ignore
    console.log('patch', item.createdAt);
    this.storage.set(item.getPrimaryKey().toString(), this.serialize(item));
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
   * Add query support
   * @param query
   * @returns
   */
  async query(query: string | Query): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
    if (typeof query === "string") {
      try {
        WebdaQL ??= await import("@webda/ql");
        query = WebdaQL.parse(query);
      } catch (error) {
        throw new Error(`Failed to parse query: ${error} - @webda/ql peer dependencies may be missing`);
      }
    }
    return MemoryRepository.simulateFind(query as Query, [...this.storage.keys()], this);
  }

  /**
   * Allow to simulate a find on a list of uuids
   * It is static to be reusable by other repository like FileRepository
   * @param query
   * @param uuids
   * @param repository
   * @returns
   */
  static async simulateFind<T extends ModelClass>(
    query: Query,
    uuids: any[],
    repository: Repository<T>
  ): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
    const result: FindResult<InstanceType<T>> = {
      results: [],
      continuationToken: undefined,
      filter: true
    };
    let count = 0;
    let limit = query.limit;
    let offset = parseInt(query.continuationToken || "0");
    const originalOffset = offset;

    if (query.orderBy && query.orderBy.length) {
      offset = 0;
      // We need to retrieve everything to orderBy after
      limit = Number.MAX_SAFE_INTEGER;
    }
    // Need to transfert to Array
    for (const uuid of uuids) {
      count++;
      // Offset start
      if (offset >= count) {
        continue;
      }
      const obj = await repository.get(uuid as any) as InstanceType<T>;
      if (obj && query.filter.eval(obj)) {
        result.results.push(obj);
        if (result.results.length >= limit) {
          result.continuationToken = count.toString();
          return result;
        }
      }
    }

    // Order by
    if (query.orderBy && query.orderBy.length) {
      // Sorting the results
      result.results.sort((a, b) => {
        let valA, valB;
        for (const orderBy of query.orderBy!) {
          const invert = orderBy.direction === "ASC" ? 1 : -1;
          valA = WebdaQL.ComparisonExpression.getAttributeValue(a, orderBy.field.split("."));
          valB = WebdaQL.ComparisonExpression.getAttributeValue(b, orderBy.field.split("."));
          if (valA === valB) {
            continue;
          }
          if (typeof valA === "string") {
            return valA.localeCompare(valB) * invert;
          }
          return (valA < valB ? -1 : 1) * invert;
        }
        return -1;
      });
      result.results = result.results.slice(originalOffset, query.limit + originalOffset);
      if (result.results.length >= query.limit) {
        result.continuationToken = (query.limit + originalOffset).toString();
      }
    }

    return result;
  }

  /**
   * Add iterater support
   * @param query
   */
  async *iterate(query: string): AsyncGenerator<InstanceType<T>, any, any> {
    let q: Query;
    try {
      WebdaQL ??= await import("@webda/ql");
      q = WebdaQL.parse(query); // Ensure it is valid
      if (!q.limit) {
        q.limit = 100; // Default pagination size
      }
    } catch (error) {
      throw new Error(`Failed to parse query: ${error} - @webda/ql peer dependencies may be missing`);
    }
    do {
      const res = await this.query(q);
      for (const i of res.results) {
        yield i as InstanceType<T>;
      }
      q.continuationToken = res.continuationToken;
    } while (q.continuationToken);
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
    const item = await this.get(primaryKey) as InstanceType<T>;
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
    const obj = await this.get(primaryKey) as InstanceType<T>;
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
    const obj = await this.get(primaryKey) as InstanceType<T>;
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
    const obj = await this.get(primaryKey) as InstanceType<T>;
    delete (obj as any)[attribute as string];
    this.storage.set(this.getPrimaryKey(primaryKey).toString(), this.serialize(obj));
  }

  [WEBDA_TEST] = {
    clear: async () => {
      this.storage.clear();
    }
  };
}
