import * as Ajv from "ajv";
import * as deepmerge from "deepmerge";
import * as events from "events";
import * as fs from "fs";
import { JSONSchema6 } from "json-schema";
import * as jsonpath from "jsonpath";
import { OpenAPIV3 } from "openapi-types";
import * as vm from "vm";
import { Application } from "./application";
import { Context, HttpContext, Logger, Service, Store } from "./index";
import { CoreModel, CoreModelDefinition } from "./models/coremodel";
import { RouteInfo, Router } from "./router";
import { WorkerOutput, WorkerLogLevel } from "@webda/workout";

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
 * Define a reusable service
 *
 * A Modda is a class that can be reused
 * For example:
 *  - MongoDB Store implementation
 *  - SQS Service implementation
 *  - etc
 */
export interface ModdaDefinition {
  uuid: string;
  /**
   * Label of the service
   */
  label: string;
  /**
   * Description of your service
   */
  description: string;
  /**
   * Documentation page must be available online
   */
  documentation?: string;
  /**
   * Type of services
   */
  category?: "services" | "models" | "deployers";
  /**
   * URL of the logo to display
   */
  logo: string;
  /**
   * Schema of the configuration
   * 
   * If defined as string we will try to extract it with typescript-json-schema
   */
  configuration: {
    schema?: JSONSchema6 | string;
    widget? : any;
  }
}

/**
 * A Webda module is a NPM package
 *
 * It contains one or more Modda to provide features
 */
export interface Module {
  services?: { [key: string]: string };
  models?: { [key: string]: string };
  deployers?: { [key: string]: string };
}

/**
 * Cached module is all modules discover plus local package including the sources list
 */
export interface CachedModule extends Module {
  sources?: string[];
}

/**
 * Configuration from Webda 1.0 > version > 0.5
 */
export interface ConfigurationV1 {
  version: number;
  cachedModules?: CachedModule;
  models?: any;
  services?: any;
  [key: string]: any;
}

/**
 * Configuration from Webda version >= 1.0
 */
export interface Configuration {
  version: number;
  cachedModules?: CachedModule;
  module: Module;
  services?: any;
  parameters?: {
    cookie?: {
      sameSite: "None" | "Strict" | "Lax";
      domain: string;
      maxAge: number;
      path: string;
    };
    [key: string]: any;
  };
  openapi?: any;
}

/**
 * RequestFilter allow a service which implement it to control incoming request
 *
 * If one of the filter replies with "true" then the request will go through
 */
export interface RequestFilter<T extends Context> {
  checkRequest(context: T): Promise<boolean>;
}

/**
 *
 * @category CoreFeatures
 */
