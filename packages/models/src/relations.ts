import { Attributes, FilterAttributes, NotEnumerable, ArrayElement, OmitPrefixed } from "@webda/tsc-esm";
import {
  isStorable,
  PrimaryKeyType,
  Storable,
  StorableAttributes,
  JSONed,
  PrimaryKey,
  PrimaryKeyEquals,
  JSONedAttributes,
  AttributesArgument,
  PrimaryKeyAttributes,
  UpdatableAttributes,
  PK
} from "./storable";
import type { Repository } from "./repository";
import { Model } from "./model";

/**
 * A reference to a model
 */
export class ModelRef<T extends Storable> {
  constructor(
    protected __WEBDA_KEY: PrimaryKeyType<T>,
    protected __WEBDA_REPOSITORY?: Repository<T>,
    protected __WEBDA_PARENT_OBJECT?: Storable
  ) {}

  /**
   * Get the model
   */
  getPrimaryKey(): PrimaryKeyType<T> {
    return this.__WEBDA_KEY;
  }

  /**
   *
   * @returns
   */
  toJSON(): PrimaryKeyType<T> {
    return <PrimaryKeyType<T>>this.__WEBDA_KEY;
  }

  /**
   * Set the attribute of the model
   * @param attribute
   * @param value
   * @returns
   */
  setAttribute<A extends UpdatableAttributes<T>>(attribute: A, value: JSONed<T[A]>): Promise<void> {
    return this.__WEBDA_REPOSITORY.setAttribute(this.__WEBDA_KEY, attribute, value as any);
  }

  /**
   * Patch the model
   * @param data
   * @param conditionField
   * @param condition
   * @returns
   */
  patch<A extends StorableAttributes<T>>(
    data: Partial<JSONedAttributes<T>>,
    conditionField?: A,
    condition?: T[A] | JSONed<T[A]>
  ): Promise<void> {
    return this.__WEBDA_REPOSITORY.patch(this.__WEBDA_KEY, data, conditionField, condition);
  }

  /**
   * Patch the model
   * @param data
   * @param conditionField
   * @param condition
   * @returns
   */
  update<A extends StorableAttributes<T>>(
    data: JSONedAttributes<T>,
    conditionField?: A,
    condition?: T[A]
  ): Promise<void> {
    return this.__WEBDA_REPOSITORY.update(this.__WEBDA_KEY, data, conditionField, condition);
  }

  /**
   * Get the model referenced by the key
   * @returns
   */
  get(): Promise<T> {
    return this.__WEBDA_REPOSITORY.get(this.__WEBDA_KEY);
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
    return this.__WEBDA_REPOSITORY.delete(this.__WEBDA_KEY, conditionField, condition);
  }

