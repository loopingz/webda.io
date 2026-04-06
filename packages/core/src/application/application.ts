import { WorkerLogLevel, WorkerOutput } from "@webda/workout";
import type {
  CachedModule,
  Configuration,
  GitInformation,
  PackageDescriptor,
  ProjectInformation,
  Section,
  UnpackedConfiguration,
  WebdaModule,
  WebdaPackageDescriptor
} from "./iconfiguration.js";
import type { Modda } from "../services/iservice.js";
import type { ModelDefinition } from "../models/types.js";
import { setLogContext } from "../loggers/hooks.js";
import { CancelablePromise, FileUtils, State } from "@webda/utils";
import { existsSync, lstatSync, Mode, readFileSync } from "node:fs";
import { join, resolve, dirname, isAbsolute } from "node:path";
import * as WebdaError from "../errors/errors.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { runWithInstanceStorage, useInstanceStorage } from "../core/instancestorage.js";
import { isModelClass, type Model, type ModelClass, type Storable } from "@webda/models";
import { JSONSchema7 } from "json-schema";
import { InstanceCache } from "../cache/cache.js";
import type { Service } from "../services/service.js";
import { ModelMetadata } from "@webda/compiler";

export type ApplicationState = "initial" | "loading" | "ready";

// We should not be able to set initial from outside
const ApplicationState: typeof State<Exclude<ApplicationState, "initial">> = State;

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
  readonly applicationPath: string;
  /**
   * Base configuration loaded from webda.config.json
   */
  protected baseConfiguration: Configuration;
  /**
   * Current deployment
   */
  protected currentDeployment: string;

  /**
   * Contains definitions of current application
   */
  protected appModule: WebdaModule = {
    moddas: {},
    models: {},
    schemas: {}
  };

  /**
   * Deployers type registry
   */
  protected deployers: { [key: string]: any } = {};

  /**
   * Moddas registry
   */
  protected moddas: { [key: string]: Modda } = {};

  /**
   * Models type registry
   */
  protected models: { [key: string /* LongId */]: ModelDefinition } = {};

  /**
   * Class Logger
   */
  protected logger: WorkerOutput;

  /**
   * Detect if running as workspace
   */
  protected workspacesPath: string = "";

  /**
   * Configuration file
   */
  readonly configurationFile: string;
  /**
   * Current deployment file
   */
  deploymentFile: string;

  /**
   * Create a new Application
   * @param file - file path or unpacked configuration to load from
   * @param logger - the logger instance
   */
  constructor(file: string | UnpackedConfiguration, logger: WorkerOutput = undefined) {
    this.logger = logger || new WorkerOutput();
    setLogContext(this.logger);
    // If configuration is a programmatic object (usually for tests)
    if (typeof file !== "string") {
      this.baseConfiguration = { parameters: {}, ...file };
      // Still want to ensure default configuration
      this.applicationPath = process.cwd();
      return;
    }
    if (!existsSync(file)) {
      throw new WebdaError.CodeError(
        "NO_WEBDA_FOLDER",
        `Not a webda application folder or webda.config.(ya?ml|jsonc?) file: unexisting ${file}`
      );
    }
    // Check if file is a file or folder
    if (lstatSync(file).isDirectory()) {
      file = FileUtils.getConfigurationFile(join(file, "webda.config"))
    }
    this.configurationFile = file;
    this.applicationPath = resolve(dirname(file));
  }

  /**
   * Run the application
   * @returns the result
   */
  async run() {
    return Application._runner(this);
  }

  /**
   * Pluggable runner — set by runner.ts to avoid circular dependency with Core.
   * @internal
   */
  static _runner: (app: Application) => Promise<void>;

  /**
   * Import all required modules
   * @returns the result
   */
  @ApplicationState({ start: "loading", end: "ready" })
  @InstanceCache()
  async load(): Promise<this> {
    await this.loadConfiguration(this.configurationFile);
    await this.loadModule(this.baseConfiguration.cachedModules);
    return this;
  }

  /**
   * Allow subclass to implement migration
   *
   * @param file - the file path
   * @returns the result
   */
  async loadConfiguration(file: string): Promise<void> {
    // Check if file is a file or folder
    if (file && !existsSync(file)) {
      throw new WebdaError.CodeError(
        "NO_WEBDA_FOLDER",
        `Not a webda application folder or webda.config.jsonc or webda.config.json file: ${file}`
      );
    }
    try {
      this.baseConfiguration ??= file ? FileUtils.load(file) : {};
      if (this.baseConfiguration.version !== 4) {
        this.log("ERROR", "Your configuration file should use version 4, see https://docs.webda.io/");
      }
    } catch (err) {
      throw new WebdaError.CodeError("INVALID_WEBDA_CONFIG", `Cannot parse JSON of: ${file}`);
    }
  }

  /**
   * Get a schema from a type
   *
   * Schema should be precomputed in the default app
   * @param type - the type to look up
   * @returns the result
   */
  getSchema(type: string): JSONSchema7 {
    return (
      this.baseConfiguration.cachedModules.schemas[type] ||
      this.baseConfiguration.cachedModules.models?.[type]?.Schemas?.Input
    );
  }

  /**
   * Get schemas
   * @returns the result
   */
  getSchemas(): { [key: string]: JSONSchema7 } {
    return this.baseConfiguration.cachedModules.schemas;
  }

  /**
   * Check if application has cached modules
   *
   * When deployed the application contains cachedModules in the `webda.config.json`
   * It allows to avoid the search for `webda.module.json` inside node_modules and
   * take the schema from the cached modules also
   * @returns true if the condition is met
   */
  isCached(): boolean {
    return true;
  }

  /**
   * Retrieve specific webda conf from package.json
   *
   * In case of workspaces the object is combined
   * @returns the result
   */
  getPackageWebda(): WebdaPackageDescriptor {
    return (
      this.baseConfiguration.cachedModules.project?.webda || {
        namespace: "Webda"
      }
    );
  }
  /**
   * Retrieve content of package.json
   * @returns the result
   */
  getPackageDescription(): PackageDescriptor {
    return this.baseConfiguration.cachedModules?.project?.package || {};
  }

  /**
   * Log information
   *
   * @param level to log for
   * @param args anything to display same as console.log
   */
  log(level: WorkerLogLevel, ...args) {
    this.logger?.log(level, ...args);
  }

  /**
   * Get current logger
   * @returns the result
   */
  getWorkerOutput() {
    return this.logger;
  }

  /**
   * Return the current app path
   *
   * @param subpath to append to
   * @returns the result string
   */
  getPath(subpath: string = undefined): string {
    if (subpath && subpath !== "") {
      if (isAbsolute(subpath)) {
        return subpath;
      }
      return join(this.applicationPath, subpath);
    }
    return this.applicationPath;
  }

  /**
   * Add a new service
   *
   * @param name - the name to use
   * @param service - the service instance
   * @returns this for chaining
   */
  addModda(name: string, service: Modda): this {
    this.log("TRACE", "Registering service", name);
    this.moddas[name] = service;
    return this;
  }

  /**
   *
   * @param section - the section name
   * @param name - the name to use
   * @param caseSensitive - whether matching is case sensitive
   * @returns true if the condition is met
   */
  hasWebdaObject(section: Section, name: string): boolean {
    let objectName = this.completeNamespace(name);
    this.log("TRACE", `Search for ${section} ${objectName}`);
    if (!this[section][objectName] && name.indexOf("/") === -1) {
      objectName = `Webda/${name}`;
    }
    return this[section][objectName] !== undefined;
  }

  /**
   * Define if the model is the last one in the hierarchy
   *
   * TODO Define clearly
   * @param model - the model to use
   * @returns true if the condition is met
   */
  isFinalModel(model: string): boolean {
    if (!this.models[model]) {
      return false;
    }
    const name = model.split("/").pop();
    if (this["models"][this.completeNamespace(name)] !== undefined) {
      return true;
    }
    //return this.graph[model].children?.length === 0;
    return false;
  }

  /**
   *
   * @param section - the section name
   * @param name - the name to use
   * @returns the result
   */
  getWebdaObject(section: Section, name: string) {
    let objectName = this.completeNamespace(name);
    this.log("TRACE", `Search for ${section} ${objectName}`);
    if (!this[section][objectName] && name.indexOf("/") === -1) {
      const namespaced = this.completeNamespace(name);
      objectName = this[section][namespaced] ? `${namespaced}/${name}` : `Webda/${name}`;
    }
    if (!this[section][objectName]) {
      if (Object.keys(this[section]).includes(objectName)) {
        throw Error(`Null ${section.substring(0, section.length - 1)} ${objectName}`);
      }
      throw Error(
        `Undefined ${section.substring(0, section.length - 1)} ${objectName} (${Object.keys(this[section]).join(", ")})`
      );
    }
    return this[section][objectName];
  }

  /**
   * Get a service based on name
   *
   * @param name - the name to use
   * @returns the result
   */
  getModda(name: string): Modda {
    return this.getWebdaObject("moddas", name);
  }

  /**
   * Return all services of the application
   * @returns the result
   */
  getModdas(): { [key: string]: Modda } {
    return this.moddas;
  }

  /**
   * Retrieve the model implementation
   *
   * @param name model to retrieve
   * @returns the result
   */
  getModel<T extends Model = Model>(name: string): ModelDefinition<T> {
    return this.getWebdaObject("models", name);
  }

  /**
   * Get all models definitions
   * @returns the result
   */
  getModels(): {
    [key: string]: ModelDefinition<any>;
  } {
    return this.models;
  }

  /**
   * Return the model name for a object
   * @param object - the target object
   * @returns the result
   */
  getModelFromInstance(object: Storable): string | undefined {
    return Object.keys(this.models).find(k => this.models[k] === object.constructor);
  }

  /**
   * Return the model name for a object
   * @param object - the target object
   * @param model - the model to use
   * @returns the result
   */
  getModelFromConstructor(model: ModelClass): string | undefined {
    // @ts-ignore
    return Object.keys(this.models).find(k => this.models[k] === model);
  }

  /**
   * Get the model name from a model or a constructor
   *
   * @param model - the model to use
   * @paramn full if true always include the namespace, default is false e.g Webda/
   * @returns longId for a model
   */
  getModelId(model: ModelClass | Storable): string | undefined {
    if (isModelClass(model)) {
      return this.getModelFromConstructor(model as ModelClass);
    }
    return this.getModelFromInstance(model as Storable);
  }

  /**
   * Return all deployers
   * @returns the result
   */
  getDeployers(): { [key: string]: Modda } {
    return this.deployers;
  }

  /**
   * Add a new model
   *
   * @param name - the name to use
   * @param model - the model to use
   * @param dynamic class is dynamic so recompute the hierarchy
   * @param metadata - the model metadata
   * @returns this for chaining
   */
  addModel(
    name: string,
    model: any,
    metadata: ModelMetadata = {
      Identifier: name,
      Ancestors: [],
      Subclasses: [],
      Relations: {},
      PrimaryKey: ["id"],
      Events: [],
      Schemas: {},
      Actions: {},
      Import: "",
      Plural: name + "s",
      Reflection: {}
    }
  ): this {
    name = this.completeNamespace(name);
    this.log("TRACE", "Registering model", name);
    if (!model) {
      this.log("ERROR", "Model is undefined", name);
      return this;
    }
    this.models[name] = model;
    if (metadata) {
      // Get ancestor?
      const superClass = Object.getPrototypeOf(model);
      model.Metadata = Object.freeze(metadata);
    }
    return this;
  }

  /* SERIALIZATION */
  /**
   *
   * @param this - the constructor
   * @param json - the JSON data
   * @returns the result
   */
  static deserialize<T extends Application>(this: new (...args: any[]) => T, json: any): T {
    const instance = new this();
    instance.baseConfiguration = json.baseConfiguration;
    instance.currentDeployment = json.currentDeployment;
    instance.appModule = json.appModule;
    return instance;
  }

  /**
   * Serialize the application state to a plain object
   * @returns the result
   */
  toJSON() {
    return {
      baseConfiguration: this.baseConfiguration,
      currentDeployment: this.currentDeployment,
      appModule: this.appModule
    };
  }

  /**
   * Return webda current version
   *
   * @returns package version
   * @since 0.4.0
   */
  getWebdaVersion(): string {
    return JSON.parse(readFileSync(__dirname + "/../../package.json").toString()).version;
  }

  /**
   * Retrieve Git Repository information
   *
   * {@link GitInformation} for more details on how the information is gathered
   * @return the git information
   * @param _packageName - the package name
   * @param _version - the version string
   * @returns the result
   */
  getGitInformation(_packageName?: string, _version?: string): GitInformation {
    return this.baseConfiguration.cachedModules.project?.git;
  }

  /**
   * Retrieve the project information
   * @returns the result
   */
  getProjectInfo(): ProjectInformation | undefined {
    return this.baseConfiguration.cachedModules.project;
  }

  /**
   * Get current deployment name
   * @returns the result string
   */
  getCurrentDeployment(): string {
    return this.baseConfiguration.cachedModules.project.deployment.name;
  }

  /**
   * Return all application modules merged as one
   *
   * Used when deployed
   * @returns the result
   */
  getModules(): CachedModule {
    return this.baseConfiguration.cachedModules;
  }

  /**
   * Get application configuration
   * @param _deployment - the deployment name
   * @returns the result
   */
  getConfiguration(_deployment: string = undefined): Configuration {
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
   * @returns the result
   */
  getCurrentConfiguration(): Configuration {
    return this.getConfiguration();
  }

  /**
   * Import a file
   *
   * If the `default` is set take this or use old format
   *
   * @param info - the information object
   * @param withExport - whether to include exports
   * @returns the result
   */
  protected async importFile(info: string, withExport: boolean = true): Promise<any> {
    if (info.startsWith(".")) {
      info = this.getPath(info);
    }
    try {
      this.log("TRACE", "Load file", info);
      // eslint-disable-next-line prefer-const
      let [importFilename, importName = "default"] = info.split(":");
      if (!importFilename.endsWith(".js") && !importFilename.endsWith(".ts")) {
        importFilename += ".js";
      }
      const importedFile = await import(importFilename);
      if (!withExport) {
        return;
      }
      const importObject = importedFile[importName];
      if (!importObject) {
        this.log("WARN", `Module ${importFilename} does not have export named ${importName}`);
      }
      return importObject;
    } catch (err) {
      this.log("ERROR", "Cannot resolve require", info, err.message);
    }
  }

  /**
   * Load local module
   */
  async loadLocalModule() {
    const moduleFile = join(process.cwd(), "webda.module.json");
    if (existsSync(moduleFile)) {
      await this.loadModule(FileUtils.load(moduleFile), process.cwd());
    }
  }

  /**
   * Get implementations of a class
   * @param object - the target object
   * @returns the result
   */
  getImplementations<T extends Service>(object: T): { [key: string]: Modda<T> } {
    const res: any = {};
    for (const key in this.moddas) {
      if (this.moddas[key] && object instanceof this.moddas[key]) {
        res[key] = this.moddas[key];
      }
    }
    return res;
  }

  /**
   * Load the module,
   *
   * @protected
   * @ignore Useless for documentation
   */
  async loadModule(module: WebdaModule, parent: string = this.applicationPath) {
    if (!module) {
      return;
    }
    const info: Omit<CachedModule, "project"> = module;
    const sectionLoader = async (section: Section) => {
      for (const key in info[section]) {
        this[section][key] ??= await this.importFile(join(parent, info[section][key].Import));
        if (!this[section][key]) {
          this.log(
            "ERROR",
            `Cannot load ${section.substring(0, section.length - 1)} ${key} from ${join(parent, info[section][key].Import)}`
          );
          continue;
        }
        if (section === "beans" || section === "moddas") {
          // Load the parameters automatically
          const configurationClass = info[section][key].Configuration
            ? await this.importFile(join(parent, info[section][key].Configuration))
            : ServiceParameters;
          if (!configurationClass) {
            this.log(
              "ERROR",
              `Cannot load configuration for ${section.substring(0, section.length - 1)} ${key} from ${join(parent, info[section][key].Configuration)}`
            );
            continue;
          }
          this[section][key].filterParameters = (params: any = {}) => {
            if (!info[section][key].Schema) {
              return params;
            }
            const filteredParams: any = {};
            for (const field of Object.keys(info[section][key].Schema.properties)) {
              if (params[field] !== undefined) {
                filteredParams[field] = params[field];
              }
            }
            return filteredParams;
          };
          this[section][key].createConfiguration = (params: any = {}) => {
            const filteredParams = this[section][key].filterParameters(params);
            return new (configurationClass ?? ServiceParameters)().load(filteredParams);
          };
        }
      }
    };
    // TODO Merging tree from different modules
    await Promise.all([
      sectionLoader("moddas"),
      sectionLoader("models"),
      ...Object.keys(info.beans || {})
        .filter(f => {
          if (this.baseConfiguration?.parameters?.ignoreBeans === true) {
            return false;
          }
          if (
            this.baseConfiguration?.parameters?.ignoreBeans &&
            Array.isArray(this.baseConfiguration.parameters.ignoreBeans)
          ) {
            return !this.baseConfiguration.parameters.ignoreBeans.includes(f);
          }
          return true;
        })
        .map(f => {
          this.baseConfiguration.cachedModules.beans[f] = info.beans[f];
          return this.importFile(join(parent, info.beans[f].Import), false).catch(this.log.bind(this, "WARN"));
        })
    ]);
    // Set metadata on models - need to be done after all models are loaded
    this.setModelMetadata(info.models);
  }

  /**
   * Set object Metadata
   * Need to be done after all models are loaded to resolve Ancestors and Subclasses
   * @param info - the information object
   */
  protected setModelMetadata(info: { [key: string]: ModelMetadata }) {
    // Might want to move this to specific methods
    for (const m in this.models) {
      if (!this.models[m]) {
        continue;
      }
      // Register serializer
      this.models[m].registerSerializer();
      this.models[m].Metadata = Object.freeze({
        ...info[m],
        // Runtime: resolve strings to model classes for backward compat
        // ModelMetadata types these as string[] but core resolves them to classes
        Ancestors: info[m].Ancestors.map(s => this.models[s]) as any,
        Subclasses: info[m].Subclasses.map(s => this.models[s]) as any
      });
    }
  }

  /**
   * Return the full name including namespace
   *
   * In Webda the ServiceType include namespace `Webda/Store` or `Webda/Test`
   * This method will make sure the namespace is present, adding it if no '/'
   * is found in the name
   *
   * @param name - the name to use
   * @returns the result string
   */
  completeNamespace(name: string = ""): string {
    // Do not add a namespace if already present
    if (name.includes("/")) {
      return name;
    }
    return `${this.getNamespace()}/${name}`;
  }

  /**
   * Return current namespace
   * @returns the result string
   */
  getNamespace(): string {
    return this.baseConfiguration?.cachedModules?.project?.webda?.namespace || "Webda";
  }
}
