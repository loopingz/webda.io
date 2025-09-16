import {
  WEBDA_DIRTY,
  WEBDA_EVENTS,
  WEBDA_PRIMARY_KEY,
  type SelfJSONed,
  type PK,
  type PrimaryKeyType,
  type Storable,
  WEBDA_PRIMARY_KEY_SEPARATOR,
  StorableClass
} from "./storable";
import { randomUUID } from "crypto";
import type { Securable } from "./securable";
import { type ModelRefWithCreate, type ModelRef, assignNonSymbols } from "./relations";
import { ExecutionContext, Exposable, WEBDA_ACTIONS, type ActionsEnum } from "./actionable";
import type { Prototype } from "@webda/tsc-esm";
import type { Repository } from "./repositories/repository";
import { ObjectSerializer, registerSerializer } from "@webda/serialize";

export type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;
export type ExceptPartial<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Allow simulated delete
 */
export const WEBDA_DELETED = "__deleted";
/**
 * Event sent by models
 *
 * Events are sent by the model to notify of changes
 * after the changes are done
 *
 * If you need to prevent the change, you should extend the object
 */
export type ModelEvents<T = any> = {
  Create: { object_id: string; object: T };
  PartialUpdate: any;
  Delete: { object_id: string };
  Update: { object_id: string; object: T; previous: T };
  // Events sent after the change
  Created: { object_id: string; object: T };
  PartialUpdated: any;
  Deleted: { object_id: string };
  Updated: { object_id: string; object: T; previous: T };
};

const Repositories = new WeakMap<StorableClass, Repository<any>>();

/**
 * Return a repository for a model
 * @param arg
 * @returns
 */
