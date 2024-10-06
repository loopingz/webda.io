import { ArrayElement, type Attributes, type FilterAttributes, Methods, NotEnumerable } from "@webda/tsc-esm";
import {
  AbstractCoreModel,
  CoreModelDefinition,
  CoreModelEvents,
  CoreModelFullDefinition,
  ModelAttributes,
  Proxied
} from "./imodel";
import { getAttributeLevelProxy } from "./coremodelproxy";
import { RawModel } from "./types";
import { CRUDHelper } from "../stores/istore";

/**
 * Helper object that reference a AbstractCoreModel
 */
export class ModelRef<T extends AbstractCoreModel = AbstractCoreModel>
  implements Omit<CRUDHelper<T>, "create" | "upsert">
{
  @NotEnumerable
  protected model: CoreModelFullDefinition<T>;
  @NotEnumerable
  protected parent: AbstractCoreModel;

  /**
   *
   * @param uuid of the target object
   * @param model definition of the target object
   * @param parent
   */
  constructor(
    protected uuid: string,
    model: CoreModelDefinition<T>,
    parent?: AbstractCoreModel
  ) {
    this.model = <CoreModelFullDefinition<T>>model;
    this.uuid = uuid === "" ? undefined : model.completeUid(uuid);
    this.parent = parent;
  }

  /**
   * Get an object
   * @returns
   */
  async get(): Promise<T> {
    return await this.model.get(this.uuid);
  }

  /**
   * Set the uuid of the object
   * @param id
   */
  set(id: string | T) {
    this.uuid = id instanceof AbstractCoreModel ? id.getUuid() : id;
    this.parent?.__dirty.add(<any>Object.keys(this.parent).find(k => this.parent[k] === this));
  }

  /**
   * Return the uuid
   * @returns
   */
  toString(): string {
    return this.uuid;
  }

  /**
   * Ensure only the uuid is returned when serialized
   * @returns
   */
  toJSON(): string {
    return this.uuid;
  }

  /**
   * Return the uuid
   * @returns
   */
  getUuid(): string {
    return this.uuid;
  }

  /**
   * @see AbstractCoreModel.deleteItemFromCollection
   */
  async deleteItemFromCollection<K extends FilterAttributes<T, Array<any>>>(
    prop: K,
    index: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    const updateDate = await this.model.Store.deleteItemFromCollection(
      this.uuid,
      <any>prop,
      index,
      <any>itemWriteConditionField,
      itemWriteCondition
    );
    await this.model.emit("PartialUpdate", <any>(<CoreModelEvents["PartialUpdate"]>{
      object_id: this.uuid,
      updateDate,
      partial_update: {
        deleteItem: {
          property: <string>prop,
          index: index
        }
      }
    }));
  }

  /**
   * @see AbstractCoreModel.upsertItemFromCollection
   */
  async upsertItemToCollection<K extends FilterAttributes<T, Array<any>>>(
    prop: K,
    item: any,
    index?: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    const updateDate = await this.model.Store.upsertItemToCollection(
      this.uuid,
      <any>prop,
      item,
      index,
      <any>itemWriteConditionField,
      itemWriteCondition
    );
    await this.model.emit("PartialUpdate", <any>(<CoreModelEvents["PartialUpdate"]>{
      object_id: this.uuid,
      updateDate,
      partial_update: {
        addItem: {
          value: item,
          property: <string>prop,
          index: index
        }
      }
    }));
  }

  /**
   * @see AbstractCoreModel.deleteItemFromCollection
   */
  exists(): Promise<boolean> {
    return this.model.Store.exists(this.uuid);
  }

  /**
   * @see AbstractCoreModel.delete
   */
  delete<K extends Attributes<T>>(conditionField?: K, condition?: T[K]): Promise<void> {
    return this.model.Store.delete(this.uuid, <any>conditionField, <any>condition);
  }

  /**
   * @see AbstractCoreModel.patch
   */
  async patch<K extends Attributes<T>>(updates: Partial<T>, conditionField?: K, condition?: T[K]): Promise<void> {
    await this.model.Store.patch(this.uuid, updates, <any>conditionField, condition);
  }

  /**
   * @see AbstractCoreModel.setAttribute
   */
  async setAttribute<K extends Attributes<T>, L extends Attributes<T>>(
    attribute: K,
    value: T[K],
    itemWriteConditionField?: L,
    itemWriteCondition?: T[L]
  ): Promise<void> {
    await this.model.Store.patch(
      this.uuid,
      <any>{ [attribute]: value },
      <any>itemWriteConditionField,
      itemWriteCondition
    );
  }

  /**
   * @see AbstractCoreModel.removeAttribute
   */
  async removeAttribute<K extends Attributes<T>>(
    attribute: Attributes<T>,
    itemWriteConditionField?: K,
    itemWriteCondition?: T[K]
  ): Promise<void> {
    await this.model.Store.removeAttribute(this.uuid, <any>attribute, <any>itemWriteConditionField, itemWriteCondition);
    await this.model?.emit("PartialUpdate", <any>{
      object_id: this.uuid,
      partial_update: {
        deleteAttribute: <any>attribute
      }
    });
  }

  /**
   * @see AbstractCoreModel.incrementAttribute
   */
  async incrementAttribute(attribute: FilterAttributes<T, number>, value: number = 1): Promise<void> {
    return this.incrementAttributes([{ property: attribute, value }]);
  }

  /**
   * @see AbstractCoreModel.incrementAttributes
   */
  async incrementAttributes<K extends Attributes<T>>(
    info: (
      | {
          property: FilterAttributes<T, number>;
          value?: number;
        }
      | FilterAttributes<T, number>
    )[],
    itemWriteConditionField?: K,
    itemWriteCondition?: T[K]
  ): Promise<void> {
    const updateDate = await this.model.Store.incrementAttributes(
      this.uuid,
      <any>info,
      <any>itemWriteConditionField,
      itemWriteCondition
    );
    await this.model.emit("PartialUpdate", <any>(<CoreModelEvents["PartialUpdate"]>{
      object_id: this.uuid,
      updateDate,
      partial_update: {
        increments: <{ property: string; value: number }[]>info
      }
    }));
  }
}

