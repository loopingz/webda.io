import * as fs from "fs";
import * as path from "path";
import { Context, Core, CoreModelDefinition, Service, WebdaError } from "./index";
import { WorkerLogLevel, WorkerOutput } from "@webda/workout";
import * as deepmerge from "deepmerge";
import { JSONSchema6 } from "json-schema";
import { FileUtils } from "./utils/serializers";

/**
 * Not the cleanest, but we have to have a true singleton within the process
 *
 * Test import application.ts while the normal application load application.js
 * Creating two singleton within the application, it would also have been true
 * if several packages where using different version of @webda/core
 */
require.main.exports.webdaApplication ??= {};
require.main.exports.webdaApplication.services ??= {};
require.main.exports.webdaApplication.deployers ??= {};
require.main.exports.webdaApplication.models ??= {};
require.main.exports.webdaApplication.namespace ??= "webda";

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
  schemas?: { [key: string]: JSONSchema6 };
}

/**
 * Cached module is all modules discover plus local package including the sources list
 */
export interface CachedModule extends Module {
  /**
   * Source files to import
   */
  sources?: string[];
  /**
   * Contained dynamic information on the project
   * Statically capture on deployment
   */
  projectInformation: {
    package: {
      version: string;
      name: string;
      [key: string]: any;
    };
    git: GitInformation;
    deployment: {
      name: string;
      [key: string]: any;
    };
  };
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
  Models = "models"
}

