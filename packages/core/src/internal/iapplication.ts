/*
 * i.....ts files should only contains
 * interfaces, types, enums and abstract classes
 * They should not import other files not prefixed with i.
 */

import type {
  Attributes,
  Constructor,
  FilterAttributes,
  IsUnion,
  Methods,
  OmitByTypeRecursive,
  Prototype
} from "@webda/tsc-esm";
import type { JSONSchema7 } from "json-schema";
import type { OpenAPIV3 } from "openapi-types";
import { AsyncEventEmitter, AsyncEventEmitterImpl, AsyncEventUnknown } from "../events/asynceventemitter";
import { Context, IContextAware, canUpdateContext } from "../contexts/icontext";
import { useContext } from "../contexts/execution";

import { StoreHelper } from "../stores/istore";
import { HttpMethodType } from "../contexts/httpcontext";
import { NotEnumerable, DeepPartial } from "@webda/tsc-esm";
import { ServiceParameters } from "../interfaces";

import type { ModelGraph, PackageDescriptor, ProjectInformation, WebdaModule } from "@webda/compiler";
export type { PackageDescriptor, WebdaPackageDescriptor, ProjectInformation, WebdaModule } from "@webda/compiler";

type JSONed<T> = T extends { toJSON: () => any } ? ReturnType<T["toJSON"]> : T;

export type NonDeclarativeModel<T extends AbstractModel> = {
  [K in keyof Omit<T, "Events" | "PrimaryKey" | "Class" | "__dirty">]: JSONed<T[K]>;
};

export type Values<T> = T[keyof T];
export type OmitNever<T> = Pick<
  T,
  Values<{
    [Prop in keyof T]: [T[Prop]] extends [never] ? never : Prop;
  }>
>;

export type Pojo<T extends AbstractModel> = Partial<
  OmitNever<{
    [K in keyof NonDeclarativeModel<T>]: T[K] extends Function ? never : JSONed<T[K]>;
  }>
>;

type DtoEd<T> = T extends { toDTO: () => any } ? ReturnType<T["toDTO"]> : T;

type Dto<T extends AbstractModel> = Partial<
  OmitNever<{
    [K in keyof NonDeclarativeModel<T>]: T[K] extends Function ? never : DtoEd<T[K]>;
  }>
>;
/**
 * Retrieve the only
 */
export type ModelAttributes<T extends AbstractModel, K = false> = K extends false
  ? keyof Omit<T, Methods<T> | "Events" | "Store" | "Metadata" | "PrimaryKey" | "Class" | "__dirty">
  : keyof Omit<
      T,
      Methods<T> | "Events" | "Store" | "Metadata" | "PrimaryKey" | "Class" | "__dirty" | FilterAttributes<T, K>
    >;

/**
 * Define the model hierarchy
 *
 * @deprecated
 */
export type ModelsTree = {
  [key: string]: ModelsTree;
};

/**
 * Define a object that can define permission on attribute level
 */
export interface IAttributeLevelPermissionModel extends IContextAware {
  attributePermission(attribute: string | symbol, value: any, action: "READ" | "WRITE"): any;
}

/**
 * Proxied object
 *
 * TODO: Check if this is real useful
 */
export type Proxied<T> = T;

/**
 * Expose parameters for the model
 */
export interface ExposeParameters {
  /**
   * If model have parent but you still want it to be exposed as root
   * in domain-like service: DomainService, GraphQL
   *
   * It would create alias for the model in the root too
   */
  root?: boolean;
  /**
   * You can select to not expose some methods like create, update, delete, get, query
   */
  restrict: {
    /**
     * Create a new object
     */
    create?: boolean;
    /**
     * Update an existing object
     *
     * Includes PUT and PATCH
     */
    update?: boolean;
    /**
     * Query the object
     */
    query?: boolean;
    /**
     * Get a single object
     */
    get?: boolean;
    /**
     * Delete an object
     */
    delete?: boolean;
  };
}

/**
 * Event sent by models
 *
 * Events are sent by the model to notify of changes
 * after the changes are done
 *
 * If you need to prevent the change, you should extend the object
 */
export type ModelEvents<T = any> = {
  Create: { object_id: string; object: T };
  PartialUpdate: any;
  Delete: { object_id: string };
  Update: { object_id: string; object: T; previous: T };
};

/**
 * Get the model Primary Key type
 *
 * If the PrimaryKey is a union it will return a partial of the model with the PrimaryKey
 * Otherwise it will return the type of the PrimaryKey
 */