export function useRepository<T extends StorableClass>(arg: T): Repository<T> {
  let clazz: any = arg;
  while (!Repositories.has(clazz)) {
    clazz = Object.getPrototypeOf(clazz);
    if (clazz === Model) {
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
export function registerRepository<T extends StorableClass>(model: T, repository: Repository<T>): void {
  Repositories.set(model, repository);
}

/**
 * Model Constructor
 */
export type ModelClass<T extends Model = Model> = {
  /**
   * Create a new model
   */
  new (data: any): T;
  /**
   * Prototype
   */
  prototype: T;
  /**
   * Reference
   * @param this
   * @param key
   */
  ref<T extends StorableClass>(this: T, key: PrimaryKeyType<InstanceType<T>>): ModelRefWithCreate<InstanceType<T>>;
  iterate<T extends StorableClass>(this: T, query: string): Iterable<Promise<InstanceType<T>>>;
  create<T extends StorableClass>(this: T, data: ConstructorParameters<T>[0], save?: boolean): Promise<InstanceType<T>>;
  query<T extends StorableClass>(
    this: T,
    query: string
  ): Promise<{
    results: InstanceType<T>[];
    continuationToken?: string;
  }>;
  getRepository<T extends StorableClass>(this: T): Repository<T>;
  registerRepository<T extends StorableClass>(this: T, repository: Repository<T>): void;
  registerSerializer<T extends StorableClass>(
    this: T & { fromJSON?: (data: any) => InstanceType<T>; getStaticProperties?: () => any }
  ): void;
};

export type ModelActions<
  T extends "create" | "get" | "update" | "query" | "delete" = "create" | "get" | "update" | "query" | "delete"
> = {
  /**
   * Create a new instance
   */
  create: T extends "create"
    ? {}
    : {
        disabled: true;
      };
  /**
   * Get an instance
   */
  get: T extends "get"
    ? {}
    : {
        disabled: true;
      };
  /**
   * Update an instance
   */
  update: T extends "update"
    ? {}
    : {
        disabled: true;
      };
  /**
   * Delete an instance
   */
  delete: T extends "delete"
    ? {}
    : {
        disabled: true;
      };
  /**
   * Query instances
   */
  query: T extends "query"
    ? {}
    : {
        disabled: true;
      };
};

/**
 * Model object definition
 *
 * This is the core of many application
 */
export abstract class Model implements Storable, Securable, Exposable {
  /**
   * Model events
   */
  [WEBDA_EVENTS]?: ModelEvents<this>;
  /**
   * Properties that are dirty and need to be saved
   * @private
   */
  [WEBDA_DIRTY]?: Set<string>;
  /**
   * Define actions for the model
   */
  [WEBDA_ACTIONS]?: ModelActions;

  /** Non-abstract class need to define their PrimaryKey */
  public abstract [WEBDA_PRIMARY_KEY]: readonly (keyof this)[];

  /**
   * K is inferred as the literal tuple type of `this.keyFields`,
   * so K[number] is the exact union of keys you wrote.
   */
  getPrimaryKey<K extends readonly (keyof this)[]>(
    this: this & { [WEBDA_PRIMARY_KEY]: K; [WEBDA_PRIMARY_KEY_SEPARATOR]?: string }
  ): PrimaryKeyType<this> {
    const result = {} as Pick<this, K[number]>;
    if (this[WEBDA_PRIMARY_KEY].length === 1) {
      return this[this[WEBDA_PRIMARY_KEY][0]] as any;
    }
    for (const k of this[WEBDA_PRIMARY_KEY]) {
      result[k] = this[k];
    }
    result.toString = () => {
      return this[WEBDA_PRIMARY_KEY].map(k => `${this[k]}`).join(this[WEBDA_PRIMARY_KEY_SEPARATOR] || "_");
    };
    return result as any;
  }

  /**
   * Return the UUID of the model
   * @returns
   */
  getUUID(): string {
    return this.getRepository().getUID(this);
  }

  /**
   * Get object reference
   * @returns
   */
  ref(): ModelRef<this & Storable> {
    return this.getRepository().ref(this.getPrimaryKey()) as any;
  }

  /**
   * Set the primary key of the model
   * @param this
   * @param value
   * @returns
   */
  setPrimaryKey<K extends readonly (keyof this)[]>(
    this: this & { [WEBDA_PRIMARY_KEY]: K },
    value: PK<this, K[number]>
  ): this {
    if (this[WEBDA_PRIMARY_KEY].length === 1) {
      this[this[WEBDA_PRIMARY_KEY][0]] = value as any;
    } else {
      for (const k of this[WEBDA_PRIMARY_KEY]) {
        (this as any)[k] = (value as any)[k as any];
      }
    }
    return this;
  }

  /**
   * Get the repository of the model
   * @param this
   * @returns
   */
  static getRepository<T extends StorableClass>(this: T): Repository<T> {
    return useRepository(this);
  }

  /**
   * Create the object directly
   * @param this
   * @param data
   * @returns
   */
  static create<T extends StorableClass>(
    this: T,
    data: ConstructorParameters<T>[0],
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
  static query<T extends StorableClass>(
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
  static *iterate<T extends StorableClass>(this: T, query: string): Iterable<Promise<InstanceType<T>>> {
    return useRepository(this).iterate(query);
  }

  /**
   * Get the repository of the model
   * @returns
   */
  getRepository(): Repository {
    return (this.constructor as any).getRepository();
  }

  /**
   * Register a repository for the model
   *
   * @param this
   * @param repository
   */
  static registerRepository<T extends StorableClass>(this: T, repository: Repository<T>): void {
    registerRepository(this, repository);
  }

  static registerSerializer<T extends StorableClass>(
    this: T & { fromJSON?: (data: any) => InstanceType<T>; getStaticProperties?: () => any }
  ): void {
    const clazz: T & { fromJSON?: (data: any) => InstanceType<T>; getStaticProperties?: () => any } = this;
    if (!clazz.getStaticProperties) {
      clazz.getStaticProperties = () => ({}) as any;
    }
    registerSerializer(
      `@webda/models/${this.prototype.constructor.name}`,
      new ObjectSerializer(clazz as any, clazz.getStaticProperties())
    );
  }

  /**
   * Get a reference to the model
   * @param this
   * @param key
   * @returns
   */
  static ref<T extends StorableClass>(
    this: T,
    key: PrimaryKeyType<InstanceType<T>> | string
  ): ModelRefWithCreate<InstanceType<T>> {
    return Repositories.get(this)!.ref(key);
  }

  toJSON(): SelfJSONed<this> {
    return <SelfJSONed<this>>this;
  }

  toDTO() {
    return this.toJSON();
  }

  /**
   * Read from a DTO
   * @param dto
   */
  fromDTO(dto: any): this {
    return this;
  }

  /**
   * Validate actions on the model
   *
   * This method always return false
   * @param action
   * @returns
   */
  async canAct(context: ExecutionContext, action: string): Promise<boolean | string> {
    return false;
  }

  /**
   * Ensure action is allowed
   * @param action
   * @param context
   */
  async checkAct(context: ExecutionContext, action: string): Promise<void> {
    let canAct = await this.canAct(context, action);
    if (canAct === false) {
      canAct = `Action ${action} is not allowed`;
    }
    if (canAct !== true) {
      throw new Error(canAct);
    }
  }

  /**
   * No proxy by default
   * @returns
   */
  toProxy(): this {
    return this;
  }

  /**
   * Reload the model from the repository
   * @returns
   */
  async refresh(): Promise<this> {
    const repo = this.getRepository();
    const data = await repo.get(this.getPrimaryKey());
    Object.assign(this, data);
    return this;
  }

  /**
   * Save the model to the repository
   */
  async save(): Promise<this> {
    const repo = this.getRepository();
    const concreteThis: this & Storable = this as any;
    if (!this[WEBDA_DIRTY]) {
      await repo.upsert(concreteThis);
    } else {
      const patch = {} as SelfJSONed<this & Storable>;
      for (const k of this[WEBDA_DIRTY]) {
        (patch as any)[k] = (this as any)[k];
      }
      await repo.patch(this.getPrimaryKey(), patch);
      this[WEBDA_DIRTY].clear();
    }
    return this;
  }

  deserialize(data: Partial<SelfJSONed<Model>>): this {
    assignNonSymbols(this, data);
    return this;
  }

  /**
   * Return if the model is deleted
   * @returns
   */
  isDeleted() {
    return (this as any)[WEBDA_DELETED];
  }

  /**
   * Delete a model
   */
  async delete(): Promise<void> {
    // Mark the model as deleted
    // return this.ref().setAttribute(WEBDA_DELETED, true);
    // or delete for real
    return this.ref().delete();
  }

  /**
   * Patch the object
   * @param data
   */
  async patch(data: Partial<SelfJSONed<this>>): Promise<this> {
    this.deserialize(data);
    const repo = this.getRepository();
    await repo.patch(
      this.getPrimaryKey(),
      Object.keys(data).reduce(
        (acc, key) => {
          (acc as any)[key] = (this as any)[key];
          return acc;
        },
        {} as Partial<SelfJSONed<this & Storable>>
      )
    );
    return this;
  }
}

/**
 * Simple model with a UUID
 */
export class UuidModel extends Model {
  /**
   * Definition of the primary key
   */
  public [WEBDA_PRIMARY_KEY] = ["uuid"] as const;
  /**
   * UUID of the model
   */
  uuid: string;

  /**
   * Constructor
   * @param data
   */
  constructor(data?: Partial<UuidModel>) {
    super();
    this.uuid = data?.uuid || this.generateUUID(data);
  }

  /**
   * Generate the UUID
   * @returns
   */
  generateUUID(data?: any): string {
    return randomUUID();
  }
}
