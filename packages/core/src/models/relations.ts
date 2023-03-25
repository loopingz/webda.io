import {
  CoreModel,
  CoreModelDefinition,
  ModelAction,
  ModelRef,
  ModelRefCustom,
  ModelRefCustomProperties
} from "./coremodel";

/**
 * Attribute of an object
 *
 * Filter out methods
 */
export type Attributes<T extends object> = {
  [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];

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

/**
 * Mapper attribute (target of a Mapper service)
 *
 * This is not exported as when mapped the target is always an array
 * TODO Handle 1:1 map
 */
export type ModelMapped<T extends CoreModel, K extends Attributes<T>> = Readonly<
  ModelLoader<T, Pick<T, K> & { uuid: string }>
>;

/**
 * Define a ModelMap attribute
 */
export type ModelsMapped<T extends CoreModel, K extends Attributes<T>> = Readonly<ModelMapped<T, K>[]>;

/**
 * Define a link to 1:n relation
 */
/*
export type ModelLink<T extends CoreModel, _FK extends keyof T = any> = ModelLoader<T> &
  String & {
    set: (id: string) => void;
  };
  */
export class ModelLink<T extends CoreModel> {
  constructor(protected uuid: string, protected model: CoreModelDefinition<T>) {}
  async get(): Promise<T> {
    return this.model.ref(this.uuid).get();
  }
  set(id: string | T) {
    this.uuid = typeof id === "string" ? id : id.getUuid();
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

export class ModelLinksSimpleArray<T extends CoreModel> extends Array<ModelRef<T>> {
  constructor(protected model: CoreModelDefinition<T>, content: any[] = []) {
    super();
    content.forEach(c => this.add(c));
  }

  add(model: string | ModelRef<T> | T) {
    this.push(typeof model === "string" ? new ModelRef(model, this.model) : new ModelRef(model.getUuid(), this.model));
  }

  remove(model: ModelRef<T> | string | T) {
    let index = this.findIndex(m => m.toString() === (typeof model === "string" ? model : model.getUuid()));
    if (index >= 0) {
      this.splice(index, 1);
    }
  }
}

export class ModelLinksArray<T extends CoreModel, K> extends Array<
  ModelRefCustomProperties<T, (K & { uuid: string }) | { getUuid: () => string }>
> {
  constructor(protected model: CoreModelDefinition<T>, content: any[] = []) {
    super();
    this.push(...content.map(c => <ModelRefCustomProperties<T, K>>new ModelRefCustom(c.uuid, model, c)));
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
              model
            ))
      )
    );
  }

  remove(model: ModelRefCustomProperties<T, K> | string | T) {
    const uuid = typeof model === "string" ? model : (<{ uuid: string }>model).uuid || model.getUuid();
    let index = this.findIndex(m => m.getUuid() === uuid);
    if (index >= 0) {
      this.splice(index, 1);
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
  ModelCollectionManager<K & ({ uuid: string } | { getUuid: () => string })>;

export function createModelLinksMap<T extends CoreModel>(model: CoreModelDefinition<any>, data: any = {}) {
  let result = {
    add: (model: ModelRefCustomProperties<T, any>) => {
      result[model.uuid || model.getUuid()] = model;
    },
    remove: (model: ModelRefCustomProperties<T, any> | string) => {
      // @ts-ignore
      const uuid = typeof model === "string" ? model : model.uuid || model.getUuid();
      delete result[uuid];
    }
  };
  Object.keys(data)
    .filter(k => k !== "__proto__")
    .forEach(key => {
      result[key] = new ModelRefCustom(data[key].uuid, model, data[key]);
    });
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