export type PrimaryKeyType<T extends { PrimaryKey: any }> =
  IsUnion<T["PrimaryKey"]> extends true ? Pick<T, T["PrimaryKey"]> : T[T["PrimaryKey"]];

/**
 * Reference to a user model
 */
export interface IUser extends AbstractModel {
  /**
   * Get the user email
   */
  getEmail(): string | undefined;
}

export interface PrimaryKeyModel {
  PrimaryKey: any;
}

export type ModelClass<T extends AbstractModel = AbstractModel> = {
  /**
   * Metadata to access the model
   */
  Metadata: Reflection;
  /**
   * Shortcut to ref(uuid).get()
   * @param uuid
   */
  get(uuid: PrimaryKeyType<T>): Promise<T>;
  ref(uuid: PrimaryKeyType<T>): IModelRefWithCreate<T>;
  emit(event: string, evt: any): Promise<void>;
  create(data: Pojo<T>, withSave?: boolean): Promise<Proxied<T>>;
  factory(data: Pojo<T>): Promise<Proxied<T>>;
  /**
   * Return the query that maps permission to the model
   * The permission query will be AND with the current query
   *
   * If null or partial is true, permissions checks should still be done in the code
   * If partial is false, canAct won't be called
   */
  getPermissionQuery(_ctx: Context): null | { partial: boolean; query: string };
  /**
   * Iterate through objects
   * @param query
   * @param includeSubclass
   * @param context
   */
  iterate(query?: string, includeSubclass?: boolean, context?: Context): AsyncGenerator<T>;
  /**
   * Query for models
   * @param this
   * @param id
   * @returns
   */
  query(
    query?: string,
    includeSubclass?: boolean
  ): Promise<{
    results: T[];
    continuationToken?: string;
  }>;
  resolve();
};

/**
 * Check if the object is a ModelClass
 */
function isModelClass(obj: any): obj is ModelClass<any> {
  return obj.Metadata !== undefined;
}
/**
 * Define a model uuid
 */
export class Uuid<T extends object> {
  /**
   * Serialize the key
   * @returns
   */
  toString() {
    return Object.values(this.data).join(this.separator);
  }

  static from<T extends object | string | number, K extends keyof T>(
    data: T,
    attributes: K[] | ModelClass<any>,
    separator: string = "-"
  ): Pick<T, K> {
    if (typeof data === "string") {
      return data;
    }
    const res: any = {};
    let attrs: K[];
    if (isModelClass(attributes)) {
      attrs = <any>(
        (Array.isArray(attributes.Metadata.PrimaryKey)
          ? attributes.Metadata.PrimaryKey
          : [attributes.Metadata.PrimaryKey])
      );
    } else {
      attrs = attributes;
    }
    attrs.forEach(e => {
      // Might want to check for separator
      res[e] = data[e];
    });
    return <T>new Uuid(res, separator);
  }

  /**
   * Parse a uuid into a Uuid object
   * @param uuid
   * @param attributes
   * @param separator
   * @returns
   */
  static parse(uuid: string, attributes: string[] | ModelClass<any>, separator?: string): any {
    if (isModelClass(attributes)) {
      separator = attributes.Metadata.PrimaryKeySeparator || "-";
    }
    const info = uuid.split(separator || "-");
    const res = {};
    let attrs: string[];
    if (isModelClass(attributes)) {
      attrs = <any>(
        (Array.isArray(attributes.Metadata.PrimaryKey)
          ? attributes.Metadata.PrimaryKey
          : [attributes.Metadata.PrimaryKey])
      );
    } else {
      attrs = attributes;
    }
    if (info.length !== attrs.length) {
      throw new Error(`Uuid '${uuid}' is invalid for ${attrs.join(",")}`);
    }
    attrs.forEach((a, ind) => {
      res[a] = info[ind];
    });
    return Uuid.from(res, <any>attributes, separator);
  }

  /**
   * Protected constructor that assign the data to the object
   * @param data
   * @param separator
   */
  protected constructor(
    protected data: T,
    protected separator: string = "-"
  ) {
    Object.assign(this, data);
  }
}

/**
 * Represent a permissive core model
 */
