import { Attributes, FilterAttributes, ArrayElement, OmitPrefixed } from "@webda/tsc-esm";
import {
  isStorable,
  PrimaryKeyType,
  Storable,
  PrimaryKey,
  PrimaryKeyEquals,
  AttributesArgument,
  PrimaryKeyAttributes,
  UpdatableAttributes,
  WEBDA_PRIMARY_KEY,
  WEBDA_DIRTY,
  ModelClass
} from "./storable";
import type { JSONed, Helpers, PropertyPaths, PropertyPathType, NumericPropertyPaths } from "./types";
import type { Repository } from "./repositories/repository";

export const RelationParent = Symbol("RelationParent");
export const RelationKey = Symbol("RelationKey");
export const RelationRepository = Symbol("RelationRepository");
export const RelationRole = Symbol("RelationRole");
export const RelationData = Symbol("RelationData");
export const RelationAttributes = Symbol("RelationAttributes");
/**
 * Assign non symbol properties from source to target
 * @param target
 * @param source
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
  [RelationParent]?: Storable;
  [RelationKey]?: PrimaryKeyType<T>;
  [RelationRepository]?: Repository<ModelClass<T>>;

  constructor(key: PrimaryKeyType<T>, repository?: Repository<ModelClass<T>>, parent?: Storable) {
    this[RelationParent] = parent;
    this[RelationKey] = key;
    this[RelationRepository] = repository;
  }

  /**
   * Get the repository and ensure it's initialized
   */
  protected getRepository(): Repository<ModelClass<T>> {
    if (!this[RelationRepository]) {
      throw new Error("Relation repository is not initialized");
    }
    return this[RelationRepository];
  }

  /**
   * Get the primary key and ensure it's initialized
   */
  protected getKey(): PrimaryKeyType<T> {
    return this.getPrimaryKey();
  }

  /**
   * Get the model
   */
  getPrimaryKey(): PrimaryKeyType<T> {
    if (!this[RelationKey]) {
      throw new Error("Relation key is not initialized");
    }
    return this[RelationKey];
  }

  /**
   *
   * @returns
   */
  toJSON(): PrimaryKeyType<T> {
    return this.getKey();
  }

  /**
   * Set the attribute of the model
   * @param attribute
   * @param value
   * @returns
   */
  setAttribute<A extends PropertyPaths<T>>(attribute: A, value: JSONed<PropertyPathType<T, A>>): Promise<void> {
    return this.getRepository().setAttribute(this.getKey(), attribute, value as any);
  }

  /**
   * Patch the model
   * @param data
   * @param conditionField
   * @param condition
   * @returns
   */
  patch<K extends keyof T, A extends PropertyPaths<T>>(
    data: Partial<Omit<T, PrimaryKeyAttributes<T>>>,
    conditionField?: A,
    condition?: PropertyPathType<T, A>
  ): Promise<void> {
    return this.getRepository().patch(this.getKey(), data, conditionField, condition);
  }

  /**
   * Patch the model
   * @param data
   * @param conditionField
   * @param condition
   * @returns
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
   * @returns
   */
  get(): Promise<T> {
    return this.getRepository().get(this.getKey()) as Promise<T>;
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
  delete<A extends PropertyPaths<T>>(conditionField?: A, condition?: PropertyPathType<T, A> | JSONed<PropertyPathType<T, A>>): Promise<void> {
    return this.getRepository().delete(this.getKey(), conditionField, condition);
  }

  /**
   * Check if the model exists in the repository
   * @returns
   */
  exists(): Promise<boolean> {
    return this.getRepository().exists(this.getKey());
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
      | (NumericPropertyPaths<T> | { property: NumericPropertyPaths<T>; value?: number })[]
      | Record<NumericPropertyPaths<T>, number>,
    conditionField?: PropertyPaths<T>,
    condition?: PropertyPathType<T, PropertyPaths<T>>
  ): Promise<void> {
    return this.getRepository().incrementAttributes(this.getKey(), info, conditionField, condition);
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
   * @param collection
   * @param index
   * @param itemWriteConditionField
   * @param itemWriteCondition
   * @returns
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
   * @param attribute
   * @param conditionField
   * @param condition
   * @returns
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
   * @param property
   * @param value
   * @param conditionField
   * @param condition
   * @returns
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

export type ModelRelations<T extends object> =
  | FilterAttributes<T, ModelRelated<any, any, any>>
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
    return this.getRepository().upsert({
      ...data,
      ...this.getRepository().getPrimaryKey(this.getKey(), true)
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
export type ModelRelated<T extends Storable, L extends Storable, _K extends FilterAttributes<T, ModelLinker<L>>> = {
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
export interface ModelLinker<T extends Storable = any, K extends "Link" | "Related" | "Links" | "CustomLinks" = any> {
  readonly [RelationRole]: K;
  readonly [RelationParent]: T;
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
  /**
   * Parent of the link
   *
   * In our example, the parent is the Album
   */
  readonly [RelationParent]: T;
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
    protected model: Repository<ModelClass<T>>,
    parent?: T
  ) {
    this[RelationParent] = parent!;
    this[RelationKey] = typeof uuid === "string" ? model.parseUID(uuid) : uuid;
  }

  async get(): Promise<T> {
    if (!this[RelationKey]) {
      throw new Error("Relation key is not initialized");
    }
    return (await this.model.get(this[RelationKey])) as T;
  }

  set(id: PrimaryKeyType<T> | T | string) {
    this[RelationKey] = isStorable(id) ? id.getPrimaryKey() : typeof id === "string" ? this.model.parseUID(id) : id;
    // Set dirty for parent
    if (this[RelationParent] && this[RelationParent][WEBDA_DIRTY]) {
      this[RelationParent][WEBDA_DIRTY].add(
        Object.keys(this[RelationParent])
          .filter(k => (this[RelationParent] as any)[k] === this)
          .pop()!
      );
    }
  }

  toString(): string {
    if (!this[RelationKey]) {
      throw new Error("Relation key is not initialized");
    }
    return this[RelationKey].toString();
  }

  toJSON(): PrimaryKeyType<T> {
    if (!this[RelationKey]) {
      throw new Error("Relation key is not initialized");
    }
    return this[RelationKey];
  }

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
  [RelationParent]: T;
  [RelationAttributes]: {};
  protected [RelationRepository]: Repository<ModelClass<T>>;

  // COMPOSITION: Internal array instead of extending Array
  private items: ModelRef<T>[] = [];

  constructor(repo: Repository<ModelClass<T>>, content: PrimaryKeyType<T>[] = [], parentObject?: T) {
    this[RelationRepository] = repo;
    this[RelationParent] = parentObject!;
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
   */
  push(...items: (string | PrimaryKeyType<T> | ModelRef<T> | T)[]): number {
    const result = this.items.push(...items.map(i => this.getModelRef(i)));
    this.setDirty();
    return result;
  }

  /**
   * Add items to the beginning of the collection
   */
  unshift(...items: (string | PrimaryKeyType<T> | ModelRef<T> | T)[]): number {
    const result = this.items.unshift(...items.map(i => this.getModelRef(i)));
    this.setDirty();
    return result;
  }

  /**
   * Remove and return the last item
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
    this.items = items?.map(i => this.getModelRef(i)) || [];
    this.setDirty();
  }

  /**
   * Remove item by reference or primary key
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
   */
  get length(): number {
    return this.items.length;
  }

  /**
   * Get item at index
   */
  at(index: number): ModelRef<T> | undefined {
    return this.items[index];
  }

  /**
   * Find item by predicate
   */
  find(predicate: (item: ModelRef<T>, index: number, array: ModelRef<T>[]) => boolean): ModelRef<T> | undefined {
    return this.items.find(predicate);
  }

  /**
   * Find index by predicate
   */
  findIndex(predicate: (item: ModelRef<T>, index: number, array: ModelRef<T>[]) => boolean): number {
    return this.items.findIndex(predicate);
  }

  /**
   * Map over items (does NOT mutate)
   */
  map<U>(callback: (item: ModelRef<T>, index: number, array: ModelRef<T>[]) => U): U[] {
    return this.items.map(callback);
  }

  /**
   * Filter items (does NOT mutate)
   */
  filter(predicate: (item: ModelRef<T>, index: number, array: ModelRef<T>[]) => boolean): ModelRef<T>[] {
    return this.items.filter(predicate);
  }

  /**
   * Execute callback for each item
   */
  forEach(callback: (item: ModelRef<T>, index: number, array: ModelRef<T>[]) => void): void {
    this.items.forEach(callback);
  }

  /**
   * Check if any item matches predicate
   */
  some(predicate: (item: ModelRef<T>, index: number, array: ModelRef<T>[]) => boolean): boolean {
    return this.items.some(predicate);
  }

  /**
   * Check if all items match predicate
   */
  every(predicate: (item: ModelRef<T>, index: number, array: ModelRef<T>[]) => boolean): boolean {
    return this.items.every(predicate);
  }

  /**
   * Convert to JSON
   */
  toJSON(): PrimaryKeyType<T>[] {
    return this.items.map(m => m.getPrimaryKey());
  }

  /**
   * Make the collection iterable (for...of loops)
   */
  [Symbol.iterator](): Iterator<ModelRef<T>> {
    return this.items[Symbol.iterator]();
  }

  /**
   * Support indexed access like an array
   */
  [index: number]: ModelRef<T>;

  protected getModelRef(model: string | PrimaryKeyType<T> | ModelRef<T> | T): ModelRef<T> {
    let modelRef: ModelRef<T>;
    if (typeof model === "string") {
      modelRef = new ModelRef<T>(this[RelationRepository].parseUID(model), this[RelationRepository]);
    } else if (model instanceof ModelRef) {
      modelRef = model;
    } else if (isStorable(model)) {
      modelRef = new ModelRef<T>(model.getPrimaryKey(), this[RelationRepository], this[RelationParent]);
    } else {
      modelRef = new ModelRef<T>(model, this[RelationRepository], this[RelationParent]);
    }
    return modelRef;
  }

  protected setDirty(): void {
    const attrName = this[RelationParent]
      ? Object.keys(this[RelationParent])
          .filter(k => (this[RelationParent] as any)[k] === this)
          .pop()
      : undefined;
    if (!attrName) {
      return;
    }
    if (this[RelationParent] && this[RelationParent][WEBDA_DIRTY]) {
      this[RelationParent][WEBDA_DIRTY].add(attrName);
    }
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

  constructor(key: PrimaryKeyType<T>, repo: Repository<ModelClass<T>>, data: K, parent?: Storable) {
    super(key, repo, parent);
    this[RelationData] = data;
    assignNonSymbols(this, data);
    // We might want to explore moving data in sub-classes
  }

  /**
   * Override toJSON to include custom properties along with primary key
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
  [RelationParent]: T;
  [RelationAttributes]: K;

  // COMPOSITION: Internal array instead of extending Array
  private items: ModelRefCustomProperties<T, K>[] = [];

  constructor(
    protected repo: Repository<ModelClass<T>>,
    content: (PrimaryKey<T> & K)[] = [],
    parentObject?: T
  ) {
    this[RelationParent] = parentObject!;
    // Initialize internal array
    this.items = content.map(
      c =>
        <ModelRefCustomProperties<T, K>>(
          (<unknown>new ModelRefCustom<T, K>(repo.getPrimaryKey(c), repo, c, this[RelationParent]))
        )
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
   * Add items to the end of the collection
   */
  push(...items: (ModelRefCustomProperties<T, K> | JSONed<ModelRefCustomProperties<T, K>>)[]): number {
    const result = this.items.push(...items.map(i => this.getModelRef(i)));
    this.setDirty();
    return result;
  }

  /**
   * Remove and return the last item
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
   */
  unshift(...items: (ModelRefCustomProperties<T, K> | JSONed<ModelRefCustomProperties<T, K>>)[]): number {
    const result = this.items.unshift(...items.map(i => this.getModelRef(i)));
    this.setDirty();
    return result;
  }

  /**
   * Remove/add items at specified index
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
   */
  get length(): number {
    return this.items.length;
  }

  /**
   * Get item at index
   */
  at(index: number): ModelRefCustomProperties<T, K> | undefined {
    return this.items[index];
  }

  /**
   * Find item by predicate
   */
  find(
    predicate: (item: ModelRefCustomProperties<T, K>, index: number, array: ModelRefCustomProperties<T, K>[]) => boolean
  ): ModelRefCustomProperties<T, K> | undefined {
    return this.items.find(predicate);
  }

  /**
   * Find index by predicate
   */
  findIndex(
    predicate: (item: ModelRefCustomProperties<T, K>, index: number, array: ModelRefCustomProperties<T, K>[]) => boolean
  ): number {
    return this.items.findIndex(predicate);
  }

  /**
   * Check if item exists in collection
   */
  includes(search: ModelRefCustomProperties<T, K>, fromIndex?: number): boolean {
    return this.items.includes(search, fromIndex);
  }

  /**
   * Map over items (does NOT mutate)
   */
  map<U>(
    callback: (item: ModelRefCustomProperties<T, K>, index: number, array: ModelRefCustomProperties<T, K>[]) => U
  ): U[] {
    return this.items.map(callback);
  }

  /**
   * Filter items (does NOT mutate)
   */
  filter(
    predicate: (item: ModelRefCustomProperties<T, K>, index: number, array: ModelRefCustomProperties<T, K>[]) => boolean
  ): ModelRefCustomProperties<T, K>[] {
    return this.items.filter(predicate);
  }

  /**
   * Execute callback for each item
   */
  forEach(
    callback: (item: ModelRefCustomProperties<T, K>, index: number, array: ModelRefCustomProperties<T, K>[]) => void
  ): void {
    this.items.forEach(callback);
  }

  /**
   * Check if any item matches predicate
   */
  some(
    predicate: (item: ModelRefCustomProperties<T, K>, index: number, array: ModelRefCustomProperties<T, K>[]) => boolean
  ): boolean {
    return this.items.some(predicate);
  }

  /**
   * Check if all items match predicate
   */
  every(
    predicate: (item: ModelRefCustomProperties<T, K>, index: number, array: ModelRefCustomProperties<T, K>[]) => boolean
  ): boolean {
    return this.items.every(predicate);
  }

  /**
   * Convert to JSON
   */
  toJSON(): JSONed<ModelRefCustomProperties<T, K>>[] {
    return <any>this.items;
  }

  /**
   * Make the collection iterable (for...of loops)
   */
  [Symbol.iterator](): Iterator<ModelRefCustomProperties<T, K>> {
    return this.items[Symbol.iterator]();
  }

  /**
   * Support indexed access like an array
   */
  [index: number]: ModelRefCustomProperties<T, K>;

  protected getModelRef(
    model: ModelRefCustomProperties<T, K> | JSONed<ModelRefCustomProperties<T, K>>
  ): ModelRefCustomProperties<T, K> {
    return <any>(
      (model instanceof ModelRefCustom
        ? model
        : new ModelRefCustom<T, K>(this.repo.getPrimaryKey(model), this.repo, model as any, this[RelationParent]))
    );
  }

  protected setDirty(): void {
    const attrName = this[RelationParent]
      ? Object.keys(this[RelationParent])
          .filter(k => (this[RelationParent] as any)[k] === this)
          .pop()!
      : undefined;
    if (!attrName) {
      return;
    }
    if (this[RelationParent] && this[RelationParent][WEBDA_DIRTY]) {
      this[RelationParent][WEBDA_DIRTY].add(attrName);
    }
  }
}

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
  K extends FilterAttributes<T, ModelLinker<L>>
> = ModelRelated<T, L, K>;
export type OneToOne<T extends Storable> = ModelLink<T>;
export type ManyToMany<T extends Storable, K extends object = {}> = K extends object
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
export type RelateTo<T extends Storable> = ModelLink<T>;
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
  getPrimaryKey() {
    return { linkA: this.linkA.getPrimaryKey(), linkB: this.linkB.getPrimaryKey() };
  }
  load(params: any): this {
    return this;
  }
  getUUID(): string {
    return `${this.linkA.getPrimaryKey()}_${this.linkB.getPrimaryKey()}`;
  }
  toProxy() {
    return this;
  }
}
