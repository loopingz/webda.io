import { FilterAttributes, ArrayElement } from "@webda/tsc-esm";
import {
  isStorable,
  PrimaryKeyType,
  Storable,
  PrimaryKey,
  PrimaryKeyEquals,
  AttributesArgument,
  PrimaryKeyAttributes,
  WEBDA_PRIMARY_KEY,
  ModelClass
} from "./storable";
import type { JSONed, Helpers, PropertyPaths, PropertyPathType, NumericPropertyPaths } from "./types";
import type { Repository } from "./repositories/repository";
import { useRepository } from "./repositories/hooks";
import * as WebdaQL from "@webda/ql";
import type { WebdaQLString } from "@webda/ql";

/** Symbol key holding the parent Storable of a relation. */
//export const RelationParent = Symbol("RelationParent");
/** Symbol key holding the primary key value of a relation target. */
export const RelationKey = Symbol("RelationKey");
/** Symbol key holding the repository used to resolve a relation. */
export const RelationRepository = Symbol("RelationRepository");
/** Symbol key identifying the role of a relation (Link, Related, Links, CustomLinks). */
export const RelationRole = Symbol("RelationRole");
/** Symbol key holding custom data on a ModelRefCustom. */
export const RelationData = Symbol("RelationData");
/** Symbol key holding the model. */
export const RelationModel = Symbol("RelationModel");
/** Symbol key holding the type of custom attributes on a ModelLinksArray. */
export const RelationAttributes = Symbol("RelationAttributes");
/**
 * Assign non symbol properties from source to target
 * @param target - the destination object
 * @param source - the source object
 */
export function assignNonSymbols(target: any, source: any) {
  Object.keys(source).forEach(key => {
    target[key] = source[key];
  });
}

/**
 * A reference to a model
 */
export class ModelRef<T extends Storable> {
  // [RelationParent]?: Storable;
  [RelationKey]?: PrimaryKeyType<T>;
  [RelationRepository]?: Repository<ModelClass<T>>;

  /**
   * Create a new model reference
   * @param key - Primary key of the referenced model
   * @param repository - Repository to resolve the reference against
   * @param parent - Parent storable that owns this reference
   */
  constructor(key: PrimaryKeyType<T>, repository?: Repository<ModelClass<T>>, parent?: Storable) {
    // this[RelationParent] = parent;
    this[RelationKey] = key;
    this[RelationRepository] = repository;
  }

  /**
   * Get the repository and ensure it's initialized
   * @returns the repository instance
   */
  protected getRepository(): Repository<ModelClass<T>> {
    if (!this[RelationRepository]) {
      throw new Error("Relation repository is not initialized");
    }
    return this[RelationRepository];
  }

  /**
   * Get the primary key and ensure it's initialized
   * @returns the primary key value
   */
  protected getKey(): PrimaryKeyType<T> {
    return this.getPrimaryKey();
  }

  /**
   * Get the model
   * @returns the primary key value
   */
  getPrimaryKey(): PrimaryKeyType<T> {
    if (!this[RelationKey]) {
      throw new Error("Relation key is not initialized");
    }
    return this[RelationKey];
  }

  /**
   * Serialize the reference to its primary key value
   * @returns the primary key value
   */
  toJSON(): PrimaryKeyType<T> {
    return this.getKey();
  }

  /**
   * Set the attribute of the model
   * @param attribute - the attribute path to set
   * @param value - the new attribute value
   * @returns a promise resolving when complete
   */
  setAttribute<A extends PropertyPaths<T>>(attribute: A, value: JSONed<PropertyPathType<T, A>>): Promise<void> {
    return this.getRepository().setAttribute(this.getKey(), attribute, value as any);
  }

  /**
   * Patch the model
   * @param data - the partial data to patch
   * @param conditionField - optional field for optimistic locking
   * @param condition - expected value for the condition field
   * @returns a promise resolving when complete
   */
  patch<K extends keyof T, A extends PropertyPaths<T>>(
    data: Partial<Omit<T, PrimaryKeyAttributes<T>>>,
    conditionField?: A,
    condition?: PropertyPathType<T, A>
  ): Promise<void> {
    return this.getRepository().patch(this.getKey(), data, conditionField, condition);
  }

