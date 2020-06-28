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
  ConsoleLoggerService,
  MemoryLoggerService,
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
  Logger,
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

export interface ServiceConstructor<T extends Service> {
  new (webda: Core, name: string, params: any): T;
  getModda();
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
   * Webda namespace
   */
  protected namespace: string;

  /**
   *
   * @param {string} fileOrFolder to load Webda Application from
   * @param {Logger} logger
   */
  constructor(file: string, logger: WorkerOutput = undefined) {
    this.logger = logger || new WorkerOutput();
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
    let packageJson = path.join(this.appPath, "package.json");
    if (fs.existsSync(packageJson)) {
      this.packageDescription = JSON.parse(fs.readFileSync(packageJson).toString());
    }
    this.namespace = this.packageDescription.webda
      ? this.packageDescription.webda.namespace
      : this.packageDescription.name | this.packageDescription.name;
  }

  /**
   * Retrieve content of package.json
   */
  getPackageDescription() {
    return this.packageDescription;
  }

  preventCompilation(compile: boolean) {
    this.compiled = compile;
  }

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

  log(level: WorkerLogLevel, ...args) {
    if (this.logger) {
      this.logger.log(level, ...args);
    }
  }

  getWorkerOutput() {
    return this.logger;
  }

  getAppPath(subpath: string = undefined) {
    if (subpath) {
      return path.join(this.appPath, subpath);
    }
    return this.appPath;
  }

  addService(name: string, service: ServiceConstructor<Service>) {
    this.log("TRACE", "Registering service", name);
    this.services[name.toLowerCase()] = service;
  }

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

  getDeployers(): { [key: string]: ServiceConstructor<Service> } {
    return this.deployers;
  }

  addModel(name: string, model: any) {
    this.log("TRACE", "Registering model", name);
    this.models[name.toLowerCase()] = model;
  }

  addDeployer(name: string, model: any) {
    this.log("TRACE", "Registering deployer", name);
    this.deployers[name.toLowerCase()] = model;
  }

  hasDeployment(deploymentName: string): boolean {
    return fs.existsSync(path.join(this.appPath, "deployments", deploymentName));
  }

  getDeployment(deploymentName: string = undefined): Deployment {
    if (!deploymentName) {
      deploymentName = this.currentDeployment;
    }
    let deploymentConfig = path.join(this.appPath, "deployments", deploymentName);
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

  getConfiguration(deploymentName: string = undefined): Configuration {
    if (!deploymentName) {
      return this.baseConfiguration;
    }
    let config = JSON.parse(JSON.stringify(this.baseConfiguration));
    let deploymentModel = this.getDeployment(deploymentName);
    config.parameters = merge.recursive(config.parameters, deploymentModel.parameters);
    config.services = merge.recursive(config.services, deploymentModel.services);
    return config;
  }

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

  generateModule() {
    // Compile
    this.compile();
    // Reinit the sources cache
    this.cachedModules.sources = [];
    this._loaded = [];
    // Read all files
    this.getPackagesLocations().forEach(p => {
      let absPath = path.join(this.appPath, p);
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
    if (current !== JSON.stringify(this.appModule, undefined, 2)) {
      // Write module
      fs.writeFileSync(moduleFile, JSON.stringify(this.appModule, undefined, 2));
    }
  }

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
      this.cachedModules.services[key] = "./" + path.relative(this.appPath, path.join(parent, info.services[key]));
    }

    // Load models definition
    for (let key in info.models) {
      let service = this.resolveRequire(path.join(parent, info.models[key]));
      if (!service) {
        continue;
      }
      this.addModel(key, service);
      this.cachedModules.models[key] = "./" + path.relative(this.appPath, path.join(parent, info.models[key]));
    }

    // Load deployers definition
    for (let key in info.deployers) {
      let service = this.resolveRequire(path.join(parent, info.deployers[key]));
      if (!service) {
        continue;
      }
      this.addDeployer(key, service);
      this.cachedModules.deployers[key] = "./" + path.relative(this.appPath, path.join(parent, info.deployers[key]));
    }
  }

  completeNamespace(info: string = ""): string {
    // Do not add a namespace if already present
    if (info.indexOf("/") >= 0) {
      return info;
    }
    return `${this.namespace}/${info}`;
  }

  extends(obj: any, className: any): boolean {
    if (!obj) {
      return false;
    }
    let i = 1;
    while (obj && Object.getPrototypeOf(obj)) {
      let proto = Object.getPrototypeOf(obj);
      // TODO Have better way
      if (proto.name == className || proto == className) {
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
    if (this._loaded.indexOf(absolutePath) >= 0) {
      return;
    }
    let source = "./" + path.relative(this.appPath, absolutePath);
    if (this.cachedModules.sources.indexOf(source) < 0) {
      this.cachedModules.sources.push(source);
    }

    this._loaded.push(absolutePath);
    let mod = this.resolveRequire(absolutePath);
    let obj = mod;
    if (obj && obj.getModda) {
      let modda: ModdaDefinition = mod.getModda();
      let name;
      let category = "services";
      if (modda) {
        name = modda.uuid;
        if (modda.category) {
          category = modda.category;
        }
      }
      this.log("DEBUG", `Found new getModda implementation ${category} ${this.completeNamespace(name)}`);
      this.appModule[category][this.completeNamespace(name)] = path.relative(this.appPath, absolutePath);
    } else if (this.extends(obj, CoreModel)) {
      this.log("DEBUG", "Found new CoreModel implementation", this.completeNamespace(obj.name));
      this.appModule["models"][this.completeNamespace(obj.name)] = path.relative(this.appPath, absolutePath);
    } else if (this.extends(obj, Service)) {
      this.log("DEBUG", "Found new Service implementation", this.completeNamespace(obj.name));
      this.appModule.services[this.completeNamespace(obj.name)] = path.relative(this.appPath, absolutePath);
    } else if (this.extends(obj, AbstractDeployer)) {
      this.log("DEBUG", "Found new Deployer implementation", this.completeNamespace(obj.name));
      this.appModule.deployers[this.completeNamespace(obj.name)] = path.relative(this.appPath, absolutePath);
    }
  }

  /**
   * Get the application files
   */
  getPackagesLocations(): string[] {
    return this.packageDescription.files || ["lib/**/*.js"];
  }
}
