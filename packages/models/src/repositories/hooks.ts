import type { ModelRefWithCreate } from "../relations.js";
import { SettablePrimaryKey, type ModelClass } from "../storable.js";
import { Helpers, PropertyPaths } from "../types.js";
import type { Repository } from "./repository.js";
import type { AggregationResult, FindOptions, ModelFilter, QueryParameters, WebdaQLString } from "@webda/ql";
import type { AggregatedRow, AggregationSpec, CountOptions, CountResult, MetricSpec } from "../aggregation.js";

/**
 * Global registry mapping ModelClass constructors to their Repository instances.
 *
 * @internal — Populated by `Store.computeStores()`; not for app code. App code
 * reaches a repository via `useRepository(Model)` or static model methods
 * (`Model.create()`, `Model.query()`, `Model.ref()`).
 */
export const Repositories = new WeakMap<ModelClass, Repository<any>>();

/**
 * Return a repository for a model
 * @param arg - the model class to look up
 * @returns the repository for the model
 */
export function useRepository<T extends ModelClass>(arg: T): Repository<T> {
  let clazz: any = arg;
  while (!Repositories.has(clazz)) {
    clazz = Object.getPrototypeOf(clazz);
    if (clazz === null || clazz === Object) {
      throw new Error(`No repository found for ${arg.prototype.constructor.name}`);
    }
  }
  return Repositories.get(clazz) as Repository<T>;
}

/**
 * Register a repository
 *
 * @internal — Called by `Store.computeStores()`; not for app code.
 * @param model - the model class to register for
 * @param repository - the repository instance
 */
export function registerRepository<T extends ModelClass>(model: T, repository: Repository<T>): void {
  Repositories.set(model, repository);
}

/**
 * MixIn that adds static repository methods (create, query, iterate, ref, getRepository)
 * to a base class, enabling Model classes to access their repository directly.
 *
 * @param Base - The base class to augment
 * @returns the augmented class with repository methods
 */
