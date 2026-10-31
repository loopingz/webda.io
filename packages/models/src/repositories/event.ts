import { PK, PrimaryKeyType, ModelClass, WEBDA_PRIMARY_KEY } from "../storable.js";
import type { JSONed, Helpers, PropertyPaths, NumericPropertyPaths, PropertyPathType } from "../types.js";
import { AbstractRepository } from "./abstract.js";
import { ArrayElement } from "@webda/utils";
import type { Query as WebdaQLQuery, QueryParameters, AggregationResult } from "@webda/ql";
import type {
  AggregatedRow,
  AggregationOptions,
  AggregationSpec,
  CountOptions,
  CountResult,
  MetricSpec
} from "../aggregation.js";
import type { QueryMonitorOptions } from "./monitoring.js";
import { WEBDA_TEST } from "./repository.js";

/**
 * Repository decorator that wraps another repository with event emission.
 *
 * Emits "before" events (Create, Update, Patch, Delete, PartialUpdate, Query)
 * before delegating to the underlying repository, then emits "after" events
 * (Created, Updated, Patched, Deleted, PartialUpdated, Queried) on success.
 *
 * @typeParam T - The ModelClass this repository manages
 */
export class EventRepository<T extends ModelClass = any> extends AbstractRepository<T> {
  /**
   * @param model - The model class constructor
   * @param pks - Array of primary key field names
   * @param repository - The underlying repository to delegate storage operations to
   * @param separator - Separator used when joining composite key fields (default: "_")
   */
  constructor(
    model: T,
    pks: string[],
    protected repository: AbstractRepository<T>,
    separator?: string
  ) {
    super(model, pks, separator);
  }

  /**
   * Set the table root on the wrapped repository too: it filters the untyped rows
   * @param root - the model owning the untyped rows of the storage
   * @returns this
   */
  setTableRoot(root?: ModelClass): this {
    super.setTableRoot(root);
    this.repository.setTableRoot(root);
    return this;
  }

  /**
   * Increment numeric attributes with event emission
   * @override
   */
  async incrementAttributes<K extends PropertyPaths<InstanceType<T>>, L extends NumericPropertyPaths<InstanceType<T>>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    info: (L | { property: L; value?: number })[] | Record<L, number>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void | Record<string, number>> {
    await this.emit("PartialUpdate", {
      object_id: primaryKey,
      partial_update: {
        increments: info
      }
    } as any);
    const updated = await this.repository.incrementAttributes(primaryKey, info, _conditionField, _condition);
    await this.emit("PartialUpdated", {
      object_id: primaryKey,
      partial_update: {
        increments: info
      }
    } as any);
    return updated;
  }

