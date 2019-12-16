import { exec, execSync } from "child_process";
import * as fs from "fs";
import * as glob from "glob";
import * as merge from "merge";
import * as path from "path";
import {
  Configuration,
  ConfigurationV1,
  Context,
  Core,
  CoreModelDefinition,
  Logger,
  ModdaDefinition,
  Module,
  Service
} from "./index";
import { Deployment } from "./models/deployment";

export interface ServiceConstructor {
  new (webda: Core, name: string, params: any): Service;
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
 *  - List deploymments
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
  protected cachedModules: Module = {
    services: {},
    models: {},
    deployers: {}
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
  protected deployers: { [key: string]: ServiceConstructor } = {};

  /**
   * Services type registry
   */
  protected services: { [key: string]: ServiceConstructor } = {};

  /**
   * Models type registry
   */
  protected models: { [key: string]: Context | CoreModelDefinition } = {};

  /**
   * Flag if application has been compiled already
   */
  protected compiled: boolean = false;

  /**
   * Class Logger
   */
  protected logger: Logger;
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
  constructor(file: string, logger: Logger = undefined) {
    this.logger = logger;
    if (!fs.existsSync(file)) {
      throw new Error("Not a webda application folder or webda.config.json file");
    }
    if (fs.lstatSync(file).isDirectory()) {
      file = path.join(file, "webda.config.json");
    }
    /*
    // Fallback on
    if (process.env.WEBDA_CONFIG == undefined) {
      file = path.join(process.cwd(), "webda.config";
      config = "./webda.config.json";
      if (fs.existsSync(config)) {
        this._configFile = path.resolve(config);
        return require(this._configFile);
      }
      config = "/etc/webda/config.json";
      if (fs.existsSync(config)) {
        this._configFile = path.resolve(config);
        return require(this._configFile);
      }
    } else {
      this.log("INFO", "Load " + process.env.WEBDA_CONFIG);
      this.appPath = path.dirname(process.env.WEBDA_CONFIG);
      file = process.env.WEBDA_CONFIG;
    }
    */
    // Check if file is a file or folder
    if (!fs.existsSync(file)) {
      throw new Error("Not a webda application folder");
    }
    this.appPath = path.dirname(file);
    this.baseConfiguration = JSON.parse(fs.readFileSync(file).toString());
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
    let packageJson = path.join(this.appPath, "package.json");
    if (fs.existsSync(packageJson)) {
      this.packageDescription = JSON.parse(fs.readFileSync(packageJson).toString());
    }
    this.namespace = this.packageDescription.webda
      ? this.packageDescription.webda.namespace
      : this.packageDescription.name | this.packageDescription.name;
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
      domain = config[Object.keys(config)[0]];
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

  log(level: string, ...args) {
    if (this.logger) {
      this.logger.log(level, ...args);
    }
  }

  getAppPath(subpath: string = undefined) {
    if (subpath) {
      return path.join(this.appPath, subpath);
    }
    return this.appPath;
  }

  addService(name: string, service: ServiceConstructor) {
    this.log("TRACE", "Registering service", name);
    this.services[name.toLowerCase()] = service;
  }

  getService(name) {
    name = name.toLowerCase();
    if (!this.services[name.toLowerCase()]) {
      throw Error("Undefined service " + name);
    }
    return this.services[name.toLowerCase()];
  }

  getModel(name: string): any {
    name = name.toLowerCase();
    if (!this.models[name.toLowerCase()]) {
      throw Error("Undefined model " + name);
    }
    return this.models[name.toLowerCase()];
  }

  getModels(): { [key: string]: Context | CoreModelDefinition } {
    return this.models;
  }

  getDeployers(): { [key: string]: ServiceConstructor } {
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

  getDeployment(deploymentName: string = undefined): Deployment {
    if (!deploymentName) {
      deploymentName = this.currentDeployment;
    }
    let deploymentConfig = path.join(this.appPath, "deployments", deploymentName);
    // Load deployment
    if (!fs.existsSync(deploymentConfig)) {
      throw new Error("Unknown deployment");
    }

    let deploymentModel: Deployment;
    try {
      deploymentModel = JSON.parse(fs.readFileSync(deploymentConfig).toString());
    } catch (err) {
      throw new Error(`Invalid deployment configuration ${deploymentConfig}`);
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
   * Compile the application in watch mode
   */
  watch(postCompileCallback: () => {} = undefined) {
    exec(`tsc -p ${this.appPath} --watch`);
  }

  /**
   * Load all imported modules and current module
   * It will compile module
   * Generate the current module file
   * Load any imported webda.module.json
   */
  loadModules() {
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
    // Read all files
    this.getPackagesLocations().forEach(p => {
      let absPath = path.join(this.appPath, p);
      if (fs.existsSync(absPath) && fs.lstatSync(absPath).isDirectory()) {
        absPath += "/**/*.js";
      }
      glob.sync(absPath).forEach(this.loadJavascriptFile.bind(this));
    });
    // Write module
    fs.writeFileSync(path.join(this.appPath, "webda.module.json"), JSON.stringify(this.appModule, undefined, 2));
  }

  resolveRequire(info: string) {
    if (info.startsWith(".")) {
      info = process.cwd() + "/" + info;
    }
    try {
      let serviceConstructor = require(info);
      if (serviceConstructor.default) {
        return serviceConstructor.default;
      } else {
        return serviceConstructor;
      }
    } catch (err) {
      this.log("WARN", "Cannot resolve require", info);
      return null;
    }
  }
  /**
   * Load the module,
   *
   * @protected
   * @ignore Useless for documentation
   */
  loadModule(info: Module, parent: string) {
    parent = parent || "";
    info.services = info.services || {};
    info.models = info.models || {};
    info.deployers = info.deployers || {};
    for (let key in info.services) {
      let service = this.resolveRequire(path.join(parent, info.services[key]));
      if (!service) {
        continue;
      }
      this.addService(key, service);
      this.cachedModules.services[key] = "./" + path.relative(process.cwd(), path.join(parent, info.services[key]));
    }
    for (let key in info.models) {
      let service = this.resolveRequire(path.join(parent, info.models[key]));
      if (!service) {
        continue;
      }
      this.addModel(key, service);
      this.cachedModules.models[key] = "./" + path.relative(process.cwd(), path.join(parent, info.models[key]));
    }
    for (let key in info.deployers) {
      let service = this.resolveRequire(path.join(parent, info.deployers[key]));
      if (!service) {
        continue;
      }
      this.addDeployer(key, service);
      this.cachedModules.deployers[key] = "./" + path.relative(process.cwd(), path.join(parent, info.deployers[key]));
    }
  }

  completeNamespace(info: string): string {
    return `${this.namespace}/${info}`;
  }

  /**
   * Load a javascript file and check for Modda
   * @param path to load
   */
  protected loadJavascriptFile(absolutePath: string) {
    if (this._loaded.indexOf(absolutePath) >= 0) {
      return;
    }
    this._loaded.push(absolutePath);
    let mod = this.resolveRequire(absolutePath);
    let obj = mod;
    // Check for CoreModel
    do {
      // TODO Have better way
      if (obj.__proto__.name === "CoreModel") {
        this.appModule["models"][this.completeNamespace(obj.name)] = path.relative(this.appPath, absolutePath);
        break;
      }
      obj = obj.__proto__;
    } while (obj.__proto__);
    // Check if it is a service
    if (mod.getModda) {
      let modda: ModdaDefinition = mod.getModda();
      if (!modda || !modda.uuid) {
        return;
      }
      this.appModule[modda.category || "services"][modda.uuid] = path.relative(this.appPath, absolutePath);
    }
  }

  /**
   * Get the application files
   */
  getPackagesLocations(): string[] {
    return this.packageDescription.files || ["lib/**/*.js"];
  }
}
