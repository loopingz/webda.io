import { Attributes, FilterAttributes, NotEnumerable, ArrayElement } from "@webda/tsc-esm";
import {
  isStorable,
  PrimaryKeyType,
  Repository,
  Storable,
  StorableAttributes,
  Pojo,
  JSONed,
  PrimaryKey,
  PrimaryKeyEquals
} from "./storable";

/**
 * A reference to a model
 */
export class ModelRef<T extends Storable> {
  constructor(
    protected key: PrimaryKeyType<T>,
    protected repository?: Repository<T>,
    protected parent?: Storable
  ) {}

  /**
   * Get the model
   */
  getPrimaryKey(): PrimaryKeyType<T> {
    return this.key;
  }

  /**
   *
   * @returns
   */
  toJSON(): PrimaryKeyType<T> {
    return <PrimaryKeyType<T>>this.key;
  }

  /**
   * Set the attribute of the model
   * @param attribute
   * @param value
   * @returns
   */
  setAttribute<A extends StorableAttributes<T, any>>(attribute: A, value: JSONed<T[A]>): Promise<void> {
    return this.repository.setAttribute(this.key, attribute, value as any);
  }

  /**
   * Patch the model
   * @param data
   * @param conditionField
   * @param condition
   * @returns
   */
  patch<A extends StorableAttributes<T>>(
    data: Partial<Pojo<T>>,
    conditionField?: A,
    condition?: T[A] | JSONed<T[A]>
  ): Promise<void> {
    return this.repository.patch(this.key, data, conditionField, condition);
  }

  /**
   * Get the model referenced by the key
   * @returns
   */
  get(): Promise<T> {
    return this.repository.get(this.key);
  }

  /**
   * Delete the model
   *
   * If a condition is specified, it will be used to check if the model can be deleted
   *
   * @param conditionField
   * @param condition
   * @returns
   */
  delete<A extends StorableAttributes<T, any>>(conditionField?: A, condition?: JSONed<T[A]> | T[A]): Promise<void> {
    return this.repository.delete(this.key, conditionField, condition);
  }

  /**
   * Check if the model exists in the repository
   * @returns
   */
  exists(): Promise<boolean> {
    return this.repository.exists(this.key);
  }

  /**
   * Increment the attributes of the model
   * @param info The attributes to increment
   * @param conditionField
   * @param condition
   * @returns
   */
  incrementAttributes(
    info:
      | (StorableAttributes<T, number> | { property: StorableAttributes<T, number>; value?: number })[]
      | Record<StorableAttributes<T, number>, number>,
    conditionField?: StorableAttributes<T, any>,
    condition?: T[StorableAttributes<T, any>]
  ): Promise<void> {
    return this.repository.incrementAttributes(this.key, info, conditionField, condition);
  }
  /**
   * Add an item to a collection
   * @param collection
   * @param item
   * @param index
   * @param itemWriteConditionField
   * @param itemWriteCondition
   * @returns
   */
  upsertItemToCollection<K extends StorableAttributes<T, Array<any>>, L extends keyof ArrayElement<T[K]>>(
    collection: K,
    item: ArrayElement<T[K]> | JSONed<ArrayElement<T[K]>>,
    index?: number,
    itemWriteConditionField?: ArrayElement<T[K]> extends object ? ArrayElement<T[K]>[L] : ArrayElement<T[K]> | null,
    itemWriteCondition?: ArrayElement<T[K]> extends object ? L : never
  ): Promise<void> {
    return this.repository.upsertItemToCollection(
      this.key,
      collection,
      item,
      index,
      itemWriteConditionField,
      itemWriteCondition
    );
  }

  /**
   * Remove an item from a collection
   * @param collection
   * @param index
   * @param itemWriteConditionField
   * @param itemWriteCondition
   * @returns
   */
  deleteItemFromCollection(
    collection: StorableAttributes<T, any[]>,
    index: number,
    itemWriteConditionField?: keyof ArrayElement<T[StorableAttributes<T, any[]>]>,
    itemWriteCondition?: ArrayElement<T[StorableAttributes<T, any[]>]>[keyof ArrayElement<
      T[StorableAttributes<T, any[]>]
    >]
  ): Promise<void> {
    return this.repository.deleteItemFromCollection(
      this.key,
      collection,
      index,
      itemWriteConditionField,
      itemWriteCondition
    );
  }

