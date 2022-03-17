import * as fs from "fs";
import * as path from "path";
import { Context, Core, CoreModelDefinition, Service, WebdaError } from "./index";
import { WorkerLogLevel, WorkerOutput } from "@webda/workout";
import { JSONSchema7 } from "json-schema";
import { FileUtils } from "./utils/serializers";

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

/**
 * A Webda module is a NPM package
 *
 * It contains one or more Modda to provide features
 */
export interface Module {
  /**
   * Services provided by the module
   */
  services?: { [key: string]: string };
  /**
   * Models provided by the module
   */
  models?: { [key: string]: string };
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
}

/**
 * Cached module is all modules discover plus local package including the sources list
 */
export interface CachedModule extends Module {
  /**
   * Application beans
   */
  beans?: { [key: string]: string };
  /**
   * Contained dynamic information on the project
   * Statically capture on deployment
   */
  project: ProjectInformation;
}

/**
 * Configuration from Webda 1.0 > version > 0.5
 */
export type ConfigurationV1 = {
  /**
   * Configuration version
   */
  version: 1;
  /**
   * Cached modules to avoid scanning node_modules
   * This is used by packagers
   */
  cachedModules?: CachedModule;
  /**
   * Models
   */
  models?: any;
  /**
   * Services configuration
   */
  services?: any;
  [key: string]: any;
};

export type Configuration = {
  version: 2;
  /**
   * Cached modules to avoid scanning node_modules
   * This is used by packagers
   */
  cachedModules?: CachedModule;
  /**
   * Module definition
   */
  module: Module;
  /**
   * Services configuration
   */
  services?: any;
  /**
   * Global parameters
   */
  parameters?: {
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
     *
     * {@link WebsiteOriginFilter}
     */
    website?: string | string[] | { url: string };
    /**
     * Cookie configuration for session
     */
    cookie?: {
      sameSite: "None" | "Strict" | "Lax";
      domain: string;
      /**
       * @minimum 1
       */
      maxAge: number;
      path: string;
    };
    /**
     * Read from the configuration service before init
     */
    configurationService?: string;
    /**
     * Application salt
     */
    salt?: string;
    /**
     * Define the api url
     */
    apiUrl?: string;
    [key: string]: any;
  };
  /**
   * OpenAPI override
   */
  openapi?: any;
};

export type StoredConfiguration = ConfigurationV1 | Configuration;

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
 * Helper to define a ServiceContrustor
 */
export interface ServiceConstructor<T extends Service> {
  new (webda: Core, name: string, params: any): T;
}

export enum SectionEnum {
  Services = "services",
  Deployers = "deployers",
  Models = "models",
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
export type Section = "services" | "deployers" | "models" | "beans";
/**
 * Map a Webda Application
 *
 * It allows to:
 *  - Analyse imported modules
 *  - Scan code for Modda and generate the webda.config.json
 *  - Compile and Watch
 *  - Migrate from old configuration
 *  - List deployments
 *
 *
 * @category CoreFeatures
 */
export class Application {
  /**
   * Get Application root path
   */
  protected appPath: string;
  /**
   * Base configuration loaded from webda.config.json
   */
  protected baseConfiguration: Configuration;
  /**
   * Current deployment
   */
  protected currentDeployment: string;

  /**
   * Contains all definitions from imported modules and current code
   */
  protected cachedModules: CachedModule = {
    services: {},
    models: {},
    deployers: {},
    beans: {},
    schemas: {},
    project: {
      webda: {
        namespace: ""
      },
      git: {
        branch: "",
        commit: "",
        short: "",
        tag: "",
        tags: [],
        version: ""
      },
      deployment: {
        name: ""
      },
      package: {
        name: "",
        version: ""
      }
    }
  };

  /**
   * Contains definitions of current application
   */
  protected appModule: Module = {
    services: {},
    models: {},
    deployers: {}
  };

  /**
   * Contains already loaded modules
   */
  protected _loaded: string[] = [];

  /**
   * Deployers type registry
   */
  protected deployers: { [key: string]: any } = {};

  /**
   * Services type registry
   */
  protected services: { [key: string]: ServiceConstructor<Service> } = {};

  /**
   * Models type registry
   */
  protected models: { [key: string]: any } = {};

  /**
   * Class Logger
   */
  protected logger: WorkerOutput;

  /**
   * Detect if running as workspace
   */
  protected workspacesPath: string = "";

  /**
   * When the application got initiated
   */
  protected initTime: number;

  /**
   * Configuration file
   */
  readonly configurationFile: string;
  /**
   * Current deployment file
   */
  deploymentFile: string;

  /**
   * Current application
   */
  protected static active: Application;

