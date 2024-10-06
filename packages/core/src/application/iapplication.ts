/*
 * i.....ts files should only contains
 * interfaces, types, enums and abstract classes
 * They should not import other files not prefixed with i.
 */

//import type { IService, ServiceConstructor } from "../core/icore";
import { Constructor } from "@webda/tsc-esm";
import type { JSONSchema7 } from "json-schema";
import type { OpenAPIV3 } from "openapi-types";

/**
 * Application interface.
 */
export interface IApplication {
  getRelations(arg0: object): ModelGraph;
  getSchemas(): { [key: string]: JSONSchema7 };
  getModels(): { [key: string]: any };
  getImplementations<T extends object>(object: T): { [key: string]: T };
  getPackageDescription(): PackageDescriptor;
  replaceVariables(arg0: any, arg1: any): any;
  name: string;
  version: string;
  description: string;

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

export type Modda<T> = Constructor<T>;

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
  parent?: Omit<ModelRelation, "type">;
  links?: ModelRelation[];
  queries?: {
    attribute: string;
    model: string;
    targetAttribute: string;
  }[];
  maps?: {
    attribute: string;
    model: string;
    targetAttributes: string[];
    targetLink: string;
    cascadeDelete: boolean;
  }[];
  children?: string[];
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
  name?: string;
  version?: string;
  description?: string;
  keywords?: string[];
  license?: string | { name: string };
  homepage?: string;
  bugs?: string;
  repository?: string;
  author?: PackageDescriptorAuthor;
  contributors?: string[] | PackageDescriptorAuthor[];
  files?: string[];
  main?: string;
  bin?:
    | string
    | {
        [key: string]: string;
      };
  man?: string | string[];
  directories?: { [key: string]: string };
  scripts?: { [key: string]: string };
  config?: any;
  dependencies?: { [key: string]: string };
  devDependencies?: { [key: string]: string };
  peerDependencies?: { [key: string]: string };
  peerDependenciesMeta?: {
    [key: string]: {
      optional: boolean;
    };
  };
  optionalDependencies?: { [key: string]: string };
  bundledDependencies?: string[];
  flat?: boolean;
  resolutions?: { [key: string]: string };
  engines?: { [key: string]: string };
  os?: string[];
  cpu?: string[];
  private?: boolean;
  publishConfig?: any;
  webda?: Partial<WebdaPackageDescriptor>;
  termsOfService?: string;
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