  /**
   * Remove an attribute from the model
   * @param attribute
   * @param conditionField
   * @param condition
   * @returns
   */
  removeAttribute<A extends StorableAttributes<T, any>>(
    attribute: StorableAttributes<T, any>,
    conditionField?: A,
    condition?: T[A]
  ): Promise<void> {
    return this.repository.removeAttribute(this.key, attribute, conditionField, condition);
  }
  /**
   * Increment only one attribute of the model
   * @param property
   * @param value
   * @param conditionField
   * @param condition
   * @returns
   */
  incrementAttribute(
    property: StorableAttributes<T, number>,
    value?: number,
    conditionField?: StorableAttributes<T, any>,
    condition?: T[StorableAttributes<T, any>]
  ): Promise<void> {
    return this.repository.incrementAttributes(
      this.key,
      [{ property: property, value: value }],
      conditionField,
      condition
    );
  }
}

export type ModelRelations<T extends object> =
  | FilterAttributes<T, ModelRelated<any>>
  | FilterAttributes<T, ModelLinker>;

/**
 * Model reference with create and upsert methods
 */
export class ModelRefWithCreate<T extends Storable> extends ModelRef<T> {
  /**
   * Upsert a model reference
   * @param data
   * @returns
   */
  upsert(data: Omit<JSONed<T>, T["PrimaryKey"][number]>): Promise<T> {
    return this.repository.upsert(this.key, data as any);
  }
  /**
   * Create a model reference
   *
   * It will fail if the model already exists
   * @param data
   * @returns
   */
  create(data: Omit<JSONed<T>, T["PrimaryKey"][number]>): Promise<T> {
    return this.repository.create(this.key, data as any);
  }
}

/**
 * Define a 1:n relation on the current model to another model
 *
 * T is the model to link to
 * _K is the attribute in T to query
 *
 * _K is not used but is required to complete the graph
 * _K define the attribute to use to load the related objects
 *
 * In SQL if current model is TableA and T is TableB, _K is the foreign key in TableB
 *
 * TODO Deduce attribute from the ModelParent on the other side when "" is used
 */
export type ModelRelated<
  T extends Storable,
  _K extends Extract<keyof T, FilterAttributes<T, ModelLinker>> | "" = ""
> = {
  /**
   * Query the related objects
   * @param query
   * @returns
   */
  query: (query?: string) => Promise<{ results: T[]; continuationToken?: string }>;
  /**
   *
   * @param model Iterate through all related objects
   * @returns
   */
  forEach: (model: T) => Promise<void>;
  /**
   * Iterate through linked objects
   */
  iterate: (query: string) => AsyncIterable<T>;
  /**
   * Get all object linked
   * @returns
   */
  getAll: () => Promise<T[]>;

  /**
   * It is a helper and should not be serialized
   */
  toJSON(): null;
};

// Define a ModelLinked
export interface ModelLinker {
  WEBDA_ROLE: "ModelLinker";
}
/**
 * Define a link to n:1 or 1:1 relation on the current model to another model
 *
 * T is the model to link to
 *
 * This is expected to be the symetric of ModelRelated or ModelLink in a 1:1 relation
 *
 * ```
 * class Album extends Model {
 *  artist: ModelLink<Artist>;
 * }
 * ```
 */
export class ModelLink<T extends Storable> implements ModelLinker {
  WEBDA_ROLE: "ModelLinker" = "ModelLinker" as const;
  /**
   * Parent of the link
   *
   * In our example, the parent is the Album
   */
  @NotEnumerable
  protected parent: Storable;

