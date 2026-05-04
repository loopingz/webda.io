import type { ModelRefWithCreate } from "../relations";
import { PrimaryKeyType, SettablePrimaryKey, WEBDA_PRIMARY_KEY, type Storable, type ModelClass } from "../storable";
import { Helpers } from "../types";
import type { Repository } from "./repository";
import type { WebdaQLString } from "@webda/ql";

/** Global registry mapping ModelClass constructors to their Repository instances. */
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
     * @param this - the model class constructor
     * @param query - the query string
     * @returns the query results
     */
    static query<T extends ModelClass>(
      this: T,
      query: WebdaQLString<InstanceType<T>>
    ): Promise<{
      results: InstanceType<T>[];
      continuationToken?: string;
    }> {
      return useRepository(this).query(query);
    }

    /**
     * Iterate through all objects
     * @param this - the model class constructor
     * @param query - the query string
     * @returns an async generator of model instances
     */
    static async *iterate<T extends ModelClass>(
      this: T,
      query: WebdaQLString<InstanceType<T>>
    ): AsyncGenerator<InstanceType<T>, any, any> {
      for await (const item of useRepository(this).iterate(query)) {
        yield item as InstanceType<T>;
      }
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