  /**
   *
   * @param {string} fileOrFolder to load Webda Application from
   * @param {Logger} logger
   */
  constructor(file: string, logger: WorkerOutput = undefined, allowModule: boolean = false) {
    this.logger = logger || new WorkerOutput();
    this.initTime = Date.now();
    if (!fs.existsSync(file)) {
      throw new WebdaError(
        "NO_WEBDA_FOLDER",
        `Not a webda application folder or webda.config.jsonc or webda.config.json file: unexisting ${file}`
      );
    }
    if (fs.lstatSync(file).isDirectory()) {
      file = path.join(file, "webda.config.jsonc");
      if (!fs.existsSync(file)) {
        file = file.substr(0, file.length - 1);
      }
    }
    // Check if file is a file or folder
    if (!fs.existsSync(file) && !allowModule) {
      throw new WebdaError(
        "NO_WEBDA_FOLDER",
        `Not a webda application folder or webda.config.jsonc or webda.config.json file: ${file}`
      );
    }
    this.appPath = path.dirname(file);
    try {
      this.configurationFile = file;
      this.baseConfiguration = this.loadConfiguration(file);
    } catch (err) {
      this.log("WARN", err);
      if (allowModule) {
        this.baseConfiguration = { version: 2, module: {} };
      } else {
        throw new WebdaError("INVALID_WEBDA_CONFIG", `Cannot parse JSON of: ${file}`);
      }
    }

    this.cachedModules = this.baseConfiguration.cachedModules;
  }

  /**
   * Import all required modules
   */
  async load() {
    await this.loadModule(this.cachedModules);
  }

  /**
   * Allow subclass to implement migration
   *
   * @param file
   * @returns
   */
  loadConfiguration(file: string) {
    return FileUtils.load(file);
  }

  /**
   *
   * @param proto Prototype to send
   */
  getFullNameFromPrototype(proto): string {
    for (let section in SectionEnum) {
      for (let i in this[SectionEnum[section]]) {
        if (this[SectionEnum[section]][i] && this[SectionEnum[section]][i].prototype === proto) {
          return i;
        }
      }
    }
  }

  /**
   * Get a schema from a type
   *
   * Schema should be precomputed in the default app
   * @param type
   * @returns
   */
  getSchema(type: string): JSONSchema7 {
    return this.cachedModules.schemas[type];
  }

  /**
   * Check if application has cached modules
   *
   * When deployed the application contains cachedModules in the `webda.config.json`
   * It allows to avoid the search for `webda.module.json` inside node_modules and
   * take the schema from the cached modules also
   */
  isCached() {
    return true;
  }

  /**
   * Retrieve specific webda conf from package.json
   *
   * In case of workspaces the object is combined
   */
  getPackageWebda(): WebdaPackageDescriptor {
    return (
      this.cachedModules.project?.webda || {
        namespace: "Webda"
      }
    );
  }
  /**
   * Retrieve content of package.json
   */
  getPackageDescription() {
    return this.cachedModules.project?.package || {};
  }

  /**
   * Log information
   *
   * @param level to log for
   * @param args anything to display same as console.log
   */
  log(level: WorkerLogLevel, ...args) {
    if (this.logger) {
      this.logger.log(level, ...args);
    }
  }

  /**
   * Get current logger
   */
  getWorkerOutput() {
    return this.logger;
  }

  /**
   * Return the current app path
   *
   * @param subpath to append to
   */
  getAppPath(subpath: string = undefined) {
    if (subpath && subpath !== "") {
      if (subpath.startsWith("/")) {
        return subpath;
      }
      return path.join(this.appPath, subpath);
    }
    return this.appPath;
  }

  /**
   * Add a new service
   *
   * @param name
   * @param service
   */
  addService(name: string, service: ServiceConstructor<Service>) {
    this.log("TRACE", "Registering service", name);
    this.services[name.toLowerCase()] = service;
  }

  /**
   *
   * @param section
   * @param name
   * @returns
   */
  getWebdaObject(section: Section, name) {
    let objectName = this.completeNamespace(name);
    this.log("TRACE", `Search for ${section} ${objectName}`);
    if (!this[section][objectName] && name.indexOf("/") === -1) {
      objectName = `webda/${name}`.toLowerCase();
    }
    if (!this[section][objectName]) {
      throw Error(
        `Undefined ${section.substr(0, section.length - 1)} ${name} or ${objectName} (${Object.keys(this[section]).join(
          ", "
        )})`
      );
    }
    return this[section][objectName];
  }

  /**
   * Get a service based on name
   *
   * @param name
   */
  getService(name) {
    return this.getWebdaObject("services", name);
  }

  /**
   * Return all services of the application
   */
  getServices() {
    return this.services;
  }

  /**
   * Retrieve the model implementation
   *
   * @param name model to retrieve
   */
  getModel(name: string): any {
    return this.getWebdaObject("models", name);
  }

  /**
   * Get all models definitions
   */
  getModels(): { [key: string]: Context | CoreModelDefinition } {
    return this.models;
  }

  /**
   * Return all deployers
   */
  getDeployers(): { [key: string]: ServiceConstructor<Service> } {
    return this.deployers;
  }

  /**
   * Add a new model
   *
   * @param name
   * @param model
   */
  addModel(name: string, model: any) {
    this.log("TRACE", "Registering model", name);
    this.models[name.toLowerCase()] = model;
  }

  /**
   * Add a new deployer
   *
   * @param name
   * @param model
   */
  addDeployer(name: string, model: any) {
    this.log("TRACE", "Registering deployer", name);
    this.deployers[name.toLowerCase()] = model;
  }