  constructor(
    /**
     * The uuid of the object to link
     *
     * In our example, the uuid of the Artist
     */
    protected uuid: PrimaryKeyType<T>,
    /**
     * The repository of the object to link
     */
    protected model: Repository<T>,
    parent?: Storable
  ) {
    this.parent = parent!;
  }

  async get(): Promise<T> {
    return await this.model.get(this.uuid);
  }

  set(id: PrimaryKeyType<T> | T) {
    this.uuid = isStorable(id) ? id.getPrimaryKey() : id;
    // Set dirty for parent
    this.parent?.__dirty.add(
      Object.keys(this.parent)
        .filter(k => this.parent[k] === this)
        .pop()!
    );
  }

  toString(): string {
    return this.uuid.toString();
  }

  toJSON(): PrimaryKeyType<T> {
    return this.uuid;
  }

  getPrimaryKey(): PrimaryKeyType<T> {
    return this.uuid;
  }
}

/**
 * Define the parent of the model
 *
 * Similar to @ModelLink but implies a Cascade delete
 */
export type ModelParent<T extends Storable> = ModelLink<T>;

/**
 * Methods that allow to manage a collection of linked objects
 */
type ModelCollectionManager<T> = {
  /**
   * Add a linked object
   * @param model
   * @returns
   */
  add: (model: T) => void;
  /**
   * Remove a linked object
   * @param model the model to remove or its uuid
   * @returns
   */
  remove: (model: T) => void;
};

/**
 * Link to a collection of objects
 *
 * This allows to do a n:m or 1:n relation between two models
 *
 * It does not require to have a symetric relation on the other side
 * The array contains uuid of the linked objects
 */
export class ModelLinksSimpleArray<T extends Storable> extends Array<ModelRef<T>> implements ModelLinker {
  WEBDA_ROLE: "ModelLinker" = "ModelLinker" as const;
  @NotEnumerable
  private parent: T;

  constructor(
    protected model: Repository<T>,
    content: PrimaryKeyType<T>[] = [],
    parent?: T
  ) {
    super();
    content.forEach(c => this.add(c));
    this.parent = parent!;
  }

  protected getModelRef(model: string | PrimaryKeyType<T> | ModelRef<T> | T) {
    let modelRef: ModelRef<T>;
    if (typeof model === "string") {
      modelRef = new ModelRef<T>(this.model.fromUUID(model));
    } else if (model instanceof ModelRef) {
      modelRef = model;
    } else {
      modelRef = new ModelRef<T>(model, this.model, this.parent);
    }
    return modelRef;
  }

  add(model: string | PrimaryKeyType<T> | ModelRef<T> | T) {
    this.push(this.getModelRef(model));
    this.parent?.__dirty.add(
      Object.keys(this.parent)
        .filter(k => this.parent[k] === this)
        .pop()!
    );
  }

  remove(model: string | ModelRef<T> | PrimaryKeyType<T> | T) {
    const uuid = this.getModelRef(model).getPrimaryKey().toString();
    const index = this.findIndex(m => m.toString() === uuid);
    if (index >= 0) {
      this.splice(index, 1);
    }
    this.parent?.__dirty.add(
      Object.keys(this.parent)
        .filter(k => this.parent[k] === this)
        .pop()!
    );
  }

  /**
   *
   * @returns
   */
  toJSON(): PrimaryKeyType<T>[] {
    return this.map(m => m.getPrimaryKey());
  }
}

type ModelRefCustomProperties<T extends Storable, K> = ModelRef<T> & {
  [key in keyof K]: K[key];
} & {
  toJSON(): K & PrimaryKey<T>;
};

/**
 * ModelRef with custom properties
 *
 * This is used to define a link to a collection of objects with additional data
 *
 * It does not require to have a symetric relation on the other side
 * The array contains uuid of the linked objects and additional properties defined as K
 *
 * Sample usage:
 * ```typescript
 * class MyModel extends AbstractCoreModel {
 *   _links: ModelLinksArray<OtherModel, { custom: string }>;
 * }
 * ```
 */
