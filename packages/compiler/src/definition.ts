import { FileUtils } from "@webda/utils";
import { WorkerLogLevel, WorkerOutput } from "@webda/workout";
import { BinaryLike, createHash, Hash } from "crypto";
import { existsSync, globSync, readFileSync } from "fs";
import type { JSONSchema7 } from "json-schema";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ts from "typescript";

/**
 * Resolve the running @webda/compiler installation root and its lib/ dir.
 *
 * Anchored on the compiler's package.json — not on `import.meta.url` —
 * because under vitest the TS source is served directly, so the running
 * file lives in `src/` rather than `lib/`. Hashing `src/` at test time
 * but `lib/` at build time would otherwise produce different digests
 * for the same logical compiler version.
 *
 * @returns the resolved package root and lib directory, or undefined
 *   if the compiler isn't installed in a standard layout
 */
function resolveCompilerLayout(): { root: string; lib: string } | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));
  /* c8 ignore next 14 -- defensive walk for non-standard installs */
  while (true) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg.name === "@webda/compiler") {
          const main = typeof pkg.main === "string" ? pkg.main : "lib/index.js";
          return { root: dir, lib: dirname(join(dir, main)) };
        }
      } catch {
        /* malformed package.json — keep walking */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

const COMPILER_LAYOUT = resolveCompilerLayout();

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
   * Model identifier
   */
  Identifier: string;
  /**
   * File to import
   */
  Import: string;
  /**
   * Specific plurals for a model
   */
  Plural: string;
  /**
   * Schemas defining the model
   */
  Schemas: {
    /**
     * Schema for input validation
     */
    Input?: JSONSchema7;
    /**
     * Schema for output validation
     */
    Output?: JSONSchema7;
    /**
     * Schema for stored data validation
     */
    Stored?: JSONSchema7;
  };
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
   *
   * Ordered from the closest to the farest
   * CoreModel is ignored
   *
   * class Test extends Parent extends GrandParent extends CoreModel
   * ["Parent", "GrandParent"]
   */
  Ancestors: string[];
  /**
   * Direct Subclasses of the model
   */
  Subclasses: string[];
  /**
   * Return the primary key
   */
  PrimaryKey: string[];
  /**
   * Separator for the primary key to serialize it
   */
  PrimaryKeySeparator?: string;
  /**
   * Return all events for the model
   */
  Events: string[];
  /**
   * Fields reflection
   */
  Reflection: {
    [field: string]: {
      type: string;
      typeParameters?: string[];
      required: boolean;
      description?: string;
    };
  };
  /**
   * Actions defined for the model
   */
  Actions: {
    [action: string]: {
      method?: string;
      path?: string;
      description?: string;
      summary?: string;
      /**
       * If true, the action is global (static method) rather than per-instance
       */
      global?: boolean;
    };
  };
}

/**
 * Definition of a single CLI argument for a {@link CommandDefinition}.
 *
 * Generated by the compiler from method parameter analysis:
 * - `type` from TypeScript type annotation
 * - `default` from parameter initializer
 * - `required` when no default and no `?` modifier
 * - `alias`, `description`, `deprecated` from JSDoc tags on the parameter
 *
 * @example
 * ```json
 * {
 *   "type": "number",
 *   "default": 18080,
 *   "alias": "p",
 *   "description": "Port to listen on"
 * }
 * ```
 */
export type CommandArgDefinition = {
  /**
   * The argument type, determining how the CLI parses the value.
   * Mapped from the TypeScript type annotation on the method parameter.
   */
  type: "string" | "number" | "boolean";
  /**
   * Default value from the method parameter initializer.
   * Omitted if the parameter has no default.
   */
  default?: any;
  /**
   * `true` if the parameter has no default value and no `?` modifier,
   * meaning the user must provide this argument. Omitted when `false`.
   */
  required?: boolean;
  /**
   * Single-character alias for the flag (e.g., `"p"` for `--port`).
   * Extracted from the `@alias` JSDoc tag on the parameter.
   */
  alias?: string;
  /**
   * Help text displayed in `--help` output for this argument.
   * Extracted from the `@description` JSDoc tag on the parameter.
   */
  description?: string;
  /**
   * Deprecation message. When present, the CLI warns users that
   * this flag is deprecated. Extracted from the `@deprecated` JSDoc tag.
   */
  deprecated?: string;
};

/**
 * Definition of a CLI command declared via the `@Command` decorator on a service method.
 *
 * Written into `webda.module.json` under `moddas[serviceName].commands` or
 * `beans[serviceName].commands` by the {@link CommandsMetadata} compiler plugin.
 *
 * @example
 * ```json
 * {
 *   "description": "Start the HTTP server",
 *   "method": "serve",
 *   "args": {
 *     "bind": { "type": "string", "default": "127.0.0.1", "alias": "b" },
 *     "port": { "type": "number", "default": 18080, "alias": "p" }
 *   }
 * }
 * ```
 */
export type CommandDefinition = {
  /**
   * Human-readable description of the command, displayed in CLI help output.
   * Extracted from the `description` option in `@Command("name", { description: "..." })`.
   */
  description: string;
  /**
   * Name of the method on the service class that handles this command.
   * The shell calls `service[method](...args)` when the command is invoked.
   */
  method: string;
  /**
   * Map of argument name to its definition. Keys are method parameter names,
   * which become `--flag` names in the CLI.
   */
  args: { [name: string]: CommandArgDefinition };
  /**
   * Capabilities required by this command.
   * The CLI resolves these against the capabilities map and auto-injects
   * missing services before booting Core.
   */
  requires?: string[];
  /**
   * Lifecycle phase at which this command runs.
   * - `"initialized"` (default when omitted): after `Core.init()`.
   * - `"resolved"`: after `Core.resolve()` only. No service.init() called.
   *   Used for build-time hooks (e.g. `@BuildCommand`).
   */
  phase?: "resolved" | "initialized";
};

