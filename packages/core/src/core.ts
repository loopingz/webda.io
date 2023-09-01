import { WorkerLogLevel, WorkerOutput } from "@webda/workout";
import Ajv, { ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { deepmerge } from "deepmerge-ts";
import * as events from "events";
import { JSONSchema7 } from "json-schema";
import jsonpath from "jsonpath";
import pkg from "node-machine-id";
import { OpenAPIV3 } from "openapi-types";
import {
  Counter,
  CounterConfiguration,
  Gauge,
  GaugeConfiguration,
  Histogram,
  HistogramConfiguration,
  register
} from "prom-client";
import { Writable } from "stream";
import { v4 as uuidv4 } from "uuid";
import { Application, Configuration, Modda } from "./application";
import {
  BinaryService,
  ConfigurationService,
  ContextProvider,
  ContextProviderInfo,
  GlobalContext,
  HttpContext,
  Logger,
  OperationContext,
  RegExpValidator,
  Service,
  Store,
  UnpackedApplication,
  WebContext,
  WebdaError,
  WebdaQL
} from "./index";
import { Constructor, CoreModel, CoreModelDefinition } from "./models/coremodel";
import { RouteInfo, Router } from "./router";
import CryptoService from "./services/cryptoservice";
import { JSONUtils } from "./utils/serializers";
const { machineIdSync } = pkg;

/**
 * Copy from https://github.com/ajv-validator/ajv/blob/master/lib/runtime/validation_error.ts
 * It is not exported by ajv
 */
export class ValidationError extends Error {
  readonly errors: Partial<ErrorObject>[];
  readonly ajv: true;
  readonly validation: true;

  constructor(errors: Partial<ErrorObject>[]) {
    super("validation failed");
    this.errors = errors;
    this.ajv = this.validation = true;
  }
}

/**
 * Operation
 */
export class OperationError extends Error {
  constructor(public operation: string, public type: "Unknown" | "PermissionDenied" | "InvalidInput") {
    super(`Operation ${operation} ${type}`);
  }
}

/**
 * Define an operation within webda app
 */
export interface OperationDefinition {
  /**
   * Id of the operation
   */
  id: string;
  /**
   * Name of the schema that defines operation input
   */
  input?: string;
  /**
   * Name of the schema that defines operation output
   */
  output?: string;
  /**
   * WebdaQL to execute on session to know if
   * operation is available to user
   */
  permission?: string;
  /**
   * Service implementing the operation
   */
  service: string;
  /**
   * Method implementing the operation
   */
  method: string;
}

/**
 * Define an operation within webda app
 */
export interface OperationDefinitionInfo extends OperationDefinition {
  /**
   * Contains the parse permission query
   */
  permissionQuery?: WebdaQL.QueryValidator;
}
/**
 *
 */
export type RegistryEntry<T = any> = CoreModel & T;
/**
 * Ensure all events store the context in the same place
 */
export interface EventWithContext<T extends OperationContext = OperationContext> {
  context: T;
}

/**
 * RequestFilter allow a service which implement it to control incoming request
 *
 * If one of the filter replies with "true" then the request will go through
 */
export interface RequestFilter<T extends WebContext = WebContext> {
  /**
   * Return true if the request should be allowed
   *
   * @param context to check for
   */
  checkRequest(context: T, type: "CORS" | "AUTH"): Promise<boolean>;
}

/**
 * Filter request based on their origin
 *
 * @category CoreFeatures
 */
export class OriginFilter implements RequestFilter<WebContext> {
  regexs: RegExpValidator;
  constructor(origins: string[]) {
    this.regexs = new RegExpValidator(origins);
  }
  /**
   *
   * @param context
   * @returns
   */
  async checkRequest(context: WebContext): Promise<boolean> {
    let httpContext = context.getHttpContext();
    return this.regexs.validate(httpContext.hostname) || this.regexs.validate(httpContext.origin);
  }
}

/**
 * Authorize requests based on the website
 */
export class WebsiteOriginFilter implements RequestFilter<WebContext> {
  websites: string[] = [];
  constructor(website: any) {
    if (!Array.isArray(website)) {
      if (typeof website === "object") {
        this.websites.push(website.url);
      } else {
        this.websites.push(website);
      }
    } else {
      this.websites = [...website];
    }
  }
  async checkRequest(context: WebContext): Promise<boolean> {
    let httpContext = context.getHttpContext();
    if (
      this.websites.indexOf(httpContext.origin) >= 0 ||
      this.websites.indexOf(httpContext.host) >= 0 ||
      this.websites.indexOf("*") >= 0
    ) {
      return true;
    }
    return false;
  }
}

// @Bean to declare as a Singleton service
export function Bean(constructor: Function) {
  let name = constructor.name;
  // @ts-ignore
  process.webdaBeans ??= {};
  // @ts-ignore
  const beans = process.webdaBeans;
  beans[name] ??= <Modda>constructor;
}

export type CoreEvents = {
  /**
   * Emitted when new result is sent
   */
  "Webda.Result": EventWithContext<WebContext>;
  /**
   * Emitted when new request comes in
   */
  "Webda.Request": EventWithContext<WebContext>;
  /**
   * Emitted when a request does not match any route
   */
  "Webda.404": EventWithContext<WebContext>;
  /**
   * Emitted when Services have been initialized
   */
  "Webda.Init.Services": { [key: string]: Service };
  /**
   * Emitted when Services have been created
   */
  "Webda.Create.Services": { [key: string]: Service };
  /**
   * Emitted when Core is initialized
   */
  "Webda.Init": Configuration;
  /**
   * Emitted whenever a new Context is created
   */
  "Webda.NewContext": {
    context: OperationContext;
    info: ContextProviderInfo;
  };
  /**
   * Sent when route is added to context
   */
  "Webda.UpdateContextRoute": {
    context: WebContext;
  };
  [key: string]: unknown;
};

type NoSchemaResult = null;

type SchemaValidResult = true;

type SchemaInvalidResult = {
  errors: ErrorObject[];
  text: string;
};

/**
 * This is the main class of the framework, it handles the routing, the services initialization and resolution
 *
 * @class Core
 * @category CoreFeatures
 */
export class Core<E extends CoreEvents = CoreEvents> extends events.EventEmitter {
  /**
   * Webda Services
   * @hidden
   */
  protected services: { [key: string]: Service } = {};
  /**
   * Application that generates this Core
   */
  protected application: Application;
  /**
   * Router that will route http request in
   */
  protected router: Router = new Router(this);
  /**
   * If Core is already initiated
   */
  protected _initiated: boolean = false;
  /**
   * Services who failed to create or initialize
   */
  protected failedServices: { [key: string]: any } = {};
  /**
   * Init promise to ensure, webda is initiated
   * Used for init() method
   */
  protected _init: Promise<void>;
  /**
   * Configuration loaded from webda.config.json
   * @hidden
   */
  protected configuration: Configuration;
  /**
   * JSON Schema validator instance
   */
  protected _ajv: Ajv;
  /**
   * JSON Schema registry
   * Save if a schema was added to Ajv already
   */
  protected _ajvSchemas: { [key: string]: true };
  /**
   * Current executor
   */
  protected _currentExecutor: any;

  protected _configFile: string;
  /**
   * Contains the current initialization process
   */
  protected _initPromise: Promise<void>;
  /**
   * When the Core was initialized
   */
  protected _initTime: number;
  /**
   * Console logger
   * @hidden
   */
  protected logger: Logger;
  /**
   * Request Filter registry
   *
   * Added via [[Webda.registerRequestFilter]]
   * See [[CorsFilter]]
   */
  protected _requestFilters: RequestFilter<WebContext>[] = [];
  /**
   * CORS Filter registry
   *
   * Added via [[Webda.registerCORSRequestFilter]]
   * See [[CorsFilter]]
   */
  protected _requestCORSFilters: RequestFilter<WebContext>[] = [];
  /**
   * Worker output
   *
   * @see @webda/workout
   */
  private workerOutput: WorkerOutput;
  /**
   * Store the instance id
   */
  private instanceId: string;
  /**
   * Application registry
   */
  protected registry: Store<RegistryEntry>;
  /**
   * Manage encryption within the application
   */
  protected cryptoService: CryptoService;
  /**
   * Contains all operations defined by services
   */
  protected operations: { [key: string]: OperationDefinitionInfo } = {};
  /**
   * Cache for model to store resolution
   */
  private _modelStoresCache: Map<Constructor<CoreModel>, Store> = new Map<Constructor<CoreModel>, Store>();
  /**
   * Cache for model to store resolution
   */
  private _modelBinariesCache: Map<string, BinaryService> = new Map<string, BinaryService>();
  /**
   * Store the Core singleton
   *
   * The main storage is on the process itself
   * This second storage allow to identify dual import
   */
  private static singleton: Core;
  /**
   * True if the dual import warning has been sent
   */
  private _dualImportWarn: boolean = false;
  /**
   * Registered context providers
   */
  private _contextProviders: ContextProvider[] = [
    {
      getContext: (info: ContextProviderInfo) => {
        // If http is defined, return a WebContext
        if (info.http) {
          return new WebContext(this, info.http, info.stream);
        }
        return new OperationContext(this, info.stream);
      }
    }
  ];
  /**
   * System context
   */
  protected globalContext: GlobalContext;

  /**
   * @params {Object} config - The configuration Object, if undefined will load the configuration file
   */
  constructor(application?: Application) {
    /** @ignore */
    super();
    // Store WebdaCore in process to avoid conflict with import
    // @ts-ignore
    Core.singleton = process.webda = this;
    this.workerOutput = application.getWorkerOutput();
    this.logger = new Logger(this.workerOutput, "@webda/core/lib/core.js");
    this.application = application || new UnpackedApplication(".");
    this._initTime = new Date().getTime();
    // Schema validations
    this._ajv = new Ajv();
    addFormats(this._ajv);
    this._ajvSchemas = {};

    // Load the configuration and migrate
    this.configuration = this.application.getCurrentConfiguration();

    // Init default values for configuration
    this.configuration.parameters ??= {};
    this.configuration.parameters.apiUrl ??= "http://localhost:18080";
    this.configuration.parameters.defaultStore ??= "Registry";
    this.configuration.parameters.metrics ??= {};
    if (this.configuration.parameters.metrics) {
      this.configuration.parameters.metrics.labels ??= {};
      this.configuration.parameters.metrics.config ??= {};
      this.configuration.parameters.metrics.prefix ??= "";
    }
    this.configuration.services ??= {};
    // Add CSRF origins filtering
    if (this.configuration.parameters.csrfOrigins) {
      this.registerCORSFilter(new OriginFilter(this.configuration.parameters.csrfOrigins));
    }
    // Add CSRF website filtering
    if (this.configuration.parameters.website) {
      this.registerCORSFilter(new WebsiteOriginFilter(this.configuration.parameters.website));
    }

    this.setGlobalContext(new GlobalContext(this));
  }

  /**
   * Get the singleton of Webda Core
   * @returns
   */
  static get(): Core {
    // @ts-ignore
    let singleton: Core = process.webda;
    if (Core.singleton !== singleton && !singleton._dualImportWarn) {
      singleton._dualImportWarn = true;
      singleton.log("WARN", "Several import version of WebdaCore has been identified");
    }
    // Store WebdaCore in process to avoid conflict with import
    return singleton;
  }

  /**
   * Get the store assigned to this model
   * @param model
   * @returns
   */
  getModelStore<T extends CoreModel>(modelOrConstructor: Constructor<T> | T): Store<T> {
    const model = <Constructor<T>>(
      (modelOrConstructor instanceof CoreModel ? modelOrConstructor.__class : modelOrConstructor)
    );
    if (this._modelStoresCache.has(model)) {
      return <Store<T>>this._modelStoresCache.get(model);
    }
    const setCache = store => {
      this._modelStoresCache.set(model, store);
    };
    const stores = this.getStores();
    let actualScore: number;
    let actualStore: Store = this.getService(this.parameter("defaultStore") || "Registry");
    for (let store in stores) {
      let score = stores[store].handleModel(model);
      // As 0 mean exact match we stop there
      if (score === 0) {
        setCache(stores[store]);
        return <Store<T>>stores[store];
      } else if (score > 0 && (actualScore === undefined || actualScore > score)) {
        actualScore = score;
        actualStore = stores[store];
      }
    }
    setCache(actualStore);
    return <Store<T>>actualStore;
  }

  /**
   * Get the service that manage a model
   * @param modelOrConstructor
   * @param attribute
   * @returns
   */
  getBinaryStore<T extends CoreModel>(modelOrConstructor: Constructor<T> | T, attribute: string): BinaryService {
    const binaries: { [key: string]: BinaryService } = this.getServicesOfType(<any>BinaryService);
    const model = this.application.getModelName(modelOrConstructor);
    let actualScore: number = -1;
    let actualService: BinaryService;
    const setCache = store => {
      this._modelBinariesCache.set(model, store);
    };
    for (let binary in binaries) {
      let score = binaries[binary].handleBinary(model, attribute);
      // As 0 mean exact match we stop there
      if (score === 2) {
        setCache(binaries[binary]);
        return binaries[binary];
      } else if (score >= 0 && (actualService === undefined || actualScore > score)) {
        actualScore = score;
        actualService = binaries[binary];
      }
    }
    if (!actualService) {
      throw new Error("No binary store found for " + model + " " + attribute);
    }
    setCache(actualService);
    return actualService;
  }

  /**
   * Return Core instance id
   *
   * It is a random generated string
   */
  getInstanceId(): string {
    this.instanceId ??= this.getUuid();
    return this.instanceId;
  }

  /**
   * Get absolute url with subpath
   * @param subpath
   */
  getApiUrl(subpath: string = ""): string {
    if (subpath.length > 0 && !subpath.startsWith("/")) {
      subpath = "/" + subpath;
    }
    return this.configuration.parameters.apiUrl + subpath;
  }

  /**
   * Return application path with subpath
   *
   * Helper that redirect to this.application.getAppPath
   *
   * @param subpath
   * @returns
   */
  getAppPath(subpath: string = ""): string {
    return this.application.getAppPath(subpath);
  }

  /**
   * Retrieve all detected modules definition
   */
  getModules() {
    return this.application.getModules();
  }

  /**
   * Return application definition
   */
  getApplication() {
    return this.application;
  }

  /**
   * Get WorkerOutput
   */
  getWorkerOutput() {
    return this.workerOutput;
  }

  /**
   * Init one service
   * @param service
   */
  protected async initService(service: string) {
    try {
      this.log("TRACE", "Initializing service", service);
      this.services[service]._initTime = Date.now();
      await this.services[service].init();
    } catch (err) {
      this.services[service]._initException = err;
      this.failedServices[service] = { _initException: err };
      this.log("ERROR", "Init service " + service + " failed: " + err.message);
      this.log("TRACE", err.stack);
    }
  }

  /**
   * Get an object from the application based on its full uuid
   * @param fullUuid
   * @param partials
   */
  async getModelObject<T extends CoreModel = CoreModel>(fullUuid: string, partials?: any): Promise<T> {
    return CoreModel.fromFullUuid(fullUuid, this, partials);
  }

  /**
   * Init Webda
   *
   * It will resolve Services init method and autolink
   */
  async init() {
    if (this._init) {
      return this._init;
    }

    if (this.configuration.parameters.configurationService) {
      try {
        this.log("INFO", "Create and init ConfigurationService", this.configuration.parameters.configurationService);
        // Create the configuration service
        this.createService(this.configuration.services, this.configuration.parameters.configurationService);
        let cfg = await this.getService<ConfigurationService>(
          this.configuration.parameters.configurationService
        ).initConfiguration();
        if (cfg) {
          cfg.parameters ??= {};
          cfg.services ??= {};
          this.configuration.parameters = deepmerge(this.configuration.parameters, cfg.parameters);
          // Ensure beans are known too
          // @ts-ignore
          Object.keys(process.webdaBeans || {}).forEach(bean => {
            this.configuration.services[bean] ??= {
              type: `Beans/${bean}`
            };
          });
          // Merge services - for security reason we cannot add new services from configuration
          for (let i in this.configuration.services) {
            this.configuration.services[i] = {
              ...deepmerge(this.configuration.services[i], cfg.services[i] || {}),
              type: this.configuration.services[i].type
            };
          }
        }
        await this.getService<ConfigurationService>(this.configuration.parameters.configurationService).init();
      } catch (err) {
        this.log("ERROR", "Cannot use ConfigurationService", this.configuration.parameters.configurationService, err);
        this.services = {};
      }
    }

    // Init the other services
    this.initStatics();
    // Reset the model cache
    this._modelStoresCache.clear();
    this._modelBinariesCache.clear();

    this.log("TRACE", "Create Webda init promise");
    this._init = (async () => {
      await this.initService("Registry");
      await this.initService("CryptoService");

      // Init services
      let service;
      let inits = [];
      for (service in this.services) {
        if (
          this.services[service].init !== undefined &&
          !this.services[service]._createException &&
          !this.services[service]._initTime
        ) {
          inits.push(this.initService(service));
        }
      }
      await Promise.all(inits);
      await this.emitSync("Webda.Init.Services", this.services);
    })();
    return this._init;
  }

  /**
   * Pause for time ms
   *
   * @param time ms
   */
  static async sleep(time): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, time);
    });
  }

  /**
   * Check if an operation can be executed with the current context
   * Not checking the input use `checkOperation` instead to check everything
   * @param context
   * @param operationId
   * @throws OperationError if operation is unknown
   * @returns true if operation can be executed
   */
  checkOperationPermission(context: OperationContext, operationId: string): boolean {
    if (!this.operations[operationId]) {
      throw new OperationError(operationId, "Unknown");
    }
    if (this.operations[operationId].permission) {
      this.operations[operationId].permissionQuery ??= new WebdaQL.QueryValidator(
        this.operations[operationId].permission
      );
      return this.operations[operationId].permissionQuery.eval(context.getSession());
    }
    return true;
  }

  /**
   * Check if an operation can be executed with the current context
   * @param context
   * @param operationId
   */
  async checkOperation(context: OperationContext, operationId: string) {
    if (!this.checkOperationPermission(context, operationId)) {
      throw new OperationError(operationId, "PermissionDenied");
    }
    let input = await context.getInput();
    this.log(
      "TRACE",
      `Operation ${operationId} input is '${JSONUtils.safeStringify(input, undefined, 2)}' (schema: ${
        this.operations[operationId].input
      })`
    );
    try {
      if (
        this.operations[operationId].input &&
        (input === undefined || this.validateSchema(this.operations[operationId].input, input) !== true)
      ) {
        throw new OperationError(operationId, "InvalidInput");
      }
    } catch (err) {
      if (err.message === "validation failed") {
        throw new OperationError(operationId, "InvalidInput");
      }
      throw err;
    }
  }

  /**
   * Call an operation within the framework
   */
  async callOperation(context: OperationContext, operationId: string) {
    context.setExtension("operation", operationId);
    await this.checkOperation(context, operationId);
    return this.getService(this.operations[operationId].service)[this.operations[operationId].method](context);
  }

  /**
   * Get available operations
   * @returns
   */
  listOperations(): { [key: string]: Omit<OperationDefinition, "service" | "method"> } {
    const list = {};
    Object.keys(this.operations).forEach(o => {
      list[o] = {
        ...this.operations[o]
      };
      delete list[o].service;
      delete list[o].method;
    });
    return list;
  }

  /**
   * Register a new operation within the app
   * @param operationId
   * @param definition
   */
  registerOperation(operationId: string, definition: OperationDefinition) {
    if (operationId.match(/[^a-zA-Z0-9.]/)) {
      throw new Error("OperationId can only contain [a-zA-Z0-9.]");
    }
    this.operations[operationId] = { ...definition, id: operationId };
    ["input", "output"]
      .filter(key => this.operations[operationId][key])
      .forEach(key => {
        if (!this.getApplication().hasSchema(this.operations[operationId][key])) {
          delete this.operations[operationId][key];
        }
      });
  }

  /**
   * Register a request filtering
   *
   * Will apply to all requests regardless of the devMode
   * @param filter
   */
  registerRequestFilter(filter: RequestFilter<WebContext>) {
    this._requestFilters.push(filter);
  }

  /**
   * Register a CORS request filtering
   *
   * Does not apply in devMode
   * @param filter
   */
  registerCORSFilter(filter: RequestFilter<WebContext>) {
    this._requestCORSFilters.push(filter);
  }

  /**
   * Register a new context provider
   * @param provider
   */
  registerContextProvider(provider: ContextProvider) {
    this._contextProviders.unshift(provider);
  }

  /**
   * Validate the object with schema
   *
   * @param schema path to use
   * @param object to validate
   */
  validateSchema(
    webdaObject: CoreModel | string,
    object: any,
    ignoreRequired?: boolean
  ): NoSchemaResult | SchemaValidResult {
    let name = typeof webdaObject === "string" ? webdaObject : this.application.getModelFromInstance(webdaObject);
    let cacheName = name;
    if (name?.endsWith("?")) {
      name = name.substring(0, name.length - 1);
      ignoreRequired = true;
    }
    if (ignoreRequired) {
      cacheName += "_noRequired";
    }
    if (!this._ajvSchemas[cacheName]) {
      let schema = this.application.getSchema(name);
      if (!schema) {
        return null;
      }
      if (ignoreRequired) {
        schema = JSONUtils.duplicate(schema);
        schema.required = [];
      }
      this.log("TRACE", "Add schema for", name);
      this._ajv.addSchema(schema, cacheName);
      this._ajvSchemas[cacheName] = true;
    }
    if (this._ajv.validate(cacheName, object)) {
      return true;
    }
    throw new ValidationError(this._ajv.errors);
  }

  /**
   * Return webda current version
   *
   * @returns package version
   * @since 0.4.0
   */
  getVersion(): string {
    return this.getApplication().getWebdaVersion();
  }

  /**
   * To define the locales just add a locales: ['en-GB', 'fr-FR'] in your host global configuration
   *
   * @return The configured locales or "en-GB" if none are defined
   */
  getLocales(): string[] {
    if (!this.configuration || !this.configuration.parameters.locales) {
      return ["en-GB"];
    }
    return this.configuration.parameters.locales;
  }

  /**
   * Get a Logger for a class
   * @param clazz
   */
  getLogger(clazz: string | Service) {
    let className = clazz;
    if (typeof clazz !== "string") {
      let definitions = this.application.getModdas();
      for (let i in definitions) {
        if (definitions[i] === clazz.constructor) {
          className = i.replace(/\//g, ".");
          break;
        }
      }
    }
    return new Logger(this.workerOutput, <string>className);
  }

  /**
   * Add a route dynamicaly
   *
   * @param {String} url of the route can contains dynamic part like {uuid}
   * @param {Object} info the type of executor
   */
  addRoute(url: string, info: RouteInfo): void {
    this.router.addRoute(url, info);
  }

  /**
   * Remove a route dynamicly
   *
   * @param {String} url to remove
   */
  removeRoute(url: string): void {
    this.router.removeRoute(url);
  }

  /**
   * Return current Router object
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Check for a service name and return the wanted singleton or undefined if none found
   *
   * @param {String} name The service name to retrieve
   */
  getService<T extends Service>(name: string = ""): T {
    return <T>this.services[name];
  }

  /**
   * Return a map of defined services
   * @returns {{}}
   */
  getServices(): { [key: string]: Service } {
    return this.services;
  }

  /**
   * Return a map of services that extends type
   * @param type The type of implementation
   * @returns {{}}
   */
  getServicesOfType<T extends Service>(type: Constructor<T, [Core, string, any]> = undefined): { [key: string]: T } {
    let result = {};
    for (let i in this.services) {
      let service = this.services[i];
      if (!type || service instanceof type) {
        result[i] = service;
      }
    }
    return result;
  }

  public getConfiguration() {
    return this.configuration;
  }

  /**
   * Return a map of defined stores
   * @returns {{}}
   */
  getStores(): { [key: string]: Store } {
    return this.getServicesOfType(<any>Store);
  }

  /**
   * Return a map of defined models
   * @returns {{}}
   */
  getModels(): { [key: string]: CoreModelDefinition } {
    return <{ [key: string]: CoreModelDefinition }>(<unknown>this.application.getModels());
  }

  /**
   * Check for a model name and return the wanted class or throw exception if none found
   *
   * @param {String} name The model name to retrieve
   */
  getModel<T extends CoreModel = CoreModel>(name): CoreModelDefinition<T> {
    return this.application.getModel<T>(name);
  }

  /**
   * Add to context information and executor based on the http context
   */
  public updateContextWithRoute(ctx: WebContext): boolean {
    let http = ctx.getHttpContext();
    // Check mapping
    let route = this.router.getRouteFromUrl(ctx, http.getMethod(), http.getRelativeUri());
    if (route === undefined) {
      return false;
    }
    ctx.setRoute({ ...this.configuration, ...route });
    ctx.setExecutor(this.getService(route.executor));
    this.emit("Webda.UpdateContextRoute", {context: ctx});
    return true;
  }

  /**
   * Flush the headers to the response, no more header modification is possible after that
   *
   * This method should set the `context.setFlushedHeaders()` and use of `context.hasFlushedHeaders()`
   *
   * @abstract
   */
  public flushHeaders(_context: WebContext): void {
    // Should be overriden by implementation
  }

  /**
   * Flush the entire response to the client
   */
  public flush(_context: WebContext): void {
    // Should be overriden by implementation
  }

  /**
   * Return if Webda is in debug mode
   */
  public isDebug(): boolean {
    return false;
  }

  /**
   * Return the global parameters of a domain
   */
  public getGlobalParams(): any {
    return this.configuration.parameters || {};
  }

  /**
   * Get the system context
   * @returns
   */
  public getGlobalContext(): GlobalContext {
    return this.globalContext;
  }

  /**
   * Set the system context
   * @param context
   */
  public setGlobalContext(context: GlobalContext): void {
    this.globalContext = context;
    context.getSession().login("system", "system");
  }

  /**
   * Reinit one service
   * @param service
   */
  protected async reinitService(service: string): Promise<void> {
    try {
      this.log("TRACE", "Re-Initializing service", service);
      let serviceBean = this.services[service];
      await serviceBean.reinit(this.getServiceParams(serviceBean.getName()));
    } catch (err) {
      this.log("ERROR", "Re-Init service " + service + " failed", err);
      this.log("TRACE", err.stack);
    }
  }

  /**
   * Reinit all services with updated parameters
   * @param updates
   * @returns
   */
  public async reinit(updates: any): Promise<void> {
    let configuration = JSON.parse(JSON.stringify(this.configuration.services));
    for (let service in updates) {
      jsonpath.value(configuration, service, updates[service]);
    }
    if (JSON.stringify(Object.keys(configuration)) !== JSON.stringify(Object.keys(this.configuration.services))) {
      this.log("ERROR", "Configuration update cannot modify services");
      throw new WebdaError.CodeError(
        "REINIT_SERVICE_INJECTION",
        "Configuration is not designed to add dynamically services"
      );
    }
    this.configuration.services = configuration;
    let inits: Promise<void>[] = [];
    for (let service in this.services) {
      inits.push(this.reinitService(service));
    }
    await Promise.all(inits);
  }

  /**
   * Get a full resolved service parameter
   *
   * @param service
   * @param configuration
   * @returns
   */
  public getServiceParams(
    service: string,
    configuration: { parameters?: any; services: any } = { parameters: {}, services: {} }
  ): any {
    configuration.parameters ??= {};
    configuration.services ??= {};
    configuration.services[service] ??= {};
    const params: any = deepmerge(
      this.configuration.parameters || {},
      configuration.parameters || {},
      this.configuration.services[service] || {},
      configuration.services[service] || {}
    );
    delete params.require;
    return params;
  }

  protected createService(services: any, service: string) {
    let type = services[service]?.type;
    if (type === undefined) {
      type = service;
    }
    let serviceConstructor = undefined;
    try {
      serviceConstructor = this.application.getModda(type);
    } catch (ex) {
      this.log("ERROR", `Create service ${service}(${type}) failed ${ex.message}`);
      this.log("TRACE", ex.stack);
      return;
    }

    try {
      this.log("TRACE", "Constructing service", service);
      this.services[service] = new serviceConstructor(this, service, this.getServiceParams(service));
    } catch (err) {
      this.log("ERROR", "Cannot create service", service, err);
      // @ts-ignore
      this.failedServices[service] = { _createException: err };
    }
  }

  /**
   * @hidden
   *
   */
  protected createServices(excludes: string[] = []): void {
    const services = this.configuration.services;
    // @ts-ignore
    const beans: { [key: string]: Modda } = process.webdaBeans || {};
    this.log("DEBUG", "BEANS", beans);
    for (let i in beans) {
      let name = beans[i].name;
      if (!services[name]) {
        services[name] = {};
      }
      // Force type to Bean
      services[name].type = `Beans/${name}`;
      // Register the type
      this.application.addService(`Beans/${name}`, beans[i]);
    }

    // Construct services
    for (let service in services) {
      if (excludes.indexOf(service) >= 0) {
        continue;
      }
      this.createService(services, service);
    }

    // Call resolve on all services
    Object.keys(this.services)
      .filter(s => !excludes.includes(s))
      .forEach(s => {
        try {
          this.services[s].resolve();
        } catch (err) {
          this.log("ERROR", `Service(${s})`, err);
        }
      });
    this.emit("Webda.Create.Services", this.services);
  }

  /**
   * A registry is a predefined store
   * @returns
   */
  getRegistry(): Store<RegistryEntry> {
    return this.registry;
  }

  /**
   * Return the crypto service
   * @returns
   */
  getCrypto(): CryptoService {
    return this.cryptoService;
  }

  protected jsonFilter(key: string, value: any): any {
    if (key[0] === "_") return undefined;
    return value;
  }

  /**
   * Init services and Beans along with Routes
   */
  initStatics() {
    // Init the registry
    const autoRegistry = this.configuration.services["Registry"] === undefined;
    this.configuration.services["Registry"] ??= {
      type: "Webda/MemoryStore",
      persistence: {
        path: ".registry",
        key: process.env["WEBDA_MACHINE_ID"] || machineIdSync()
      }
    };
    this.createService(this.configuration.services, "Registry");
    this.registry = this.getService<Store<RegistryEntry>>("Registry").resolve();

    // Init the key service
    this.configuration.services["CryptoService"] ??= {
      type: "Webda/CryptoService",
      autoRotate: autoRegistry ? 30 : undefined,
      autoCreate: true
    };
    this.createService(this.configuration.services, "CryptoService");
    this.cryptoService = this.getService<CryptoService>("CryptoService").resolve();

    // Session Manager
    this.configuration.services["SessionManager"] ??= {
      type: "Webda/CookieSessionManager"
    };

    if (this.configuration.services !== undefined) {
      let excludes = ["Registry", "CryptoService"];
      if (this.configuration.parameters.configurationService) {
        excludes.push(this.configuration.parameters.configurationService);
      }
      // Do not recreate the configuration services
      this.createServices(excludes);
    }

    this.router.remapRoutes();

    this._initiated = true;
    this.emit("Webda.Init", this.configuration);
  }

  /**
   * Get a context based on the info
   * @param info
   * @returns
   */
  public async newContext<T extends OperationContext>(
    info: ContextProviderInfo,
    noInit: boolean = false
  ): Promise<OperationContext> {
    let context: OperationContext;
    this._contextProviders.find(provider => (context = provider.getContext(info)) !== undefined);
    if (!noInit) {
      await context.init();
    }
    await this.emitSync("Webda.NewContext", { context, info });
    return <T>context;
  }

  /**
   * Create a new context for a request
   *
   * @class Service
   * @param httpContext THe HTTP request context
   * @param stream - The request output stream if any
   * @return A new context object to pass along
   */
  public async newWebContext<T extends WebContext>(
    httpContext: HttpContext,
    stream: Writable = undefined,
    noInit: boolean = false
  ): Promise<T> {
    return <T>await this.newContext({ http: httpContext, stream: stream });
  }

  /**
   * Convert an object to JSON using the Webda json filter
   *
   * @class Service
   * @param {Object} object - The object to export
   * @return {String} The export of the strip object ( removed all attribute with _ )
   */
  public toPublicJSON(object): string {
    return JSON.stringify(object, this.jsonFilter);
  }

  /**
   * Return a UUID
   *
   * @param format to return different type of format
   * Plan to implement base64 and maybe base85
   */
  public getUuid(format: "ascii" | "base64" | "hex" | "binary" | "uuid" = "uuid"): string {
    if (format === "uuid") {
      return uuidv4().toString();
    }
    let buffer = Buffer.alloc(16);
    uuidv4(undefined, buffer);
    if (format === "base64") {
      // Remove useless = we won't transfer back to original value or could just add ==
      // https://datatracker.ietf.org/doc/html/rfc4648#page-7
      return buffer.toString(format).replace(/=/g, "").replace(/\//g, "_").replace(/\+/g, "-");
    }
    return buffer.toString(format);
  }

  /**
   * @override
   */
  public emit<K extends keyof E>(eventType: K | symbol | string, event?: E[K], ...data: any[]): boolean {
    return super.emit(<string>eventType, event, ...data);
  }

  /**
   * Emit the event with data and wait for Promise to finish if listener returned a Promise
   */
  public emitSync<K extends keyof E>(eventType: K | symbol, event?: E[K], ...data: any[]): Promise<any[]> {
    let result;
    let promises = [];
    let listeners = this.listeners(<string>eventType);
    for (let listener of listeners) {
      result = listener(event, ...data);
      if (result instanceof Promise) {
        promises.push(result);
      }
    }
    return Promise.all(promises);
  }

  /**
   * Type the listener part
   * @param event
   * @param listener
   * @param queue
   * @returns
   */
  on<Key extends keyof E>(event: Key | symbol, listener: (evt: E[Key]) => void): this {
    super.on(<string>event, listener);
    return this;
  }

  /**
   * Logs
   * @param level
   * @param args
   */
  public log(level: WorkerLogLevel, ...args): void {
    this.logger.log(level, ...args);
  }

  /**
   * Retrieve a global parameter
   */
  public parameter(name: string): any {
    return this.getGlobalParams()[name];
  }

  /**
   * Verify if a request can be done
   *
   * @param context Context of the request
   */
  protected async checkRequest(ctx: WebContext): Promise<boolean> {
    // Do not need to filter on OPTIONS as CORS is for that
    if (ctx.getHttpContext().getMethod() === "OPTIONS" || this._requestFilters.length === 0) {
      return true;
    }
    return (await Promise.all(this._requestFilters.map(filter => filter.checkRequest(ctx, "AUTH")))).some(v => v);
  }

  /**
   * Verify if an origin is allowed to do request on the API
   *
   * @param context Context of the request
   */
  protected async checkCORSRequest(ctx: WebContext): Promise<boolean> {
    return (await Promise.all(this._requestCORSFilters.map(filter => filter.checkRequest(ctx, "CORS")))).some(v => v);
  }

  /**
   * Export OpenAPI
   * @param skipHidden
   * @returns
   */
  exportOpenAPI(skipHidden: boolean = true): OpenAPIV3.Document {
    let packageInfo = this.application.getPackageDescription();
    let contact: OpenAPIV3.ContactObject;
    if (typeof packageInfo.author === "string") {
      contact = {
        name: packageInfo.author
      };
    } else if (packageInfo.author) {
      contact = packageInfo.author;
    }
    let license: OpenAPIV3.LicenseObject;
    if (typeof packageInfo.license === "string") {
      license = {
        name: packageInfo.license
      };
    } else if (packageInfo.license) {
      license = packageInfo.license;
    }
    let openapi: OpenAPIV3.Document = deepmerge(
      {
        openapi: "3.0.3",
        info: {
          description: packageInfo.description,
          version: packageInfo.version || "0.0.0",
          title: packageInfo.title || "Webda-based application",
          termsOfService: packageInfo.termsOfService,
          contact,
          license
        },
        components: {
          schemas: {
            Object: {
              type: "object"
            }
          }
        },
        paths: {},
        tags: []
      },
      this.application.getConfiguration().openapi || {}
    );
    let models = this.application.getModels();
    for (let i in models) {
      let model = models[i];
      let desc: JSONSchema7 = {
        type: "object"
      };
      let modelName = model.name || i.split("/").pop();
      let schema = this.application.getSchema(i);
      if (schema) {
        for (let j in schema.definitions) {
          // @ts-ignore
          openapi.components.schemas[j] ??= schema.definitions[j];
        }
        delete schema.definitions;
        desc = schema;
      }
      // Remove empty required as openapi does not like that
      // Our compiler is not generating this anymore but it is additional protection
      /* c8 ignore next 3 */
      if (desc.required && desc.required.length === 0) {
        delete desc.required;
      }
      // Remove $schema
      delete desc.$schema;
      // Rename all #/definitions/ by #/components/schemas/
      openapi.components.schemas[modelName] = JSON.parse(
        JSON.stringify(desc).replace(/#\/definitions\//g, "#/components/schemas/")
      );
    }
    this.router.completeOpenAPI(openapi, skipHidden);
    openapi.tags.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    let paths = {};
    Object.keys(openapi.paths)
      .sort()
      .forEach(i => (paths[i] = openapi.paths[i]));
    openapi.paths = paths;

    return openapi;
  }

  /**
   * Get a metric object
   *
   * Use the Service.getMetric method if possible
   *
   * This is map from prometheus 3 types of metrics
   * Our hope is that we can adapt them to export to other
   * metrics system if needed
   *
   * @param type
   * @param configuration
   * @returns
   */
  getMetric<T = Gauge | Counter | Histogram>(
    type: Constructor<T, [MetricConfiguration<T>]>,
    configuration: MetricConfiguration<T>
  ): T {
    const metrics = this.getGlobalParams().metrics;
    if (metrics === false) {
      // Return a mock
      return <T>{
        inc: () => {},
        reset: () => {},
        labels: () => undefined,
        remove: () => {},
        observe: () => {},
        startTimer: () => {
          return () => 0;
        },
        zero: () => {},
        dec: () => {},
        setToCurrentTime: () => {},
        set: () => {}
      };
    }
    const name = `${metrics.prefix}webda_${configuration.name}`;
    const labelNames = [...(configuration.labelNames || []), ...Object.keys(metrics.labels)];
    // Will probably need to override with a staticLabels property
    return (
      <T>register.getSingleMetric(name) ||
      new type({
        ...configuration,
        ...metrics.config[configuration.name],
        name,
        labelNames
      })
    );
  }
}

/**
 * Generic type for metric
 */
export type MetricConfiguration<T = Counter | Gauge | Histogram, K extends string = string> = T extends Counter
  ? CounterConfiguration<K>
  : T extends Gauge
  ? GaugeConfiguration<K>
  : HistogramConfiguration<K>;

/**
 * Export a Registry type alias
 */
export type Registry<T extends CoreModel = RegistryEntry> = Store<T>;

export { Counter, Gauge, Histogram };
