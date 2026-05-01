import type { ArrayElement } from "@webda/tsc-esm";
import type { PK, WEBDA_PRIMARY_KEY, ModelClass } from "../storable";
import type { Helpers, JSONed, SelfJSONed, PropertyPaths, NumericPropertyPaths } from "../types";
import { deserialize, serialize, serializeRaw } from "@webda/serialize";
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
   * The serialized payload is also stamped with a top-level `__type` field
   * carrying the concrete model identifier when available
   * (`item.constructor.Metadata?.Identifier`). This lets `query()` and external
   * storage backends filter results by class without re-instantiating every
   * item — important when a single underlying storage map is shared across a
   * model and its subclasses (the common case in production where each
   * registered model owns its own MemoryRepository pointing at the same Map).
   *
   * The stamp lives on the serializer envelope (sibling of `value` /
   * `$serializer`), not inside `value`. `deserialize()` re-surfaces it on the
   * reconstructed instance as a non-enumerable `__type` property so WebdaQL's
   * filter eval can read it without it ever leaking into `JSON.stringify` or
   * `Object.keys` output — keeping API responses and re-serialize cycles
   * byte-identical for the model's own fields.
   *
   * Models that don't carry Metadata (plain unit-test classes that don't go
   * through Application.setModelMetadata) simply skip the stamp; the resulting
   * payload is byte-identical to the previous implementation.
   *
   * @param item to serialize
   * @returns serialized object
   */
  serialize(item: InstanceType<T>): string {
    const typeIdentifier = (item as any)?.constructor?.Metadata?.Identifier;
    if (!typeIdentifier) {
      return serialize(item);
    }
    const raw = serializeRaw(item);
    // serializeRaw returns either { value, $serializer } for objects with
    // metadata, or just the raw value for primitives. Models always come back
    // in the former shape; stamp __type at the envelope level (sibling of
    // value/$serializer) so the deserializer never copies it onto the model.
    if (raw && typeof raw === "object" && raw.value !== undefined) {
      if ((raw as any).__type === undefined) {
        (raw as any).__type = typeIdentifier;
      }
    }
    return JSON.stringify(raw);
  }

  /**
   * Unserialize the object from a string
   *
   * Beyond restoring the concrete type via `@webda/serialize`'s
   * `$serializer.type` typeKey, this also surfaces the storage envelope's
   * `__type` stamp on the in-memory instance as a NON-ENUMERABLE property. The
   * non-enumerable bit keeps `__type` invisible to `JSON.stringify` and
   * `Object.keys` (so API responses and re-serialize cycles are byte-identical
   * for the model's own fields), while still being readable via direct
   * property access — which is exactly how WebdaQL's filter eval reads it
   * (`ComparisonExpression.getAttributeValue` walks `obj[name]`).
   *
   * Backward-compat: legacy rows written before the envelope-stamping was
   * introduced won't carry `__type`. In that case we backfill from the
   * repository's own `model.Metadata.Identifier` so they look like records of
   * the parent class — which is exactly what `query()`'s prepended class
   * filter expects (parent + descendants). Plain unit-test classes without
   * Metadata get no stamp at all; their repos opt out of class filtering on
   * the query side too (see `query`).
   *
   * @param item - the serialized string
   * @returns the deserialized model instance
   */
  deserialize(item: string): InstanceType<T> {
    const instance = deserialize(item) as InstanceType<T>;
    // Re-parse the envelope to read `__type` (the serializer's deserialize
    // path strips it because it's not in `value`). This is cheap relative to
    // deserialize itself.
    let typeFromEnvelope: string | undefined;
    try {
      const raw = JSON.parse(item);
      if (raw && typeof raw === "object") {
        typeFromEnvelope = (raw as any).__type;
      }
    } catch {
      // Non-JSON or malformed; skip the stamp — instance is still usable.
    }
    const stamped = typeFromEnvelope ?? (this.model as any)?.Metadata?.Identifier;
    if (stamped) {
      Object.defineProperty(instance, "__type", {
        value: stamped,
        enumerable: false,
        configurable: true,
        writable: true
      });
    }
    return instance;
  }

  /**
   * Collect the WebdaQL class-filter identifier list — `this.model`'s
   * identifier and every transitive descendant carried in `Metadata.Subclasses`.
   *
   * Returns `undefined` when the model carries no `Metadata` (plain unit-test
   * classes that didn't go through `Application.setModelMetadata`). In that
   * case `query()` skips the prepend and returns everything in storage,
   * preserving the pre-fix behavior for those bare classes.
   *
   * @returns the list of identifiers to match, or `undefined` when no Metadata
   */
  protected buildClassFilterIdentifiers(): string[] | undefined {
    const meta: any = (this.model as any)?.Metadata;
    if (!meta?.Identifier) return undefined;

    const ids: string[] = [meta.Identifier];
    const subclasses: any[] = Array.isArray(meta.Subclasses) ? meta.Subclasses : [];
    for (const sub of subclasses) {
      const id = sub?.Metadata?.Identifier;
      if (typeof id === "string" && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  /**
   * Build the WebdaQL class-filter clause `__type IN ['A', 'B', ...]` covering
   * `this.model`'s identifier and every transitive descendant.
   *
   * Returns `undefined` when the model carries no `Metadata`.
   *
   * @returns the class-filter WebdaQL clause, or `undefined` when no Metadata
   */
  protected buildClassFilter(): string | undefined {
    const ids = this.buildClassFilterIdentifiers();
    if (!ids) return undefined;
    // Single-quote each id; escape embedded single quotes by doubling them.
    const literals = ids.map(id => `'${id.replace(/'/g, "''")}'`).join(", ");
    return `__type IN [${literals}]`;
  }

  /**
   * Add query support
   *
   * Class filtering: when several model classes share the same underlying
   * storage Map (e.g. a model and its subclasses each registering their own
   * repository pointing at the same `Map` via `MemoryStore.getRepository`),
   * results are restricted to instances of `this.model` and its transitive
   * descendants. The filter is applied as a real WebdaQL clause —
   * `__type IN ['Webda/Post', 'Webda/BlogPost', ...]` — prepended to the
   * caller's query via `WebdaQL.PrependCondition` (string path) or merged
   * directly into the AST (parsed-Query path used by `iterate`). Each stored
   * item carries its `__type` as a non-enumerable property courtesy of
   * `deserialize`, so the WebdaQL filter eval reads it directly without
   * leaking it to JSON serialization. There is no post-filter step.
   *
   * Models without `Metadata` (plain unit-test classes) opt out of the
   * prepend — `buildClassFilterIdentifiers` returns `undefined` and the query
   * runs as given. External storage backends that adopt the same `__type`
   * stamping convention can use `buildClassFilter` to produce the equivalent
   * server-side WHERE clause.
   *
   * @param query - the query string or parsed query
   * @returns the query results with optional continuation token
   */
  async query(query: string | Query): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
    WebdaQL ??= await import("@webda/ql");
    const ids = this.buildClassFilterIdentifiers();
    let parsed: Query;

    if (typeof query === "string") {
      const merged = ids ? WebdaQL.PrependCondition(query, this.buildClassFilter()!) : query;
      parsed = WebdaQL.parse(merged);
    } else {
      parsed = query as Query;
      if (ids) {
        // Merge the class filter directly into the AST so callers like
        // `iterate()` keep their per-page mutations on the parsed Query
        // (notably `continuationToken`) — re-stringifying via toString() loses
        // those because parse-tree-backed toString reflects the original
        // source, not later runtime mutations.
        const classClause = new WebdaQL.ComparisonExpression("IN", "__type", ids);
        const current: any = (parsed as any).filter;
        if (current instanceof WebdaQL.AndExpression) {
          // Avoid double-prepend across pages of `iterate()`.
          const already = current.children.some(
            (c: any) =>
              c instanceof WebdaQL.ComparisonExpression && c.operator === "IN" && c.attribute?.[0] === "__type"
          );
          if (!already) {
            current.children.unshift(classClause);
          }
        } else {
          (parsed as any).filter = new WebdaQL.AndExpression([classClause, current]);
        }
      }
    }

    return MemoryRepository.simulateFind(parsed, [...this.storage.keys()], this);
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
