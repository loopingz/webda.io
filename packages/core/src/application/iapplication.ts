/*
 * i.....ts files should only contains
 * interfaces, types, enums and abstract classes
 * They should not import other files not prefixed with i.
 */

import { Constructor } from "@webda/tsc-esm";
import type { JSONSchema7 } from "json-schema";
import type { OpenAPIV3 } from "openapi-types";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IModel {
  Events: any;
}

/**
 * Represent a Webda service
 */
export interface IService {
  /**
   * Exception that occured during the creation of the service
   */
  _createException?: string;
  /**
   * Exception that occured during the initialization of the service
   */
  _initException?: string;
  /**
   * Time of initialization
   */
  _initTime?: number;
  /**
   * Initialize the service
   * @returns
   */
  init: () => Promise<this>;
  /**
   * Reinit the service
   * @param params
   * @returns
   */
  reinit: (params: any) => Promise<this>;
  /**
   * All services should be able to resolve themselves
   * @returns
   */
  resolve: () => this;
  /**
   * Get the name of the service
   * @returns
   */
  getName: () => string;
  /**
   * Stop the service
   * @returns
   */
  stop: () => Promise<void>;
  /**
   *
   * @returns
   */
  getOpenApiReplacements: () => { [key: string]: string };
}
/**
 * Application interface.
 */
export interface IApplication {
  getGraph(): ModelsGraph;
  getSchema(name: any): unknown;
  getModelHierarchy(i: string): { children: ModelsTree; ancestors: string[] };
  getModelPlural(arg0: string): string;
  getAppPath(source: string): string;
  getRelations(objectOrName: IModel | Constructor<IModel> | string): ModelGraph;
  getSchemas(): { [key: string]: JSONSchema7 };
  getModels(): { [key: string]: any };
  getImplementations<T extends object>(object: T): { [key: string]: T };
  getPackageDescription(): PackageDescriptor;
  replaceVariables(arg0: any, arg1: any): any;

  /**
   * Get the model hierarchy
   * @param model
   */
  getModelHierarchy<T extends object>(
    model: T | string
  ): {
    ancestors: string[];
    children: ModelsTree;
  };

  /**
   * Get an application model
   */
  getModelDefinition(name: string): any;

  /**
   * Get Webda model name
   * @param object instance of an object or constructor
   * @param full if true return the full model name
   */
  getModelId(object: any, full?: boolean): string | undefined;

  /**
   * Get a service by name
   */
  getServiceDefinition(name: string): any;
}

export enum SectionEnum {
  Moddas = "moddas",
  Deployers = "deployers",
  Beans = "beans"
}

/**
 * Webda specific metadata for the project
 */
export interface WebdaPackageDescriptor {
  /**
   * Webda namespace
   */
  namespace?: string;
  /**
   * Logo to display within the shell tty
   */
  logo?: string;
  /**
   * Service to replace default launcher
   */
  launcher?: {
    /**
     * Service to use for launch
     */
    service: string;
    /**
     * Method to use
     */
    method: string;
  };
  /**
   * Information on the workspace
   */
  workspaces?: {
    packages: string[];
    parent: PackageDescriptor;
    path: string;
  };
  [key: string]: any;
}

/**
 * Information on the whole project
 */
export interface ProjectInformation {
  /**
   * package.json information
   */
  package: PackageDescriptor;
  /**
   * Webda project information
   *
   * It is the aggregation of webda information contained in package
   * and its workspace meta
   */
  webda: WebdaPackageDescriptor;
  /**
   * Git information gathered
   */
  git: GitInformation;
  /**
   * Deployment information
   */
  deployment: {
    name: string;
    [key: string]: any;
  };
}

/**
 * Type of Section
 */
export type Section = "moddas" | "deployers" | "models" | "beans";

export type PackageDescriptorAuthor =
  | string
  | {
      name?: string;
      email?: string;
      url?: string;
    };

export type ModelGraphBinaryDefinition = {
  attribute: string;
  cardinality: "ONE" | "MANY";
  metadata?: string;
};

/**
 * Defined relationship for one model
 */
export type ModelGraph = {
  /**
   * If the model has a parent
   */
  parent?: Omit<ModelRelation, "type">;
  /**
   * This contains links to other models.
   * These links are low cardinality as ids and
   * their selected attributes are stored in the
   * current model.
   */
  links?: ModelRelation[];
  /**
   * Target other models with a new query
   * This is usually our foreign keys
   *
   * This will generate queries for you:
   * SELECT * FROM 'model' WHERE 'targetAttribute' = 'this[attribute]'
   */
  queries?: {
    /**
     * Attribute in the model
     */
    attribute: string;
    /**
     * Targeted model
     */
    model: string;
    /**
     * Targeted model attribute
     */
    targetAttribute: string;
  }[];
  /**
   * Maps are deduplication of data in your model
   * They are managed automatically by a service like `ModelMapper`
   *
   * They are useful in NoSQL environment like DynamoDB or Firebase
   */
  maps?: {
    /**
     * Attribute in the model
     */
    attribute: string;
    /**
     * Target model
     */
    model: string;
    /**
     * Target model attributes to duplicate
     */
    targetAttributes: string[];
    targetLink: string;
    /**
     *
     */
    cascadeDelete: boolean;
  }[];
  /**
   * References to every model that declare this model
   * as a parent
   */
  children?: string[];
  /**
   * Binaries attribute, in the model you can declare
   * attributes as Binary, so users can upload binaries that
   * will be linked to this object with some metadata
   */
  binaries?: ModelGraphBinaryDefinition[];
};