/**
 * ModelRef with create
 */
export class ModelRefWithCreate<T extends AbstractCoreModel = AbstractCoreModel>
  extends ModelRef<T>
  implements CRUDHelper<T>
{
  /**
   * Allow to create a model
   * @param defaultValue
   * @param context
   * @param withSave
   * @returns
   */
  async create(defaultValue: RawModel<T>, withSave: boolean = true): Promise<Proxied<T>> {
    const result = (await this.model.factory(<Partial<T>>defaultValue)).setUuid(this.uuid);
    if (withSave) {
      await result.save();
    }
    return getAttributeLevelProxy(result);
  }

  /**
   * Load a model from the known store
   *
   * @param this the class from which the static is called
   * @param id of the object to load
   * @param defaultValue if object not found return a default object
   * @param context to set on the object
   * @returns
   */
  async getOrCreate(defaultValue: RawModel<T>, withSave: boolean = true): Promise<T> {
    return (await this.get()) || (await this.create(defaultValue, withSave));
  }

  /**
   * Upsert a model
   * @param defaultValue
   * @returns
   */
  async upsert(defaultValue: RawModel<T>): Promise<T> {
    let result = await this.get();
    if (await this.exists()) {
      await this.patch(<any>defaultValue);
    } else {
      result = await this.create(defaultValue);
    }
    return result;
  }
}

/**
 * ModelRef with custom data information
 */
export class ModelRefCustom<T extends AbstractCoreModel> extends ModelRef<T> {
  constructor(
    public uuid: string,
    model: CoreModelDefinition<T>,
    data: any,
    parent: AbstractCoreModel
  ) {
    super(uuid, model, parent);
    Object.assign(this, data);
  }

  toJSON(): any {
    return this;
  }
  getUuid(): string {
    return this.uuid;
  }
}

export type ModelRefCustomProperties<T extends AbstractCoreModel, K> = ModelRefCustom<T> & K;

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
export type ModelRelated<T extends AbstractCoreModel, _K extends FilterAttributes<T, ModelLinker> | "" = ""> = {
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
};

// Empty class to allow filtering it with FilterAttributes
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ModelLinker {}
/**
 * Define a link to n:1 or 1:1 relation on the current model to another model
 *
 * T is the model to link to
 *
 * This is expected to be the symetric of ModelRelated or ModelLink in a 1:1 relation
 */
export class ModelLink<T extends AbstractCoreModel> implements ModelLinker {
  @NotEnumerable
  protected parent: AbstractCoreModel;

  constructor(
    protected uuid: string,
    protected model: CoreModelDefinition<T>,
    parent?: AbstractCoreModel
  ) {
    this.parent = parent;
  }

  async get(): Promise<T> {
    return await this.model.ref(this.uuid).get();
  }
  set(id: string | T) {
    this.uuid = typeof id === "string" ? id : id.getUuid();
    // Set dirty for parent
    this.parent?.__dirty.add(
      Object.keys(this.parent)
        .filter(k => this.parent[k] === this)
        .pop()
    );
  }

  toString(): string {
    return this.uuid;
  }
  toJSON(): string {
    return this.uuid;
  }
  getUuid(): string {
    return this.uuid;
  }
}

/**
 * Define the parent of the model
 *
 * Similar to @ModelLink but implies a Cascade delete
 */
export type ModelParent<T extends AbstractCoreModel> = ModelLink<T>;

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
  remove: (model: T | string) => void;
};

/**
 * Link to a collection of objects
 *
 * This allows to do a n:m or 1:n relation between two models
 *
 * It does not require to have a symetric relation on the other side
 * The array contains uuid of the linked objects
 */
export class ModelLinksSimpleArray<T extends AbstractCoreModel> extends Array<ModelRef<T>> implements ModelLinker {
  @NotEnumerable
  private parent: AbstractCoreModel;

  constructor(
    protected model: CoreModelDefinition<T>,
    content: any[] = [],
    parent?: AbstractCoreModel
  ) {
    super();
    content.forEach(c => this.add(c));
    this.parent = parent;
  }