class ModelRefCustom<T extends Storable, K> extends ModelRef<T> {
  constructor(
    protected $$key: PrimaryKeyType<T>,
    protected $$model: Repository<T>,
    protected $$data: K,
    protected $$parent?: Storable
  ) {
    super($$key, $$model, $$parent);
    if (
      $$data["key"] !== undefined ||
      $$data["parent"] !== undefined ||
      $$data["model"] !== undefined ||
      $$data["data"] !== undefined
    ) {
      throw new Error("$$key,$$parent,$$model,$$data are reserved keywords");
    }
    Object.assign(this, $$data);
    // We might want to explore moving data in sub-classes
  }

  toJSON(): K & PrimaryKey<T> {
    return <K & PrimaryKey<T>>this.$$data;
  }
}

/**
 * Link to a collection of objects including some additional data
 *
 * It does not require to have a symetric relation on the other side
 * The array contains uuid of the linked objects and additional properties defined as K
 *
 * Sample usage:
 * ```typescript
 * class MyModel extends AbstractCoreModel {
 *   _links: ModelLinksArray<OtherModel, { custom: string }>;
 * }
 * ```
 */
export class ModelLinksArray<T extends Storable, K>
  extends Array<ModelRefCustomProperties<T, K>>
  implements ModelLinker
{
  WEBDA_ROLE: "ModelLinker" = "ModelLinker" as const;
  @NotEnumerable
  parent: T;
  constructor(
    protected model: Repository<T>,
    content: (PrimaryKey<T> & K)[] = [],
    parent?: T
  ) {
    super();
    this.parent = parent!;
    this.push(
      ...content.map(
        c =>
          <ModelRefCustomProperties<T, K>>(
            (<unknown>new ModelRefCustom<T, K>(model.getPrimaryKey(c), model, c, this.parent))
          )
      )
    );
  }

  add(model: JSONed<ModelRefCustomProperties<T, K>>) {
    this.push(<ModelRefCustomProperties<T, K & ({ uuid: string } | { getUuid: () => string })>>model);
    this.parent?.__dirty.add(
      Object.keys(this.parent)
        .filter(k => this.parent[k] === this)
        .pop()!
    );
  }

  remove(model: ModelRefCustomProperties<T, K> | PrimaryKeyType<T> | T) {
    const uuid = typeof model["getPrimaryKey"] === "function" ? model["getPrimaryKey"]() : model;
    const index = this.findIndex(m => PrimaryKeyEquals(m.getPrimaryKey(), uuid));
    if (index >= 0) {
      this.splice(index, 1);
      this.parent?.__dirty.add(
        Object.keys(this.parent)
          .filter(k => this.parent[k] === this)
          .pop()!
      );
    }
  }

  /**
   *
   * @returns
   */
  toJSON(): JSONed<ModelRefCustomProperties<T, K>>[] {
    return <any>this;
  }
}

/**
 * Define 1:n or n:m relation with some sort of additional data or duplicated data
 *
 * The key of the map is the value of the FK
 * This is similar to ModelLinksArray but the key is used to store the data
 *
 * T is the target model
 * K is the additional data to store
 * L is the attribute to duplicate from the target model, it can be empty
 *
 * @deprecated Use ModelLinksArray instead
 * @see ModelLinksArray
 */
export type ModelLinksMap<T extends Storable, K, L extends keyof T = undefined> = Readonly<{
  [key: string]: ModelRefCustomProperties<T, K & { [key in L]: T[L] }>;
}> &
  ModelCollectionManager<PrimaryKey<T> & K & { [key in L]: T[L] }> &
  ModelLinker & {
    toJSON(): {
      [key: string]: Omit<JSONed<ModelRefCustomProperties<T, K & { [key in L]: T[L] }>>, keyof PrimaryKey<T>>;
    };
  };