  /**
   * Query with event emission
   *
   * Parameters are bound here, so the events carry the bound query and the underlying
   * repository (often a store one) only ever receives a plain query.
   * @param query - the query to execute
   * @param params - values for the `?` or `:name` placeholders
   * @returns the query results with optional continuation token
   */
  async query(
    query: string,
    params?: QueryParameters
  ): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
    if (params !== undefined) {
      query = (await import("@webda/ql")).bind(query, params);
    }
    await this.emit("Query", { query } as any);
    const res = await this.monitor(
      "query",
      query,
      () => this.repository.query(query),
      r => ({ count: r.results.length, paginated: !!r.continuationToken })
    );
    await this.emit("Queried", { ...res, query } as any);
    return res;
  }

  /**
   * Iterate through all objects
   * @param query - the query filter
   * @param params - values for the `?` or `:name` placeholders, bound before reaching the underlying repository
   * @returns an async generator of objects
   */
  async *iterate(query: string, params?: QueryParameters): AsyncGenerator<InstanceType<T>, any, any> {
    if (params !== undefined) {
      query = (await import("@webda/ql")).bind(query, params);
    }
    const model = (this.model as any).Metadata?.Identifier ?? this.model.name;
    const iterator = this.repository.iterate(query)[Symbol.asyncIterator]();
    let totalDuration = 0;
    let count = 0;
    let error: Error | undefined;

    try {
      while (true) {
        const start = performance.now();
        let step: IteratorResult<InstanceType<T>>;
        try {
          step = await iterator.next();
        } catch (err: any) {
          totalDuration += performance.now() - start;
          error = err;
          throw err;
        }
        totalDuration += performance.now() - start;
        if (step.done) {
          break;
        }
        count++;
        yield step.value;
      }
    } finally {
      this.safeOnQuery({
        operation: "iterate",
        model,
        query,
        duration: totalDuration,
        count,
        error
      });
    }
  }

  /**
   * Aggregate with event emission
   *
   * Parameters are bound here, so the events carry the bound filter and the underlying
   * repository receives a plain spec and keeps its native implementation.
   * @param spec - the aggregation spec
   * @param params - values for the placeholders of `spec.filter`
   * @returns the aggregated rows
   */
  async aggregate<
    const G extends readonly PropertyPaths<InstanceType<T>>[] = [],
    const M extends Record<string, MetricSpec<InstanceType<T>>> = Record<string, MetricSpec<InstanceType<T>>>
  >(
    spec: AggregationSpec<InstanceType<T>, G, M>,
    params?: QueryParameters
  ): Promise<AggregationResult<AggregatedRow<InstanceType<T>, G, M>>> {
    if (params !== undefined && spec.filter) {
      spec = { ...spec, filter: (await import("@webda/ql")).bind(spec.filter, params) as any };
    }
    await this.emit("Aggregate", { query: spec } as any);
    const queryStr = JSON.stringify(spec);
    const res = await this.monitor(
      "aggregate",
      queryStr,
      () => this.repository.aggregate(spec),
      r => r.rows.length
    );
    await this.emit("Aggregated", { query: spec, ...res } as any);
    return res;
  }

  /**
   * Count through the underlying repository, monitored as a "count" operation
   *
   * Parameters are bound here, so the monitor sees the bound filter and the underlying repository keeps its native
   * implementation. A count emits no repository event.
   * @param filter - the WebdaQL filter
   * @param params - values for the placeholders of the filter
   * @param options - `max` stops counting after max objects
   * @returns the count
   */
  async count(filter?: string, params?: QueryParameters, options?: CountOptions): Promise<CountResult> {
    if (params !== undefined && filter) {
      filter = (await import("@webda/ql")).bind(filter, params);
    }
    return this.monitor(
      "count",
      filter ?? "",
      () => this.repository.count(filter, undefined, options),
      r => r.value
    );
  }

  /**
   * Configure both this wrapper and the underlying repository
   * @override
   */
  configureAggregation(options: Partial<AggregationOptions>): void {
    super.configureAggregation(options);
    this.repository.configureAggregation(options);
  }

  /**
   * Configure monitoring on the event wrapper only (not on the inner repository)
   * @override
   */
  configureMonitoring(options: Partial<QueryMonitorOptions>): void {
    super.configureMonitoring(options);
  }

  /**
   * Delete in bulk through the underlying repository
   *
   * Bulk operations emit no per-object event: see {@link Repository.deleteMany}.
   * @param statement - the DELETE statement or its parsed form
   * @param params - values for the placeholders
   * @returns the number of objects deleted
   */
  async deleteMany(statement: string | WebdaQLQuery, params?: QueryParameters): Promise<number> {
    let bound = typeof statement === "string" ? statement : JSON.stringify(statement);
    if (typeof statement === "string" && params !== undefined) {
      bound = (await import("@webda/ql")).bind(statement, params);
    }
    return this.monitor(
      "deleteMany",
      bound,
      () => this.repository.deleteMany(statement, params),
      r => r
    );
  }

  /**
   * Update in bulk through the underlying repository
   *
   * Bulk operations emit no per-object event: see {@link Repository.updateMany}.
   * @param statement - the UPDATE statement or its parsed form
   * @param params - values for the placeholders
   * @returns the number of objects updated
   */
  async updateMany(statement: string | WebdaQLQuery, params?: QueryParameters): Promise<number> {
    let bound = typeof statement === "string" ? statement : JSON.stringify(statement);
    if (typeof statement === "string" && params !== undefined) {
      bound = (await import("@webda/ql")).bind(statement, params);
    }
    return this.monitor(
      "updateMany",
      bound,
      () => this.repository.updateMany(statement, params),
      r => r
    );
  }

  /**
   * Delete an item from a collection
   * @param uuid The UUID of the item
   * @param collection The collection to delete from
   * @param index The index of the item to delete
   * @param itemWriteConditionField The field to use for the write condition
   * @param itemWriteCondition The value to use for the write condition
   */
  async deleteItemFromCollection<
    K extends Extract<PropertyPaths<InstanceType<T>, any[]>, keyof InstanceType<T>>,
    L extends keyof ArrayElement<InstanceType<T>[K]>
  >(
    uuid: PrimaryKeyType<InstanceType<T>>,
    collection: K,
    index: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: ArrayElement<InstanceType<T>[K]>[L]
  ): Promise<void> {
    await this.emit("PartialUpdate", {
      object_id: uuid,
      partial_update: {
        delete_from_collection: {
          collection,
          index,
          itemWriteConditionField,
          itemWriteCondition
        }
      }
    } as any);
    await this.repository.deleteItemFromCollection(
      uuid,
      collection,
      index,
      itemWriteConditionField,
      itemWriteCondition
    );
    await this.emit("PartialUpdated", {
      object_id: uuid,
      partial_update: {
        delete_from_collection: {
          collection,
          index,
          itemWriteConditionField,
          itemWriteCondition
        }
      }
    } as any);
  }

  /**
   * Upsert item to collection with event emission
   * @override
   */
  async upsertItemToCollection<
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
  ): Promise<void> {
    await this.emit("PartialUpdate", {
      object_id: uuid,
      partial_update: {
        upsert_in_collection: {
          collection,
          item,
          index,
          itemWriteConditionField,
          itemWriteCondition
        }
      }
    } as any);
    await this.repository.upsertItemToCollection(
      uuid,
      collection,
      item,
      index,
      itemWriteConditionField,
      itemWriteCondition
    );
    await this.emit("PartialUpdated", {
      object_id: uuid,
      partial_update: {
        upsert_in_collection: {
          collection,
          item,
          index,
          itemWriteConditionField,
          itemWriteCondition
        }
      }
    } as any);
  }
  /**
   * Remove attribute with event emission
   * @override
   */
  async removeAttribute<L extends PropertyPaths<InstanceType<T>>, K extends PropertyPaths<InstanceType<T>>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    attribute: K,
    conditionField?: L | null,
    condition?: PropertyPathType<InstanceType<T>, L> | JSONed<PropertyPathType<InstanceType<T>, L>>
  ): Promise<void> {
    await this.emit("PartialUpdate", {
      object_id: uuid,
      partial_update: {
        remove_attribute: {
          attribute,
          conditionField,
          condition
        }
      }
    } as any);
    await this.repository.removeAttribute(uuid, attribute, conditionField, condition);
    await this.emit("PartialUpdated", {
      object_id: uuid,
      partial_update: {
        remove_attribute: {
          attribute,
          conditionField,
          condition
        }
      }
    } as any);
  }
  /** @override */
  async get(primaryKey: PrimaryKeyType<InstanceType<T>>): Promise<Helpers<InstanceType<T>>> {
    const res = await this.repository.get(primaryKey);
    return res;
  }
  /**
   * Create with event emission (emits Create before and Created after)
   * @override
   */
  async create(data: Helpers<InstanceType<T>>, save?: boolean): Promise<InstanceType<T>> {
    // Build the instance once so a generated primary key is shared by the events
    // and the underlying repository
    const item = this.buildItem(data);
    const object_id = this.getPrimaryKey(item);
    await this.emit("Create", { object_id, object: item } as any);
    const res = await this.repository.create(item as Helpers<InstanceType<T>>, save);
    await this.emit("Created", { object_id, object: res } as any);
    return res;
  }
  /**
   * Patch with event emission (emits Patch before and Patched after)
   * @override
   */
  async patch<K extends PropertyPaths<InstanceType<T>>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    data: Partial<InstanceType<T>>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    await this.emit("Patch", { object_id: primaryKey, object: data } as any);
    await this.repository.patch(primaryKey, data, _conditionField, _condition);
    await this.emit("Patched", { object_id: primaryKey, object: data } as any);
  }
  /**
   * Update with event emission (emits Update before and Updated after)
   * @override
   */
  async update<K extends PropertyPaths<InstanceType<T>>>(
    data: Helpers<InstanceType<T>>,
    conditionField?: K | null,
    condition?: PropertyPathType<InstanceType<T>, K>
  ): Promise<void> {
    await this.emit("Update", { object_id: this.getPrimaryKey(data), object: data } as any);
    await this.repository.update(data, conditionField, condition);
    await this.emit("Updated", { object_id: this.getPrimaryKey(data), object: data } as any);
  }
  /**
   * Delete with event emission (emits Delete before and Deleted after)
   * @override
   */
  async delete<K extends PropertyPaths<InstanceType<T>>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    conditionField?: K | null,
    condition?: PropertyPathType<InstanceType<T>, K> | JSONed<PropertyPathType<InstanceType<T>, K>>
  ): Promise<void> {
    await this.emit("Delete", { object_id: uuid } as any);
    await this.repository.delete(uuid, conditionField, condition);
    await this.emit("Deleted", { object_id: uuid } as any);
  }
  /** @override */
  async exists(uuid: PrimaryKeyType<InstanceType<T>>): Promise<boolean> {
    const res = await this.repository.exists(uuid);
    return res;
  }

  /** Test utilities - clears events and delegates to underlying repository */
  [WEBDA_TEST]: {
    clear: (excludeListeners?: boolean) => Promise<void>;
  } = {
    clear: async excludeListeners => {
      if (!excludeListeners) {
        this.events.clear();
      }
      // @ts-ignore
      this.repository[WEBDA_TEST].clear();
    }
  };
}
