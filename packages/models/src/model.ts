import { JSONedAttributes, PK, PrimaryKeyType, Storable } from "./storable";
import { randomUUID } from "crypto";
import { Securable } from "./securable";
import { ExposableModel } from "./exposable";
import { ModelRefWithCreate, type ModelRef } from "./relations";
import { ActionsEnum } from "./actionable";
import { Constructor, NotEnumerable } from "@webda/tsc-esm";
import { Repository } from "./repository";
export class ModelEvents<T> {
  Saved: { model: T };
  Deleted: { model: T };
}

const Repositories = new WeakMap<Constructor<Model>, Repository<any>>();

export abstract class Model implements Storable, Securable, ExposableModel {
  Events: ModelEvents<this>;
  /**
   * Properties that are dirty and need to be saved
   * @private
   */
  @NotEnumerable
  __dirty?: Set<string>;

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

  ref(): ModelRef<this> {
    return this.getRepository().ref(this.getPrimaryKey());
  }

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
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let clazz: any = this;
    while (!Repositories.has(clazz)) {
      clazz = Object.getPrototypeOf(clazz);
      if (clazz === Model) {
        throw new Error(`No repository found for ${this.name}`);
      }
    }
    return Repositories.get(clazz) as Repository<T>;
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
    Repositories.set(this, repository);
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

  async refresh(): Promise<this> {
    const repo = this.getRepository();
    const data = await repo.get(this.getPrimaryKey());
    Object.assign(this, data);
    return this;
  }

  async save(): Promise<void> {
    const repo = this.getRepository();
    if (!this.__dirty) {
      await repo.upsert(this.getPrimaryKey(), this.toJSON());
    } else {
      const patch = {} as JSONedAttributes<this>;
      for (const k of this.__dirty) {
        patch[k] = this[k];
      }
      await repo.patch(this.getPrimaryKey(), patch);
      this.__dirty.clear();
    }
  }
}

export class UuidModel extends Model {
  public PrimaryKey = ["uuid"] as const;
  uuid: string;

  constructor(data?: Partial<UuidModel>) {
    super();
    this.uuid = data?.uuid || randomUUID();
  }
}
