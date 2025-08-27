import {
  WEBDA_DIRTY,
  WEBDA_EVENTS,
  WEBDA_PRIMARY_KEY,
  type AttributesArgument,
  type Eventable,
  type SelfJSON,
  type PK,
  type PrimaryKeyType,
  type Storable
} from "./storable";
import { randomUUID } from "crypto";
import type { Securable } from "./securable";
import type { ModelRefWithCreate, ModelRef } from "./relations";
import { WEBDA_ACTIONS, type Actionable, type ActionsEnum } from "./actionable";
import { type Constructor } from "@webda/tsc-esm";
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
  // Events sent after the change
  Created: { object_id: string; object: T };
  PartialUpdated: any;
  Deleted: { object_id: string };
  Updated: { object_id: string; object: T; previous: T };
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
      throw new Error(`No repository found for ${arg.name}`);
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
  new (data: SelfJSON<T>): T;
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
export abstract class Model implements Storable, Securable, Actionable {
  [WEBDA_EVENTS]: ModelEvents<this>;
  /**
   * Properties that are dirty and need to be saved
   * @private
   */
  [WEBDA_DIRTY]?: Set<string>;
  /**
   * Define actions for the model
   */
  [WEBDA_ACTIONS]: {
    /**
     * Create a new instance
     */
    create: {};
    /**
     * Get an instance
     */
    get: {};
    /**
     * Update an instance
     */
    update: {};
    /**
     * Delete an instance
     */
    delete: {};
  };

  /** Non-abstract class need to define their PrimaryKey */
  public abstract [WEBDA_PRIMARY_KEY]: readonly (keyof this)[];

  /**
   * K is inferred as the literal tuple type of `this.keyFields`,
   * so K[number] is the exact union of keys you wrote.
   */
  getPrimaryKey<K extends readonly (keyof this)[]>(this: this & { [WEBDA_PRIMARY_KEY]: K }): PK<this, K[number]> {
    const result = {} as Pick<this, K[number]>;
    if (this[WEBDA_PRIMARY_KEY].length === 1) {
      return this[this[WEBDA_PRIMARY_KEY][0]] as any;
    }
    for (const k of this[WEBDA_PRIMARY_KEY]) {
      result[k] = this[k];
    }
    result.toString = () => {
      return this[WEBDA_PRIMARY_KEY].map(k => `${this[k]}`).join("_");
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
  setPrimaryKey<K extends readonly (keyof this)[]>(
    this: this & { [WEBDA_PRIMARY_KEY]: K },
    value: PK<this, K[number]>
  ): this {
    if (this[WEBDA_PRIMARY_KEY].length === 1) {
      this[this[WEBDA_PRIMARY_KEY][0]] = value as any;
    } else {
      for (const k of this[WEBDA_PRIMARY_KEY]) {
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

  static create<T extends Model>(this: Constructor<T, any[]>, data?: AttributesArgument<T>): Promise<T> {
    const repository = Repositories.get(this);
    return repository.ref(repository.getPrimaryKey(data)).create(data);
  }

  toJSON(): SelfJSON<this> {
    return <SelfJSON<this>>this;
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
  async canAct(action: ActionsEnum<Model>): Promise<boolean | string> {
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
    if (!this[WEBDA_DIRTY]) {
      await repo.upsert(this.getPrimaryKey(), this.toJSON());
    } else {
      const patch = {} as SelfJSON<this>;
      for (const k of this[WEBDA_DIRTY]) {
        patch[k] = this[k];
      }
      await repo.patch(this.getPrimaryKey(), patch);
      this[WEBDA_DIRTY].clear();
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
    this.uuid = data?.uuid || randomUUID();
  }
}