export type Section = "services" | "deployers" | "models";
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
    sources: [],
    schemas: {},
    projectInformation: {
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
  protected static deployers: { [key: string]: any } = require.main.exports.webdaApplication.deployers;

  /**
   * Services type registry
   */
  protected static services: { [key: string]: ServiceConstructor<Service> } =
    require.main.exports.webdaApplication.services;

  /**
   * Models type registry
   */
  protected static models: { [key: string]: any } = require.main.exports.webdaApplication.models;

  /**
   * @Modda to declare as a reusable service
   */
  static DefinitionDecorator(definition: Section, label?: string | Function) {
    // Annotation without ()
    if (label instanceof Function) {
      Application[definition][Application.completeNamespace(label.name)] ??= label;
      return;
    } else if (typeof label === "string") {
      return function (target: any) {
        Application[definition][Application.completeNamespace(<string>label || target.constructor.name)] ??= target;
      };
    }
  }

  /**
   * Class Logger
   */
  protected logger: WorkerOutput;
  /**
   * Contains package.json of application
   */
  protected packageDescription: any = {};
  /**
   * Contains webda section of package.json and workspaces if exist
   */
  protected packageWebda: any = {};
  /**
   * Webda namespace
   */
  protected namespace: string;

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
    if (!Application.active) {
      Application.active = this;
    }
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
      this.baseConfiguration = FileUtils.load(file);
    } catch (err) {
      this.log("WARN", err);
      if (allowModule) {
        this.baseConfiguration = { version: 2, module: {} };
      } else {
        throw new WebdaError("INVALID_WEBDA_CONFIG", `Cannot parse JSON of: ${file}`);
      }
    }
    // Load if a module definition is included
    if (this.baseConfiguration.module) {
      //this.loadModule(this.baseConfiguration.module, this.appPath);
    }
    this.loadPackageInfos();
    this.namespace = this.packageDescription.webda
      ? this.packageDescription.webda.namespace
      : this.packageDescription.name | this.packageDescription.name;
  }

  /**
   * Set the application the current one
   */
  setActive() {
    Application.active = this;
  }

  /**
   *
   * @param proto Prototype to send
   */
  getFullNameFromPrototype(proto): string {
    for (let section in SectionEnum) {
      for (let i in Application[SectionEnum[section]]) {
        if (Application[SectionEnum[section]][i] && Application[SectionEnum[section]][i].prototype === proto) {
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
  getSchema(type: string): JSONSchema6 {
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
   * Check package.json
   */
  loadPackageInfos() {
    let packageJson = path.join(this.appPath, "package.json");
    if (fs.existsSync(packageJson)) {
      this.packageDescription = JSON.parse(fs.readFileSync(packageJson).toString());
    } else {
      this.log("WARN", "Application does not have a package.json");
      return;
    }
    this.packageWebda = this.packageDescription.webda || {};
    let parent = path.join(this.appPath, "..");
    do {
      packageJson = path.join(parent, "package.json");
      if (fs.existsSync(packageJson)) {
        let info = JSON.parse(fs.readFileSync(packageJson).toString());
        if (info.workspaces) {
          this.log("DEBUG", "Application is running within a workspace");
          this.workspacesPath = path.resolve(parent);
          // Replace any relative path by absolute one
          for (let i in info.webda) {
            if (info.webda[i].startsWith("./")) {
              info.webda[i] = path.resolve(parent) + "/" + info.webda[i].substr(2);
            }
          }
          this.packageWebda = deepmerge(info.webda || {}, this.packageWebda);
          this.packageWebda.workspaces = {
            packages: info.workspaces,
            parent: info,
            path: path.resolve(parent)
          };
          return;
        }
      }
      parent = path.join(parent, "..");
    } while (path.resolve(parent) !== "/");
  }

  /**
   * Retrieve specific webda conf from package.json
   *
   * In case of workspaces the object is combined
   */
  getPackageWebda() {
    return this.packageWebda;
  }
  /**
   * Retrieve content of package.json
   */
  getPackageDescription() {
    return this.packageDescription;
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
    Application.services[name.toLowerCase()] = service;
  }

  /**
   * Get a service based on name
   *
   * @param name
   */
  getService(name) {
    let serviceName = Application.completeNamespace(name).toLowerCase();
    this.log("TRACE", "Search for service", serviceName);
    if (!Application.services[serviceName]) {
      serviceName = `Webda/${name}`.toLowerCase();
      // Try Webda namespace
      if (!Application.services[serviceName]) {
        throw Error("Undefined service " + name);
      }
    }
    return Application.services[serviceName];
  }

  /**
   * Return all services of the application
   */
  getServices() {
    return Application.services;
  }

  /**
   * Retrieve the model implementation
   *
   * @param name model to retrieve
   */
  getModel(name: string): any {
    name = name.toLowerCase();
    if (name.indexOf("/") < 0) {
      name = `webda/${name}`;
    }
    if (!Application.models[name.toLowerCase()]) {
      throw Error(
        "Undefined model '" + name + "' known models are '" + Object.keys(Application.models).join(",") + "'"
      );
    }
    return Application.models[name.toLowerCase()];
  }

  /**
   * Get all models definitions
   */
  getModels(): { [key: string]: Context | CoreModelDefinition } {
    return Application.models;
  }

  /**
   * Return all deployers
   */
  getDeployers(): { [key: string]: ServiceConstructor<Service> } {
    return Application.deployers;
  }

  /**
   * Add a new model
   *
   * @param name
   * @param model
   */
  addModel(name: string, model: any) {
    this.log("TRACE", "Registering model", name);
    Application.models[name.toLowerCase()] = model;
  }

  /**
   * Add a new deployer
   *
   * @param name
   * @param model
   */
  addDeployer(name: string, model: any) {
    this.log("TRACE", "Registering deployer", name);
    Application.deployers[name.toLowerCase()] = model;
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
    return this.cachedModules.projectInformation.git;
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
      ...this.cachedModules.projectInformation,
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
    return this.cachedModules.projectInformation.deployment.name;
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
  async importFile(info: string): Promise<string> {
    if (info.startsWith(".")) {
      info = this.appPath + "/" + info;
    }
    try {
      this.log("INFO", "Load file", info, fs.existsSync(info));
      await import(info);
      const relativePath = "./" + path.relative(this.appPath, path.resolve(info));
      return relativePath;
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
  async loadModule(info: Module, parent: string = this.appPath) {
    info.services = info.services || {};
    info.models = info.models || {};
    info.deployers = info.deployers || {};
    const sectionLoader = async (section: Section) => {
      for (let key in info[section]) {
        try {
          require.main.exports.webdaApplication.namespace = key.split("/").shift() || this.namespace;
          this.cachedModules[section][key] = await this.importFile(path.join(parent, info[section][key]));
        } finally {
          require.main.exports.webdaApplication.namespace = this.namespace;
        }
      }
    };
    await Promise.all([sectionLoader("services"), sectionLoader("deployers"), sectionLoader("models")]);
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
  static completeNamespace(name: string = ""): string {
    // Do not add a namespace if already present
    if (name.indexOf("/") >= 0) {
      return name.toLowerCase();
    }
    return `${require.main.exports.webdaApplication.namespace || "webda"}/${name}`.toLowerCase();
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

/**
 * Define a deployer
 *
 * A Modda is a class that can be reused
 * For example:
 *  - MongoDB Store implementation
 *  - SQS Service implementation
 *  - etc
 */
const Deployer = Application.DefinitionDecorator.bind(Application, "deployers");
/**
 * Define a reusable service
 *
 * A Modda is a class that can be reused
 * For example:
 *  - MongoDB Store implementation
 *  - SQS Service implementation
 *  - etc
 */
const Modda = Application.DefinitionDecorator.bind(Application, "services");
/**
 * Define a reusable model
 *
 * A Modda is a class that can be reused
 * For example:
 *  - MongoDB Store implementation
 *  - SQS Service implementation
 *  - etc
 */
const Model = Application.DefinitionDecorator.bind(Application, "models");
export { Deployer, Modda, Model };
