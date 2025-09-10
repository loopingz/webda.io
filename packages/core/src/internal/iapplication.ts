/*
 * i.....ts files should only contains
 * interfaces, types, enums and abstract classes
 * They should not import other files not prefixed with i.
 */

import type { Attributes, CustomConstructor, OmitByTypeRecursive, Prototype } from "@webda/tsc-esm";
import type { JSONSchema7 } from "json-schema";
import type { OpenAPIV3 } from "openapi-types";
import { AsyncEventEmitter, AsyncEventEmitterImpl, AsyncEventUnknown } from "../events/asynceventemitter";
import { IContextAware } from "../contexts/icontext";

import { HttpMethodType } from "../contexts/httpcontext";
import { DeepPartial } from "@webda/tsc-esm";
import { ServiceParameters } from "../interfaces";

import type { ModelGraph, PackageDescriptor, ProjectInformation, WebdaModule } from "@webda/compiler";
import { Model } from "@webda/models";
import { State, StateOptions } from "@webda/utils";
export type { PackageDescriptor, WebdaPackageDescriptor, ProjectInformation, WebdaModule } from "@webda/compiler";

export type Values<T> = T[keyof T];
export type OmitNever<T> = Pick<
  T,
  Values<{
    [Prop in keyof T]: [T[Prop]] extends [never] ? never : Prop;
  }>
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
 * Reference to a user model
 */
export interface IUser extends Model {
  /**
   * Get the user email
   */
  getEmail(): string | undefined;
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
  Ancestors: Prototype<Model>[];
  /**
   * Subclasses of the model
   */
  Subclasses: Prototype<Model>[];
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
  PrimaryKey: string[];
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
  [K in keyof Reflection]: Reflection[K] extends Array<Prototype<Model>> ? string[] : Reflection[K];
};

export type ModelEmitter<T extends AsyncEventUnknown> = Pick<
  AsyncEventEmitter<T>,
  "on" | "emit" | "removeAllListeners" | "once" | "off"
>;

export type ServiceStates =
  | "initial"
  | "resolving"
  | "resolved"
  | "errored"
  | "initializing"
  | "running"
  | "stopping"
  | "stopped";

/**
 * Define the service state for the application
 */
export const ServiceState = (options: StateOptions<ServiceStates>) => State({ error: "errored", ...options });

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

  constructor(name: string, params: T) {
    super();
    this.name = name;
    // TODO Remove to auto create based on service definition
    this.parameters =
      !(params instanceof ServiceParameters) && this["loadParameters"] ? this["loadParameters"](params) : params;
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
   * Return the state of initialization
   */
  abstract getState(): string;
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

export type Modda<T = AbstractService> = CustomConstructor<T, [name: string, params: any]> & {
  createConfiguration: (params: any) => any;
};

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
  getModel(name: string | object): any;
  /**
   * Get the metadata for a model
   * @param name
   */
  getModelMetadata(name: string): Reflection | undefined;

  /**
   * Get Webda model name
   * @param object instance of an object or constructor
   * @param full if true return the full model name
   */
  getModelId(object: any, full?: boolean): string | undefined;

  /**
   * Get a service definition by name
   */
  getModda(name: string): CustomConstructor<AbstractService, [string, any]> | undefined;
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
