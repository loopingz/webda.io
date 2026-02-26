import { Model } from "../model";
import type { ModelRefWithCreate } from "../relations";
import { PrimaryKeyType, WEBDA_PRIMARY_KEY, type Storable, type ModelClass } from "../storable";
import { Helpers } from "../types";
import type { Repository } from "./repository";

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
    if (clazz === Model) {
      if (!Repositories.has(clazz)) {
        throw new Error(`No repository found for ${arg.prototype.constructor.name}`);
      }
      break;
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

export function RepositoryStorageClassMixIn<TBase extends new (...args: any[]) => {}>(Base: TBase) {
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
      key: PrimaryKeyType<InstanceType<T>>
    ): ModelRefWithCreate<InstanceType<T>> {
      return useRepository(this)!.ref(key);
    }

    toProxy() {
      return this;
    }
  };
}
