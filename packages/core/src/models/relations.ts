import { CoreModel, ModelAction } from "./coremodel";

/**
 * Attribute of an object
 *
 * Filter out methods
 */
export type Attributes<T extends object> = {
  [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];

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
  query: (
    query?: string
  ) => Promise<{ results: T[]; continuationToken?: string }>;
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
export type ModelMapped<
  T extends CoreModel,
  K extends Attributes<T>
> = Readonly<Pick<T, K> & ModelLoader<T> & { uuid: string }>;

/**
 * Define a ModelMap attribute
 */
export type ModelsMapped<
  T extends CoreModel,
  K extends Attributes<T>
> = Readonly<ModelMapped<T, K>[]>;

/**
 * Define a link to 1:n relation
 */
export type ModelLink<
  T extends CoreModel,
  _FK extends keyof T = any
> = ModelLoader<T> &
  String & {
    set: (id: string) => void;
  };

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
 * Define 1:n relation
 */
export type ModelLinksSimpleArray<T extends CoreModel> = Readonly<
  ModelLoader<T>[]
> &
  ModelCollectionManager<string>;
/**
 * Define 1:n relation with some sort of additional data or duplicated data
 */
export type ModelLinksArray<T extends CoreModel, K = any> = Readonly<
  (ModelLoader<T, K> & { uuid: string })[]
> &
  ModelCollectionManager<K & ({ uuid: string } | { getUuid: () => string })>;
/**
 * Define 1:n relation with some sort of additional data or duplicated data
 *
 * The key of the map is the value of the FK
 */
export type ModelLinksMap<T extends CoreModel, K = any> = Readonly<{
  [key: string]: ModelLoader<T, K> & { uuid: string };
}> &
  ModelCollectionManager<K & ({ uuid: string } | { getUuid: () => string })>;

/**
 * Define the parent of the model
 */
export type ModelParent<T extends CoreModel> = ModelLink<T, any>;

/**
 * Define an export of actions from Model
 */
export type ModelActions = {
  [key: string]: ModelAction;
};
