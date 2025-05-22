import type { Eventable, JSONedAttributes, JSONedInternal, PK, PrimaryKeyType, Storable } from "./storable";
import { randomUUID } from "crypto";
import type { Securable } from "./securable";
import type { ExposableModel } from "./exposable";
import type { ModelRefWithCreate, ModelRef } from "./relations";
import type { ActionsEnum } from "./actionable";
import { type Constructor, NotEnumerable } from "@webda/tsc-esm";
import type { Repository } from "./repository";

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
};

const Repositories = new WeakMap<Constructor<Storable & Eventable>, Repository<any>>();

/**
 * Return a repository for a model
 * @param arg
 * @returns
 */
export function useRepository<T extends Storable & Eventable>(arg: Constructor<T>): Repository<T> {
  let clazz: any = arg;
  while (!Repositories.has(clazz)) {
    clazz = Object.getPrototypeOf(clazz);
    if (clazz === Model) {
      throw new Error(`No repository found for ${this.name}`);
    }
  }
  return Repositories.get(clazz) as Repository<T>;
}

/**
 * Register a repository
 * @param this
 * @param repository
 */
export function registerRepository<T extends Storable & Eventable>(
  model: Constructor<T, any[]>,
  repository: Repository<T>
): void {
  Repositories.set(model, repository);
}

/**
 * Model Constructor
 */
export type ModelPrototype<T extends Model = Model> = {
  /**
   * Create a new model
   */
  new (data: JSONedInternal<T>): T;
  /**
   * Reference
   * @param this
   * @param key
   */
  ref<T extends Model>(this: Constructor<T>, key: PrimaryKeyType<T>): ModelRefWithCreate<T>;
};

/**
 * Model object definition
 *
 * This is the core of many application
 */
export abstract class Model implements Storable, Securable, ExposableModel {
  Events: ModelEvents<this>;
  /**
   * Properties that are dirty and need to be saved
   * @private
   */
  @NotEnumerable
  __WEBDA_DIRTY?: Set<string>;

  /** Non-abstract class need to define their PrimaryKey */
  public abstract PrimaryKey: readonly (keyof this)[];

  /**
   * K is inferred as the literal tuple type of `this.keyFields`,
   * so K[number] is the exact union of keys you wrote.
   */
  getPrimaryKey<K extends readonly (keyof this)[]>(this: this & { PrimaryKey: K }): PK<this, K[number]> {
    const result = {} as Pick<this, K[number]>;
    if (this.PrimaryKey.length === 1) {
      return this[this.PrimaryKey[0]] as any;
    }
    for (const k of this.PrimaryKey) {
      result[k] = this[k];
    }
    result.toString = () => {
      return this.PrimaryKey.map(k => `${this[k]}`).join("_");
    };
    return result as any;
  }

  /**
   * Return the UUID of the model
   * @returns
   */
  getUUID(): string {
    return this.getRepository().getUUID(this);
  }

  /**
   * Get object reference
   * @returns
   */
  ref(): ModelRef<this> {
    return this.getRepository().ref(this.getPrimaryKey());
  }

  /**
   * Set the primary key of the model
   * @param this
   * @param value
   * @returns
   */
  setPrimaryKey<K extends readonly (keyof this)[]>(this: this & { PrimaryKey: K }, value: PK<this, K[number]>): this {
    if (this.PrimaryKey.length === 1) {
      this[this.PrimaryKey[0]] = value as any;
    } else {
      for (const k of this.PrimaryKey) {
        this[k] = value[k as any];
      }
    }
    return this;
  }

  /**
   * Get the repository of the model
   * @param this
   * @returns
   */
  static getRepository<T extends Model>(this: Constructor<T, any[]>): Repository<T> {
    return useRepository(this);
  }

  /**
   * Get the repository of the model
   * @returns
   */
  getRepository(): Repository<this> {
    return (this.constructor as any).getRepository();
  }

  /**
   * Register a repository for the model
   *
   * @param this
   * @param repository
   */
  static registerRepository<T extends Model>(this: Constructor<T, any[]>, repository: Repository<T>): void {
    registerRepository(this, repository);
  }

  /**
   * Get a reference to the model
   * @param this
   * @param key
   * @returns
   */
  static ref<T extends Model>(this: Constructor<T>, key: PrimaryKeyType<T>): ModelRefWithCreate<T> {
    return Repositories.get(this).ref(key);
  }

  toJSON(): JSONedAttributes<this> {
    return <JSONedAttributes<this>>this;
  }

  toDTO() {
    return this.toJSON();
  }

  /**
   * Read from a DTO
   * @param dto
   */
  fromDTO(dto: any): void {}

  /**
   * Validate actions on the model
   *
   * This method always return false
   * @param action
   * @returns
   */
  async canAct(action: ActionsEnum<this>): Promise<boolean | string> {
    return false;
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
  async save(): Promise<void> {
    const repo = this.getRepository();
    if (!this.__WEBDA_DIRTY) {
      await repo.upsert(this.getPrimaryKey(), this.toJSON());
    } else {
      const patch = {} as JSONedAttributes<this>;
      for (const k of this.__WEBDA_DIRTY) {
        patch[k] = this[k];
      }
      await repo.patch(this.getPrimaryKey(), patch);
      this.__WEBDA_DIRTY.clear();
    }
  }
}

/**
 * Simple model with a UUID
 */
export class UuidModel extends Model {
  /**
   * Definition of the primary key
   */
  public PrimaryKey = ["uuid"] as const;
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
    this.uuid = data?.uuid || randomUUID();
  }
}