export abstract class AbstractModel implements PrimaryKeyModel {
  /**
   * Dirty fields
   */
  __dirty: Set<string>;
  /**
   * Context of the object
   */
  context: Context;
  /**
   * Events for the object
   */
  Events: ModelEvents<this>;
  /**
   * Metadata for the model
   */
  static Metadata: Reflection;
  /**
   * Current class
   */
  Class: ModelClass<this>;
  /**
   * We do not want to allow direct instantiation
   */
  protected constructor() {}
  /**
   * Define the primary key for the model
   *
   * This is only used for typing and should not be used in the code
   */
  PrimaryKey: any;
  /**
   * Unserialize the data into the object
   * @param data
   */
  abstract unserialize(data: any): this;
  /**
   * Get the proxy for this object
   */
  abstract getProxy(): Proxied<this>;

  /**
   * Save the object
   */
  abstract save(): Promise<this>;

  abstract checkAct(
    context: Context,
    action:
      | "create"
      | "update"
      | "get"
      | "delete"
      | "get_binary"
      | "detach_binary"
      | "attach_binary"
      | "update_binary_metadata"
      | "subscribe" // To manage MQTT or Websockets
      | string
  ): Promise<void>;
  abstract canAct(
    context: Context,
    action:
      | "create"
      | "update"
      | "get"
      | "delete"
      | "get_binary"
      | "detach_binary"
      | "attach_binary"
      | "update_binary_metadata"
      | "subscribe" // To manage MQTT or Websockets
      | string
  ): Promise<boolean | string>;

  abstract isDeleted(): boolean;

  static resolve() {}
  /**
   *
   * @param data
   */
  abstract patch<T extends ModelAttributes<this>>(
    data: Pojo<this>,
    conditionField?: T,
    condition?: this[T]
  ): Promise<this>;

  /**
   * Delete the object
   */
  abstract delete(): Promise<void>;

  /**
   * Get the uuid for the object
   * @returns
   */
  getUuid(): PrimaryKeyType<this> {
    if (Array.isArray(this.Class.Metadata.PrimaryKey)) {
      return <any>Uuid.from(this, <any>this.Class.Metadata.PrimaryKey);
    }
    return this[this.Class.Metadata.PrimaryKey];
  }

  /**
   * Set the uuid for the object
   * @param uuid
   */
  setUuid(uuid: PrimaryKeyType<this>): this {
    if (Array.isArray(this.Class.Metadata.PrimaryKey)) {
      this.Class.Metadata.PrimaryKey.forEach(key => {
        this[key] = uuid[key];
      });
    } else {
      this[this.Class.Metadata.PrimaryKey] = uuid;
    }
    return this;
  }

  /**
   * @deprecated You should override the save method
   */
  _onSave() {}

  /**
   * @deprecated You should override the save method
   */
  _onSaved() {}

  /**
   * @deprecated You should override the save/patch method
   */
  _onUpdate() {}

  /**
   * @deprecated You should override the save/patch method
   */
  _onUpdated() {}

  /**
   * @deprecated You should override the delete method
   */
  _onDelete() {}

  /**
   * @deprecated You should override the delete method
   */
  _onDeleted() {}
}

/**
 * ModelRef create
 */