  /**
   * Fully replace the model data (except primary key fields)
   * @param data - Complete model data excluding primary key
   * @param conditionField - Optional field for optimistic locking
   * @param condition - Expected value for the condition field
   * @returns a promise resolving when complete
   */
  update<A extends PropertyPaths<T>>(
    data: Omit<Helpers<T>, PrimaryKeyAttributes<T>>,
    conditionField?: A,
    condition?: PropertyPathType<T, A>
  ): Promise<void> {
    return this.getRepository().update({ ...data, ...this.getKey() } as Helpers<T>, conditionField, condition);
  }

  /**
   * Get the model referenced by the key
   * @returns the resolved model instance
   */
  get(): Promise<T> {
    return this.getRepository().get(this.getKey()) as Promise<T>;
  }

  /**
   * Delete the model
   *
   * If a condition is specified, it will be used to check if the model can be deleted
   *
   * @param conditionField - optional field for optimistic locking
   * @param condition - expected value for the condition field
   * @returns a promise resolving when complete
   */
  delete<A extends PropertyPaths<T>>(
    conditionField?: A,
    condition?: PropertyPathType<T, A> | JSONed<PropertyPathType<T, A>>
  ): Promise<void> {
    return this.getRepository().delete(this.getKey(), conditionField, condition);
  }

  /**
   * Check if the model exists in the repository
   * @returns true if the model exists
   */
  exists(): Promise<boolean> {
    return this.getRepository().exists(this.getKey());
  }

  /**
   * Increment the attributes of the model
   * @param info The attributes to increment
   * @param conditionField - optional field for optimistic locking
   * @param condition - expected value for the condition field
   * @returns a promise resolving when complete
   */
  incrementAttributes(
    info:
      | (NumericPropertyPaths<T> | { property: NumericPropertyPaths<T>; value?: number })[]
      | Record<NumericPropertyPaths<T>, number>,
    conditionField?: PropertyPaths<T>,
    condition?: PropertyPathType<T, PropertyPaths<T>>
  ): Promise<void> {
    return this.getRepository().incrementAttributes(this.getKey(), info, conditionField, condition);
  }
  /**
   * Add an item to a collection
   * @param collection - the collection field name
   * @param item - the item to add or update
   * @param index - optional position to insert at
   * @param itemWriteConditionField - optional field for item write condition
   * @param itemWriteCondition - expected value for the item write condition
   * @returns a promise resolving when complete
   */
  upsertItemToCollection<K extends Extract<PropertyPaths<T, any[]>, keyof T>, L extends keyof ArrayElement<T[K]>>(
    collection: K,
    item: ArrayElement<T[K]> | JSONed<ArrayElement<T[K]>>,
    index?: number,
    itemWriteConditionField?: ArrayElement<T[K]> extends object ? L : never,
    itemWriteCondition?: ArrayElement<T[K]> extends object ? ArrayElement<T[K]>[L] : ArrayElement<T[K]> | null
  ): Promise<void> {
    return this.getRepository().upsertItemToCollection(
      this.getKey(),
      collection,
      item,
      index,
      itemWriteConditionField,
      itemWriteCondition
    );
  }

  /**
   * Remove an item from a collection
   * @param collection - the collection field name
   * @param index - the position to remove from
   * @param itemWriteConditionField - optional field for item write condition
   * @param itemWriteCondition - expected value for the item write condition
   * @returns a promise resolving when complete
   */
  deleteItemFromCollection<K extends Extract<PropertyPaths<T, any[]>, keyof T>, L extends keyof ArrayElement<T[K]>>(
    collection: K,
    index: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: ArrayElement<T[K]>[L]
  ): Promise<void> {
    return this.getRepository().deleteItemFromCollection(
      this.getKey(),
      collection,
      index,
      itemWriteConditionField,
      itemWriteCondition
    );
  }

  /**
   * Remove an attribute from the model
   * @param attribute - the attribute to remove
   * @param conditionField - optional field for optimistic locking
   * @param condition - expected value for the condition field
   * @returns a promise resolving when complete
   */
  removeAttribute<A extends PropertyPaths<T>>(
    attribute: Exclude<PropertyPaths<T>, PrimaryKeyAttributes<T>>,
    conditionField?: A,
    condition?: PropertyPathType<T, A>
  ): Promise<void> {
    return this.getRepository().removeAttribute(this.getKey(), attribute, conditionField, condition);
  }
  /**
   * Increment only one attribute of the model
   * @param property - the numeric property to increment
   * @param value - the increment amount
   * @param conditionField - optional field for optimistic locking
   * @param condition - expected value for the condition field
   * @returns a promise resolving when complete
   */
  incrementAttribute(
    property: NumericPropertyPaths<T>,
    value?: number,
    conditionField?: PropertyPaths<T>,
    condition?: PropertyPathType<T, PropertyPaths<T>>
  ): Promise<void> {
    return this.incrementAttributes([{ property: property, value: value }], conditionField, condition);
  }
}