export function RepositoryStorageClassMixIn<TBase extends new (...args: any[]) => object>(Base: TBase) {
  return class extends Base {
    /**
     * Get the repository registered for this model class.
     * @returns the repository
     */
    static getRepository<T extends ModelClass>(this: T): Repository<T> {
      return useRepository(this);
    }

    /**
     * Create the object directly
     * @param this - the model class constructor
     * @param data - the initial data
     * @param save - whether to persist immediately
     * @returns the created model instance
     */
    static create<T extends ModelClass>(
      this: T,
      data: Helpers<InstanceType<T>>,
      save: boolean = true
    ): Promise<InstanceType<T>> {
      return useRepository(this).create(data, save);
    }

    /**
     * Query the object directly
     *
     * ```ts
     * Task.query("owner = ? AND priority >= ?", [user, 2]);
     * Task.query("owner = :owner", { owner: user });
     * Task.query({ owner: user, priority: { $gte: 2 } }, { limit: 10 });
     * ```
     *
     * A JSON filter is converted to WebdaQL here, so repositories only ever receive query strings.
     * @param this - the model class constructor
     * @param query - the query string, optionally with `?` or `:name` placeholders, or a JSON filter
     * @param params - values for the placeholders: an array for `?`, an object for `:name`; or the find options of a JSON filter
     * @returns the query results
     */
    static query<T extends ModelClass>(
      this: T,
      query: WebdaQLString<InstanceType<T>>,
      params?: QueryParameters
    ): Promise<{ results: InstanceType<T>[]; continuationToken?: string }>;
    /**
     * Query the object directly with a JSON filter, converted to WebdaQL
     * @param this - the model class constructor
     * @param filter - the JSON filter
     * @param options - ordering, limit and continuation token
     * @returns the query results
     */
    static query<T extends ModelClass>(
      this: T,
      filter: ModelFilter<InstanceType<T>>,
      options?: FindOptions<InstanceType<T>>
    ): Promise<{ results: InstanceType<T>[]; continuationToken?: string }>;
    /**
     * Query the object directly with a query string or a JSON filter
     * @param this - the model class constructor
     * @param query - the query string or the JSON filter
     * @param paramsOrOptions - the placeholder values of a query string, or the find options of a JSON filter
     * @returns the query results
     */
    static async query<T extends ModelClass>(
      this: T,
      query: WebdaQLString<InstanceType<T>> | ModelFilter<InstanceType<T>>,
      paramsOrOptions?: QueryParameters | FindOptions<InstanceType<T>>
    ): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
      if (typeof query === "string" || query === undefined || query === null) {
        return useRepository(this).query(query as string, paramsOrOptions as QueryParameters);
      }
      const WebdaQL = await import("@webda/ql");
      return useRepository(this).query(WebdaQL.toWebdaQL(query, paramsOrOptions as FindOptions<InstanceType<T>>));
    }

    /**
     * Iterate through all objects
     * @param this - the model class constructor
     * @param query - the query string, optionally with `?` or `:name` placeholders, or a JSON filter
     * @param params - values for the placeholders: an array for `?`, an object for `:name`; or the ordering of a JSON filter
     * @returns an async generator of model instances
     */
    static iterate<T extends ModelClass>(
      this: T,
      query: WebdaQLString<InstanceType<T>>,
      params?: QueryParameters
    ): AsyncGenerator<InstanceType<T>, any, any>;
    /**
     * Iterate through the objects matching a JSON filter, converted to WebdaQL
     * @param this - the model class constructor
     * @param filter - the JSON filter
     * @param options - the ordering
     * @returns an async generator of model instances
     */
    static iterate<T extends ModelClass>(
      this: T,
      filter: ModelFilter<InstanceType<T>>,
      options?: Pick<FindOptions<InstanceType<T>>, "orderBy">
    ): AsyncGenerator<InstanceType<T>, any, any>;
    /**
     * Iterate through the objects matching a query string or a JSON filter
     * @param this - the model class constructor
     * @param query - the query string or the JSON filter
     * @param params - the placeholder values of a query string, or the ordering of a JSON filter
     * @returns an async generator of model instances
     */
    static async *iterate<T extends ModelClass>(
      this: T,
      query: WebdaQLString<InstanceType<T>> | ModelFilter<InstanceType<T>>,
      params?: QueryParameters | Pick<FindOptions<InstanceType<T>>, "orderBy">
    ): AsyncGenerator<InstanceType<T>, any, any> {
      const iterator =
        typeof query === "string" || query === undefined || query === null
          ? useRepository(this).iterate(query as string, params as QueryParameters)
          : useRepository(this).iterate(
              (await import("@webda/ql")).toWebdaQL(query, params as Pick<FindOptions<InstanceType<T>>, "orderBy">)
            );
      for await (const item of iterator) {
        yield item as InstanceType<T>;
      }
    }

    /**
     * Aggregate the objects directly
     *
     * ```ts
     * Task.aggregate({ groupBy: ["status"], metrics: { n: { count: "*" } } });
     * ```
     * @param this - the model class constructor
     * @param spec - filter, group by paths, metrics, ordering and limit
     * @param params - values for the placeholders of `spec.filter`
     * @returns the aggregated rows
     */
    static aggregate<
      T extends ModelClass,
      const G extends readonly PropertyPaths<InstanceType<T>>[] = [],
      const M extends Record<string, MetricSpec<InstanceType<T>>> = Record<string, MetricSpec<InstanceType<T>>>
    >(
      this: T,
      spec: AggregationSpec<InstanceType<T>, G, M>,
      params?: QueryParameters
    ): Promise<AggregationResult<AggregatedRow<InstanceType<T>, G, M>>> {
      return useRepository(this).aggregate(spec, params);
    }

    /**
     * Count the objects matching a filter directly
     *
     * ```ts
     * Task.count("status = ?", ["open"], { max: 10000 });
     * ```
     * No permission is checked: see `countModelWithPermissions` in `@webda/core` for a client total.
     * @param this - the model class constructor
     * @param filter - the WebdaQL filter; ORDER BY, LIMIT and OFFSET are ignored
     * @param params - values for the placeholders of the filter
     * @param options - `max` stops counting after max objects (relation "gte")
     * @returns the count
     */
    static count<T extends ModelClass>(
      this: T,
      filter?: WebdaQLString<InstanceType<T>>,
      params?: QueryParameters,
      options?: CountOptions
    ): Promise<CountResult> {
      return useRepository(this).count(filter, params, options);
    }

    /**
     * Get a reference to the model
     * @param this - the model class constructor
     * @param key - the primary key value
     * @returns a model reference with create capability
     */
    static ref<T extends ModelClass>(
      this: T,
      key: SettablePrimaryKey<InstanceType<T>>
    ): ModelRefWithCreate<InstanceType<T>> {
      return useRepository(this)!.ref(key as any);
    }

    /**
     * Return the proxied version of this model (identity by default)
     * @returns this instance
     */
    toProxy() {
      return this;
    }
  };
}
