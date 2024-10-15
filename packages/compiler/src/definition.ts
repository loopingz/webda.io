import { WorkerLogLevel, WorkerOutput } from "@webda/workout";
import { existsSync, readFileSync } from "fs";
import type { JSONSchema7 } from "json-schema";
import { join } from "path";

export type ModelGraphBinaryDefinition = {
  attribute: string;
  cardinality: "ONE" | "MANY";
  metadata?: string;
};

export type ModelRelation = {
  attribute: string;
  model: string;
  type: "LINK" | "LINKS_MAP" | "LINKS_ARRAY" | "LINKS_SIMPLE_ARRAY";
};

/**
 * Defined relationship for one model
 */
export type ModelGraph = {
  /**
   * Model names of the parent of the parent, etc...
   */
  ancestors?: string[];
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

export interface ModelMetadata {
  /**
   * File to import
   */
  Import: string;
  /**
   * Specific plurals for a model
   */
  Plural: string;
  /**
   * Schema defining the model
   */
  Schema: JSONSchema7;
  /**
   * If model have a short name
   */
  ShortName?: string;
  /**
   * Models graph
   *
   * Typescript does not have reflection, we therefore deduct the
   * relations on compilation time and inject in the module
   *
   * The parent is define by a ModelParent type on the model
   * The links are attribute of types ModelLink
   */
  Relations: ModelGraph;
  /**
   * Ancestors of the model
   */
  Ancestors: string[];
}

export type ServiceMetadata = {
  /**
   * File to import
   */
  Import: string;
  /**
   * Schema defining the service
   */
  Schema: JSONSchema7;
};

/**
 * A Webda module is a NPM package
 *
 * It contains one or more Modda to provide features
 */
export interface WebdaModule {
  /**
   * Schema version
   */
  $schema?: string;
  /**
   * Services provided by the module
   */
  moddas?: {
    [key: string]: ServiceMetadata;
  };
  /**
   * Beans
   */
  beans?: {
    [key: string]: ServiceMetadata;
  };
  /**
   * Deployers provided by this module
   */
  deployers?: {
    [key: string]: ServiceMetadata;
  };

  /**
   * Additional schemas defined by the module
   * Not through a CoreModel or a ServiceParameters
   */
  schemas: {
    [key: string]: JSONSchema7;
  };
  /**
   * Models provided by the module
   */
  models: {
    /**
     * Models provided by the module
     */
    [key: string]: ModelMetadata;
  };
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

export type PackageDescriptorAuthor =
  | string
  | {
      name?: string;
      email?: string;
      url?: string;
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

export class WebdaProject {
  namespace: string;
  packageDescription: PackageDescriptor;
  constructor(
    protected folder: string,
    protected output: WorkerOutput = new WorkerOutput()
  ) {
    if (!existsSync(folder) || !existsSync(join(folder, "package.json"))) {
      throw new Error(`Invalid folder ${folder}`);
    }
    this.packageDescription = JSON.parse(readFileSync(join(folder, "package.json")).toString());
    this.namespace = this.packageDescription.webda?.namespace;
    if (!this.namespace && this.packageDescription.name.startsWith("@")) {
      this.namespace = this.packageDescription.name.split("/")[0].substring(1);
      this.namespace = this.namespace.charAt(0).toUpperCase() + this.namespace.slice(1);
    }
    this.namespace ??= "Webda";
  }

  getAppPath(path?: string) {
    if (!path) {
      return this.folder;
    }
    return join(this.folder, path);
  }

  log(level: WorkerLogLevel, ...args: any[]) {
    this.output.log(level, ...args);
  }

  completeNamespace(name: string) {
    if (!name.includes("/")) {
      return `${this.namespace}/${name}`;
    }
    return name;
  }
}
