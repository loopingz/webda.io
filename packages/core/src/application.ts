import { execSync } from "child_process";
import * as fs from "fs";
import * as glob from "glob";
import * as merge from "merge";
import * as path from "path";
import {
  Authentication,
  CachedModule,
  Configuration,
  ConfigurationService,
  FileConfigurationService,
  KubernetesConfigurationService,
  ConsoleLoggerService,
  MemoryLoggerService,
  Cache,
  ConfigurationV1,
  Context,
  Core,
  CoreModel,
  CoreModelDefinition,
  DebugMailer,
  EventService,
  FileBinary,
  FileStore,
  Ident,
  Mailer,
  MemoryQueue,
  MemoryStore,
  ModdaDefinition,
  Module,
  ResourceService,
  SecureCookie,
  Service,
  SessionCookie,
  User,
  WebdaError
} from "./index";
import { Deployment } from "./models/deployment";
import { WorkerLogLevel, WorkerOutput } from "@webda/workout";
import { AbstractDeployer } from "./utils/abstractdeployer";
import * as deepmerge from "deepmerge";
import * as semver from "semver";
import * as dateFormat from "dateformat";
import { JSONSchema6 } from "json-schema";

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
  getModda();
  getSchema(): JSONSchema6;
}

/**
 * Retrieve a JSONSchema from a webda object
 *
 */
export interface SchemaResolver {
  fromPrototype(type: any): JSONSchema6;
  fromServiceType(type: string): JSONSchema6;
}

/**
 * Implement the default way of retrieving schema
 */
export class DefaultSchemaResolver implements SchemaResolver {
  /**
   * Application
   */
  protected app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  fromServiceType(type: string = ""): JSONSchema6 {
    if (this.app.isCached()) {
      return this.app.getConfiguration().cachedModules.schemas[type];
    }
    type = type.toLowerCase();
    let proto: any = this.app.getDeployers()[type];
    if (proto) {
      return this.fromPrototype(proto);
    }
    proto = this.app.getServices()[type];
    if (proto) {
      return this.fromPrototype(proto);
    }
    proto = this.app.getModels()[type];
    if (proto) {
      return this.fromPrototype(proto);
    }
    return undefined;
  }

