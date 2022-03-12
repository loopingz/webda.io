import Ajv from "ajv";
import * as deepmerge from "deepmerge";
import * as events from "events";
import { JSONSchema6 } from "json-schema";
import * as jsonpath from "jsonpath";
import { OpenAPIV3 } from "openapi-types";
import * as vm from "vm";
import { Application, Configuration } from "./application";
import { ConfigurationService, Context, HttpContext, Logger, Service, Store } from "./index";
import { CoreModel, CoreModelDefinition } from "./models/coremodel";
import { OpenAPIWebdaDefinition, RouteInfo, Router } from "./router";
import { WorkerOutput, WorkerLogLevel } from "@webda/workout";
import { AbstractDeployer } from "./utils/abstractdeployer";
import { v4 as uuidv4 } from "uuid";

/**
 * Error with a code
 */
export class WebdaError extends Error {
  code: string;

  /**
   *
   * @param code
   * @param message
   */
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }

  /**
   * Return error code
   */
  getCode() {
    return this.code;
  }
}

/**
 * Ensure all events store the context in the same place
 */
export interface EventWithContext {
  context: Context;
}

/**
 * RequestFilter allow a service which implement it to control incoming request
 *
 * If one of the filter replies with "true" then the request will go through
 */
export interface RequestFilter<T extends Context = Context> {
  /**
   * Return true if the request should be allowed
   *
   * @param context to check for
   */
  checkRequest(context: T): Promise<boolean>;
}

/**
 * Filter request based on their origin
 *
 * @category CoreFeatures
 */