/**
 * Union of all relation property keys on a model (both ModelRelated and ModelLinker fields).
 */
export type ModelRelations<T extends object> =
  | FilterAttributes<T, ModelRelated<any, any, any>>
  | FilterAttributes<T, ModelLinker>;

/**
 * Model reference with create and upsert methods
 */
export class ModelRefWithCreate<T extends Storable> extends ModelRef<T> {
  /**
   * Upsert a model reference
   * @param data - the model data excluding primary key
   * @returns the upserted model instance
   */
  upsert(data: Omit<JSONed<T>, T[typeof WEBDA_PRIMARY_KEY][number]>): Promise<T> {
    return this.getRepository().upsert({
      ...data,
      ...this.getRepository().getPrimaryKey(this.getKey(), true)
    });
  }
  /**
   * Create a model reference
   *
   * It will fail if the model already exists
   * @param data - the model data excluding primary key
   * @returns the created model instance
   */
  create(data: Omit<AttributesArgument<T>, T[typeof WEBDA_PRIMARY_KEY][number]>): Promise<T> {
    return this.getRepository().create({
      ...(data as any),
      ...this.getRepository().getPrimaryKey(this.getKey(), true)
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
export class ModelRelated<
  T extends Storable,
  L extends Storable,
  K extends Extract<FilterAttributes<T, ModelLinker<L>>, string> | "" = ""
> {
  private repoSource: Repository<any>;

  /** Create a new ModelRelated
   * @param targetClass - the target model class
   * @param object - the source object owning the relation
   * @param attribute - the attribute name linking the relation
   */
  constructor(
    targetClass: ModelClass<T>,
    private object: L,
    private attribute: K = "" as K
  ) {
    this.repoSource = useRepository(targetClass) as Repository<any>;
  }

  /**
   * Build a WebdaQL query string that filters related objects by this model's primary key.
   * @param query - optional additional query filter
   * @returns the constructed query string
   */
  getQuery(query: WebdaQLString<T> | string = ""): WebdaQLString<T> {
    return WebdaQL.PrependCondition(
      query as string,
      `${this.attribute} = "${this.object.getPrimaryKey()}"`
    ) as WebdaQLString<T>;
  }

  /**
   * Query the related objects
   * @param query - optional additional query filter
   * @returns the query results with optional continuation token
   */
  async query(query: WebdaQLString<T> = "" as WebdaQLString<T>): Promise<{ results: T[]; continuationToken?: string }> {
    const q = this.getQuery(query);
    return this.repoSource.query(q);
  }

  /**
   * Iterate through linked objects
   * @param query - the query filter
   * @returns an async iterable of linked objects
   */
  iterate(query: WebdaQLString<T>): AsyncIterable<T> {
    const q = this.getQuery(query);
    return this.repoSource.iterate(q);
  }

  /**
   * It is a helper and should not be serialized
   */
  toJSON(): void {
    return;
  }
}

/**
 * Marker interface for relation properties.
 *
 * All relation types (ModelLink, ModelLinksSimpleArray, ModelLinksArray) implement this
 * so they can be detected and filtered at the type level.
 *
 * @typeParam T - The target Storable type
 * @typeParam K - The relation role identifier
 */
export interface ModelLinker<T extends Storable = any, K extends "Link" | "Related" | "Links" | "CustomLinks" = any> {
  readonly [RelationRole]: K;
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
  readonly [RelationRole]: "Link" = "Link" as const;
  protected [RelationKey]: PrimaryKeyType<T>;
  readonly [RelationModel]: ModelClass<T>;

  /** Create a new ModelLink
   * @param model - the model class to link to
   */
  constructor(
    /**
     * The repository of the object to link
     */
    model: ModelClass<T>
  ) {
    this[RelationModel] = model;
  }

  /**
   * Resolve the link and fetch the target model from the repository
   * @returns the linked model instance
   */
  async get(): Promise<T> {
    if (!this[RelationKey]) {
      throw new Error("Relation key is not initialized");
    }
    return (await useRepository(this[RelationModel]).get(this[RelationKey])) as T;
  }

  /**
   * Update the link to point to a different target
   * @param id - New target: a primary key, model instance, or string UID
   * @returns this link instance
   * @WebdaAutoSetter
   */
  set(id: PrimaryKeyType<T> | T | string): this {
    this[RelationKey] = isStorable(id)
      ? id.getPrimaryKey()
      : typeof id === "string"
        ? useRepository(this[RelationModel]).parseUID(id)
        : id;
    return this;
  }

  /**
   * Return the string representation of the linked key
   * @returns the string representation
   */
  toString(): string {
    if (!this[RelationKey]) {
      throw new Error("Relation key is not initialized");
    }
    return this[RelationKey].toString();
  }

  /**
   * Serialize the link to its primary key value
   * @returns the primary key value
   */
  toJSON(): PrimaryKeyType<T> {
    if (!this[RelationKey]) {
      throw new Error("Relation key is not initialized");
    }
    return this[RelationKey];
  }

  /**
   * Get the primary key of the linked model
   * @returns the primary key value
   */
  getPrimaryKey(): PrimaryKeyType<T> {
    if (!this[RelationKey]) {
      throw new Error("Relation key is not initialized");
    }
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
 * Link to a collection of objects
 *
 * Uses composition instead of extending Array for better maintainability,
 * performance, and type safety.
 *
 * This allows to do a n:m or 1:n relation between two models
 *
 * It does not require to have a symetric relation on the other side
 * The array contains uuid of the linked objects
 */
export class ModelLinksSimpleArray<T extends Storable> implements ModelLinker {
  [RelationRole]: "Links" = "Links" as const;
  [RelationAttributes]: object;
  protected [RelationRepository]: Repository<ModelClass<T>>;

  // COMPOSITION: Internal array instead of extending Array
  private items: ModelRef<T>[] = [];

  /** Create a new ModelLinksSimpleArray
   * @param model - the model class for linked items
   * @param content - initial array of primary keys
   * @param parentObject - optional parent object owning this relation
   */
  constructor(model: ModelClass<T>, content: PrimaryKeyType<T>[] = [], parentObject?: T) {
    this[RelationRepository] = useRepository(model);
    // Initialize internal array
    this.items = content.map(c => this.getModelRef(c));

    // Return a Proxy to support indexed access like an array
    return new Proxy(this, {
      get(target, prop) {
        // Handle numeric indices
        if (typeof prop === "string" && /^\d+$/.test(prop)) {
          return target.items[parseInt(prop, 10)];
        }
        // Handle all other properties normally
        return (target as any)[prop];
      },
      set(target, prop, value) {
        // Handle numeric indices
        if (typeof prop === "string" && /^\d+$/.test(prop)) {
          target.items[parseInt(prop, 10)] = value;
          return true;
        }
        // Handle all other properties normally
        (target as any)[prop] = value;
        return true;
      }
    });
  }

  /**
   * Add items to the end of the collection
   * @param items - items to add
   * @returns the new collection length
   */
  push(...items: (string | PrimaryKeyType<T> | ModelRef<T> | T)[]): number {
    const result = this.items.push(...items.map(i => this.getModelRef(i)));
    this.setDirty();
    return result;
  }

  /**
   * Add items to the beginning of the collection
   * @param items - items to prepend
   * @returns the new collection length
   */
  unshift(...items: (string | PrimaryKeyType<T> | ModelRef<T> | T)[]): number {
    const result = this.items.unshift(...items.map(i => this.getModelRef(i)));
    this.setDirty();
    return result;
  }

  /**
   * Remove and return the last item
   * @returns the removed item, or undefined
   */
  pop(): ModelRef<T> | undefined {
    const result = this.items.pop();
    if (result !== undefined) {
      this.setDirty();
    }
    return result;
  }

  /**
   * Remove and return the first item
   * @returns the removed item, or undefined
   */
  shift(): ModelRef<T> | undefined {
    const result = this.items.shift();
    if (result !== undefined) {
      this.setDirty();
    }
    return result;
  }

  /**
   * Remove/add items at specified index
   * @param start - the start index
   * @param deleteCount - number of items to remove
   * @param rest - items to insert
   * @returns the removed items
   */
  splice(
    start: number,
    deleteCount?: number,
    ...rest: (string | PrimaryKeyType<T> | ModelRef<T> | T)[]
  ): ModelRef<T>[] {
    const result = this.items.splice(start, deleteCount as number, ...rest.map(i => this.getModelRef(i)));
    if (result.length > 0 || rest.length > 0) {
      this.setDirty();
    }
    return result;
  }

  /**
   * Add a model to the collection
   * @param model - the model to add
   * @deprecated use push instead
   */
  add(model: string | PrimaryKeyType<T> | ModelRef<T> | T) {
    this.push(model);
  }

  /**
   * Set the collection to a new set of items
   * @param items - the new items to set
   * @WebdaAutoSetter
   */
  set(items?: (string | PrimaryKeyType<T> | ModelRef<T> | T)[]): void {
    this.items = items?.map(i => this.getModelRef(i)) || [];
    this.setDirty();
  }

  /**
   * Remove item by reference or primary key
   * @param model - the item to remove
   * @returns true if the item was found and removed
   */
  remove(model: string | ModelRef<T> | PrimaryKeyType<T> | T): boolean {
    const uuid = this.getModelRef(model).getPrimaryKey().toString();
    const index = this.items.findIndex(m => m.getPrimaryKey().toString() === uuid);
    if (index >= 0) {
      this.items.splice(index, 1);
      this.setDirty();
      return true;
    }
    return false;
  }

  /**
   * Get the number of items
   * @returns the item count
   */
  get length(): number {
    return this.items.length;
  }

  /**
   * Get item at index
   * @param index - the array index
   * @returns the item, or undefined
   */
  at(index: number): ModelRef<T> | undefined {
    return this.items[index];
  }

  /**
   * Find item by predicate
   * @param predicate - the search predicate
   * @returns the found item, or undefined
   */
  find(predicate: (item: ModelRef<T>, index: number, array: ModelRef<T>[]) => boolean): ModelRef<T> | undefined {
    return this.items.find(predicate);
  }

  /**
   * Find index by predicate
   * @param predicate - the search predicate
   * @returns the index, or -1
   */
  findIndex(predicate: (item: ModelRef<T>, index: number, array: ModelRef<T>[]) => boolean): number {
    return this.items.findIndex(predicate);
  }

  /**
   * Map over items (does NOT mutate)
   * @param callback - the mapping function
   * @returns the mapped array
   */
  map<U>(callback: (item: ModelRef<T>, index: number, array: ModelRef<T>[]) => U): U[] {
    return this.items.map(callback);
  }

  /**
   * Filter items (does NOT mutate)
   * @param predicate - the filter predicate
   * @returns the filtered items
   */
  filter(predicate: (item: ModelRef<T>, index: number, array: ModelRef<T>[]) => boolean): ModelRef<T>[] {
    return this.items.filter(predicate);
  }

  /**
   * Execute callback for each item
   * @param callback - the function to execute for each item
   */
  forEach(callback: (item: ModelRef<T>, index: number, array: ModelRef<T>[]) => void): void {
    this.items.forEach(callback);
  }

  /**
   * Check if any item matches predicate
   * @param predicate - the test predicate
   * @returns true if any item matches
   */
  some(predicate: (item: ModelRef<T>, index: number, array: ModelRef<T>[]) => boolean): boolean {
    return this.items.some(predicate);
  }

  /**
   * Check if all items match predicate
   * @param predicate - the test predicate
   * @returns true if all items match
   */
  every(predicate: (item: ModelRef<T>, index: number, array: ModelRef<T>[]) => boolean): boolean {
    return this.items.every(predicate);
  }

  /**
   * Convert to JSON
   * @returns array of primary key values
   */
  toJSON(): PrimaryKeyType<T>[] {
    return this.items.map(m => m.getPrimaryKey());
  }

  /**
   * Make the collection iterable (for...of loops)
   * @returns an iterator over the items
   */
  [Symbol.iterator](): Iterator<ModelRef<T>> {
    return this.items[Symbol.iterator]();
  }

  /**
   * Support indexed access like an array
   */
  [index: number]: ModelRef<T>;

  /**
   * Convert any accepted input (string, key, ref, or model) into a ModelRef
   * @param model - the input to convert
   * @returns the model reference
   */
  protected getModelRef(model: string | PrimaryKeyType<T> | ModelRef<T> | T): ModelRef<T> {
    let modelRef: ModelRef<T>;
    if (typeof model === "string") {
      modelRef = new ModelRef<T>(this[RelationRepository].parseUID(model), this[RelationRepository]);
    } else if (model instanceof ModelRef) {
      modelRef = model;
    } else if (isStorable(model)) {
      modelRef = new ModelRef<T>(model.getPrimaryKey(), this[RelationRepository]);
    } else {
      modelRef = new ModelRef<T>(model, this[RelationRepository]);
    }
    return modelRef;
  }

  /**
   * Mark the parent model's property for this collection as dirty
   */
  protected setDirty(): void {
    // no-op: dirty tracking is handled by the deep proxy in track()
  }
}

/** A ModelRef augmented with custom properties K, exposing them both at runtime and in JSON. */
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

  /** Create a new ModelRefCustom
   * @param key - the primary key of the referenced object
   * @param repo - the repository managing the referenced model
   * @param data - custom data associated with this reference
   * @param parent - optional parent storable
   */
  constructor(key: PrimaryKeyType<T>, repo: Repository<ModelClass<T>>, data: K, parent?: Storable) {
    super(key, repo, parent);
    this[RelationData] = data;
    assignNonSymbols(this, data);
    // We might want to explore moving data in sub-classes
  }

  /**
   * Override toJSON to include custom properties along with primary key
   * @returns the relation data
   */
  toJSON(): any {
    // Return the relation data which should already include the primary key
    // along with any additional custom properties
    return this[RelationData];
  }
}

/**
 * Link to a collection of objects including some additional data
 *
 * Uses composition instead of extending Array for better maintainability,
 * performance, and type safety. Provides array-like interface through
 * explicit methods and iterators.
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
export class ModelLinksArray<T extends Storable, K extends object> implements ModelLinker {
  [RelationRole]: "CustomLinks" = "CustomLinks" as const;
  //[RelationParent]: T;
  [RelationAttributes]: K;

  // COMPOSITION: Internal array instead of extending Array
  private items: ModelRefCustomProperties<T, K>[] = [];

  /** Create a new ModelLinksCustomArray
   * @param repo - the repository for the linked model
   * @param content - initial array of primary keys with custom data
   */
  constructor(
    protected repo: Repository<ModelClass<T>>,
    content: (PrimaryKey<T> & K)[] = []
    //parentObject?: T
  ) {
    //this[RelationParent] = parentObject!;
    // Initialize internal array
    this.items = content.map(
      c => <ModelRefCustomProperties<T, K>>(<unknown>new ModelRefCustom<T, K>(repo.getPrimaryKey(c), repo, c))
    );

    // Return a Proxy to support indexed access like an array
    return new Proxy(this, {
      get(target, prop) {
        // Handle numeric indices
        if (typeof prop === "string" && /^\d+$/.test(prop)) {
          return target.items[parseInt(prop, 10)];
        }
        // Handle all other properties normally
        return (target as any)[prop];
      },
      set(target, prop, value) {
        // Handle numeric indices
        if (typeof prop === "string" && /^\d+$/.test(prop)) {
          target.items[parseInt(prop, 10)] = value;
          return true;
        }
        // Handle all other properties normally
        (target as any)[prop] = value;
        return true;
      }
    });
  }

  /**
   * Add a model to the collection
   * @param model - the model to add
   * @deprecated use push instead
   */
  add(model: JSONed<ModelRefCustomProperties<T, K>>) {
    this.push(new ModelRefCustom<T, K>(this.repo.getPrimaryKey(model), this.repo, model as any) as any);
  }

  /**
   * Add items to the end of the collection
   * @param items - items to add
   * @returns the new collection length
   */
  push(...items: (ModelRefCustomProperties<T, K> | JSONed<ModelRefCustomProperties<T, K>>)[]): number {
    const result = this.items.push(...items.map(i => this.getModelRef(i)));
    this.setDirty();
    return result;
  }

  /**
   * Remove and return the last item
   * @returns the removed item, or undefined
   */
  pop(): ModelRefCustomProperties<T, K> | undefined {
    const result = this.items.pop();
    if (result !== undefined) {
      this.setDirty();
    }
    return result;
  }

  /**
   * Remove and return the first item
   * @returns the removed item, or undefined
   */
  shift(): ModelRefCustomProperties<T, K> | undefined {
    const result = this.items.shift();
    if (result !== undefined) {
      this.setDirty();
    }
    return result;
  }

  /**
   * Add items to the beginning of the collection
   * @param items - items to prepend
   * @returns the new collection length
   */
  unshift(...items: (ModelRefCustomProperties<T, K> | JSONed<ModelRefCustomProperties<T, K>>)[]): number {
    const result = this.items.unshift(...items.map(i => this.getModelRef(i)));
    this.setDirty();
    return result;
  }

  /**
   * Remove/add items at specified index
   * @param start - the start index
   * @param deleteCount - number of items to remove
   * @param rest - items to insert
   * @returns the removed items
   */
  splice(
    start: number,
    deleteCount?: number,
    ...rest: (ModelRefCustomProperties<T, K> | JSONed<ModelRefCustomProperties<T, K>>)[]
  ): ModelRefCustomProperties<T, K>[] {
    const result = this.items.splice(start, deleteCount as number, ...rest.map(i => this.getModelRef(i)));
    if (result.length > 0 || rest.length > 0) {
      this.setDirty();
    }
    return result;
  }

  /**
   * Remove item by reference or primary key
   * @param model - the item to remove
   * @returns true if found and removed
   */
  remove(model: ModelRefCustomProperties<T, K> | PrimaryKeyType<T> | T): boolean {
    const uuid = typeof (model as any)["getPrimaryKey"] === "function" ? (model as any)["getPrimaryKey"]() : model;
    const index = this.items.findIndex(m => PrimaryKeyEquals(m.getPrimaryKey(), uuid));
    if (index >= 0) {
      this.items.splice(index, 1);
      this.setDirty();
      return true;
    }
    return false;
  }

  /**
   * Get the number of items
   * @returns the item count
   */
  get length(): number {
    return this.items.length;
  }

  /**
   * Get item at index
   * @param index - the array index
   * @returns the item, or undefined
   */
  at(index: number): ModelRefCustomProperties<T, K> | undefined {
    return this.items[index];
  }

  /**
   * Find item by predicate
   * @param predicate - the search predicate
   * @returns the found item, or undefined
   */
  find(
    predicate: (item: ModelRefCustomProperties<T, K>, index: number, array: ModelRefCustomProperties<T, K>[]) => boolean
  ): ModelRefCustomProperties<T, K> | undefined {
    return this.items.find(predicate);
  }

  /**
   * Find index by predicate
   * @param predicate - the search predicate
   * @returns the index, or -1
   */
  findIndex(
    predicate: (item: ModelRefCustomProperties<T, K>, index: number, array: ModelRefCustomProperties<T, K>[]) => boolean
  ): number {
    return this.items.findIndex(predicate);
  }

  /**
   * Check if item exists in collection
   * @param search - the item to look for
   * @param fromIndex - optional start index
   * @returns true if found
   */
  includes(search: ModelRefCustomProperties<T, K>, fromIndex?: number): boolean {
    return this.items.includes(search, fromIndex);
  }

  /**
   * Map over items (does NOT mutate)
   * @param callback - the mapping function
   * @returns the mapped array
   */
  map<U>(
    callback: (item: ModelRefCustomProperties<T, K>, index: number, array: ModelRefCustomProperties<T, K>[]) => U
  ): U[] {
    return this.items.map(callback);
  }

  /**
   * Filter items (does NOT mutate)
   * @param predicate - the filter predicate
   * @returns the filtered items
   */
  filter(
    predicate: (item: ModelRefCustomProperties<T, K>, index: number, array: ModelRefCustomProperties<T, K>[]) => boolean
  ): ModelRefCustomProperties<T, K>[] {
    return this.items.filter(predicate);
  }

  /**
   * Execute callback for each item
   * @param callback - the function to execute for each item
   */
  forEach(
    callback: (item: ModelRefCustomProperties<T, K>, index: number, array: ModelRefCustomProperties<T, K>[]) => void
  ): void {
    this.items.forEach(callback);
  }

  /**
   * Check if any item matches predicate
   * @param predicate - the test predicate
   * @returns true if any item matches
   */
  some(
    predicate: (item: ModelRefCustomProperties<T, K>, index: number, array: ModelRefCustomProperties<T, K>[]) => boolean
  ): boolean {
    return this.items.some(predicate);
  }

  /**
   * Check if all items match predicate
   * @param predicate - the test predicate
   * @returns true if all items match
   */
  every(
    predicate: (item: ModelRefCustomProperties<T, K>, index: number, array: ModelRefCustomProperties<T, K>[]) => boolean
  ): boolean {
    return this.items.every(predicate);
  }

  /**
   * Convert to JSON
   * @returns array of serialized items
   */
  toJSON(): JSONed<ModelRefCustomProperties<T, K>>[] {
    return <any>this.items;
  }

  /**
   * Make the collection iterable (for...of loops)
   * @returns an iterator over the items
   */
  [Symbol.iterator](): Iterator<ModelRefCustomProperties<T, K>> {
    return this.items[Symbol.iterator]();
  }

  /**
   * Support indexed access like an array
   */
  [index: number]: ModelRefCustomProperties<T, K>;

  /**
   * Convert input into a ModelRefCustom, preserving custom properties
   * @param model - the input to convert
   * @returns the model reference with custom properties
   */
  protected getModelRef(
    model: ModelRefCustomProperties<T, K> | JSONed<ModelRefCustomProperties<T, K>>
  ): ModelRefCustomProperties<T, K> {
    return <any>(
      (model instanceof ModelRefCustom
        ? model
        : new ModelRefCustom<T, K>(this.repo.getPrimaryKey(model), this.repo, model as any))
    );
  }

  /**
   * Mark the parent model's property for this collection as dirty
   */
  protected setDirty(): void {
    // no-op: dirty tracking is handled by the deep proxy in track()
  }
}

/**
 * Define a ModelRef with custom properties for map
 * Exclude the PrimaryKey from the JSON
 *
 * @deprecated
 */
export class ModelRefCustomMap<T extends Storable, K> extends ModelRefCustom<T, K> {
  /**
   * Serialize the relation data as a plain object (excluding the primary key).
   * @returns the relation data
   */
  toJSON(): any {
    return this[RelationData] || {};
  }
}

/** Alias for a many-to-one relation (foreign key link). */
export type ManyToOne<T extends Storable> = ModelLink<T>;
/**
 * Define a 1:n relation on the current model to another model
 *
 * This is an helper type that allows to query the related objects with the correct type
 *
 * T is the model to link to
 * K is the attribute in T to query (not used but required to complete the graph)
 */
export type OneToMany<
  T extends Storable,
  L extends Storable,
  K extends Extract<FilterAttributes<T, ModelLinker<L>>, string> | ""
> = ModelRelated<T, L, K>;
/** Alias for a one-to-one relation. */
export type OneToOne<T extends Storable> = ModelLink<T>;
/**
 * Alias for a many-to-many relation.
 * If K (custom properties) is provided, uses ModelLinksArray; otherwise ModelLinksSimpleArray.
 */
export type ManyToMany<T extends Storable, K extends object = object> = K extends object
  ? ModelLinksArray<T, K>
  : ModelLinksSimpleArray<T>;

/**
 * Define the parent of the model
 * Can only have one parent and implies a Cascade delete
 *
 * Alias for @ModelParent
 * Similar to @ModelLink but implies a Cascade delete
 */
export type BelongTo<T extends Storable> = ModelParent<T>;
/** Alias for ModelLink - defines a relation to another model. */
export type RelateTo<T extends Storable> = ModelLink<T>;
/** Alias for ManyToMany - defines ownership of a collection of models. */
export type Contains<T extends Storable> = ManyToMany<T>;

/**
 * Define a junction link between two models in a n:m relation
 *
 * This is used to define the junction model in a n:m relation with additional data
 * It does not require to have a symetric relation on the other side
 */
export class JunctionLink<T extends Storable, K extends Storable> implements Storable {
  [WEBDA_PRIMARY_KEY] = ["linkA", "linkB"] as const;
  linkA: ModelParent<T>;
  linkB: ModelLink<K>;
  /**
   * Return the composite primary key (linkA + linkB)
   * @returns the composite primary key object
   */
  getPrimaryKey() {
    return { linkA: this.linkA.getPrimaryKey(), linkB: this.linkB.getPrimaryKey() };
  }
  /** @override */
  load(params: any): this {
    return this;
  }
  /**
   * Return a string UID combining both link keys
   * @returns the combined UID string
   */
  getUUID(): string {
    return `${this.linkA.getPrimaryKey()}_${this.linkB.getPrimaryKey()}`;
  }
  /**
   * Return the proxied version of this model (identity for JunctionLink)
   * @returns this instance
   */
  toProxy() {
    return this;
  }
}
