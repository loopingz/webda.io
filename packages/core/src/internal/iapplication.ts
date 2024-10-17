/*
 * i.....ts files should only contains
 * interfaces, types, enums and abstract classes
 * They should not import other files not prefixed with i.
 */

import type { Attributes, Constructor, FilterAttributes, Methods, OmitByTypeRecursive } from "@webda/tsc-esm";
import type { JSONSchema7 } from "json-schema";
import type { OpenAPIV3 } from "openapi-types";
import { AsyncEventEmitter, AsyncEventEmitterImpl, AsyncEventUnknown } from "../events/asynceventemitter";
import { Context, IContextAware, canUpdateContext } from "../contexts/icontext";
import { useContext } from "../contexts/execution";

import { CRUDHelper, StoreHelper } from "../stores/istore";
import { HttpMethodType } from "../contexts/httpcontext";
import { NotEnumerable, DeepPartial } from "@webda/tsc-esm";
import { ServiceParameters } from "../interfaces";

import type { ModelGraph, PackageDescriptor, ProjectInformation, WebdaModule } from "@webda/compiler";
export type { PackageDescriptor, WebdaPackageDescriptor, ProjectInformation, WebdaModule } from "@webda/compiler";

export type ModelAttributes<T extends AbstractCoreModel> = Omit<T, Methods<T> | "Events" | "Store" | "Metadata">;

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

export abstract class AbstractCoreModel implements IAttributeLevelPermissionModel {
  @NotEnumerable
  private __context: Context[] = [useContext()];
  @NotEnumerable
  set context(context: Context) {
    if (!canUpdateContext()) {
      throw new Error("Cannot update context, you have to use runWithContext(() => {}, [myObject])");
    }
    if (context === undefined) {
      if (this.__context.length <= 1) {
        throw new Error("Cannot remove context");
      }
      this.__context.pop();
    } else {
      this.__context.push(context);
    }
  }
  get context(): Context {
    return this.__context[this.__context.length - 1];
  }

  abstract checkAct(context: Context, action: string);
  isDeleted(): boolean {
    throw new Error("Method not implemented.");
  }
  Events: AsyncEventUnknown;
  __type: string;
  /**
   * Class reference to the object
   */
  @NotEnumerable
  __class: ModelDefinition<this>;
  /**
   * Dirty attributes
   */
  __dirty: Set<string>;

  constructor() {
    this.__class = <any>this.constructor;
    this.__type = this.__class.getIdentifier();
  }

  /**
   * Increment an attribute
   * @param property
   * @param value
   * @param itemWriteConditionField
   * @param itemWriteCondition
   * @returns
   */
  incrementAttribute<K extends never, L extends Attributes<this>>(
    property: K,
    value?: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: this[L]
  ) {
    return this.incrementAttributes([{ property, value }], <any>itemWriteConditionField, itemWriteCondition);
  }
  abstract delete<K extends keyof ModelAttributes<this>>(
    itemWriteConditionField?: K,
    itemWriteCondition?: this[K]
  ): Promise<void>;
  abstract incrementAttributes<K extends Attributes<this>, L extends FilterAttributes<this, number>>(
    info: ({ property: L; value: number } | L)[],
    itemWriteConditionField?: K,
    itemWriteCondition?: this[K]
  );
  abstract patch(obj: Partial<this>, conditionField?: keyof this | null, conditionValue?: any): Promise<void>;
  abstract save(full?: boolean | keyof this, ...fields: (keyof this)[]): Promise<this>;
  abstract upsertItemToCollection<K extends FilterAttributes<this, Array<any>>>(
    collection: K,
    item: any,
    index?: number,
    conditionField?: any,
    conditionValue?: any
  ): Promise<void>;
  abstract deleteItemFromCollection<K extends FilterAttributes<this, Array<any>>>(
    collection: K,
    index: number,
    conditionField?: any,
    conditionValue?: any
  ): Promise<void>;
  abstract setAttribute<K extends keyof ModelAttributes<this>, L extends keyof ModelAttributes<this>>(
    property: K,
    value: this[K],
    itemWriteConditionField?: L,
    itemWriteCondition?: this[L]
  );

  /**
   * isDirty check if the object has been modified
   */
  isDirty(): boolean {
    if (this.__dirty === undefined) {
      throw new Error("isDirty called on a non proxied object");
    }
    return this.__dirty?.size > 0;
  }

  /**
   * Define a object that can define permission on attribute level
   */
  abstract attributePermission(attribute: string | symbol, value: any, action: "READ" | "WRITE"): any;
  abstract getUuid(): string;
  abstract setUuid(uuid: string): this;
  static test() {
    return 4;
  }
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
 * ModelRef create
 */
export interface IModelRefWithCreate<T extends AbstractCoreModel> extends CRUDHelper<T> {
  get(): Promise<T>;
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
  Ancestors: ModelDefinition[];
  /**
   * Subclasses of the model
   */
  Subclasses: ModelDefinition[];
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
}

export type SerializedReflection = {
  [K in keyof Reflection]: Reflection[K] extends Array<ModelDefinition<any>> ? string[] : Reflection[K];
};

export type ModelCRUD<T extends AbstractCoreModel> = {
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

export type ModelDeprecated<T extends AbstractCoreModel> = {
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

export type ModelDefinition<T extends AbstractCoreModel = AbstractCoreModel> = ModelCRUD<T> &
  ModelEmitter<T["Events"]> &
  ModelDeprecated<T> & {
    /**
     * Accessing metadata for a model is pretty common
     * so we cache it in the model
     */
    readonly Metadata: Reflection;
    /**
     * If the model have some Expose annotation
     */
    Expose?: ExposeParameters;

    /**
     * Constructor to a new CoreModel object
     */
    new (): T;

    /**
     * Get the model actions
     */
    getActions(): { [key: string]: ModelAction };

    /**
     * Return the event on the model that can be listened to by an
     * external authorized source
     * @see authorizeClientEvent
     */
    getClientEvents(): ({ name: string; global?: boolean } | string)[];
    /**
     * Authorize a public event subscription
     * @param event
     * @param context
     */
    authorizeClientEvent(_event: string, _context: Context, _model?: T): boolean;
    /**
     * Resolve and init the model
     */
    resolve(): void;
  };

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

  constructor(name: string, params: T) {
    super();
    this.name = name;
    this.parameters = this.loadParameters(params);
  }

  abstract loadParameters(params: DeepPartial<T>): T;

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