  /**
   * Return webda current version
   *
   * @returns package version
   * @since 0.4.0
   */
  getWebdaVersion(): string {
    return JSON.parse(fs.readFileSync(__dirname + "/../package.json").toString()).version;
  }

  /**
   * Retrieve Git Repository information
   *
   * {@link GitInformation} for more details on how the information is gathered
   * @return the git information
   */
  getGitInformation(): GitInformation {
    return this.cachedModules.project?.git;
  }

  /**
   * Allow variable inside of string
   *
   * @param templateString to copy
   * @param replacements additional replacements to run
   */
  protected stringParameter(templateString: string, replacements: any = {}) {
    // Optimization if no parameter is found just skip the costy function
    if (templateString.indexOf("${") < 0) {
      return templateString;
    }
    return new Function("return `" + templateString.replace(/\$\{/g, "${this.") + "`;").call({
      ...this.cachedModules.project,
      now: this.initTime,
      ...replacements
    });
  }

  /**
   * Allow variable inside object strings
   *
   * Example
   * ```js
   * replaceVariables({
   *  myobj: "${test.replace}"
   * }, {
   *  test: {
   *    replace: 'plop'
   *  }
   * })
   * ```
   * will return
   * ```
   * {
   *  myobj: 'plop'
   * }
   * ```
   *
   * By default the replacements map contains
   * ```
   * {
   *  git: GitInformation,
   *  package: 'package.json content',
   *  deployment: string,
   *  now: number,
   *  ...replacements
   * }
   * ```
   *
   * See: {@link GitInformation}
   *
   * @param object a duplicated object with replacement done
   * @param replacements additional replacements to run
   */
  replaceVariables(object: any, replacements: any = {}) {
    if (typeof object === "string") {
      return this.stringParameter(object, replacements);
    }
    let app = this;
    return JSON.parse(
      JSON.stringify(object, function (key: string, value: any) {
        if (typeof this[key] === "string") {
          return app.stringParameter(value, replacements);
        }
        return value;
      })
    );
  }

  /**
   * Get current deployment name
   */
  getCurrentDeployment() {
    return this.cachedModules.project.deployment.name;
  }

  /**
   * Return all application modules merged as one
   *
   * Used when deployed
   * @returns
   */
  getModules(): CachedModule {
    return this.cachedModules;
  }

  /**
   * Get application configuration
   * @returns
   */
  getConfiguration(deployment: string = undefined): Configuration {
    return this.baseConfiguration;
  }

  /**
   * Return current Configuration of the Application
   *
   * Same as calling
   *
   * ```js
   * getConfiguration(this.currentDeployment);
   * ```
   */
  getCurrentConfiguration(): Configuration {
    return this.getConfiguration();
  }

  /**
   * Import a file
   *
   * If the `default` is set take this or use old format
   *
   * @param info
   */
  async importFile(info: string): Promise<any> {
    if (info.startsWith(".")) {
      info = this.appPath + "/" + info;
    }
    try {
      this.log("INFO", "Load file", info, fs.existsSync(info));
      const [importFilename, importName = "default"] = info.split(":");
      // const relativePath = "./" + path.relative(this.appPath, path.resolve(info));
      return (await import(importFilename))[importName];
    } catch (err) {
      this.log("WARN", "Cannot resolve require", info, err.message);
    }
  }

  /**
   * Load local module
   */
  async loadLocalModule() {
    let moduleFile = path.join(process.cwd(), "webda.module.json");
    if (fs.existsSync(moduleFile)) {
      await this.loadModule(JSON.parse(fs.readFileSync(moduleFile).toString()), process.cwd());
    }
  }

  /**
   * Load the module,
   *
   * @protected
   * @ignore Useless for documentation
   */
  async loadModule(module: Module, parent: string = this.appPath) {
    const info: Omit<CachedModule, "project"> = { beans: {}, ...module };
    const sectionLoader = async (section: Section) => {
      for (let key in info[section]) {
        this[section][key.toLowerCase()] = await this.importFile(path.join(parent, info[section][key]));
      }
    };
    await Promise.all([
      sectionLoader("services"),
      sectionLoader("deployers"),
      sectionLoader("models"),
      sectionLoader("beans")
    ]);
  }

  /**
   * Return the full name including namespace
   *
   * In Webda the ServiceType include namespace `Webda/Store` or `Webda/Test`
   * This method will make sure the namespace is present, adding it if no '/'
   * is found in the name
   *
   * @param name
   */
  completeNamespace(name: string = ""): string {
    // Do not add a namespace if already present
    if (name.indexOf("/") >= 0) {
      return name.toLowerCase();
    }
    return `${this.cachedModules.project?.webda?.namespace || "webda"}/${name}`.toLowerCase();
  }

  /**
   * Check if object extends a class
   *
   * @param obj
   * @param className
   */
  extends(obj: any, className: any): boolean {
    if (!obj) {
      return false;
    }
    let i = 1;
    while (obj && Object.getPrototypeOf(obj)) {
      let proto = Object.getPrototypeOf(obj);
      if (proto.name == className.name || proto == className.name) {
        return true;
      }
      obj = proto;
    }
    return false;
  }
}