  fromPrototype(type: any): JSONSchema6 {
    if (type && typeof type.getSchema === "function") {
      return type.getSchema();
    }
    return undefined;
  }
}

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
    sources: []
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
  protected services: { [key: string]: ServiceConstructor<Service> } = {
    // real service - modda
    "webda/authentication": Authentication,
    "webda/filestore": FileStore,
    "webda/memorystore": MemoryStore,
    "webda/filebinary": FileBinary,
    "webda/debugmailer": DebugMailer,
    "webda/mailer": Mailer,
    "webda/asyncevents": EventService,
    "webda/resourceservice": ResourceService,
    "webda/memoryqueue": MemoryQueue,
    "webda/configurationservice": ConfigurationService,
    "webda/fileconfigurationservice": FileConfigurationService,
    "webda/kubernetesconfigurationservice": KubernetesConfigurationService,
    "webda/consolelogger": ConsoleLoggerService,
    "webda/memorylogger": MemoryLoggerService
  };

  /**
   * Models type registry
   */
  protected models: { [key: string]: any } = {
    // Models
    "webda/coremodel": CoreModel,
    "webda/ident": Ident,
    "webda/user": User,
    "webdacore/context": Context,
    "webdacore/sessioncookie": SessionCookie,
    "webdacore/securecookie": SecureCookie
  };

  /**
   * Flag if application has been compiled already
   */
  protected compiled: boolean = false;

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
   * Current Schema resolver
   */
  protected schemaResolver: SchemaResolver;

  /**
   *
   * @param {string} fileOrFolder to load Webda Application from
   * @param {Logger} logger
   */
  constructor(file: string, logger: WorkerOutput = undefined) {
    this.logger = logger || new WorkerOutput();
    this.initTime = Date.now();
    if (!fs.existsSync(file)) {
      throw new WebdaError(
        "NO_WEBDA_FOLDER",
        `Not a webda application folder or webda.config.json file: unexisting ${file}`
      );
    }
    if (fs.lstatSync(file).isDirectory()) {
      file = path.join(file, "webda.config.json");
    }
    // Check if file is a file or folder
    if (!fs.existsSync(file)) {
      throw new WebdaError("NO_WEBDA_FOLDER", `Not a webda application folder or webda.config.json file: ${file}`);
    }
    this.appPath = path.dirname(file);
    try {
      this.baseConfiguration = JSON.parse(fs.readFileSync(file).toString() || "{}");
    } catch (err) {
      throw new WebdaError("INVALID_WEBDA_CONFIG", `Cannot parse JSON of: ${file}`);
    }
    // Load default schema resolver
    this.schemaResolver = new DefaultSchemaResolver(this);
    // Migrate if needed
    if (!this.baseConfiguration.version) {
      this.baseConfiguration = this.migrateV0Config(this.baseConfiguration);
    }
    if (this.baseConfiguration.version == 1) {
      this.baseConfiguration = this.migrateV1Config(this.baseConfiguration);
    }
    // Load if a module definition is included
    if (this.baseConfiguration.module) {
      this.loadModule(this.baseConfiguration.module, this.appPath);
    }
    // Load cached modules if there
    if (this.baseConfiguration.cachedModules) {
      this.loadModule(this.baseConfiguration.cachedModules, this.appPath);
      // Import all modules sources to include any annotation
      if (this.baseConfiguration.cachedModules.sources) {
        this.baseConfiguration.cachedModules.sources.forEach(src => {
          require(path.join(process.cwd(), src));
        });
      }
    }
    this.loadPackageInfos();
    this.namespace = this.packageDescription.webda
      ? this.packageDescription.webda.namespace
      : this.packageDescription.name | this.packageDescription.name;
  }

  /**
   *
   * @param proto Prototype to send
   */
  getFullNameFromPrototype(proto): string {
    for (let i in this.services) {
      if (this.services[i].prototype === proto) {
        return i;
      }
    }
    for (let i in this.deployers) {
      if (this.deployers[i].prototype === proto) {
        return i;
      }
    }
    for (let i in this.models) {
      if (this.models[i].prototype === proto) {
        return i;
      }
    }
  }

  /**
   * Set the current schema resolver
   *
   * @param resolver
   */
  setSchemaResolver(resolver: SchemaResolver) {
    this.schemaResolver = resolver;
  }

  /**
   * Get schema resolver
   */
  getSchemaResolver(): SchemaResolver {
    return this.schemaResolver;
  }

  /**
   * Check if application has cached modules
   *
   * When deployed the application contains cachedModules in the `webda.config.json`
   * It allows to avoid the search for `webda.module.json` inside node_modules and
   * take the schema from the cached modules also
   */
  isCached() {
    return this.baseConfiguration.cachedModules !== undefined;
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
   * Set the status of the compilation
   *
   * @param compile true will avoid trigger new compilation
   */
  preventCompilation(compile: boolean) {
    this.compiled = compile;
  }

  /**
   * Migrate from v0 to v1 configuration
   *
   * A V0 is a webda.config.json that does not contain any version tag
   *
   * @param config
   */
  migrateV0Config(config: any): Configuration {
    this.log("WARN", "Old V0 webda.config.json format, trying to migrate");
    let newConfig: any = {
      parameters: {},
      services: {},
      models: {},
      routes: {},
      version: 1
    };
    let domain;
    if (config["*"]) {
      domain = config[config["*"]];
    } else {
      domain = config[Object.keys(config)[0]] || { global: {} };
    }
    if (domain.global) {
      newConfig.parameters = domain.global.params || {};
      newConfig.services = domain.global.services || {};
      newConfig.models = domain.global.models || {};
      newConfig.parameters.locales = domain.global.locales;
      newConfig.moddas = domain.global.moddas || {};
    }
    for (let i in domain) {
      if (i === "global") continue;
      newConfig.routes[i] = domain[i];
    }
    return newConfig;
  }

  /**
   * Migrate from v1 to v2 configuration format
   *
   * @param config
   */
  migrateV1Config(config: ConfigurationV1): Configuration {
    this.log("WARN", "Old V1 webda.config.json format, trying to migrate");
    let newConfig: Configuration = {
      parameters: config.parameters,
      services: config.services,
      module: {
        services: {},
        models: { ...config.models },
        deployers: {}
      },
      version: 2
    };
    if (config.moddas) {
      for (let i in config.moddas) {
        newConfig.module.services[i] = config.moddas[i].require;
      }
    }
    return newConfig;
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
   * Get a service based on name
   *
   * @param name
   */
  getService(name) {
    let serviceName = this.completeNamespace(name).toLowerCase();
    this.log("TRACE", "Search for service", serviceName);
    if (!this.services[serviceName]) {
      serviceName = `Webda/${name}`.toLowerCase();
      // Try Webda namespace
      if (!this.services[serviceName]) {
        throw Error("Undefined service " + name);
      }
    }
    return this.services[serviceName];
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
    name = name.toLowerCase();
    if (name.indexOf("/") < 0) {
      name = `webda/${name}`;
    }
    if (!this.models[name.toLowerCase()]) {
      throw Error("Undefined model '" + name + "' known models are '" + Object.keys(this.models).join(",") + "'");
    }
    return this.models[name.toLowerCase()];
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
   * Check if a deployment exists for this application
   * This method cannot be called for a packaged application
   * as we do not keep deployments files when deployed
   *
   * @param deploymentName
   */
  hasDeployment(deploymentName: string): boolean {
    return fs.existsSync(path.join(this.appPath, "deployments", deploymentName + ".json"));
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

  getDeployment(deploymentName: string = undefined): Deployment {
    if (!deploymentName) {
      deploymentName = this.currentDeployment;
    }
    let deploymentConfig = path.join(this.appPath, "deployments", deploymentName + ".json");
    // Load deployment
    if (!fs.existsSync(deploymentConfig)) {
      throw new WebdaError("UNKNOWN_DEPLOYMENT", "Unknown deployment");
    }

    let deploymentModel: Deployment;
    try {
      deploymentModel = JSON.parse(fs.readFileSync(deploymentConfig).toString());
    } catch (err) {
      throw new WebdaError(
        "INVALID_DEPLOYMENT",
        `Invalid deployment configuration ${deploymentConfig}: ${err.toString()}`
      );
    }
    return deploymentModel;
  }

  /**
   * Retrieve Git Repository information
   *
   * {@link GitInformation} for more details on how the information is gathered
   * @return the git information
   */
  @Cache()
  getGitInformation(): GitInformation {
    let options = {
      cwd: this.getAppPath()
    };
    let info = this.getPackageDescription();
    try {
      let tags = execSync(`git tag --points-at HEAD`, options).toString().trim().split("\n");
      let tag = "";
      let version = info.version;
      if (tags.includes(`${info.name}@${info.version}`)) {
        tag = `${info.name}@${info.version}`;
      } else if (tags.includes(`v${info.version}`)) {
        tag = `v${info.version}`;
      } else {
        version = semver.inc(info.version, "patch") + "+" + dateFormat(new Date(), "yyyymmddHHMMssl");
      }
      // Search for what would be the tag
      // packageName@version
      // or version if single repo
      // if not included create a nextVersion+SNAPSHOT.${commit}.${now}
      return {
        commit: execSync(`git rev-parse HEAD`, options).toString().trim(),
        branch: execSync("git symbolic-ref --short HEAD", options).toString().trim(),
        short: execSync(`git rev-parse --short HEAD`, options).toString().trim(),
        tag,
        tags,
        version
      };
    } catch (err) {
      return {
        commit: "unknown",
        branch: "unknown",
        tag: "",
        short: "0000000",
        tags: [],
        version: info.version
      };
    }
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
      package: this.getPackageDescription(),
      git: this.getGitInformation(),
      deployment: this.getCurrentDeployment(),
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
    if (typeof this[object] === "string") {
      return this.stringParameter(object);
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
   * Return the application Configuration for a deployment
   *
   * Given this inputs:
   *
   * webda.config.json
   * ```json
   * {
   *  "parameters": {
   *    "param3": "test"
   *  },
   *  "services": {
   *    "MyService": {
   *      "param1": {
   *        "sub": "test"
   *      },
   *      "param2": "value"
   *    }
   *  }
   * }
   * ```
   *
   * deployment.json
   * ```json
   * {
   *  "parameters": {
   *    "param4": "deployment"
   *  }
   *  "services": {
   *    "MyService": {
   *      "param1": {
   *        "sub2": "deploymentSub"
   *      },
   *      "param2": "${package.version}"
   *    }
   *  }
   * }
   * ```
   *
   * The result would be:
   * ```json
   * {
   *  "parameters": {
   *    "param3": "test",
   *    "param4": "deployment"
   *  },
   *  "services": {
   *    "MyService": {
   *      "param1": {
   *        "sub": "test",
   *        "sub2": "deploymentSub"
   *      },
   *      "param2": "1.1.0"
   *    }
   *  }
   * }
   * ```
   * This map can also use parameters {@link replaceVariables}
   *
   * @param deploymentName to use for the Configuration
   */
  getConfiguration(deploymentName: string = undefined): Configuration {
    if (!deploymentName) {
      return this.baseConfiguration;
    }
    let config = JSON.parse(JSON.stringify(this.baseConfiguration));
    let deploymentModel = this.getDeployment(deploymentName);
    config.parameters = this.replaceVariables(merge.recursive(config.parameters, deploymentModel.parameters));
    config.services = this.replaceVariables(merge.recursive(config.services, deploymentModel.services));
    return config;
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
    return this.getConfiguration(this.currentDeployment);
  }

  /**
   * Set the current deployment for the application
   * Call to getCurrentConfiguration will resolve to the computed configuration for the deployment
   * If needed, you can call the method with undefined to reset to default configuration
   *
   * @param deployment to set
   */
  setCurrentDeployment(deployment: string) {
    this.currentDeployment = deployment;
  }

  /**
   * Get current deployment name
   */
  getCurrentDeployment() {
    return this.currentDeployment;
  }

  /**
   * Return if the application is a typescript application
   */
  isTypescript() {
    return fs.existsSync(`${this.appPath}/tsconfig.json`);
  }

  /**
   * Compile the application if it is a Typescript application
   * Do nothing otherwise
   */
  compile() {
    if (this.compiled) {
      return;
    }
    // exec typescript
    if (this.isTypescript()) {
      execSync(`tsc -p ${this.appPath}`);
    }
    this.compiled = true;
  }

  /**
   * Load all imported modules and current module
   * It will compile module
   * Generate the current module file
   * Load any imported webda.module.json
   */
  loadModules() {
    // Cached modules is defined on deploy
    if (this.baseConfiguration.cachedModules) {
      // We should not load any modules as we are in a deployed version
      return;
    }
    // Compile
    this.compile();
    const Finder = require("fs-finder");
    // Modules should be cached on deploy
    var files = [];
    let nodeModules = path.join(this.appPath, "node_modules");
    if (fs.existsSync(nodeModules)) {
      files = Finder.from(nodeModules).findFiles("webda.module.json");
    }
    // Search workspace for webda.module.json
    if (this.workspacesPath !== "") {
      nodeModules = path.join(this.workspacesPath, "node_modules");
      if (fs.existsSync(nodeModules)) {
        files.push(...Finder.from(nodeModules).findFiles("webda.module.json"));
      }
    }
    // Generate module
    this.generateModule();
    let currentModule = path.join(this.appPath, "webda.module.json");
    if (fs.existsSync(currentModule)) {
      files.push(currentModule);
    }
    if (files.length) {
      this.log("DEBUG", "Found modules", files);
      files.forEach(file => {
        let info = require(file);
        this.loadModule(info, path.dirname(file));
      });
    }
  }

  getModules() {
    return this.cachedModules;
  }

  /**
   * Generate the module for current application
   */
  generateModule() {
    // Compile
    this.compile();
    // Reinit the sources cache
    this.cachedModules.sources = [];
    this._loaded = [];
    // Read all files
    this.getPackagesLocations().forEach(p => {
      let absPath = path.resolve(path.join(this.appPath, p));
      if (this._loaded.indexOf(absPath) >= 0) {
        return;
      }
      this._loaded.push(absPath);
      if (fs.existsSync(absPath) && fs.lstatSync(absPath).isDirectory()) {
        absPath += "/**/*.js";
      }
      glob.sync(absPath).forEach(this.loadJavascriptFile.bind(this));
    });
    let moduleFile = path.join(this.appPath, "webda.module.json");
    let current = "";
    if (fs.existsSync(moduleFile)) {
      current = fs.readFileSync(moduleFile).toString();
    }
    let module: CachedModule = {
      ...this.appModule,
      schemas: {}
    };
    for (let i in this.appModule.services) {
      module.schemas[i] = this.getSchemaResolver().fromPrototype(this.services[i.toLowerCase()]);
    }
    for (let i in this.appModule.deployers) {
      module.schemas[i] = this.getSchemaResolver().fromPrototype(this.deployers[i.toLowerCase()]);
    }
    for (let i in this.appModule.models) {
      module.schemas[i] = this.getSchemaResolver().fromPrototype(this.models[i.toLowerCase()]);
    }
    if (current !== JSON.stringify(module, undefined, 2)) {
      // Write module
      fs.writeFileSync(moduleFile, JSON.stringify(module, undefined, 2));
    }
  }

  /**
   * Import a file
   *
   * If the `default` is set take this or use old format
   *
   * @param info
   */
  resolveRequire(info: string) {
    if (info.startsWith(".")) {
      info = this.appPath + "/" + info;
    }
    try {
      let serviceConstructor = require(info);
      if (serviceConstructor.default) {
        return serviceConstructor.default;
      } else {
        return serviceConstructor;
      }
    } catch (err) {
      this.log("WARN", "Cannot resolve require", info, err.message);
      return null;
    }
  }

  /**
   * Load local module
   */
  loadLocalModule() {
    let moduleFile = path.join(process.cwd(), "webda.module.json");
    if (fs.existsSync(moduleFile)) {
      this.loadModule(JSON.parse(fs.readFileSync(moduleFile).toString()), process.cwd());
    }
  }
  /**
   * Load the module,
   *
   * @protected
   * @ignore Useless for documentation
   */
  loadModule(info: Module, parent: string = this.appPath) {
    info.services = info.services || {};
    info.models = info.models || {};
    info.deployers = info.deployers || {};

    // Load services definition
    for (let key in info.services) {
      let service = this.resolveRequire(path.join(parent, info.services[key]));
      if (!service) {
        continue;
      }
      this.addService(key, service);
      this.cachedModules.services[key] =
        "./" + path.relative(this.appPath, path.resolve(path.join(parent, info.services[key])));
    }

    // Load models definition
    for (let key in info.models) {
      let service = this.resolveRequire(path.join(parent, info.models[key]));
      if (!service) {
        continue;
      }
      this.addModel(key, service);
      this.cachedModules.models[key] =
        "./" + path.relative(this.appPath, path.resolve(path.join(parent, info.models[key])));
    }

    // Load deployers definition
    for (let key in info.deployers) {
      let service = this.resolveRequire(path.join(parent, info.deployers[key]));
      if (!service) {
        continue;
      }
      this.addDeployer(key, service);
      this.cachedModules.deployers[key] =
        "./" + path.relative(this.appPath, path.resolve(path.join(parent, info.deployers[key])));
    }
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
      return name;
    }
    return `${this.namespace}/${name}`;
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

  /**
   * Load a javascript file and check for Modda
   * @param path to load
   */
  protected loadJavascriptFile(absolutePath: string) {
    let marker = path.resolve(absolutePath);
    if (this._loaded.indexOf(marker) >= 0) {
      return;
    }
    this._loaded.push(marker);
    let source = "./" + path.relative(this.appPath, absolutePath);
    if (this.cachedModules.sources.indexOf(source) < 0) {
      this.cachedModules.sources.push(source);
    }

    let mod = this.resolveRequire(absolutePath);
    let obj = mod;
    if (obj && obj.getModda) {
      let modda: ModdaDefinition = mod.getModda();
      let name = mod.prototype.name;
      let category = "services";
      if (modda) {
        name = modda.uuid;
        if (modda.category) {
          category = modda.category;
        }
      }
      this.log("DEBUG", `Found new getModda implementation ${category} ${this.completeNamespace(name)}`);
      this.appModule[category][this.completeNamespace(name)] = path.relative(this.appPath, absolutePath);
      if (this.extends(obj, AbstractDeployer)) {
        this.addDeployer(this.completeNamespace(name), obj);
      } else {
        this.addService(this.completeNamespace(name), obj);
      }
    } else if (this.extends(obj, CoreModel) || this.extends(obj, Context)) {
      this.log("DEBUG", "Found new CoreModel implementation", this.completeNamespace(obj.name));
      this.appModule["models"][this.completeNamespace(obj.name)] = path.relative(this.appPath, absolutePath);
      this.addModel(this.completeNamespace(obj.name), obj);
    } else if (this.extends(obj, Service)) {
      this.log("DEBUG", "Found new Service implementation", this.completeNamespace(obj.name));
      this.appModule.services[this.completeNamespace(obj.name)] = path.relative(this.appPath, absolutePath);
      this.addService(this.completeNamespace(obj.name), obj);
    } else if (this.extends(obj, AbstractDeployer)) {
      this.log("DEBUG", "Found new Deployer implementation", this.completeNamespace(obj.name));
      this.appModule.deployers[this.completeNamespace(obj.name)] = path.relative(this.appPath, absolutePath);
      this.addDeployer(this.completeNamespace(obj.name), obj);
    }
  }

  /**
   * Get the application files
   */
  getPackagesLocations(): string[] {
    return this.packageDescription.files || ["lib/**/*.js"];
  }
}