export class OriginFilter implements RequestFilter<Context> {
  origins: string[];
  constructor(origins: string[]) {
    this.origins = origins;
  }
  async checkRequest(context: Context): Promise<boolean> {
    let httpContext = context.getHttpContext();
    for (let i in this.origins) {
      let origin = this.origins[i];
      if (!origin.endsWith("$")) {
        origin += "$";
      }
      if (!origin.startsWith("^")) {
        origin = "^" + origin;
      }
      let regexp = new RegExp(origin);
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

let beans = {};

export function Model(constructor: Function) {}

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
  openapi: any = {}
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

/**
 * This is the main class of the framework, it handles the routing, the services initialization and resolution
 *
 * @class Core
 * @category CoreFeatures
 */
export class Core extends events.EventEmitter {
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
    this._ajv = Ajv();
    this._ajvSchemas = {};

    // Load the configuration and migrate
    this.configuration = this.application.getCurrentConfiguration();
    // Set the global context
    Context.setGlobalContext(<Context>new (this.getModel(this.parameter("contextModel") || "WebdaCore/Context"))(this));
    // Init default values for configuration
    this.configuration.parameters = this.configuration.parameters || {};
    this.configuration.services = this.configuration.services || {};
    this.configuration.module = this.configuration.module || {};
    // Add CSRF origins filtering
    if (this.configuration.parameters.csrfOrigins) {
      this.registerRequestFilter(new OriginFilter(this.configuration.parameters.csrfOrigins));
    }
    // Add CSRF website filtering
    if (this.configuration.parameters.website) {
      this.registerRequestFilter(new WebsiteOriginFilter(this.configuration.parameters.website));
    }

    this.initStatics();
  }

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
          beans[i].routes[j].forEach(r => (r.resolved = false));
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
   * Retrieve all deployers
   */
  getDeployers() {
    return this.application.getDeployers();
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
   * Init Webda
   *
   * It will resolve Services init method and autolink
   */
  async init() {
    if (this._init) {
      return this._init;
    }
    this.reinitResolvedRoutes();
    this.log("TRACE", "Create Webda init promise");
    this._init = new Promise(async resolve => {
      // Init services
      let service;
      for (service in this.services) {
        if (this.services[service].init !== undefined && !this.services[service]._createException) {
          try {
            // TODO Define parralel initialization
            this.log("TRACE", "Initializing service", service);
            this.initBeanRoutes(this.services[service]);
            await this.services[service].init();
          } catch (err) {
            this.services[service]._initException = err;
            this.failedServices[service] = { _initException: err };
            this.log("ERROR", "Init service " + service + " failed: " + err.message);
            this.log("TRACE", err.stack);
          }
        }
      }
      this.emit("Webda.Init.Services", this.services);
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
  sandbox(executor, code) {
    var sandbox: vm.Context = {
      // Should be custom console
      console: console,
      webda: executor._webda,
      executor: executor,
      module: {},
      require: function (mod) {
        // We need to add more control here
        if (mod === "net") {
          throw Error("not allowed");
        }
        // if the module is okay to load, load it:
        return require.apply(this, arguments);
      }
    };
    vm.runInNewContext(code, sandbox);
    return sandbox.module.exports(executor);
  }

  /**
   * Validate the object with schema
   *
   * @param object to validate
   * @param schema path to use
   */
  validate(object, schema) {
    if (!this._ajvSchemas[schema]) {
      this._ajv.addSchema(require(schema), schema);
      this._ajvSchemas[schema] = true;
    }
    return this._ajv.validate(schema, object);
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
          className = i.replace(/\//g, ".") + ".";
          break;
        }
      }
      className += clazz.getName();
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
    if (this.services !== undefined) {
      return <T>this.services[name];
    }
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
   * Register model
   */
  registerModel(name: string, clazz) {
    this.application.addModel(name, clazz);
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

    var executor = this.getService(route.executor);
    if (executor === undefined) {
      return false;
    }
    ctx.setRoute({...this.configuration, ...route});
    ctx.setExecutor(executor);
    return true;
  }

  /**
   * Flush the headers to the response, no more header modification is possible after that
   * @abstract
   */
  public flushHeaders(context: Context): void {}

  /**
   * Flush the entire response to the client
   */
  public flush(context: Context): void {}

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

  public async reinit(updates: any): Promise<void> {
    let configuration = JSON.parse(JSON.stringify(this.configuration.services));
    for (let service in updates) {
      jsonpath.value(configuration, service, updates[service]);
    }
    if (JSON.stringify(Object.keys(configuration)) !== JSON.stringify(Object.keys(this.configuration.services))) {
      this.log("ERROR", "Configuration update cannot modify services");
      return this._initPromise;
    }
    this.configuration.services = configuration;
    for (let service in this.services) {
      try {
        // TODO Define parralel initialization
        this.log("TRACE", "Re-Initializing service", service);
        let serviceBean = this.services[service];
        await serviceBean.reinit(this.getServiceParams(serviceBean._name));
      } catch (err) {
        this.log("ERROR", "Re-Init service " + service + " failed", err);
        this.log("TRACE", err.stack);
      }
    }
  }

  protected getServiceParams(service: string): any {
    var params = {...this.configuration.parameters, ...this.configuration.services[service]};
    delete params.require;
    return params;
  }
  /**
   * @hidden
   *
   */
  protected createServices(excludes: string[] = []): void {
    var services = this.configuration.services;
    if (this.services === undefined) {
      this.services = {};
    }
    if (services === undefined) {
      services = {};
    }

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

    let service;
    // Construct services
    for (service in services) {
      if (excludes.indexOf(service.toLowerCase()) >= 0) {
        continue;
      }
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
        continue;
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
    // TODO Leverage decorators instead of setter name
    for (let service in this.services) {
      this.log("TRACE", "Auto-connect", service);
      let serviceBean = this.services[service];
      serviceBean.resolve();
      let setters = this._getSetters(serviceBean);
      setters.forEach(setter => {
        let targetService = this.services[setter.substr(3).toLowerCase()];
        if (targetService) {
          this.log("TRACE", "Auto-connecting", serviceBean._name, targetService._name);
          serviceBean[setter](targetService);
        }
      });
    }
  }

  protected jsonFilter(key: string, value: any): any {
    if (key[0] === "_") return undefined;
    return value;
  }

  protected initStatics() {
    if (this.configuration.services !== undefined) {
      this.createServices();
    }

    this.router.remapRoutes();

    this._initiated = true;
    this.emit("Webda.Init", this.configuration);
  }

  /**
   * Init Routes declare by @Route annotation
   */
  initBeanRoutes(serviceBean: Service) {
    let service = serviceBean._name.toLowerCase();
    if (beans[service] !== undefined && beans[service].routes) {
      for (let j in beans[service].routes) {
        this.log("TRACE", "Adding route", j, "for bean", service);
        beans[service].routes[j].forEach(route => {
          if (route.resolved) {
            return;
          }
          this.addRoute(j, {
            methods: route.methods, // HTTP methods
            _method: this.services[service][route.executor], // Link to service method
            allowPath: route.allowPath || false, // Allow / in parser
            openapi: route.openapi,
            executor: beans[service].constructor.name // Name of the service
          });
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
      new (this.getModel(this.parameter("contextModel") || "WebdaCore/Context"))(this, httpContext, stream)
    );
    if (!noInit) {
      await res.init();
    }
    this.emit("Webda.NewContext", res);
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
   * Emit the event with data and wait for Promise to finish if listener returned a Promise
   */
  public emitSync(event, ...data): Promise<any[]> {
    var result;
    var promises = [];
    var listeners = this.listeners(event);
    for (var i in listeners) {
      result = listeners[i](...data);
      if (result instanceof Promise) {
        promises.push(result);
      }
    }
    return Promise.all(promises);
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
    for (let i in this._requestFilters) {
      if (await this._requestFilters[i].checkRequest(ctx)) {
        return true;
      }
    }
    return false;
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
      let desc = {
        type: "object"
      };
      if (model instanceof Context) {
        continue;
      }
      let modelDescription = this.getModel(i);
      // Only export CoreModel info
      if (!(modelDescription.prototype instanceof CoreModel)) {
        continue;
      }
      let schema = new modelDescription()._getSchema();
      if (schema) {
        schema = JSON.parse(fs.readFileSync(schema).toString());
        for (let j in schema.definitions) {
          openapi.definitions[j] = schema.definitions[j];
        }
        delete schema.definitions;
        desc = schema;
      }
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