export interface IModelRefWithCreate<T extends AbstractModel> {
  get(): Promise<T>;
  /**
   * Set attribute on the object
   * @param property
   * @param value
   * @param itemWriteConditionField
   * @param itemWriteCondition
   */
  setAttribute<K extends ModelAttributes<T>, L extends ModelAttributes<T>>(
    property: K,
    value: T[K],
    itemWriteConditionField?: L,
    itemWriteCondition?: T[L]
  ): Promise<void>;
  incrementAttribute<K extends ModelAttributes<T, number>, L extends ModelAttributes<T>>(
    property: K,
    value?: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: T[L]
  ): Promise<void>;
  upsert(data: Pojo<T>): Promise<T>;
  create(data: Pojo<T>, withSave?: boolean): Promise<T>;
  /**
   * Update data in the store, replacing the object
   * @param uuid
   * @param data
   * @returns
   */
  update<K extends ModelAttributes<T>>(data: Pojo<T>, conditionField?: K, condition?: T[K]): Promise<void>;
  /**
   * Patch data in the store, patching the object
   * @param uuid
   * @param data
   * @returns
   */
  patch<K extends ModelAttributes<T>>(data: Pojo<T>, conditionField?: K, condition?: T[K]): Promise<void>;
  /**
   * Delete data from the store
   * @param uuid
   * @returns
   */
  delete<K extends ModelAttributes<T>>(conditionField?: K, condition?: T[K]): Promise<void>;
  /**
   * Verify if the object exists
   * @param uuid
   * @returns
   */
  exists(): Promise<boolean>;
  /**
   * Increment attributes of an object
   * @param uuid
   * @param info
   * @returns
   */
  incrementAttributes<K extends ModelAttributes<T>, L extends ModelAttributes<T, number>>(
    info: ({ property: L; value?: number } | L)[],
    conditionField?: K,
    condition?: T[K]
  ): Promise<void>;
  /**
   * Upsert an item to a collection
   * @param uuid
   * @param collection
   * @param item
   * @param index
   * @param itemWriteCondition
   * @param itemWriteConditionField
   * @returns
   */
  upsertItemToCollection<K extends ModelAttributes<T, Array<any>>>(
    collection: K,
    item: any,
    index?: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void>;
  /**
   * Delete item from a collection
   * @param uuid
   * @param collection
   * @param index
   * @param itemWriteCondition
   * @param itemWriteConditionField
   * @returns
   */
  deleteItemFromCollection<K extends ModelAttributes<T, Array<any>>>(
    collection: K,
    index: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void>;
  /**
   * Remove an attribute from an object
   * @param uuid
   * @param attribute
   * @returns
   */
  removeAttribute<L extends ModelAttributes<T>, K extends ModelAttributes<T>>(
    attribute: K,
    conditionField?: L,
    condition?: T[L]
  ): Promise<void>;
}

/**
 * Expose CoreModel reflective properties
 *
 * These properties are detected at compilation by @webda/shell
 * and injected by the application on load
 */
export interface Reflection {
  /**
   * Model identifier
   */
  Identifier: string;
  /**
   * ShortName is set, if the model is final
   *
   * A Webda/User will have a ShortName of User, if no override exists
   * If you define your MyNamespace/User, the ShortName will be undefined for Webda/User
   * and User for MyNamespace/User
   */
  ShortName?: string;
  /**
   * Ancestors of the model
   *
   * This is basically the prototype chain of the model
   */
  Ancestors: ModelClass[];
  /**
   * Subclasses of the model
   */
  Subclasses: ModelClass[];
  /**
   * Relations for the model
   *
   * This is the relation graph for the model
   * It includes Parent, Children, Links, Queries and Maps
   *
   * It is different from the ancestors and subclasses that are the class hierarchy
   */
  Relations: ModelGraph;
  /**
   * Schema for the model
   */
  Schema?: JSONSchema7;
  /**
   * Define the plural of the model
   * We recommand using singular for the model class name
   * @default model name + s
   */
  Plural?: string;
  /**
   * Attributes that define the uuid of the model
   */
  PrimaryKey: string | string[];
  /**
   * Separator for the primary key to serialize it
   */
  PrimaryKeySeparator?: string;
  /**
   * Events emitted by the model
   */
  Events: string[];
  /**
   * Expose parameters for the model
   */
  Expose?: ExposeParameters;
  /**
   * Actions that can be performed on the model
   */
  Actions: { [key: string]: ModelAction };
}

export type SerializedReflection = {
  [K in keyof Reflection]: Reflection[K] extends Array<ModelClass<any>> ? string[] : Reflection[K];
};

export type ModelCRUD<T extends AbstractModel> = {
  Store: StoreHelper<T> & { name: string };
  /**
   * Complete uuid useful to implement uuid prefix or suffix
   * @param uid
   */
  completeUid(uid: string): string;
  /**
   * Get the model uuid field if you do not want to use the uuid field
   */
  getUuidField(): string;
  /**
   * Permission query for the model
   * @param context
   */
  getPermissionQuery(context: Context): null | { partial: boolean; query: string };
  /**
   * Reference to an object without doing a DB request yet
   */
  ref: (uuid: string) => IModelRefWithCreate<any>;
  /**
   * Get an object
   */
  get: (uuid: string) => Promise<any>;
  /**
   * Create a new model
   * @param this
   * @param data
   * @param save if the object should be saved
   */
  create(data: RawModel<T>, save?: boolean): Promise<Proxied<T>>;
  /**
   * Query the model
   * @param query
   */
  query(query?: string, includeSubclass?: boolean): Promise<{ results: T[]; continuationToken?: string }>;
  /**
   * Iterate through objects
   * @param query
   * @param includeSubclass
   * @param context
   */
  iterate(query?: string, includeSubclass?: boolean): AsyncGenerator<T>;

  /**
   * Create a CoreModel object loaded with the content of object
   *
   * It allows polymorphism from Store
   *
   * By default it will act as a create method without saving
   * @param model to create by default
   * @param object to load data from
   */
  factory(object: RawModel<T>): Promise<Proxied<T>>;
};

export type ModelDeprecated<T extends AbstractModel> = {
  /**
   * Get the model schema
   *
   * @deprecated
   */
  getSchema(): JSONSchema7;

  /**
   * Get the model hierarchy
   *
   * @deprecated
   */
  getHierarchy(): { ancestors: string[]; children: ModelsTree };
  /**
   * Get the model relations
   *
   * @deprecated
   */
  getRelations(): ModelGraph;
  /**
   * Get Model identifier
   *
   * @deprecated
   */
  getIdentifier(): string;
  /**
   * Use Store
   * @deprecated
   */
  store<T = any>(): T;
};

export type ModelEmitter<T extends AsyncEventUnknown> = Pick<
  AsyncEventEmitter<T>,
  "on" | "emit" | "removeAllListeners" | "once" | "off"
>;

export type ServicePartialParameters<T extends ServiceParameters> = DeepPartial<Attributes<T>>;
/**
 * Represent a Webda service
 */
export abstract class AbstractService<
  T extends ServiceParameters = ServiceParameters,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  E extends AsyncEventUnknown = {}
> extends AsyncEventEmitterImpl<E> {
  public readonly name: string;
  public readonly parameters: T;

  constructor(name: string, params: ServicePartialParameters<T>) {
    super();
    this.name = name;
  }

  /**
   * Initialize the service
   * @returns
   */
  abstract init(): Promise<this>;
  /**
   * All services should be able to resolve themselves
   * @returns
   */
  abstract resolve(): this;
  /**
   * Get the name of the service
   * @returns
   *
   * @deprecated use name directly
   */
  abstract getName(): string;
  /**
   * Stop the service
   * @returns
   */
  abstract stop(): Promise<void>;
  /**
   *
   * @returns
   */
  abstract getOpenApiReplacements(): { [key: string]: string };
}

export type Modda<T = AbstractService> = Constructor<T, [name: string, params: any]>;

/**
 * Application interface.
 */
export interface IApplication {
  getCurrentConfiguration(): Configuration;
  getAppPath(source: string): string;

  getSchema(name: any): unknown;
  getSchemas(): { [key: string]: JSONSchema7 };

  getModels(): { [key: string]: any };
  getPackageDescription(): PackageDescriptor;
  replaceVariables(arg0: any, arg1: any): any;
  getImplementations<T extends AbstractService>(object: T): { [key: string]: Modda<T> };
  /**
   * Get an application model
   */
  getModel(name: string): any;

  /**
   * Get Webda model name
   * @param object instance of an object or constructor
   * @param full if true return the full model name
   */
  getModelId(object: any, full?: boolean): string | undefined;

  /**
   * Get a service definition by name
   */
  getModda(name: string): Constructor<AbstractService, [string, any]> | undefined;
}

export enum SectionEnum {
  Moddas = "moddas",
  Deployers = "deployers",
  Beans = "beans",
  Models = "models"
}

/**
 * Type of Section
 */
export type Section = "moddas" | "deployers" | "models" | "beans";

export type ModelGraphBinaryDefinition = {
  attribute: string;
  cardinality: "ONE" | "MANY";
  metadata?: string;
};

/**
 * Cached module is all modules discover plus local package including the sources list
 */
export interface CachedModule extends WebdaModule {
  /**
   * Contained dynamic information on the project
   * Statically capture on deployment
   */
  project: ProjectInformation;
}

export type StaticWebsite = {
  url: string;
  path?: string;
  index?: string;
  catchAll?: boolean;
};

export type ServiceGroup = {
  services?: any;
  parameters: any;
};

export type UnpackedConfiguration = {
  version: 4;
  /**
   * Configuration of core
   */
  application?: {
    /**
     * Ignore beans
     *
     * If set to true, all beans are ignored
     * If set to an array, only the beans in the array are ignored
     *
     * @default false
     */
    ignoreBeans?: boolean | string[];
    /**
     * Define the default store
     *
     * @default "Registry"
     */
    defaultStore?: string;
    /**
     * Read from the configuration service before init
     *
     * @default "ConfigurationService"
     */
    configurationService?: string;
  };
  /**
   * Services configuration
   */
  services?: any;
  /**
   * Global parameters
   */
  parameters?: {
    /**
     * Trust this reverse proxies
     */
    trustedProxies?: string | string[];
    /**
     * Allowed origin for referer that match
     * any of this regexp
     *
     * {@link OriginFilter}
     */
    csrfOrigins?: string[];
    /**
     * Allow you to authorize one or several websites
     * If you use "*" then the API is open to direct call and any origins
     * You can also serve one static website by having a
     *
     * {@link WebsiteOriginFilter}
     */
    website?: string | string[];
    /**
     * Serve statically a website
     */
    static?: StaticWebsite;
    /**
     * Read from the configuration service before init
     *
     * @default "ConfigurationService"
     */
    configurationService?: string;
    /**
     * Define the api url
     */
    apiUrl?: string;
    /**
     * Will not try to parse request bigger than this
     *
     * This parameter can be overriden by a direct call to
     * getHttpContext().getRawBody(xxx)
     *
     * @default 10Mb
     */
    requestLimit?: number;
    /**
     * Will not take more than this to read a request (unit: milliseconds)
     *
     * This parameter can be overriden by a direct call to
     * getHttpContext().getRawBody(undefined, xxx)
     *
     * @default 60000
     */
    requestTimeout?: number;
    /**
     * Define the default store
     */
    defaultStore?: string;
    /**
     * Default headers to send to the client
     *
     * Having a Cache-Control: private will prevent caching for API
     * If you overwrite this parameter, you will need to add it back
     */
    defaultHeaders?: { [key: string]: string };
    /**
     * Define metrics
     */
    metrics?:
      | false
      | {
          labels?: { [key: string]: string };
          config?: { [key: string]: any };
          prefix?: string;
        };
    /**
     * Ignore beans
     *
     * If set to true, all beans are ignored
     * If set to an array, only the beans in the array are ignored
     *
     * @default false
     */
    ignoreBeans?: boolean | string[];
    /**
     * Allow any other type of parameters
     */
    [key: string]: any;
  };
  /**
   * OpenAPI override
   *
   * Should move to Router
   */
  openapi?: Partial<OpenAPIV3.Document>;
  /**
   * Include other configuration.json
   *
   * This allow you so share Store definition or parameters between different components
   * The configuration is merged with `deepmerge(...imports, local)`
   */
  imports?: string[];
};

export type Configuration = UnpackedConfiguration & {
  /**
   * Cached modules to avoid scanning node_modules
   * This is used by packagers
   */
  cachedModules?: CachedModule;
  /**
   * Parameters will be set
   */
  parameters: UnpackedConfiguration["parameters"];
};

export type StoredConfiguration = Configuration;

/**
 * Return the gather information from the repository
 * @mermaid Make TypeDoc easy to use with mermaid.js
 * graph TB
 *   mermaid.js --> TypeDoc;
 */
export interface GitInformation {
  /**
   * Current commit reference
   *
   * `git rev-parse HEAD`
   */
  commit: string;
  /**
   * Current branch
   *
   * `git symbolic-ref --short HEAD`
   */
  branch: string;
  /**
   * Current commit short reference
   *
   * `git rev-parse --short HEAD`
   */
  short: string;
  /**
   * Current tag name that match the package version
   */
  tag: string;
  /**
   * Return all tags that point to the current HEAD
   *
   * `git tag --points-at HEAD`
   */
  tags: string[];
  /**
   * Current version as return by package.json with auto snapshot
   *
   * If the version return by package is not in the current `tags`, the version is
   * incremented to the next patch version with a +{date}
   *
   * Example:
   *
   * with package.json version = "1.1.0" name = "mypackage"
   * if a tag "v1.1.0" or "mypackage@1.1.0" then version = "1.1.0"
   * else version = "1.1.1+20201110163014178"
   */
  version: string;
}

/**
 * Define an Action on a model
 *
 * It is basically a method designed to be called by the API or external
 * systems
 */
export interface ModelAction {
  /**
   * Method for the route
   *
   * By default ["PUT"]
   */
  methods?: HttpMethodType[];
  /**
   * Define if the action is global or per object
   *
   * The method that implement the action must be called
   * `_${actionName}`
   */
  global?: boolean;
  /**
   * Additional openapi info
   */
  openapi?: any;
  /**
   * Method of the action
   */
  method?: string;
}

/**
 * Define an export of actions from Model
 */
export type ModelActions = {
  [key: string]: ModelAction;
};

/**
 * Raw model without methods
 *
 * This is used to represent a model without methods and stripping out the helper methods
 */
export type RawModel<T extends object> = Partial<
  OmitByTypeRecursive<Omit<T, "__dirty" | "Events" | "__type" | "__types" | "_new" | "context">, Function>
>;