  add(model: string | ModelRef<T> | T) {
    this.push(
      typeof model === "string"
        ? new ModelRef(model, this.model, this.parent)
        : new ModelRef(model.getUuid(), this.model, this.parent)
    );
    this.parent?.__dirty.add(
      Object.keys(this.parent)
        .filter(k => this.parent[k] === this)
        .pop()
    );
  }

  remove(model: ModelRef<T> | string | T) {
    const index = this.findIndex(m => m.toString() === (typeof model === "string" ? model : model.getUuid()));
    if (index >= 0) {
      this.splice(index, 1);
    }
    this.parent?.__dirty.add(
      Object.keys(this.parent)
        .filter(k => this.parent[k] === this)
        .pop()
    );
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
export class ModelLinksArray<T extends AbstractCoreModel, K>
  extends Array<ModelRefCustomProperties<T, (K & { uuid: string }) | { getUuid: () => string }>>
  implements ModelLinker
{
  @NotEnumerable
  parent: AbstractCoreModel;
  constructor(
    protected model: CoreModelDefinition<T>,
    content: any[] = [],
    parent?: AbstractCoreModel
  ) {
    super();
    this.parent = parent;
    this.push(
      ...content
        .filter(c => c && c.uuid)
        .map(c => <ModelRefCustomProperties<T, K>>new ModelRefCustom(c.uuid, model, c, this.parent))
    );
  }

  add(
    model:
      | ModelRefCustomProperties<T, (K & { uuid: string }) | { getUuid: () => string }>
      | ((K & { uuid: string }) | { getUuid: () => string })
  ) {
    this.push(
      <ModelRefCustomProperties<T, K & ({ uuid: string } | { getUuid: () => string })>>(
        (model instanceof ModelRefCustom
          ? model
          : new ModelRefCustom(
              (<{ uuid: string }>model).uuid || (<{ getUuid: () => string }>model).getUuid(),
              this.model,
              model,
              this.parent
            ))
      )
    );
    this.parent?.__dirty.add(
      Object.keys(this.parent)
        .filter(k => this.parent[k] === this)
        .pop()
    );
  }

  remove(model: ModelRefCustomProperties<T, K> | string | T) {
    const uuid = typeof model === "string" ? model : (<{ uuid: string }>model).uuid || model.getUuid();
    const index = this.findIndex(m => m.getUuid() === uuid);
    if (index >= 0) {
      this.splice(index, 1);
      this.parent?.__dirty.add(
        Object.keys(this.parent)
          .filter(k => this.parent[k] === this)
          .pop()
      );
    }
  }
}

/**
 * Define 1:n or n:m relation with some sort of additional data or duplicated data
 *
 * The key of the map is the value of the FK
 * This is similar to ModelLinksArray but the key is used to store the data
 */
export type ModelLinksMap<T extends AbstractCoreModel, K> = Readonly<{
  [key: string]: ModelRefCustomProperties<T, K & ({ uuid: string } | { getUuid: () => string })>;
}> &
  ModelCollectionManager<K & ({ uuid: string } | { getUuid: () => string })> &
  ModelLinker;

export function createModelLinksMap<T extends AbstractCoreModel = AbstractCoreModel>(
  model: CoreModelDefinition<T>,
  data: any = {},
  parent?: AbstractCoreModel
) {
  const result = {
    add: (model: ModelRefCustomProperties<T, any>) => {
      result[model.uuid || model.getUuid()] = model;
      parent?.__dirty.add(
        Object.keys(parent)
          .filter(k => parent[k] === result)
          .pop()
      );
    },
    remove: (model: ModelRefCustomProperties<T, any> | string) => {
      // @ts-ignore
      const uuid = typeof model === "string" ? model : model.uuid || model.getUuid();
      delete result[uuid];
      parent?.__dirty.add(
        Object.keys(parent)
          .filter(k => parent[k] === result)
          .pop()
      );
    }
  };
  Object.keys(data)
    .filter(k => k !== "__proto__")
    .forEach(key => {
      result[key] = new ModelRefCustom(data[key].uuid, model, data[key], parent);
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
  T extends AbstractCoreModel,
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
export class ModelMapLoaderImplementation<T extends AbstractCoreModel, K = any> {
  @NotEnumerable
  protected _model: CoreModelDefinition<T>;
  @NotEnumerable
  protected _parent: AbstractCoreModel;
  /**
   * The uuid of the object
   */
  public uuid: string;

  constructor(model: CoreModelDefinition<T>, data: { uuid: string } & K, parent: AbstractCoreModel) {
    Object.assign(this, data);
    this._model = model;
    this._parent = parent;
  }

  /**
   *
   * @returns the model
   */
  async get(): Promise<T> {
    return this._model.ref(this.uuid).get();
  }
}

/**
 * Mapper attribute (target of a Mapper service)
 *
 * This is not exported as when mapped the target is always an array
 * TODO Handle 1:1 map
 */
export type ModelMapLoader<T extends AbstractCoreModel, K extends keyof T> = ModelMapLoaderImplementation<T, K> &
  Pick<T, K>;