/**
 * Defined relationship for all models
 */
export type ModelsGraph = {
  // key is shared with models
  [key: string]: ModelGraph;
};

/**
 * Some package exists but seems pretty big for this
 * https://classic.yarnpkg.com/en/docs/package-json
 */
export interface PackageDescriptor {
  /**
   * The name of the package.
   */
  name?: string;
  /**
   * The version of the package.
   */
  version?: string;
  /**
   * A brief description of the package.
   */
  description?: string;
  /**
   * Keywords that describe the package.
   */
  keywords?: string[];
  /**
   * The license for the package.
   */
  license?: string | { name: string };
  /**
   * The homepage URL for the package.
   */
  homepage?: string;
  /**
   * The URL to the package's issue tracker.
   */
  bugs?: string;
  /**
   * The URL to the package's repository.
   */
  repository?: string;
  /**
   * The author of the package.
   */
  author?: PackageDescriptorAuthor;
  /**
   * The contributors to the package.
   */
  contributors?: string[] | PackageDescriptorAuthor[];
  /**
   * The files included in the package.
   */
  files?: string[];
  /**
   * The entry point to the package.
   */
  main?: string;
  /**
   * The executable files for the package.
   */
  bin?:
    | string
    | {
        [key: string]: string;
      };
  /**
   * The manual pages for the package.
   */
  man?: string | string[];
  /**
   * The directories in the package.
   */
  directories?: { [key: string]: string };
  /**
   * The scripts that can be run for the package.
   */
  scripts?: { [key: string]: string };
  /**
   * Configuration options for the package.
   */
  config?: any;
  /**
   * The dependencies of the package.
   */
  dependencies?: { [key: string]: string };
  /**
   * The development dependencies of the package.
   */
  devDependencies?: { [key: string]: string };
  /**
   * The peer dependencies of the package.
   */
  peerDependencies?: { [key: string]: string };
  /**
   * Metadata for peer dependencies.
   */
  peerDependenciesMeta?: {
    [key: string]: {
      optional: boolean;
    };
  };
  /**
   * The optional dependencies of the package.
   */
  optionalDependencies?: { [key: string]: string };
  /**
   * The bundled dependencies of the package.
   */
  bundledDependencies?: string[];
  /**
   * If true, the package will be installed with a flat node_modules structure.
   */
  flat?: boolean;
  /**
   * Resolutions for dependencies.
   */
  resolutions?: { [key: string]: string };
  /**
   * The engines that the package is compatible with.
   */
  engines?: { [key: string]: string };
  /**
   * The operating systems that the package is compatible with.
   */
  os?: string[];
  /**
   * The CPU architectures that the package is compatible with.
   */
  cpu?: string[];
  /**
   * If true, the package is private and cannot be published.
   */
  private?: boolean;
  /**
   * Configuration for publishing the package.
   */
  publishConfig?: any;
  /**
   * Webda specific metadata for the package.
   */
  webda?: Partial<WebdaPackageDescriptor>;
  /**
   * The terms of service for the package.
   */
  termsOfService?: string;
  /**
   * The title of the package.
   */
  title?: string;
}

export type ModelRelation = {
  attribute: string;
  model: string;
  type: "LINK" | "LINKS_MAP" | "LINKS_ARRAY" | "LINKS_SIMPLE_ARRAY";
};

/**
 * Define the model hierarchy
 */
export type ModelsTree = {
  [key: string]: ModelsTree;
};
/**
 * A Webda module is a NPM package
 *
 * It contains one or more Modda to provide features
 */
export interface Module {
  /**
   * Services provided by the module
   */
  moddas?: { [key: string]: string };
  /**
   * Models provided by the module
   */
  models: {
    /**
     * Models provided by the module
     */
    list: { [key: string]: string };
    /**
     * Models hierarchy tree
     *
     * Models Graph establish the relationship between models
     * Models Tree establish the hierarchy between models classes
     */
    tree: ModelsTree;
    /**
     * Models graph
     *
     * Typescript does not have reflection, we therefore deduct the
     * relations on compilation time and inject in the module
     *
     * The parent is define by a ModelParent type on the model
     * The links are attribute of types ModelLink
     */
    graph: ModelsGraph;
    /**
     * Specific plurals for a model
     */
    plurals: { [key: string]: string };
    /**
     * Store the model attributes types
     */
    reflections: { [key: string]: { [key: string]: string } };
  };
  /**
   * Deployers provided by the module
   *
   * @link Deployer
   */
  deployers?: { [key: string]: string };
  /**
   * Schemas for services, deployers and coremodel
   */
  schemas?: { [key: string]: JSONSchema7 };
  /**
   * Application beans
   */
  beans?: { [key: string]: string };
}

/**
 * Cached module is all modules discover plus local package including the sources list
 */
export interface CachedModule extends Module {
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
export type UnpackedConfiguration = {
  version: 3;
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
