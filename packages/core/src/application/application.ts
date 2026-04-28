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
import type { BehaviorMetadata } from "@webda/compiler";

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
   * Beans registry
   */
  protected beans: { [key: string]: Modda } = {};

  /**
   * Behaviors registry
   *
   * Populated by `loadModule` from the top-level `behaviors` map of every
   * loaded `webda.module.json`. Each entry holds the metadata blob emitted by
   * the compiler so downstream consumers (DomainService, REST transport, etc.)
   * can introspect the Behavior's declared actions and shape.
   *
   * The Behavior class itself is NOT loaded at runtime: the per-model
   * `__hydrateBehaviors` method emitted at compile time by
   * `@webda/ts-plugin` holds a static import to the class, so the runtime
   * never needs to look it up by identifier.
   */
  protected behaviors: { [key: string]: { metadata: BehaviorMetadata } } = {};

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
    // "?" suffix means optional input — return the same schema without required fields
    if (type.endsWith("?")) {
      const base = this.getSchema(type.slice(0, -1));
      if (!base) return undefined;
      const copy = { ...base };
      delete copy.required;
      return copy;
    }
    const cm = this.baseConfiguration.cachedModules;
    return (
      cm.schemas[type] ||
      cm.models?.[type]?.Schemas?.Input ||
      cm.moddas?.[type]?.Schema ||
      cm.beans?.[type]?.Schema
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
   * Return true if `model` is the one that wins when consumers look up the
   * short name in the current namespace. Used by transports (REST, GraphQL,
   * gRPC) so only one model gets exposed at a given URL / type when the app
   * overrides a framework-provided class — e.g. WebdaSample/User shadowing
   * Webda/User at `/users`.
   *
   * A model is "final" when either:
   *  - it is the one resolved by `completeNamespace(shortName)`, or
   *  - no other model exists with the same short name in the current namespace.
   * @param model - the fully-qualified model identifier (e.g. "Webda/User")
   * @returns true when `model` should be treated as the canonical version
   */
  isFinalModel(model: string): boolean {
    if (!this.models[model]) {
      return false;
    }
    const name = model.split("/").pop();
    const resolved = this.completeNamespace(name);
    // Only a model that the current namespace resolves to is exposed. If the
    // app defines its own version (e.g. WebdaSample/User shadowing Webda/User)
    // just that one wins; otherwise the framework-provided model stays internal.
    return resolved === model;
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
   * Return the metadata blob (Identifier, Actions, etc.) for a Behavior
   * loaded from `webda.module.json`.
   *
   * @param identifier - fully qualified Behavior id (e.g. `Webda/MFA`)
   * @returns the metadata, or undefined if no Behavior with that id is registered
   */
  getBehaviorMetadata(identifier: string): BehaviorMetadata | undefined {
    return this.behaviors[identifier]?.metadata;
  }

  /**
   * Return all loaded Behaviors keyed by identifier.
   *
   * Each entry exposes the original metadata blob emitted by the compiler.
   * @returns the result
   */
  getBehaviors(): { [key: string]: { metadata: BehaviorMetadata } } {
    return this.behaviors;
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
    // Filter beans based on ignoreBeans configuration
    if (info.beans) {
      const ignoreBeans = this.baseConfiguration?.parameters?.ignoreBeans;
      for (const f of Object.keys(info.beans)) {
        if (ignoreBeans === true) continue;
        if (Array.isArray(ignoreBeans) && ignoreBeans.includes(f)) continue;
        this.baseConfiguration.cachedModules.beans[f] = info.beans[f];
      }
    }
    // Behaviors are registered by metadata only — the runtime never imports
    // the Behavior class. The per-model `__hydrateBehaviors(rawData)` method
    // emitted at compile time by `@webda/ts-plugin` holds the static
    // imports needed to coerce raw values into Behavior instances, so the
    // application registry just needs to retain the metadata blob (action
    // shapes, identifier, etc.) for `DomainService` operation registration
    // and the REST transport routing.
    if (info.behaviors) {
      for (const id in info.behaviors) {
        this.behaviors[id] ??= { metadata: info.behaviors[id] };
      }
    }

    // TODO Merging tree from different modules
    await Promise.all([sectionLoader("moddas"), sectionLoader("models"), sectionLoader("beans")]);
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
      // Register serializer under the full model identifier so app-specific
      // classes (e.g. WebdaSample/User) don't collide with framework ones that
      // share the same JS constructor name (Webda/User).
      this.models[m].registerSerializer(true, m);
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
