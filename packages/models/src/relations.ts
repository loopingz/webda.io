import { Attributes, FilterAttributes, ArrayElement, OmitPrefixed } from "@webda/tsc-esm";
import {
  isStorable,
  PrimaryKeyType,
  Storable,
  StorableAttributes,
  JSONed,
  PrimaryKey,
  PrimaryKeyEquals,
  AttributesArgument,
  PrimaryKeyAttributes,
  UpdatableAttributes,
  WEBDA_PRIMARY_KEY,
  WEBDA_DIRTY,
  SelfJSONed,
  StorableClass
} from "./storable";
import type { Repository } from "./repositories/repository";

const RelationParent = Symbol("RelationParent");
const RelationKey = Symbol("RelationKey");
const RelationRepository = Symbol("RelationRepository");
const RelationRole = Symbol("RelationRole");
const RelationData = Symbol("RelationData");

/**
 * Assign non symbol properties from source to target
 * @param target
 * @param source
 */
export function assignNonSymbols(target, source) {
  Object.keys(source).forEach(key => {
    target[key] = source[key];
  });
}

/**
 * A reference to a model
 */
export class ModelRef<T extends Storable> {
  [RelationParent]?: Storable;
  [RelationKey]?: PrimaryKeyType<T>;
  [RelationRepository]?: Repository<StorableClass<T>>;

  constructor(key: PrimaryKeyType<T>, repository?: Repository<StorableClass<T>>, parent?: Storable) {
    this[RelationParent] = parent;
    this[RelationKey] = key;
    this[RelationRepository] = repository;
  }

  /**
   * Get the model
   */
  getPrimaryKey(): PrimaryKeyType<T> {
    return this[RelationKey];
  }

  /**
   *
   * @returns
   */
  toJSON(): PrimaryKeyType<T> {
    return <PrimaryKeyType<T>>this[RelationKey];
  }

  /**
   * Set the attribute of the model
   * @param attribute
   * @param value
   * @returns
   */
  setAttribute<A extends UpdatableAttributes<T>>(attribute: A, value: JSONed<T[A]>): Promise<void> {
    return this[RelationRepository].setAttribute(this[RelationKey], attribute, value as any);
  }

  /**
   * Patch the model
   * @param data
   * @param conditionField
   * @param condition
   * @returns
   */
  patch<A extends StorableAttributes<T>>(
    data: Partial<SelfJSONed<T>>,
    conditionField?: A,
    condition?: T[A] | JSONed<T[A]>
  ): Promise<void> {
    return this[RelationRepository].patch(this[RelationKey], data, conditionField, condition);
  }

  /**
   * Patch the model
   * @param data
   * @param conditionField
   * @param condition
   * @returns
   */
  update<A extends StorableAttributes<T>>(data: SelfJSONed<T>, conditionField?: A, condition?: T[A]): Promise<void> {
    return this[RelationRepository].update({ ...data, ...this[RelationKey] }, conditionField, condition);
  }

  /**
   * Get the model referenced by the key
   * @returns
   */
  get(): Promise<T> {
    return this[RelationRepository].get(this[RelationKey]) as Promise<T>;
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
    return this[RelationRepository].delete(this[RelationKey], conditionField, condition);
  }