export class OriginFilter implements RequestFilter<Context> {
  regexs: RegExp[];
  constructor(origins: string[]) {
    this.regexs = origins.map(origin => {
      if (!origin.endsWith("$")) {
        origin += "$";
      }
      if (!origin.startsWith("^")) {
        origin = "^" + origin;
      }
      return new RegExp(origin);
    });
  }
  /**
   *
   * @param context
   * @returns
   */
  async checkRequest(context: Context): Promise<boolean> {
    let httpContext = context.getHttpContext();
    for (let regexp of this.regexs) {
      if (httpContext.origin.match(regexp)) {
        return true;
      }
      if (httpContext.root.match(regexp)) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Authorize requests based on the website
 */
export class WebsiteOriginFilter implements RequestFilter<Context> {
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
  async checkRequest(context: Context): Promise<boolean> {
    let httpContext = context.getHttpContext();
    if (
      this.websites.indexOf(httpContext.root) >= 0 ||
      this.websites.indexOf(httpContext.origin) >= 0 ||
      this.websites.indexOf("*") >= 0
    ) {
      return true;
    }
    return false;
  }
}

const beans = {};

// @Bean to declare as a Singleton service
export function Bean(constructor: Function) {
  let name = constructor.name.toLowerCase();
  beans[name] = beans[name] || { constructor };
  beans[name] = { ...beans[name], bean: true };
}

// @Route to declare route on Bean
export function Route(
  route: string,
  methods: string | string[] = ["GET"],
  allowPath: boolean = false,
  openapi: OpenAPIWebdaDefinition = {}
) {
  return function (target: any, executor: string, descriptor: PropertyDescriptor) {
    let targetName = target.constructor.name.toLowerCase();
    beans[targetName] = beans[targetName] || {
      constructor: target.constructor
    };
    beans[targetName].routes = beans[targetName].routes || {};
    beans[targetName].routes[route] = beans[targetName].routes[route] || [];
    beans[targetName].routes[route].push({
      methods: Array.isArray(methods) ? methods : [methods],
      executor,
      allowPath,
      openapi
    });
  };
}

export type CoreEvents = {
  /**
   * Emitted when new result is sent
   */
  "Webda.Result": EventWithContext;
  /**
   * Emitted when new request comes in
   */
  "Webda.Request": EventWithContext;
  /**
   * Emitted when a request does not match any route
   */
  "Webda.404": EventWithContext;
  "Webda.Init.Services": { [key: string]: Service };
  "Webda.Create.Services": { [key: string]: Service };
  "Webda.Init": Configuration;
  "Webda.NewContext": Context;
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
  protected application: Application;
  protected router: Router = new Router(this);
  protected _initiated: boolean = false;
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
  protected _ajv: any;
  /**
   * JSON Schema registry
   */
  protected _ajvSchemas: any;
  /**
   * Current executor
   */
  protected _currentExecutor: any;

  protected _configFile: string;
  protected _initPromise: Promise<void>;
  protected _initTime: number;
  /**
   * Console logger
   * @hidden
   */
  protected logger: Logger;
  /**
   * CORS Filter registry
   *
   * Added via [[Webda.registerRequestFilter]]
   * See [[CorsFilter]]
   */
  protected _requestFilters: RequestFilter<Context>[] = [];
  private workerOutput: WorkerOutput;
  /**
   * Store the instance id
   */
  private instanceId: string;

  /**
   * @params {Object} config - The configuration Object, if undefined will load the configuration file
   */
  constructor(application: Application) {
    /** @ignore */
    super();
    this.workerOutput = application.getWorkerOutput();
    this.logger = new Logger(this.workerOutput, "@webda/core/lib/core.js");
    this.application = application;
    this._initTime = new Date().getTime();
    // Schema validations
    this._ajv = new Ajv();
    this._ajvSchemas = {};

    // Load the configuration and migrate
    this.configuration = this.application.getCurrentConfiguration();
    // Set the global context
    Context.setGlobalContext(<Context>new (this.getModel(this.parameter("contextModel") || "Webda/Context"))(this));
    // Init default values for configuration
    this.configuration.parameters ??= {};
    this.configuration.parameters.apiUrl ??= "http://localhost:18080";
    this.configuration.services ??= {};
    this.configuration.module ??= {};
    // Add CSRF origins filtering
    if (this.configuration.parameters.csrfOrigins) {
      this.registerRequestFilter(new OriginFilter(this.configuration.parameters.csrfOrigins));
    }
    // Add CSRF website filtering
    if (this.configuration.parameters.website) {
      this.registerRequestFilter(new WebsiteOriginFilter(this.configuration.parameters.website));
    }
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
   * Reinit the @Route
   */
  reinitResolvedRoutes() {
    for (let i in beans) {
      if (beans[i].routes) {
        for (let j in beans[i].routes) {
          beans[i].routes[j].forEach(r => {
            r.resolved = false;
            this.router.removeRoute(j, r.info);
          });
        }
      }
    }
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
      // TODO Define parralel initialization
      this.log("TRACE", "Initializing service", service);
      this.initBeanRoutes(this.services[service]);
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
        if (cfg.webda) {
          cfg.webda.parameters ??= {};
          cfg.webda.services ??= {};
          this.configuration.parameters = { ...this.configuration.parameters, ...cfg.webda.parameters };
          for (let i in this.configuration.services) {
            this.configuration.services[i] = {
              ...deepmerge.all([this.configuration.services[i], cfg.webda.services[i] || {}]),
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
    this.initStatics();
    this.reinitResolvedRoutes();
    this.log("TRACE", "Create Webda init promise");
    this._init = new Promise(async resolve => {
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
      resolve();
    });
    return this._init;
  }

  registerRequestFilter(filter: RequestFilter<Context>) {
    this._requestFilters.push(filter);
  }

  /**
   *
   * @param {Object} executor The executor to expose as executor
   * @param {String} code to execute
   */
  sandbox(code, context?: vm.Context) {
    context ??= {
      require: () => {
        throw Error("not allowed");
      }
    };
    context.module = {
      exports: {}
    };
    vm.runInNewContext(code, context);
    return context.module.exports();
  }

  /**
   * Validate the object with schema
   *
   * @param schema path to use
   * @param object to validate
   */
  validateSchema(webdaObject: CoreModel, object: any) {
    let name = this.application.getFullNameFromPrototype(Object.getPrototypeOf(webdaObject));
    if (!this._ajvSchemas[name]) {
      let schema = this.application.getSchema(name);
      if (!schema) {
        return true;
      }
      this.log("TRACE", "Add schema for", name);
      this._ajv.addSchema(schema, name);
      this._ajvSchemas[name] = true;
    }
    return this._ajv.validate(name, object);
  }

  /**
   * Get last errors from AJV schema validator ( called through validate method )
   */
  validationLastErrors() {
    return this._ajv.errors;
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
      let definitions = this.application.getServices();
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
    name = name.toLowerCase();
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
  getServicesImplementations(type = undefined): { [key: string]: Service } {
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
  getStores(): { [key: string]: Service } {
    return this.getServicesImplementations(Store);
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
  getModel(name): any {
    return this.application.getModel(name);
  }

  /**
   * This should return a "turning" secret with cache and a service to modify it every x mins
   * WARNING The security is lower without this "turning" secret, you can still set the global.secret parameter
   *
   * Dont rely on this method, it will probably disapear to avoid secret leak
   *
   * @deprecated
   * @returns {String} Current secret
   */
  public getSecret(): string {
    // For now a static config file but should have a rolling service secret
    return this.configuration.parameters.sessionSecret;
  }

  /**
   * Return a salt to use when doing digest
   *
   * @returns {String} Current salt
   */
  public getSalt(): string {
    // For now a static config file but should have a rolling service secret
    return this.configuration.parameters.salt;
  }

  /**
   * Add to context information and executor based on the http context
   */
  public updateContextWithRoute(ctx: Context): boolean {
    let http = ctx.getHttpContext();
    // Check mapping
    var route = this.router.getRouteFromUrl(ctx, http.getMethod(), http.getRelativeUri());
    if (route === undefined) {
      return false;
    }
    ctx.setRoute({ ...this.configuration, ...route });
    ctx.setExecutor(this.getService(route.executor));
    return true;
  }

  /**
   * Flush the headers to the response, no more header modification is possible after that
   *
   * This method should set the `context.setFlushedHeaders()` and use of `context.hasFlushedHeaders()`
   *
   * @abstract
   */
  public flushHeaders(context: Context): void {
    // Should be overriden by implementation
  }

  /**
   * Flush the entire response to the client
   */
  public flush(context: Context): void {
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
      throw new WebdaError("REINIT_SERVICE_INJECTION", "Configuration is not designed to add dynamically services");
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
    const params: any = deepmerge.all([
      this.configuration.parameters || {},
      configuration.parameters || {},
      this.configuration.services[service] || {},
      configuration.services[service] || {}
    ]);
    delete params.require;
    return params;
  }

  protected createService(services: any, service: string) {
    var type = services[service].type;
    if (type === undefined) {
      type = service;
    }
    var serviceConstructor = undefined;
    try {
      serviceConstructor = this.application.getService(type);
    } catch (ex) {
      this.log("ERROR", `Create service ${service}(${type}) failed ${ex.message}`);
      this.log("TRACE", ex.stack);
      return;
    }

    try {
      this.log("TRACE", "Constructing service", service);
      this.services[service.toLowerCase()] = new serviceConstructor(this, service, this.getServiceParams(service));
    } catch (err) {
      this.log("ERROR", "Cannot create service", service, err);
      // @ts-ignore
      this.failedServices[service.toLowerCase()] = { _createException: err };
    }
  }

  /**
   * @hidden
   *
   */
  protected createServices(excludes: string[] = []): void {
    const services = this.configuration.services;
    this.log("DEBUG", beans);
    for (let i in beans) {
      if (!beans[i].bean) {
        this.log("DEBUG", "Implicit @Bean due to a @Route", beans[i].constructor.name);
      }
      let name = beans[i].constructor.name;
      if (!services[name]) {
        services[name] = {};
      }
      // Force type to Bean
      services[name].type = `Beans/${name}`;
      // Register the type
      this.application.addService(`Beans/${name}`, beans[i].constructor);
    }

    // Construct services
    for (let service in services) {
      if (excludes.indexOf(service.toLowerCase()) >= 0) {
        continue;
      }
      this.createService(services, service);
    }

    this.autoConnectServices();
    this.emit("Webda.Create.Services", this.services);
  }

  /**
   * Return all methods that are setters (startsWith("set"))
   * @param obj service get setter from
   */
  protected _getSetters(obj): any[] {
    let methods = [];
    while ((obj = Reflect.getPrototypeOf(obj))) {
      let keys = Reflect.ownKeys(obj).filter(k => k.toString().startsWith("set"));
      keys.forEach(k => methods.push(k));
    }
    return methods;
  }

  /**
   * Auto connect services with setters
   */
  protected autoConnectServices(): void {
    for (let service in this.services) {
      this.log("TRACE", "Auto-connect", service, Object.keys(this.configuration.services));
      try {
        let serviceBean = this.services[service];
        serviceBean.resolve();
        let setters = this._getSetters(serviceBean);
        setters.forEach(setter => {
          let targetService = this.services[setter.substr(3).toLowerCase()];
          if (targetService) {
            this.log("TRACE", "Auto-connecting", serviceBean.getName(), targetService.getName());
            serviceBean[setter](targetService);
          }
        });
      } catch (err) {
        this.log("ERROR", err);
      }
    }
  }

  protected jsonFilter(key: string, value: any): any {
    if (key[0] === "_") return undefined;
    return value;
  }

  /**
   * Init services and Beans along with Routes
   */
  initStatics() {
    if (this.configuration.services !== undefined) {
      this.createServices(Object.keys(this.services));
    }

    this.router.remapRoutes();

    this._initiated = true;
    this.emit("Webda.Init", this.configuration);
  }

  /**
   * Init Routes declare by @Route annotation
   */
  initBeanRoutes(serviceBean: Service) {
    let service = serviceBean.getName().toLowerCase();
    if (beans[service] !== undefined && beans[service].routes) {
      for (let j in beans[service].routes) {
        this.log("TRACE", "Adding route", j, "for bean", service);
        beans[service].routes[j].forEach(route => {
          if (route.resolved) {
            return;
          }
          route.info = {
            methods: route.methods, // HTTP methods
            _method: this.services[service][route.executor], // Link to service method
            allowPath: route.allowPath || false, // Allow / in parser
            openapi: route.openapi,
            executor: beans[service].constructor.name // Name of the service
          };
          this.addRoute(j, route.info);
          route.resolved = true;
        });
      }
    }
  }

  /**
   * Create a new context for a request
   *
   * @class Service
   * @param httpContext THe HTTP request context
   * @param stream - The request output stream if any
   * @return A new context object to pass along
   */
  public async newContext<T extends Context>(
    httpContext: HttpContext,
    stream = undefined,
    noInit: boolean = false
  ): Promise<T> {
    let res: Context = <Context>(
      new (this.getModel(this.parameter("contextModel") || "Webda/Context"))(this, httpContext, stream)
    );
    if (!noInit) {
      await res.init();
    }
    await this.emitSync("Webda.NewContext", res);
    return <T>res;
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
  public getUuid(format: "hex" = "hex"): string {
    return uuidv4().toString();
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
    var result;
    var promises = [];
    var listeners = this.listeners(<string>eventType);
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
  on<Key extends keyof E>(event: Key | symbol | string, listener: (evt: E[Key]) => void): this {
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
   * Verify if an origin is allowed to do request on the API
   *
   * @param context Context of the request
   */
  protected async checkRequest(ctx: Context): Promise<boolean> {
    return (await Promise.all(this._requestFilters.map(filter => filter.checkRequest(ctx)))).reduce(
      (prev, cur) => prev || cur
    );
  }

  exportOpenAPI(skipHidden: boolean = true): OpenAPIV3.Document {
    let packageInfo = this.application.getPackageDescription();
    let contact = packageInfo.author;
    if (typeof packageInfo.author === "string") {
      contact = {
        name: packageInfo.author
      };
    }
    let license = packageInfo.license;
    if (typeof packageInfo.license === "string") {
      license = {
        name: packageInfo.license
      };
    }
    let openapi = deepmerge(
      {
        openapi: "3.0",
        info: {
          description: packageInfo.description,
          version: packageInfo.version || "0.0.0",
          title: packageInfo.title || "Webda-based application",
          termsOfService: packageInfo.termsOfService,
          contact,
          license
        },
        schemes: ["https"],
        basePath: "/",
        definitions: {
          Object: {
            type: "object"
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
      let desc: JSONSchema6 = {
        type: "object"
      };
      let modelDescription = this.getModel(i);
      // Only export CoreModel info
      if (!this.application.extends(modelDescription, CoreModel)) {
        continue;
      }
      let schema = this.application.getSchema(i);
      if (schema) {
        for (let j in schema.definitions) {
          openapi.definitions[j] ??= schema.definitions[j];
        }
        delete schema.definitions;
        desc = schema;
      }
      // @ts-ignore
      openapi.definitions[model.name.split("/").pop()] = desc;
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
}
