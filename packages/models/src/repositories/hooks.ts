import type { ModelRefWithCreate } from "../relations";
import { PrimaryKeyType, SettablePrimaryKey, WEBDA_PRIMARY_KEY, type Storable, type ModelClass } from "../storable";
import { Helpers } from "../types";
import type { Repository } from "./repository";

/** Global registry mapping ModelClass constructors to their Repository instances. */
export const Repositories = new WeakMap<ModelClass, Repository<any>>();

/**
 * Return a repository for a model
 * @param arg
 * @returns
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
 * @param this
 * @param repository
 */
export function registerRepository<T extends ModelClass>(model: T, repository: Repository<T>): void {
  Repositories.set(model, repository);
}

/**
 * MixIn that adds static repository methods (create, query, iterate, ref, getRepository)
 * to a base class, enabling Model classes to access their repository directly.
 *
 * @param Base - The base class to augment
 */
export function RepositoryStorageClassMixIn<TBase extends new (...args: any[]) => object>(Base: TBase) {
  return class extends Base {
    static getRepository<T extends ModelClass>(this: T): Repository<T> {
      return useRepository(this);
    }

    /**
     * Create the object directly
     * @param this
     * @param data
     * @returns
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
     * @param this
     * @param query
     * @returns
     */
    static query<T extends ModelClass>(
      this: T,
      query: string
    ): Promise<{
      results: InstanceType<T>[];
      continuationToken?: string;
    }> {
      return useRepository(this).query(query);
    }

    /**
     * Iterate through all objects
     * @param this
     * @param query
     * @returns
     */
    static async *iterate<T extends ModelClass>(this: T, query: string): AsyncGenerator<InstanceType<T>, any, any> {
      for await (const item of useRepository(this).iterate(query)) {
        yield item as InstanceType<T>;
      }
    }

    /**
     * Get a reference to the model
     * @param this
     * @param key
     * @returns
     */
    static ref<T extends ModelClass>(
      this: T,
      key: SettablePrimaryKey<InstanceType<T>>
    ): ModelRefWithCreate<InstanceType<T>> {
      return useRepository(this)!.ref(key as any);
    }

    /**
     * Return the proxied version of this model (identity by default)
     */
    toProxy() {
      return this;
    }
  };
}