export type ServiceMetadata = {
  /**
   * File to import
   */
  Import: string;
  /**
   * Schema defining the service
   */
  Schema?: JSONSchema7;
  /**
   * Configuration for the service
   */
  Configuration?: string;
  /**
   * Capability names provided by this service, detected at compile-time.
   *
   * The compiler inspects which interfaces the service class implements.
   * If an interface has a `@WebdaCapability <name>` JSDoc tag, that name
   * is added to this array. At runtime, the framework uses these to
   * auto-discover services (e.g., registering request filters with the Router).
   *
   * @example `["request-filter", "cors-filter"]`
   */
  capabilities?: string[];
  /**
   * CLI commands declared via `@Command` decorator on service methods.
   *
   * Keys are command names (space-separated for subcommands, e.g., `"aws s3"`).
   * Values describe the command handler and its arguments.
   *
   * @example
   * ```json
   * {
   *   "serve": { "description": "Start server", "method": "serve", "args": { ... } },
   *   "aws s3": { "description": "Manage S3", "method": "s3", "args": { ... } }
   * }
   * ```
   */
  commands?: { [name: string]: CommandDefinition };
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
  /**
   * Default capability providers declared by this package.
   * Maps capability names to service type names.
   * Merged from dependencies at build/load time; project-level values override.
   */
  capabilities?: { [name: string]: string };
  /**
   * Hash of the source files this module was generated from.
   *
   * Compared against the project's current source digest to decide whether
   * the on-disk module file is up-to-date — letting the compiler detect
   * external mutations (git checkout, manual edit, framework upgrade that
   * regenerates the file) even when source hashes alone match the cache.
   */
  sourceDigest?: string;
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
   * Default capability providers for this package.
   * Maps capability names to service type names.
   */
  capabilities?: { [name: string]: string };
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

/** Represents a Webda project on disk, providing access to package metadata and project paths */
export class WebdaProject {
  namespace: string;
  packageDescription: PackageDescriptor;
  /** Create a new WebdaProject.
   * @param folder - path to the project root
   * @param output - worker output for logging
   */
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

  /**
   * Check if the project is a webda application
   * @returns true if a webda.config file exists
   */
  isApplication(): boolean {
    try {
      FileUtils.getConfigurationFile(join(this.folder, "webda.config"));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Mix the running @webda/compiler's package.json + lib/ contents into the
   * digest. Catches both published version bumps (via package.json) and
   * local rebuilds of a linked workspace dep (via lib/ files), since neither
   * project source nor tsconfig change when a framework dep updates.
   *
   * @param hash - the digest accumulator to update
   */
  private hashCompilerPackage(hash: Hash): void {
    if (!COMPILER_LAYOUT) return;
    try {
      hash.update(readFileSync(join(COMPILER_LAYOUT.root, "package.json")));
    } catch {
      /* package.json vanished mid-flight — skip */
    }
    if (!existsSync(COMPILER_LAYOUT.lib)) return;
    globSync("**/*", { cwd: COMPILER_LAYOUT.lib, withFileTypes: true })
      .filter(f => f.isFile())
      .map(f => join(f.parentPath, f.name))
      .sort()
      .forEach(f => hash.update(readFileSync(f) as BinaryLike));
  }

  /**
   * Compute digest of the source files
   * @returns the MD5 hex digest of the source
   */
  getDigest(): string {
    const current = createHash("md5");
    const tsCfg = readFileSync(this.getAppPath("tsconfig.json"));
    current.update(tsCfg as BinaryLike);
    const tsParsed = ts.parseConfigFileTextToJson("tsconfig.json", tsCfg.toString()).config;
    // Maybe just use the mtime of tsconfig + all files?
    globSync(tsParsed.include || ["**/*"], {
      cwd: this.getAppPath(""),
      exclude: tsParsed.exclude,
      withFileTypes: true
    })
      .filter(f => f.isFile())
      .map(f => join(f.parentPath, f.name))
      .sort()
      .forEach(f => {
        current.update(readFileSync(f) as BinaryLike);
      });
    this.hashCompilerPackage(current);
    // We might want to consider doing the same with the output files?
    return current.digest("hex");
  }

  /**
   * Ensure a dependency is declared
   * @param name - the package name to check
   */
  ensureDependency(name: string) {
    if (!this.packageDescription.dependencies || !this.packageDescription.dependencies[name]) {
      throw new Error(`Package ${name} is not declared as a dependency in package.json`);
    }
  }

  /**
   * Subscribe to output events
   * @param event - event name
   * @param listener - callback function
   */
  on(event: string, listener: (...args: any[]) => void) {
    this.output.on(event, listener);
  }

  /**
   * Emit an output event
   * @param event - event name
   * @param args - event arguments
   */
  emit(event: string, ...args: any[]) {
    this.output.emit(event, ...args);
  }

  /**
   * Get an absolute path within the project folder, or the project root if no path given
   * @param path - relative path within the project
   * @returns the absolute path
   */
  getAppPath(path?: string) {
    if (!path) {
      return this.folder;
    }
    return join(this.folder, path);
  }

  /**
   * Log a message at the specified level through the worker output
   * @param level - log level
   * @param args - log arguments
   */
  log(level: WorkerLogLevel, ...args: any[]) {
    this.output.log(level, ...args);
  }

  /**
   * Prefix a name with the project namespace if it does not already contain one
   * @param name - the name to prefix
   * @returns the namespaced name
   */
  completeNamespace(name: string) {
    if (!name.includes("/")) {
      return `${this.namespace}/${name}`;
    }
    return name;
  }
}
