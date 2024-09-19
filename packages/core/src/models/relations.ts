import {
  Attributes,
  CoreModel,
  CoreModelDefinition,
  FilterAttributes,
  ModelAction,
  ModelRef,
  ModelRefCustom,
  ModelRefCustomProperties,
  NotEnumerable
} from "./coremodel";

/**
 * Raw model without methods
 */
export type RawModel<T extends object> = {
  [K in Attributes<T>]?: T[K] extends object ? RawModel<T[K]> : T[K];
};

/**
 * Methods of an object
 *
 * Filter out attributes
 */
export type Methods<T extends object> = {
  [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

/**
 * Model loader with a `get` method
 */
type ModelLoader<T extends CoreModel, K = string> = {
  get: () => Promise<T>;
  set: (info: K) => void;
  toString(): string;
} & Readonly<K>;

/**
 * Load related objects
 *
 * _K is not used but is required to complete the graph
 */
export type ModelRelated<T extends CoreModel, _K extends Attributes<T>> = {
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
   * Get all object linked
   * @returns
   */
  getAll: () => Promise<T[]>;
};

// Empty class to allow filtering it with FilterAttributes
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ModelLinker {}
/**
 * Define a link to 1:n relation
 */
export class ModelLink<T extends CoreModel> implements ModelLinker {
  @NotEnumerable
  protected parent: CoreModel;

  constructor(
    protected uuid: string,
    protected model: CoreModelDefinition<T>,
    parent?: CoreModel
  ) {
    this.parent = parent;
  }

  async get(): Promise<T> {
    return (await this.model.ref(this.uuid).get())?.setContext(this.parent?.getContext());
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
 */
export class ModelLinksSimpleArray<T extends CoreModel> extends Array<ModelRef<T>> implements ModelLinker {
  @NotEnumerable
  private parent: CoreModel;

  constructor(
    protected model: CoreModelDefinition<T>,
    content: any[] = [],
    parent?: CoreModel
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
 */
export class ModelLinksArray<T extends CoreModel, K>
  extends Array<ModelRefCustomProperties<T, (K & { uuid: string }) | { getUuid: () => string }>>
  implements ModelLinker
{
  @NotEnumerable
  parent: CoreModel;
  constructor(
    protected model: CoreModelDefinition<T>,
    content: any[] = [],
    parent?: CoreModel
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
 * Define 1:n relation with some sort of additional data or duplicated data
 *
 * The key of the map is the value of the FK
 */
export type ModelLinksMap<T extends CoreModel, K> = Readonly<{
  [key: string]: ModelRefCustomProperties<T, K & ({ uuid: string } | { getUuid: () => string })>;
}> &
  ModelCollectionManager<K & ({ uuid: string } | { getUuid: () => string })> &
  ModelLinker;

export function createModelLinksMap<T extends CoreModel>(
  model: CoreModelDefinition<any>,
  data: any = {},
  parent?: CoreModel
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
 * Define the parent of the model
 */
export type ModelParent<T extends CoreModel> = ModelLink<T>;

/**
 * Define an export of actions from Model
 */
export type ModelActions = {
  [key: string]: ModelAction;
};

/**
 * Mapper attribute (target of a Mapper service)
 *
 * This is not exported as when mapped the target is always an array
 * TODO Handle 1:1 map
 */
export class ModelMapLoaderImplementation<T extends CoreModel, K = any> {
  @NotEnumerable
  protected _model: CoreModelDefinition<T>;
  @NotEnumerable
  protected _parent: CoreModel;
  /**
   * The uuid of the object
   */
  public uuid: string;

  constructor(model: CoreModelDefinition<T>, data: { uuid: string } & K, parent: CoreModel) {
    Object.assign(this, data);
    this._model = model;
    this._parent = parent;
  }

  /**
   *
   * @returns the model
   */
  async get(): Promise<T> {
    return this._model.ref(this.uuid).get(this._parent.getContext());
  }
}

/**
 * Mapper attribute (target of a Mapper service)
 *
 * This is not exported as when mapped the target is always an array
 * TODO Handle 1:1 map
 */
export type ModelMapLoader<T extends CoreModel, K extends keyof T> = ModelMapLoaderImplementation<T, K> & Pick<T, K>;

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
 */
export type ModelsMapped<
  T extends CoreModel,
  // Do not remove used by the compiler
  K extends FilterAttributes<T, ModelLinker>,
  L extends Attributes<T>
> = Readonly<ModelMapLoader<T, L>[]>;
