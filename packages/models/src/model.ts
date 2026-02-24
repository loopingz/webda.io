import {
  WEBDA_DIRTY,
  WEBDA_EVENTS,
  WEBDA_PRIMARY_KEY,
  type PK,
  type PrimaryKeyType,
  type Storable,
  WEBDA_PRIMARY_KEY_SEPARATOR,
  ModelClass
} from "./storable";
import type { Helpers, SelfJSONed } from "./types";
import { randomUUID } from "crypto";
import type { Securable } from "./securable";
import type { ModelRef } from "./relations";
//import { ExecutionContext, Exposable } from "./actionable";
import type { Repository } from "./repositories/repository";
import { ObjectSerializer, registerSerializer } from "@webda/serialize";
import { LoadParameters } from "./types";
import { RepositoryStorageClassMixIn } from "./repositories/hooks";

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
  Patch: { object_id: string; object: T; previous: T };
  Query: { query: string };
  // Events sent after the change
  Created: { object_id: string; object: T };
  PartialUpdated: any;
  Deleted: { object_id: string };
  Patched: { object_id: string; object: T; previous: T };
  Updated: { object_id: string; object: T; previous: T };
  Queried: { query: string; results: T[]; continuationToken?: string };
};

/**
 * Model object definition
 *
 * This is the core of many application
 */
export abstract class Model extends RepositoryStorageClassMixIn(Object) implements Storable, Securable {
  /**
   * Model events
   */
  [WEBDA_EVENTS]?: ModelEvents<this>;
  /**
   * Properties that are dirty and need to be saved
   * @private
   */
  [WEBDA_DIRTY]?: Set<string>;

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
  ref(): ModelRef<this> {
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
   * @returns
   */
  getRepository(): Repository<ModelClass<this>> {
    return (this.constructor as any).getRepository();
  }

  /**
   * Register Model custom serializer
   * @param this
   * @param overwrite
   *
   * TODO Might want to move to deserialize static function
   */
  static registerSerializer<T extends ModelClass>(
    this: T & { fromJSON?: (data: any) => InstanceType<T>; getStaticProperties?: () => any },
    overwrite: boolean = true
  ): void {
    const clazz: T & { fromJSON?: (data: any) => InstanceType<T>; getStaticProperties?: () => any } = this;
    if (!clazz.getStaticProperties) {
      clazz.getStaticProperties = () => ({}) as any;
    }
    registerSerializer(
      `@webda/models/${this.prototype.constructor.name}`,
      new ObjectSerializer(clazz as any, clazz.getStaticProperties()),
      overwrite
    );
  }

  /**
   * No proxy by default
   * @returns
   */
  toProxy(): this {
    return this;
  }

  /**
   * Serialize the model to JSON
   * By default, returns the model itself
   * @returns
   */
  toJSON(): this {
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
      await repo.upsert(concreteThis as Helpers<this>);
    } else {
      const patch = {} as Partial<this>;
      for (const k of this[WEBDA_DIRTY]) {
        (patch as any)[k] = (this as any)[k];
      }
      await repo.patch(this.getPrimaryKey(), patch);
      this[WEBDA_DIRTY].clear();
    }
    return this;
  }

  /**
   * Custom deserializers for the model
   */
  static getDeserializers<T extends ModelClass>(
    this: T
  ): Partial<Record<keyof InstanceType<T>, (value: any) => any>> | undefined {
    return undefined;
  }

  static DefaultDeserializer = {
    Date: (value: string | number | Date | undefined) => (value ? new Date(value) : new Date())
  };

  /**
   * Deserialize the model
   * @param this
   * @param data
   * @param instance
   * @returns
   */
  static deserialize<T extends ModelClass, K extends object = InstanceType<T>>(this: T, data: any, instance?: K): K {
    if (!instance) {
      instance = new (this as any)(data);
      return instance as K;
    }
    // Deserialize with custom deserializers if any
    const deserializers = (this as any).getDeserializers ? (this as any).getDeserializers() : undefined;
    let info: any = deserializers ? {} : data;
    if (deserializers) {
      for (const key in data) {
        if (deserializers[key]) {
          info[key] = deserializers[key](data[key]);
        } else {
          info[key] = data[key];
        }
      }
    } else {
      info = data;
    }
    Object.assign(instance, info);
    return instance;
  }

  /**
   * Allow to load from Storage, Dto and helper formats
   * @param params
   * @returns
   */
  load(params: LoadParameters<this>): this {
    // @ts-ignore
    this.constructor.deserialize(params, this);
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
    // return this.ref().setAttribute(WEBDA_DELETED, Date.now());
    // or delete for real
    return this.ref().delete();
  }

  /**
   * Patch the object
   * @param data
   */
  async patch(data: Partial<SelfJSONed<this>>): Promise<this> {
    this.load(data as any);
    const repo = this.getRepository();
    await repo.patch(
      this.getPrimaryKey(),
      Object.keys(data).reduce((acc, key) => {
        (acc as any)[key] = (this as any)[key];
        return acc;
      }, {} as Partial<this>)
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
   * @format uuid
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

// Register serializer for UuidModel
UuidModel.registerSerializer();
