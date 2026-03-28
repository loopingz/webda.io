import type { OpenAPIV3 } from "openapi-types";
import type { ModelGraph, PackageDescriptor, ProjectInformation, WebdaModule } from "@webda/compiler";
export type { PackageDescriptor, WebdaPackageDescriptor, ProjectInformation, WebdaModule } from "@webda/compiler";

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
  services?: Record<string, any>;
  /**
   * Global parameters
   *
   * Shared between all services if it matches the service parameters
   */
  parameters?: {
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
     * Define the api url
     */
    apiUrl?: string;
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
   * This allow you to share Store definition or parameters between different components
   * The configuration is merged with `deepmerge(...imports, local)`
   */
  $import?: string[] | string;
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

/**
 * Return the gather information from the repository
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
