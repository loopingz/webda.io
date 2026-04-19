import type { ArrayElement } from "@webda/tsc-esm";
import type { PK, WEBDA_PRIMARY_KEY, ModelClass } from "../storable";
import type { Helpers, JSONed, SelfJSONed, PropertyPaths, NumericPropertyPaths } from "../types";
import { deserialize, serialize } from "@webda/serialize";
import { AbstractRepository } from "./abstract";
import { Repository, WEBDA_TEST } from "./repository";

/**
 * Parsed query structure expected from the WebdaQL parser.
 *
 * Includes pagination (limit, continuationToken), ordering, and a filter
 * with an `eval` function for in-memory evaluation.
 */
export type Query = {
  limit: number;
  orderBy?: { field: string; direction: "ASC" | "DESC" }[];
  continuationToken?: string;
  filter: {
    eval: (item: any) => boolean;
  };
};

/** Lazily-loaded WebdaQL module for query parsing */
let WebdaQL: any & {
  parse: (query: string) => Query;
} = null;

/** Result of a simulated find operation, including whether filtering was applied. */
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
   * @param model - The model class constructor
   * @param pks - Primary key field names
   * @param separator - Composite key separator (default: "_")
   * @param map - Optional pre-existing Map to use as storage backend
   */
  constructor(model: T, pks: string[], separator?: string, map?: K) {
    super(model, pks, separator);
    this.storage = map || (new Map<string, string>() as K);
  }
  /** @override */
  async get(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]> | string
  ): Promise<Helpers<InstanceType<T>>> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const item = this.storage.get(key);
    if (!item) throw new Error(`Not found: ${key}`);
    return this.deserialize(item) as Helpers<InstanceType<T>>;
  }

  /** @override */
  async create(data: Helpers<InstanceType<T>>, save: boolean = true): Promise<InstanceType<T>> {
    const key = this.getPrimaryKey(data).toString();
    if (this.storage.has(key)) {
      throw new Error(`Already exists: ${key}`);
    }
    // Build a fresh instance and copy the incoming fields onto it. Most model
    // constructors ignore their arguments (only RegistryEntry and a few others
    // assign them), so `new this.model(data)` alone dropped slug/name/uuid and
    // produced an empty object on serialize → deserialize was missing the PK.
    const item = new this.model(data) as InstanceType<T>;
    if (data && data !== item) {
      if (typeof (item as any).load === "function") {
        (item as any).load(data);
      } else {
        Object.assign(item as any, data);
      }
    }
    if (save !== false) {
      this.storage.set(key, this.serialize(item));
    }
    return item;
  }

  /** @override */
  async update<K extends PropertyPaths<InstanceType<T>>>(
    data: Helpers<InstanceType<T>>,
    conditionField?: K | null,
    condition?: any
  ): Promise<void> {
    const item = (await this.get(this.getPrimaryKey(data))) as InstanceType<T>;
    this.checkCondition(item, conditionField, condition);
    this.storage.set(this.getPrimaryKey(data).toString(), this.serialize(new this.model(data) as InstanceType<T>));
  }

  /**
   * Verify an optimistic locking condition on an item
   * @param item - The item to check
   * @param conditionField - Field to validate
   * @param condition - Expected value
   * @throws Error if the condition does not match
   */
  protected checkCondition<K extends PropertyPaths<InstanceType<T>>>(
    item: InstanceType<T>,
    conditionField?: K | null,
    condition?: any
  ) {
    if (conditionField) {
      if ((item as any)[conditionField as string] !== condition) {
        throw new Error(`Condition failed: ${conditionField as string} !== ${condition}`);
      }
    }
  }
  /** @override */
  async patch<K extends PropertyPaths<InstanceType<T>>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]> | string,
    data: Partial<InstanceType<T>>,
    conditionField?: K | null,
    condition?: any
  ): Promise<void> {
    const item = (await this.get(primaryKey)) as InstanceType<T>;
    this.checkCondition(item, conditionField, condition);
    item.load(data);
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
   * @param item - the serialized string
   * @returns the deserialized model instance
   */
  deserialize(item: string): InstanceType<T> {
    return deserialize(item) as InstanceType<T>;
  }

  /**
   * Add query support
   * @param query - the query string or parsed query
   * @returns the query results with optional continuation token
   */
  async query(query: string | Query): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
    if (typeof query === "string") {
      WebdaQL ??= await import("@webda/ql");
      query = WebdaQL.parse(query);
    }
    return MemoryRepository.simulateFind(query as Query, [...this.storage.keys()], this);
  }

  /**
   * Allow to simulate a find on a list of uuids
   * It is static to be reusable by other repository like FileRepository
   * @param query - the parsed query
   * @param uuids - the list of UIDs to search
   * @param repository - the repository to fetch objects from
   * @returns the query results with optional continuation token
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
      const obj = (await repository.get(uuid as any)) as InstanceType<T>;
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
   * Add iterator support
   * @param query - the query string
   */
  async *iterate(query: string): AsyncGenerator<InstanceType<T>, any, any> {
    WebdaQL ??= await import("@webda/ql");
    /* c8 ignore next */
    const q: Query = WebdaQL.parse(query); // Ensure it is valid
    if (!q.limit) {
      q.limit = 100; // Default pagination size
    }
    do {
      const res = await this.query(q);
      for (const i of res.results) {
        yield i as InstanceType<T>;
      }
      q.continuationToken = res.continuationToken;
    } while (q.continuationToken);
  }

  /** @override */
  async delete<K extends PropertyPaths<InstanceType<T>>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    this.storage.delete(this.getPrimaryKey(primaryKey).toString());
  }

  /** @override */
  async exists(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]> | string
  ): Promise<boolean> {
    return this.storage.has(this.getPrimaryKey(primaryKey).toString());
  }

  /** @override */
  async incrementAttributes<K extends PropertyPaths<InstanceType<T>>, L extends NumericPropertyPaths<InstanceType<T>>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]> | string,
    info: (L | { property: L; value?: number })[] | Record<L, number>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    const item = (await this.get(primaryKey)) as InstanceType<T>;
    if (Array.isArray(info)) {
      for (const entry of info) {
        const prop = typeof entry === "string" ? entry : (entry as any).property;
        const inc = typeof entry === "string" ? 1 : ((entry as any).value ?? 1);
        const parts = prop.split(".");
        let current: any = item;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          current[part] ??= {};
          current = current[part];
        }
        const lastPart = parts[parts.length - 1];
        (current as any)[lastPart] = ((current as any)[lastPart] || 0) + inc;
      }
    } else {
      for (const prop in info) {
        const parts = prop.split(".");
        let current: any = item;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          current[part] ??= {};
          current = current[part];
        }
        const lastPart = parts[parts.length - 1];
        (current as any)[lastPart] = ((current as any)[lastPart] || 0) + info[prop]!;
      }
    }
    this.storage.set(this.getPrimaryKey(primaryKey).toString(), this.serialize(item));
  }

  /**
   * Verify a write condition on a collection item
   * @param item - The array to check
   * @param index - Index of the item in the array
   * @param itemWriteConditionField - Field name to check on the item
   * @param itemWriteCondition - Expected value for the field
   * @throws Error if the condition does not match
   */
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

  /** @override */
  async upsertItemToCollection<
    K extends Extract<PropertyPaths<InstanceType<T>, any[]>, keyof InstanceType<T>>,
    L extends keyof ArrayElement<InstanceType<T>[K]>
  >(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    collection: K,
    item: ArrayElement<InstanceType<T>[K]> | JSONed<ArrayElement<InstanceType<T>[K]>>,
    index?: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    const obj = (await this.get(primaryKey)) as InstanceType<T>;
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

  /** @override */
  async deleteItemFromCollection<
    K extends Extract<PropertyPaths<InstanceType<T>, any[]>, keyof InstanceType<T>>,
    L extends keyof ArrayElement<InstanceType<T>[K]>
  >(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    collection: K,
    index: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    const obj = (await this.get(primaryKey)) as InstanceType<T>;
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

  /** @override */
  async removeAttribute<L extends PropertyPaths<InstanceType<T>>, K extends PropertyPaths<InstanceType<T>>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    attribute: K,
    _conditionField?: L | null,
    _condition?: any
  ): Promise<void> {
    const obj = (await this.get(primaryKey)) as InstanceType<T>;
    delete (obj as any)[attribute as string];
    this.storage.set(this.getPrimaryKey(primaryKey).toString(), this.serialize(obj));
  }

  /** Test utilities - clears all stored data */
  [WEBDA_TEST] = {
    clear: async () => {
      this.storage.clear();
    }
  };
}
