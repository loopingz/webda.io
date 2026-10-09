import type { ModelRefWithCreate } from "../relations.js";
import { PrimaryKeyType, SettablePrimaryKey, WEBDA_PRIMARY_KEY, type Storable, type ModelClass } from "../storable.js";
import { Helpers, PropertyPaths } from "../types.js";
import type { Repository } from "./repository.js";
import type { AggregationResult, QueryParameters, WebdaQLString } from "@webda/ql";
import type { AggregatedRow, AggregationSpec, MetricSpec } from "../aggregation.js";

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
     * ```
     * @param this - the model class constructor
     * @param query - the query string, optionally with `?` or `:name` placeholders
     * @param params - values for the placeholders: an array for `?`, an object for `:name`
     * @returns the query results
     */
    static query<T extends ModelClass>(
      this: T,
      query: WebdaQLString<InstanceType<T>>,
      params?: QueryParameters
    ): Promise<{
      results: InstanceType<T>[];
      continuationToken?: string;
    }> {
      return useRepository(this).query(query, params);
    }

    /**
     * Iterate through all objects
     * @param this - the model class constructor
     * @param query - the query string, optionally with `?` or `:name` placeholders
     * @param params - values for the placeholders: an array for `?`, an object for `:name`
     * @returns an async generator of model instances
     */
    static async *iterate<T extends ModelClass>(
      this: T,
      query: WebdaQLString<InstanceType<T>>,
      params?: QueryParameters
    ): AsyncGenerator<InstanceType<T>, any, any> {
      for await (const item of useRepository(this).iterate(query, params)) {
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