  /**
   * Check if the model exists in the repository
   * @returns
   */
  exists(): Promise<boolean> {
    return this.__WEBDA_REPOSITORY.exists(this.__WEBDA_KEY);
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
      | (UpdatableAttributes<T, number> | { property: UpdatableAttributes<T, number>; value?: number })[]
      | Record<UpdatableAttributes<T, number>, number>,
    conditionField?: StorableAttributes<T, any>,
    condition?: T[StorableAttributes<T, any>]
  ): Promise<void> {
    return this.__WEBDA_REPOSITORY.incrementAttributes(this.__WEBDA_KEY, info, conditionField, condition);
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
    return this.__WEBDA_REPOSITORY.upsertItemToCollection(
      this.__WEBDA_KEY,
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
    return this.__WEBDA_REPOSITORY.deleteItemFromCollection(
      this.__WEBDA_KEY,
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
    attribute: Exclude<StorableAttributes<T, any>, PrimaryKeyAttributes<T>>,
    conditionField?: A,
    condition?: T[A]
  ): Promise<void> {
    return this.__WEBDA_REPOSITORY.removeAttribute(this.__WEBDA_KEY, attribute, conditionField, condition);
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
    property: UpdatableAttributes<T, number>,
    value?: number,
    conditionField?: StorableAttributes<T, any>,
    condition?: T[StorableAttributes<T, any>]
  ): Promise<void> {
    return this.incrementAttributes([{ property: property, value: value }], conditionField, condition);
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
    return this.__WEBDA_REPOSITORY.upsert(this.__WEBDA_KEY, data as any);
  }
  /**
   * Create a model reference
   *
   * It will fail if the model already exists
   * @param data
   * @returns
   */
  create(data: Omit<AttributesArgument<T>, T["PrimaryKey"][number]>): Promise<T> {
    return this.__WEBDA_REPOSITORY.create(this.__WEBDA_KEY, data as any);
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
    this.parent?.__WEBDA_DIRTY.add(
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
  private parentObject: T;

  constructor(
    protected repo: Repository<T>,
    content: PrimaryKeyType<T>[] = [],
    parentObject?: T
  ) {
    super();
    content.forEach(c => this.push(c));
    this.parentObject = parentObject!;
  }

  protected getModelRef(model: string | PrimaryKeyType<T> | ModelRef<T> | T) {
    let modelRef: ModelRef<T>;
    if (typeof model === "string") {
      modelRef = new ModelRef<T>(this.repo.fromUUID(model), this.repo);
    } else if (model instanceof ModelRef) {
      modelRef = model;
    } else if (isStorable(model)) {
      modelRef = new ModelRef<T>(model.getPrimaryKey(), this.repo, this.parentObject);
    } else {
      modelRef = new ModelRef<T>(model, this.repo, this.parentObject);
    }
    return modelRef;
  }

  /**
   * @inheritdoc
   */
  push(...items: (string | PrimaryKeyType<T> | ModelRef<T> | T)[]): number {
    const result = super.push(...items.map(i => this.getModelRef(i)));
    this.setDirty();
    return result;
  }

  /**
   * @inheritdoc
   */
  unshift(...items: (string | PrimaryKeyType<T> | ModelRef<T> | T)[]): number {
    const result = super.unshift(...items.map(i => this.getModelRef(i)));
    this.setDirty();
    return result;
  }

  /**
   * @inheritdoc
   */
  pop(): ModelRef<T> {
    const result = super.pop();
    this.setDirty();
    return result;
  }

  /**
   * @inheritdoc
   */
  shift(): ModelRef<T> {
    const result = super.shift();
    this.setDirty();
    return result;
  }

  /**
   * Add a model to the collection
   * @param model
   * @returns
   * @deprecated use push instead
   */
  add(model: string | PrimaryKeyType<T> | ModelRef<T> | T) {
    this.push(model);
  }

  /**
   * Set the collection to a new set of items
   * @param items
   */
  set(items?: (string | PrimaryKeyType<T> | ModelRef<T> | T)[]): void {
    this.splice(0, this.length, ...(items?.map(i => this.getModelRef(i)) || []));
    this.setDirty();
  }

  setDirty() {
    const attrName = this.parentObject
      ? Object.keys(this.parentObject)
          .filter(k => this.parentObject[k] === this)
          .pop()
      : undefined;
    if (!attrName) {
      return;
    }
    this.parentObject.__WEBDA_DIRTY?.add(attrName);
  }

  remove(model: string | ModelRef<T> | PrimaryKeyType<T> | T) {
    const uuid = this.getModelRef(model).getPrimaryKey().toString();
    const index = this.findIndex(m => m.getPrimaryKey() === uuid);
    if (index >= 0) {
      this.splice(index, 1);
      this.setDirty();
    }
  }

  /**
   *
   * @returns
   */
  toJSON(): PrimaryKeyType<T>[] {
    return this.map(m => m.getPrimaryKey());
  }
}

type ModelRefCustomProperties<T extends Storable, K extends object> = ModelRef<T> & {
  [key in keyof K]: K[key];
} & {
  toJSON(): JSONed<K> & PrimaryKey<T>;
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
  @NotEnumerable
  protected __WEBDA_KEY: PrimaryKeyType<T>;
  @NotEnumerable
  protected __WEBDA_REPO: Repository<T>;
  @NotEnumerable
  protected __WEBDA_DATA: K;
  @NotEnumerable
  protected __WEBDA_PARENT_OBJECT?: Storable;

  constructor(__WEBDA_KEY: PrimaryKeyType<T>, __WEBDA_REPO: Repository<T>, __WEBDA_DATA: K, __WEBDA_PARENT?: Storable) {
    super(__WEBDA_KEY, __WEBDA_REPO, __WEBDA_PARENT);
    if (
      __WEBDA_DATA["__WEBDA_KEY"] !== undefined ||
      __WEBDA_DATA["__WEBDA_PARENT"] !== undefined ||
      __WEBDA_DATA["__WEBDA_MODEL"] !== undefined ||
      __WEBDA_DATA["__WEBDA_DATA"] !== undefined
    ) {
      throw new Error("__WEBDA_* are reserved keywords");
    }
    this.__WEBDA_KEY = __WEBDA_KEY;
    this.__WEBDA_REPO = __WEBDA_REPO;
    this.__WEBDA_PARENT_OBJECT = __WEBDA_PARENT;
    this.__WEBDA_DATA = __WEBDA_DATA;
    Object.assign(this, __WEBDA_DATA);
    // We might want to explore moving data in sub-classes
  }

  toJSON(): K & PrimaryKey<T> {
    let res: any = {};
    for (let i in this) {
      if (i.startsWith("__WEBDA_")) {
        continue;
      }
      res[i] = this[i];
    }
    return res;
  }
}

// Your specific version
export type CleanWebda<T> = OmitPrefixed<T, "__WEBDA_">;

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
export class ModelLinksArray<T extends Storable, K extends object>
  extends Array<ModelRefCustomProperties<T, K>>
  implements ModelLinker
{
  @NotEnumerable
  WEBDA_ROLE: "ModelLinker" = "ModelLinker" as const;
  @NotEnumerable
  protected parentObject: T;
  constructor(
    protected repo: Repository<T>,
    content: (PrimaryKey<T> & K)[] = [],
    parentObject?: T
  ) {
    super();
    this.parentObject = parentObject!;
    this.push(
      ...content.map(
        c =>
          <ModelRefCustomProperties<T, K>>(
            (<unknown>new ModelRefCustom<T, K>(repo.getPrimaryKey(c), repo, c, this.parentObject))
          )
      )
    );
  }

  /**
   * Add a model to the collection
   * @param model
   * @returns
   * @deprecated use push instead
   */
  add(model: JSONed<ModelRefCustomProperties<T, K>>) {
    this.push(
      new ModelRefCustom<T, K>(this.repo.getPrimaryKey(model), this.repo, model as any, this.parentObject) as any
    );
  }

  /**
   * @inheritdoc
   */
  push(...items: (ModelRefCustomProperties<T, K> | JSONed<ModelRefCustomProperties<T, K>>)[]) {
    const result = super.push(...items.map(i => this.getModelRef(i)));
    this.setDirty();
    return result;
  }

  /**
   * @inheritdoc
   */
  pop(): ModelRefCustomProperties<T, K> {
    const result = super.pop();
    this.setDirty();
    return result;
  }

  /**
   * @inheritdoc
   */
  shift(): ModelRefCustomProperties<T, K> {
    const result = super.shift();
    this.setDirty();
    return result;
  }

  getModelRef(
    model: ModelRefCustomProperties<T, K> | JSONed<ModelRefCustomProperties<T, K>>
  ): ModelRefCustomProperties<T, K> {
    return <any>(
      (model instanceof ModelRefCustom
        ? model
        : new ModelRefCustom<T, K>(this.repo.getPrimaryKey(model), this.repo, model as any, this.parentObject))
    );
  }

  /**
   * @inheritdoc
   */
  splice(
    start: unknown,
    deleteCount?: unknown,
    ...rest: (ModelRefCustomProperties<T, K> | JSONed<ModelRefCustomProperties<T, K>>)[]
  ): ModelRefCustomProperties<T, K>[] {
    const result = super.splice(start as number, deleteCount as number, ...rest.map(i => this.getModelRef(i)));
    this.setDirty();
    return result;
  }

  /**
   * @inheritdoc
   */
  unshift(...items: (ModelRefCustomProperties<T, K> | JSONed<ModelRefCustomProperties<T, K>>)[]): number {
    const result = super.unshift(...items.map(i => this.getModelRef(i)));
    this.setDirty();
    return result;
  }

  setDirty() {
    const attrName = this.parentObject
      ? Object.keys(this.parentObject)
          .filter(k => this.parentObject[k] === this)
          .pop()!
      : undefined;
    if (!attrName) {
      return;
    }
    this.parentObject.__WEBDA_DIRTY?.add(attrName);
  }

  /**
   * @inheritdoc
   */
  remove(model: ModelRefCustomProperties<T, K> | PrimaryKeyType<T> | T) {
    const uuid = typeof model["getPrimaryKey"] === "function" ? model["getPrimaryKey"]() : model;
    const index = this.findIndex(m => PrimaryKeyEquals(m.getPrimaryKey(), uuid));
    if (index >= 0) {
      this.splice(index, 1);
      this.setDirty();
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

/**
 * Define a ModelRef with custom properties for map
 * Exclude the PrimaryKey from the JSON
 *
 * @deprecated
 */
export class ModelRefCustomMap<T extends Storable, K> extends ModelRefCustom<T, K> {
  toJSON(): any {
    return this.__WEBDA_DATA || {};
  }
}

export function createModelLinksMap<T extends Storable = Storable, K extends object = object>(
  repo: Repository<T>,
  data: any = {},
  parent?: T
) {
  let setDirty = () => {
    const attrName = parent
      ? Object.keys(parent)
          .filter(k => parent[k] === result)
          .pop()!
      : undefined;
    if (!attrName) {
      return;
    }
    parent.__WEBDA_DIRTY?.add(attrName);
  };
  const result = {
    add: (model: JSONed<ModelRefCustomProperties<T, K>>) => {
      const uuid = repo.getUUID(model);
      const pk = repo.getPrimaryKey(model);
      result[uuid] = new ModelRefCustomMap(pk, repo, repo.excludePrimaryKey(model), parent!);
      setDirty();
    },
    remove: (model: ModelRefCustomProperties<T, any> | PrimaryKeyType<T>) => {
      const uuid = repo.getUUID(model);
      if (!result[uuid]) {
        return;
      }
      delete result[uuid];
      setDirty();
    }
  };
  Object.keys(data)
    .filter(k => k !== "__proto__")
    .forEach(key => {
      data[key] = new ModelRefCustomMap(repo.fromUUID(key), repo, data[key], parent!);
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

  constructor(model: Repository<T>, data: PrimaryKey<T> & K, parent: T) {
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