  /**
   * Check if the model exists in the repository
   * @returns
   */
  exists(): Promise<boolean> {
    return this[RelationRepository].exists(this[RelationKey]);
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
    return this[RelationRepository].incrementAttributes(this[RelationKey], info, conditionField, condition);
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
    itemWriteConditionField?: ArrayElement<T[K]> extends object ? L : never,
    itemWriteCondition?: ArrayElement<T[K]> extends object ? ArrayElement<T[K]>[L] : ArrayElement<T[K]> | null
  ): Promise<void> {
    return this[RelationRepository].upsertItemToCollection(
      this[RelationKey],
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
    return this[RelationRepository].deleteItemFromCollection(
      this[RelationKey],
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
    return this[RelationRepository].removeAttribute(this[RelationKey], attribute, conditionField, condition);
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
  upsert(data: Omit<JSONed<T>, T[typeof WEBDA_PRIMARY_KEY][number]>): Promise<T> {
    return this[RelationRepository].upsert({
      ...data,
      ...this[RelationRepository].getPrimaryKey(this[RelationKey], true)
    });
  }
  /**
   * Create a model reference
   *
   * It will fail if the model already exists
   * @param data
   * @returns
   */
  create(data: Omit<AttributesArgument<T>, T[typeof WEBDA_PRIMARY_KEY][number]>): Promise<T> {
    return this[RelationRepository].create({
      ...data,
      ...this[RelationRepository].getPrimaryKey(this[RelationKey], true)
    });
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
  [RelationRole]: "ModelLinker";
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
  [RelationRole]: "ModelLinker" = "ModelLinker" as const;
  /**
   * Parent of the link
   *
   * In our example, the parent is the Album
   */
  protected [RelationParent]: Storable;
  protected [RelationKey]: PrimaryKeyType<T>;

  constructor(
    /**
     * The uuid of the object to link
     *
     * In our example, the uuid of the Artist
     */
    uuid: PrimaryKeyType<T> | string,
    /**
     * The repository of the object to link
     */
    protected model: Repository<StorableClass<T>>,
    parent?: Storable
  ) {
    this[RelationParent] = parent!;
    this[RelationKey] = typeof uuid === "string" ? model.parseUUID(uuid) : uuid;
  }

  async get(): Promise<T> {
    return await this.model.get(this[RelationKey]);
  }

  set(id: PrimaryKeyType<T> | T | string) {
    this[RelationKey] = isStorable(id) ? id.getPrimaryKey() : typeof id === "string" ? this.model.parseUUID(id) : id;
    // Set dirty for parent
    this[RelationParent]?.[WEBDA_DIRTY].add(
      Object.keys(this[RelationParent])
        .filter(k => this[RelationParent][k] === this)
        .pop()!
    );
  }

  toString(): string {
    return this[RelationKey].toString();
  }

  toJSON(): PrimaryKeyType<T> {
    return this[RelationKey];
  }

  getPrimaryKey(): PrimaryKeyType<T> {
    return this[RelationKey];
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
  [RelationRole]: "ModelLinker" = "ModelLinker" as const;
  private [RelationParent]: T;
  protected [RelationRepository]: Repository<StorableClass<T>>;

  constructor(repo: Repository<StorableClass<T>>, content: PrimaryKeyType<T>[] = [], parentObject?: T) {
    super();
    this[RelationRepository] = repo;
    content.forEach(c => this.push(c));
    this[RelationParent] = parentObject!;
  }

  protected getModelRef(model: string | PrimaryKeyType<T> | ModelRef<T> | T) {
    let modelRef: ModelRef<T>;
    if (typeof model === "string") {
      modelRef = new ModelRef<T>(this[RelationRepository].parseUUID(model), this[RelationRepository]);
    } else if (model instanceof ModelRef) {
      modelRef = model;
    } else if (isStorable(model)) {
      modelRef = new ModelRef<T>(model.getPrimaryKey(), this[RelationRepository], this[RelationParent]);
    } else {
      modelRef = new ModelRef<T>(model, this[RelationRepository], this[RelationParent]);
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
    const attrName = this[RelationParent]
      ? Object.keys(this[RelationParent])
          .filter(k => this[RelationParent][k] === this)
          .pop()
      : undefined;
    if (!attrName) {
      return;
    }
    this[RelationParent]?.[WEBDA_DIRTY].add(attrName);
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
  protected [RelationData]: K;

  constructor(key: PrimaryKeyType<T>, repo: Repository<StorableClass<T>>, data: K, parent?: Storable) {
    super(key, repo, parent);
    this[RelationData] = data;
    assignNonSymbols(this, data);
    // We might want to explore moving data in sub-classes
  }

  toJSON(): K & PrimaryKey<T> {
    const res: any = {};
    for (const i in this) {
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
  [RelationRole]: "ModelLinker" = "ModelLinker" as const;
  protected [RelationParent]?: T;
  constructor(
    protected repo: Repository<StorableClass<T>>,
    content: (PrimaryKey<T> & K)[] = [],
    parentObject?: T
  ) {
    super();
    this[RelationParent] = parentObject!;
    this.push(
      ...content.map(
        c =>
          <ModelRefCustomProperties<T, K>>(
            (<unknown>new ModelRefCustom<T, K>(repo.getPrimaryKey(c), repo, c, this[RelationParent]))
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
      new ModelRefCustom<T, K>(this.repo.getPrimaryKey(model), this.repo, model as any, this[RelationParent]) as any
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
        : new ModelRefCustom<T, K>(this.repo.getPrimaryKey(model), this.repo, model as any, this[RelationParent]))
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
    const attrName = this[RelationParent]
      ? Object.keys(this[RelationParent])
          .filter(k => this[RelationParent][k] === this)
          .pop()!
      : undefined;
    if (!attrName) {
      return;
    }
    this[RelationParent]?.[WEBDA_DIRTY].add(attrName);
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
    return this[RelationData] || {};
  }
}

export function createModelLinksMap<T extends Storable = Storable, K extends object = object>(
  repo: Repository<StorableClass<T>>,
  data: any = {},
  parent?: T
) {
  const setDirty = () => {
    const attrName = parent
      ? Object.keys(parent)
          .filter(k => parent[k] === result)
          .pop()!
      : undefined;
    if (!attrName) {
      return;
    }
    parent?.[WEBDA_DIRTY]?.add(attrName);
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
      data[key] = new ModelRefCustomMap(repo.parseUUID(key), repo, data[key], parent!);
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
  protected [RelationRepository]: Repository<StorableClass<T>>;
  protected [RelationParent]?: Storable;
  /**
   * The uuid of the object
   */
  public uuid: PrimaryKeyType<T>;

  constructor(model: Repository<StorableClass<T>>, data: PrimaryKey<T> & K, parent: T) {
    assignNonSymbols(this, data);
    this[RelationRepository] = model;
    this[RelationParent] = parent;
  }

  /**
   *
   * @returns the model
   */
  async get(): Promise<T> {
    return this[RelationRepository].get(this.uuid);
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