export function createModelLinksMap<T extends Storable = Storable>(model: Repository<T>, data: any = {}, parent?: T) {
  const result = {
    add: (model: ModelRefCustomProperties<T, any>) => {
      result[model.uuid || model.getUuid()] = model;
      parent?.__dirty.add(
        Object.keys(parent)
          .filter(k => parent[k] === result)
          .pop()!
      );
    },
    remove: (model: ModelRefCustomProperties<T, any> | string) => {
      // @ts-ignore
      const uuid = typeof model === "string" ? model : model.uuid || model.getUuid();
      delete result[uuid];
      parent?.__dirty.add(
        Object.keys(parent)
          .filter(k => parent[k] === result)
          .pop()!
      );
    }
  };
  Object.keys(data)
    .filter(k => k !== "__proto__")
    .forEach(key => {
      result[key] = new ModelRefCustom(data[key].uuid, model, data[key], parent!);
    });
  Object.defineProperty(result, "add", { enumerable: false });
  Object.defineProperty(result, "remove", { enumerable: false });
  return result;
}

/**
 * Define a ModelMap attribute
 *
 * K is used by the compiler to define the field it comes from
 *
 * This will instructed a ModelMapper to deduplicate information from the T model into this
 * current model attribute.
 *
 * The attribute where the current model uuid is found is defined by K
 * The attributes to dedepulicate are defined by the L type
 *
 * In the T model, the K attribute should be of type ModelLink
 *
 * This is used for NoSQL model where you need to denormalize data
 * Webda will auto update the current model when the T model is updated
 * to keep the data in sync
 *
 * A SQL Store should define a JOIN to get the data with auto-fetch2
 */
export type ModelsMapped<
  T extends Storable,
  // Do not remove used by the compiler
  K extends FilterAttributes<T, ModelLinker>,
  L extends Attributes<T>
> = Readonly<ModelMapLoader<T, L>[]>;

/**
 * Mapper attribute (target of a Mapper service)
 *
 * This is not exported as when mapped the target is always an array
 * TODO Handle 1:1 map
 */
export class ModelMapLoaderImplementation<T extends Storable, K = any> {
  @NotEnumerable
  protected _model: Repository<T>;
  @NotEnumerable
  protected _parent: Storable;
  /**
   * The uuid of the object
   */
  public uuid: PrimaryKeyType<T>;

  constructor(model: Repository<T>, data: PrimaryKeyType<T> & K, parent: T) {
    Object.assign(this, data);
    this._model = model;
    this._parent = parent;
  }

  /**
   *
   * @returns the model
   */
  async get(): Promise<T> {
    return this._model.get(this.uuid);
  }
}

/**
 * Mapper attribute (target of a Mapper service)
 *
 * This is not exported as when mapped the target is always an array
 * TODO Handle 1:1 map
 */
export type ModelMapLoader<T extends Storable, K extends keyof T> = ModelMapLoaderImplementation<T, K> & Pick<T, K>;

export type ManyToOne<T extends Storable> = ModelLink<T>;
export type OneToMany<T extends Storable> = ModelRelated<T>;
export type OneToOne<T extends Storable> = ModelLink<T>;
export type ManyToMany<T extends Storable, K extends object = null> = K extends object
  ? ModelLinksArray<T, K>
  : ModelLinksSimpleArray<T>;

export type BelongTo<T extends Storable> = ModelParent<T>;
export type RelateTo<T extends Storable> = ModelLink<T>;
export type Contains<T extends Storable> = ModelLinksSimpleArray<T> | ModelLinksArray<T, any> | ModelLinksMap<T, any>;

export type OneToMany2<T extends Storable, K extends object | never = never> = K extends never
  ? ModelRef<T>
  : ModelRefCustom<T, K>[];

export type ManyToMany2<T extends Storable, K extends object | never = never> = K extends never
  ? ModelLinksSimpleArray<T>
  : ModelLinksArray<T, K>;

export type ManyToOne2<T extends Storable, K extends object | never = never> = K extends never
  ? ModelLink<T>
  : ModelRefCustom<T, K>;

export type OneToOne2<T extends Storable, K extends object | never = never> = K extends never
  ? ModelLink<T>
  : ModelRefCustom<T, K>;
