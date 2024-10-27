import { type WorkerLogLevel, WorkerOutput } from "@webda/workout";
import * as fs from "fs";
import type { JSONSchema7 } from "json-schema";
import * as path from "path";
import * as WebdaError from "../errors/errors";
import { FileUtils, getCommonJS } from "@webda/utils";
const { __dirname } = getCommonJS(import.meta.url);
import {
  CachedModule,
  ModelDefinition,
  Configuration,
  GitInformation,
  IApplication,
  WebdaModule,
  PackageDescriptor,
  Section,
  UnpackedConfiguration,
  WebdaPackageDescriptor,
  Reflection,
  AbstractCoreModel,
  AbstractService,
  Modda
} from "../internal/iapplication";
import { CoreModel } from "../models/coremodel";
import { useInstanceStorage } from "../core/instancestorage";
import { setLogContext } from "../loggers/hooks";

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
export class Application implements IApplication {
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
  protected models: { [key: string /* LongId */]: ModelDefinition<CoreModel> } = {};

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
   *
   * @param {string} fileOrFolder to load Webda Application from
   * @param {Logger} logger
   */
  constructor(file: string | UnpackedConfiguration, logger: WorkerOutput = undefined) {
    useInstanceStorage().application = this;
    this.logger = logger || new WorkerOutput();
    setLogContext(this.logger);
    this.initTime = Date.now();
    // If configuration is a programmatic object (usually for tests)
    if (typeof file !== "string") {
      this.baseConfiguration = { parameters: {}, ...file };
      this.appPath = process.cwd();
      return;
    }
    if (!fs.existsSync(file)) {
      throw new WebdaError.CodeError(
        "NO_WEBDA_FOLDER",
        `Not a webda application folder or webda.config.jsonc or webda.config.json file: unexisting ${file}`
      );
    }
    // Check if file is a file or folder
    if (fs.lstatSync(file).isDirectory()) {
      file = path.join(file, "webda.config.jsonc");
      if (!fs.existsSync(file)) {
        file = file.substring(0, file.length - 1);
      }
    }
    this.configurationFile = file;
    this.appPath = path.resolve(path.dirname(file));
  }

  /**
   * Import all required modules
   */
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
        Relations: {}
      };
      const metadata = {
        Identifier: model,
        Ancestors: info.Ancestors.map(a => this.models[a]).filter(m => m),
        Subclasses: info.Subclasses.map(c => this.models[c]).filter(m => m),
        Relations: info.Relations,
        Schema: this.getSchema(model)
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
    if (file && !fs.existsSync(file)) {
      throw new WebdaError.CodeError(
        "NO_WEBDA_FOLDER",
        `Not a webda application folder or webda.config.jsonc or webda.config.json file: ${file}`
      );
    }
    try {
      this.baseConfiguration ??= file ? FileUtils.load(file) : {};
      this.baseConfiguration.parameters ??= {};
      this.baseConfiguration.parameters.defaultStore ??= "Registry";
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
      if (path.isAbsolute(subpath)) {
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
  getModel<T extends AbstractCoreModel = AbstractCoreModel>(name: string): ModelDefinition<T> {
    return this.getWebdaObject("models", name);
  }

  /**
   * Get all models definitions
   */
  getModels(): {
    [key: string]: ModelDefinition<CoreModel>;
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
    const results = new Set<string>(this.getRootModels().filter(k => this.getModel(k).Expose));
    for (const model in this.models) {
      if (this.models[model]?.Expose?.root) {
        results.add(model);
      }
    }
    return [...results];
  }

  /**
   * Return the model name for a object
   * @param object
   */
  getModelFromInstance(object: CoreModel): string | undefined {
    return Object.keys(this.models).find(k => this.models[k] === object.constructor.prototype);
  }

  /**
   * Return the model name for a object
   * @param object
   */
  getModelFromConstructor<T extends CoreModel>(model: ModelDefinition<T>): string | undefined {
    return Object.keys(this.models).find(k => this.models[k] === model);
  }

  /**
   * Get the model name from a model or a constructor
   *
   * @param model
   * @returns longId for a model
   */
  getModelId<T extends CoreModel = CoreModel>(model: ModelDefinition<T> | T): string | undefined {
    if (model instanceof AbstractCoreModel) {
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
        Schema: {}
      });
    }
    return this;
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
  getGitInformation(_packageName?: string, _version?: string): GitInformation {
    return this.baseConfiguration.cachedModules.project?.git;
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

    let scan = templateString;
    let index;
    let i = 0;
    while ((index = scan.indexOf("${")) >= 0) {
      // Add escape sequence
      if (index > 0 && scan.substring(index - 1, 1) === "\\") {
        scan = scan.substring(scan.indexOf("}", index));
        continue;
      }
      const next = scan.indexOf("}", index);
      const variable = scan.substring(index + 2, next);
      scan = scan.substring(next);
      if (variable.match(/[|&;<>\\{]/)) {
        throw new Error(`Variable cannot use every javascript features found ${variable}`);
      }
      if (i++ > 10) {
        throw new Error("Too many variables");
      }
    }
    return new Function(
      "return `" + (" " + templateString).replace(/([^\\])\$\{([^}{]+)}/g, "$1${this.$2}").substring(1) + "`;"
    ).call({
      ...this.baseConfiguration.cachedModules.project,
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
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const app = this;
    return JSON.parse(
      // eslint-disable-next-line func-names
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
    const moduleFile = path.join(process.cwd(), "webda.module.json");
    if (fs.existsSync(moduleFile)) {
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
      if (object instanceof this.moddas[key]) {
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
        this[section][key] ??= await this.importFile(path.join(parent, info[section][key].Import));
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
          return this.importFile(path.join(parent, info.beans[f].Import), false).catch(this.log.bind(this, "WARN"));
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
