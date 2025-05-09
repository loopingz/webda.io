import { JSONedAttributes, PK, PrimaryKeyType, Repository, Storable } from "./storable";
import { randomUUID } from "crypto";
import { Securable } from "./securable";
import { ExposableModel } from "./exposable";
import { ModelRefWithCreate } from "./relations";
import { ActionsEnum } from "./actionable";
import { Constructor } from "@webda/tsc-esm";

export class ModelEvents<T> {
  Saved: { model: T };
  Deleted: { model: T };
}

const Repositories = new WeakMap<Constructor<Model>, Repository<any>>();

export abstract class Model implements Storable, Securable, ExposableModel {
  Events: ModelEvents<this>;

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
   * Get the repository of the model
   * @param this
   * @returns
   */
  static getRepository<T extends Model>(this: Constructor<T>): Repository<T> {
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
  static registerRepository<T extends Model>(this: Constructor<T>, repository: Repository<T>): void {
    Repositories.set(this, repository);
  }

  /**
   * Get a reference to the model
   * @param this
   * @param key
   * @returns
   */
  static ref<T extends Model>(this: Constructor<T>, key: PrimaryKeyType<T>): ModelRefWithCreate<T> {
    return null;
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

  async save(): Promise<void> {
    throw new Error("Not implemented");
  }
}

export class UuidModel extends Model {
  public PrimaryKey = ["uuid"] as const;
  uuid: string;

  constructor() {
    super();
    this.uuid ??= randomUUID();
  }
}

