import {
  AbstractDeployer,
  Cache,
  UnpackedApplication,
  CachedModule,
  Context,
  CoreModel,
  Deployment,
  FileUtils,
  GitInformation,
  JSONUtils,
  WebdaError,
  ConfigurationV1,
  Configuration
} from "@webda/core";
import * as path from "path";
import * as fs from "fs";
import * as glob from "glob";
import * as semver from "semver";
import { execSync } from "child_process";
import * as dateFormat from "dateformat";
import * as merge from "merge";

export class SourceApplication extends UnpackedApplication {
  /**
   * Flag if application has been compiled already
   */
  protected compiled: boolean = false;

  /**
   * Migrate from v0 to v1 configuration
   *
   * A V0 is a webda.config.json that does not contain any version tag
   *
   * @param config
   */
  migrateV0Config(config: any): ConfigurationV1 {
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
   * Load configuration with auto-migration of version
   * @param file
   * @returns
   */
  loadConfiguration(file) {
    let storedConfiguration = FileUtils.load(file);
    // Migrate if needed
    if (!storedConfiguration.version) {
      storedConfiguration = this.migrateV0Config(storedConfiguration);
    }
    if (storedConfiguration.version == 1) {
      storedConfiguration = this.migrateV1Config(storedConfiguration);
    }
    if (storedConfiguration.version == 2) {
      storedConfiguration = storedConfiguration;
    }
    return this.completeConfiguration(storedConfiguration);
  }

  getNamespace(): string {
    return this.cachedModules?.project?.webda.namespace || "webda";
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
      let tags = execSync(`git tag --points-at HEAD`, options)
        .toString()
        .trim()
        .split("\n")
        .filter(t => t !== "");
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
        short: "00000000",
        tags: [],
        version: info.version
      };
    }
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
   * Generate the module for current application
   */
  generateModule() {
    // Compile
    this.compile();
    // Reinit the sources cache
    this.cachedModules.beans = {};
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
      glob.sync(absPath).forEach(f => this.loadJavascriptFile(f));
    });
    let moduleFile = path.join(this.appPath, "webda.module.json");
    let current = "";
    if (fs.existsSync(moduleFile)) {
      current = fs.readFileSync(moduleFile).toString();
    }
    /*
    let module: CachedModule = {
      ...this.appModule,
      schemas: {},
      projectInformation: {
        git: this.getGitInformation(),
        deployment: {
          name: this.currentDeployment
        },
        package: FileUtils.load(this.getAppPath("package.json"))
      }
    };
    
    for (let i in this.appModule.services) {
      module.schemas[i] = this.getSchema(i.toLowerCase());
    }
    for (let i in this.appModule.deployers) {
      module.schemas[i] = this.getSchema(i.toLowerCase());
    }
    for (let i in this.appModule.models) {
      module.schemas[i] = this.getSchema(i.toLowerCase());
    }
    if (current !== JSONUtils.stringify(module, undefined, 2)) {
      // Write module
      FileUtils.save(module, moduleFile);
    }
    */
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
    /*
    if (this.cachedModules.sources.indexOf(source) < 0) {
      this.cachedModules.sources.push(source);
    }
    */
  }

  /**
   * Get the application files
   */
  getPackagesLocations(): string[] {
    return this.cachedModules.project.package.files || ["lib/**/*.js"];
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

  /**
   * Compile the application if it is a Typescript application
   * Do nothing otherwise
   */
  compile() {
    if (this.compiled) {
      return;
    }
    // exec typescript
    this.log("DEBUG", "Compiling application");
    try {
      execSync(`tsc -p ${this.appPath}`);
    } catch (err) {
      (err.stdout.toString() + err.stderr.toString())
        .split("\n")
        .filter(l => l !== "")
        .forEach(l => {
          this.log("ERROR", "tsc:", l);
        });
    }
    this.compiled = true;
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
    let config = JSONUtils.duplicate(this.baseConfiguration);
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

  getDeployment(deploymentName: string = undefined): Deployment {
    if (!deploymentName) {
      deploymentName = this.currentDeployment;
    }
    this.deploymentFile = undefined;
    let deploymentConfig;
    for (let ext of [".jsonc", ".json", ".yaml", ".yml"]) {
      deploymentConfig = path.join(this.appPath, "deployments", `${deploymentName}${ext}`);
      if (fs.existsSync(deploymentConfig)) {
        break;
      }
    }

    if (!fs.existsSync(deploymentConfig)) {
      throw new WebdaError("UNKNOWN_DEPLOYMENT", "Unknown deployment");
    }

    let deploymentModel: Deployment;
    try {
      deploymentModel = FileUtils.load(deploymentConfig);
      deploymentModel.name = deploymentName;
    } catch (err) {
      throw new WebdaError(
        "INVALID_DEPLOYMENT",
        `Invalid deployment configuration ${deploymentConfig}: ${err.toString()}`
      );
    }
    this.deploymentFile = deploymentConfig;
    return deploymentModel;
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
}
