import { WorkerLogLevel, WorkerOutput } from "@webda/workout";
import type {
  AbstractService,
  CachedModule,
  Configuration,
  GitInformation,
  Modda,
  PackageDescriptor,
  ProjectInformation,
  Reflection,
  Section,
  UnpackedConfiguration,
  WebdaModule,
  WebdaPackageDescriptor
} from "../internal/iapplication";
import { setLogContext } from "../loggers/hooks";
import { FileUtils, State } from "@webda/utils";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join, resolve, dirname, isAbsolute } from "node:path";
import * as WebdaError from "../errors/errors";
import { ServiceParameters } from "../interfaces";
import { useInstanceStorage } from "../core/instancestorage";
import { Model, ModelClass } from "@webda/models";
import { JSONSchema7 } from "json-schema";
import { InstanceCache } from "../cache/cache";
import { getMachineId } from "../core/hooks";

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
  readonly appPath: string;
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
   * Contains already loaded modules
   */
  protected _loaded: string[] = [];

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
  protected models: { [key: string /* LongId */]: ModelClass } = {};

  /**
   * Models metadata
   */
  protected modelsMetadata: { [key: string]: Reflection } = {};

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
   *
   * @param {string} fileOrFolder to load Webda Application from
   * @param {Logger} logger
   */
  constructor(file: string | UnpackedConfiguration, logger: WorkerOutput = undefined) {
    useInstanceStorage().application = this;
    this.logger = logger || new WorkerOutput();
    setLogContext(this.logger);
    // If configuration is a programmatic object (usually for tests)
    if (typeof file !== "string") {
      this.baseConfiguration = { parameters: {}, ...file };
      this.appPath = process.cwd();
      return;
    }
    if (!existsSync(file)) {
      throw new WebdaError.CodeError(
        "NO_WEBDA_FOLDER",
        `Not a webda application folder or webda.config.jsonc or webda.config.json file: unexisting ${file}`
      );
    }
    // Check if file is a file or folder
    if (lstatSync(file).isDirectory()) {
      file = join(file, "webda.config.jsonc");
      if (!existsSync(file)) {
        file = file.substring(0, file.length - 1);
      }
    }
    this.configurationFile = file;
    this.appPath = resolve(dirname(file));
  }

  /**
   * Import all required modules
   */
  @ApplicationState({ start: "loading", end: "ready" })
  @InstanceCache()
  async load(): Promise<this> {
    await this.loadConfiguration(this.configurationFile);
    await this.loadModule(this.baseConfiguration.cachedModules);
    this.setModelsMetadata();
    return this;
  }

  /**
   * Set the models metadata on each known model
   */
  setModelsMetadata() {
    for (const model in this.models) {
      if (!this.models[model]) {
        this.log("ERROR", `Model ${model} is not defined`);
        continue;
      }
      const info = this.baseConfiguration.cachedModules.models[model] || {
        Ancestors: [],
        Subclasses: [],
        Relations: {},
        Reflection: {}
      };
      const metadata = {
        Identifier: model,
        Ancestors: info.Ancestors.map(a => this.models[a]).filter(m => m),
        Subclasses: info.Subclasses.map(c => this.models[c]).filter(m => m),
        Relations: info.Relations,
        Schema: this.getSchema(model),
        Reflection: info.Reflection || {}
      };
      // @ts-ignore
      this.models[model].Metadata = Object.freeze(metadata);
      this.log("TRACE", `Set metadata for ${model}`, metadata);
    }
  }

  /**
   * Allow subclass to implement migration
   *
   * @param file
   * @returns
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
      this.ensureDefaultConfiguration(this.baseConfiguration);
      if (this.baseConfiguration.version !== 4) {
        this.log("ERROR", "Your configuration file should use version 4, see https://docs.webda.io/");
      }
    } catch (err) {
      throw new WebdaError.CodeError("INVALID_WEBDA_CONFIG", `Cannot parse JSON of: ${file}`);
    }
  }

  /**
   * Ensure default parameters are set on our application
   * Creating the default services if they do not exist
   *
   * Might want to have only this in unpackaged application as Application should
   * have a perfectly valid configuration
   * @param configuration
   */
  ensureDefaultConfiguration(configuration: Configuration) {
    configuration.services ??= {};
    configuration.parameters ??= {};
    configuration.parameters.apiUrl ??= "http://localhost:18080";
    configuration.parameters.metrics ??= {};
    if (configuration.parameters.metrics) {
      configuration.parameters.metrics.labels ??= {};
      configuration.parameters.metrics.config ??= {};
      configuration.parameters.metrics.prefix ??= "";
    }
    configuration.parameters.configurationService ??= "Configuration";
    configuration.parameters.defaultStore ??= "Registry";
    const autoRegistry = configuration.services["Registry"] === undefined;

    configuration.services["Router"] ??= {
      type: "Webda/Router"
    };

    // Registry by default
    configuration.services["Registry"] ??= {
      type: "Webda/MemoryStore",
      persistence: {
        path: ".registry",
        key: getMachineId()
      }
    };

    // CryptoService by default
    configuration.services["CryptoService"] ??= {
      type: "Webda/CryptoService",
      autoRotate: autoRegistry ? 30 : undefined,
      autoCreate: true
    };

    // By default use CookieSessionManager
    configuration.services["SessionManager"] ??= {
      type: "Webda/CookieSessionManager"
    };

    // Ensure type is set to default
    for (const serviceName in configuration.services) {
      if (configuration.services[serviceName].type !== undefined) {
        continue;
      }
      if (this.moddas[this.completeNamespace(serviceName)]) {
        configuration.services[serviceName].type = this.completeNamespace(serviceName);
        continue;
      }
      if (!serviceName.includes("/") && this.moddas[`Webda/${serviceName}`]) {
        configuration.services[serviceName].type = `Webda/${serviceName}`;
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
    return this.baseConfiguration.cachedModules.schemas[type];
  }

  /**
   * Get schemas
   * @returns
   */
  getSchemas(): { [key: string]: JSONSchema7 } {
    return this.baseConfiguration.cachedModules.schemas;
  }

  /**
   * Check if a schema exists
   * @param type
   * @returns schema name if it exists
   */
  hasSchema(type: string): boolean {
    return this.baseConfiguration.cachedModules.schemas[type] !== undefined;
  }

  /**
   * Check if application has cached modules
   *
   * When deployed the application contains cachedModules in the `webda.config.json`
   * It allows to avoid the search for `webda.module.json` inside node_modules and
   * take the schema from the cached modules also
   */
  isCached(): boolean {
    return true;
  }

  /**
   * Retrieve specific webda conf from package.json
   *
   * In case of workspaces the object is combined
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
   */
  getWorkerOutput() {
    return this.logger;
  }

  /**
   * Return the current app path
   *
   * @param subpath to append to
   */
  getAppPath(subpath: string = undefined): string {
    if (subpath && subpath !== "") {
      if (isAbsolute(subpath)) {
        return subpath;
      }
      return join(this.appPath, subpath);
    }
    return this.appPath;
  }

  /**
   * Add a new service
   *
   * @param name
   * @param service
   */
  addModda(name: string, service: Modda): this {
    this.log("TRACE", "Registering service", name);
    this.moddas[name] = service;
    return this;
  }

  /**
   * Register a new schema in the application
   * @param name
   * @param schema
   */
  registerSchema(name: string, schema: JSONSchema7): void {
    if (this.hasSchema(name)) {
      throw new Error(`Schema ${name} already registered`);
    }
    this.baseConfiguration.cachedModules.schemas[name] = schema;
  }

  /**
   *
   * @param section
   * @param name
   * @param caseSensitive
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
   * @param model
   * @returns
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
   * @param section
   * @param name
   * @returns
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
   * @param name
   */
  getModda(name): Modda {
    return this.getWebdaObject("moddas", name);
  }

  /**
   * Return all services of the application
   */
  getModdas(): { [key: string]: Modda } {
    return this.moddas;
  }

  /**
   * Retrieve the model implementation
   *
   * @param name model to retrieve
   */
  getModel<T extends Model = Model>(name: string): ModelClass<T> {
    return this.getWebdaObject("models", name);
  }

  /**
   * Get all models definitions
   */
  getModels(): {
    [key: string]: ModelClass<any>;
  } {
    return this.models;
  }

  /**
   * Return models that do not have parents
   * @returns
   */
  getRootModels(): string[] {
    return [];
  }

  /**
   * Return models that do not have parents and are exposed
   * Or specifically set as root via the Expose.root parameter
   * @returns
   */
  getRootExposedModels(): string[] {
    // TODO Redefine this
    return [];
  }

  /**
   * Return the model name for a object
   * @param object
   */
  getModelFromInstance(object: Model): string | undefined {
    return Object.keys(this.models).find(k => this.models[k] === object.constructor.prototype);
  }

  /**
   * Return the model name for a object
   * @param object
   */
  getModelFromConstructor<T extends Model>(model: ModelClass<T>): string | undefined {
    return Object.keys(this.models).find(k => this.models[k] === model);
  }

  /**
   * Get the model name from a model or a constructor
   *
   * @param model
   * @paramn full if true always include the namespace, default is false e.g Webda/
   * @returns longId for a model
   */
  getModelId<T extends Model = Model>(model: ModelClass<T> | T, full?: boolean): string | undefined {
    if (model instanceof Model) {
      return this.getModelFromInstance(model);
    }
    return this.getModelFromConstructor(model);
  }

  /**
   * Return all deployers
   */
  getDeployers(): { [key: string]: Modda } {
    return this.deployers;
  }

  /**
   * Add a new model
   *
   * @param name
   * @param model
   * @param dynamic class is dynamic so recompute the hierarchy
   */
  addModel(name: string, model: any, dynamic: boolean = true): this {
    name = this.completeNamespace(name);
    this.log("TRACE", "Registering model", name);
    if (!model) {
      this.log("ERROR", "Model is undefined", name);
      return this;
    }
    this.models[name] = model;
    if (dynamic) {
      const superClass = Object.getPrototypeOf(model);
      model.Metadata = this.modelsMetadata[name] = Object.freeze({
        Identifier: name,
        Ancestors: [],
        Subclasses: [],
        Relations: {},
        PrimaryKey: ["id"],
        Events: [],
        Schema: {},
        Actions: {}
      });
    }
    return this;
  }

  /* SERIALIZATION */
  /**
   *
   * @param this
   * @param json
   * @returns
   */
  static deserialize<T extends Application>(this: new (...args: any[]) => T, json: any): T {
    const instance = new this();
    instance.baseConfiguration = json.baseConfiguration;
    instance.currentDeployment = json.currentDeployment;
    instance.appModule = json.appModule;
    return instance;
  }

  toJSON() {
    return {
      baseConfiguration: this.baseConfiguration,
      currentDeployment: this.currentDeployment,
      appModule: this.appModule
    };
  }

  /**
   * Get the metadata for a model
   * @param name
   * @returns
   */
  getModelMetadata(name: string): Reflection | undefined {
    return this.modelsMetadata[name];
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
   */
  getGitInformation(_packageName?: string, _version?: string): GitInformation {
    return this.baseConfiguration.cachedModules.project?.git;
  }

  /**
   * Retrieve the project information
   * @returns
   */
  getProjectInfo(): ProjectInformation | undefined {
    return this.baseConfiguration.cachedModules.project;
  }

  /**
   * Get current deployment name
   */
  getCurrentDeployment(): string {
    return this.baseConfiguration.cachedModules.project.deployment.name;
  }

  /**
   * Return all application modules merged as one
   *
   * Used when deployed
   * @returns
   */
  getModules(): CachedModule {
    return this.baseConfiguration.cachedModules;
  }

  /**
   * Get application configuration
   * @returns
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
  protected async importFile(info: string, withExport: boolean = true): Promise<any> {
    if (info.startsWith(".")) {
      info = this.getAppPath(info);
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
   * @param object
   * @returns
   */
  getImplementations<T extends AbstractService>(object: T): { [key: string]: Modda<T> } {
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
  async loadModule(module: WebdaModule, parent: string = this.appPath) {
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
          this[section][key].createConfiguration = (params: any) => {
            const filteredParams = {};
            if (info[section][key].Schema) {
              // If schema is defined, filter the params
              for (const field of Object.keys(info[section][key].Schema.properties)) {
                filteredParams[field] = params[field];
              }
            } else {
              // If no schema we just use the params as is
              Object.assign(filteredParams, params);
            }
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
    if (name.includes("/")) {
      return name;
    }
    return `${this.getNamespace()}/${name}`;
  }

  /**
   * Return current namespace
   * @returns
   */
  getNamespace(): string {
    return this.baseConfiguration?.cachedModules?.project?.webda?.namespace || "Webda";
  }
}
