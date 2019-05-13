import * as uriTemplates from "uri-templates";
import * as fs from "fs";
import * as vm from "vm";
import * as Ajv from "ajv";
import * as path from "path";
import * as events from "events";
import {
  Store,
  Service,
  Executor,
  MemoryStore,
  FileStore,
  Authentication,
  CoreModel,
  Ident,
  User,
  DebugMailer,
  Mailer,
  MemoryQueue,
  EventService,
  ResourceService,
  FileBinary,
  Logger,
  ConsoleLogger,
  MemoryLogger,
  ConfigurationService,
  Context,
  SecureCookie,
  SessionCookie,
  HttpContext
} from "./index";
import { CoreModelDefinition } from "./models/coremodel";
import * as jsonpath from "jsonpath";
/**
 * @hidden
 */
const _extend = require("util")._extend;

interface Configuration {
  [key: string]: any;
}

export interface CorsFilter {
  checkCSRF(context: Context): Promise<boolean>;
}
/**
 * This is the main class of the framework, it handles the routing, the services initialization and resolution
 *
 * @class Webda
 */
class Webda extends events.EventEmitter {
  /**
   * Webda Services
   * @hidden
   */
  public _services: Map<string, Service> = new Map(); // TODO Close to protected
  /**
   * Init promise to ensure, webda is initiated
   * Used for init() method
   */
  protected _init: Promise<void>;
  /**
   * Known modules
   * @hidden
   */
  public _modules: any; // TODO Close to protected
  /**
   * Configuration loaded from webda.config.json
   * @hidden
   */
  public _config: Configuration; // TODO Close to protected
  /**
   * Old route helpers to allow direct URL behaviors
   *
   * It is not **deprecated** per say but we advise to use [[Service]] instead
   */
  protected _routehelpers: any;
  /**
   * Models that can be retrieved with [[Webda.getModel]]
   * @hidden
   */
  public _models: Map<string, CoreModelDefinition> = new Map(); // TODO Close to protected
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
  /**
   * Loggers registry
   * @hidden
   */
  public _loggers: Logger[] = []; // TODO Close to protected
  protected _initTime: number;
  /**
   * Console logger
   * @hidden
   */
  public _logger: ConsoleLogger; // TODO Close to protected
  /**
   * CORS Filter registry
   *
   * Added via [[Webda.registerCorsFilter]]
   * See [[CorsFilter]]
   */
  protected _corsFilters: CorsFilter[] = [];

  /**
   * @params {Object} config - The configuration Object, if undefined will load the configuration file
   */
  constructor(config = undefined) {
    /** @ignore */
    super();
    this._initTime = new Date().getTime();
    this._logger = new ConsoleLogger(this, "coreLogger", {
      logLevel: "WARN",
      logLevels: "ERROR,WARN,INFO,DEBUG,TRACE"
    });
    // We enforce this normalization
    this._logger.normalizeParams();
    this._loggers.push(this._logger);
    // Schema validations
    this._ajv = Ajv();
    this._ajvSchemas = {};
    // on the spot routehelpers
    this._routehelpers = {};
    this._routehelpers["debug"] = Executor;
    this._routehelpers[
      "inline"
    ] = require("./routehelpers/inline").InlineRouteHelper;
    this._routehelpers[
      "string"
    ] = require("./routehelpers/string").StringRouteHelper;
    this._routehelpers[
      "resource"
    ] = require("./routehelpers/resource").ResourceRouteHelper;
    this._routehelpers["file"] = require("./routehelpers/file").FileRouteHelper;

    // real service - modda
    this._services["Webda/Authentication"] = Authentication;
    this._services["Webda/FileStore"] = FileStore;
    this._services["Webda/MemoryStore"] = MemoryStore;
    this._services["Webda/FileBinary"] = FileBinary;
    this._services["Webda/DebugMailer"] = DebugMailer;
    this._services["Webda/Mailer"] = Mailer;
    this._services["Webda/AsyncEvents"] = EventService;
    this._services["Webda/ResourceService"] = ResourceService;
    this._services["Webda/MemoryQueue"] = MemoryQueue;
    this._services["Webda/MemoryLogger"] = MemoryLogger;
    this._services["Webda/ConsoleLogger"] = ConsoleLogger;
    this._services["Webda/ConfigurationService"] = ConfigurationService;
    // Models
    this._models["Webda/CoreModel"] = CoreModel;
    this._models["Webda/Ident"] = Ident;
    this._models["Webda/User"] = User;
    // Context
    this._models["WebdaCore/Context"] = Context;
    this._models["WebdaCore/SessionCookie"] = SessionCookie;
    this._models["WebdaCore/SecureCookie"] = SecureCookie;
    // Load the configuration
    this._config = this.loadConfiguration(config);
    if (!this._config.version) {
      this._config = this.migrateConfig(this._config);
    }
    // Load modules
    this._loadModules();

    this.initStatics();
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
    this.log("TRACE", "Create Webda init promise");
    this._init = new Promise(async resolve => {
      // Init services
      let service;
      for (service in this._config._services) {
        if (
          this._config._services[service].init !== undefined &&
          !this._config._services[service]._createException
        ) {
          try {
            // TODO Define parralel initialization
            this.log("TRACE", "Initializing service", service);
            await this._config._services[service].init();
          } catch (err) {
            this._config._services[service]._initException = err;
            this.log("ERROR", "Init service " + service + " failed", err);
            this.log("TRACE", err.stack);
          }
        }
      }

      this.emit("Webda.Init.Services", this._config._services);
      resolve();
    });
    return this._init;
  }

  registerCorsFilter(filter: CorsFilter) {
    this._corsFilters.push(filter);
  }

  /**
   * Load the modules,
   *
   * @protected
   * @ignore Useless for documentation
   */
  _loadModules() {
    if (this._config.cachedModules) {
      for (let key in this._config.cachedModules.services) {
        let servicePath = this._config.cachedModules.services[key];
        if (servicePath.startsWith(".")) {
          servicePath = process.cwd() + "/" + servicePath;
        }
        let serviceConstructor = require(servicePath);
        if (serviceConstructor.default) {
          this._services[key] = serviceConstructor.default;
        } else {
          this._services[key] = serviceConstructor;
        }
      }
      for (let key in this._config.cachedModules.models) {
        let modelPath = this._config.cachedModules.models[key];
        if (modelPath.startsWith(".")) {
          modelPath = process.cwd() + "/" + modelPath;
        }
        let model = require(modelPath);
        if (model.default) {
          this._models[key] = model.default;
        } else {
          this._models[key] = model;
        }
      }
      return;
    }
    this._modules = {
      services: {},
      models: {}
    };
    const Finder = require("fs-finder");
    // Modules should be cached on deploy
    var files = [];
    if (fs.existsSync("./node_modules")) {
      files = Finder.from("./node_modules").findFiles("webda.module.json");
    }
    if (fs.existsSync(process.cwd() + "/webda.module.json")) {
      files.push(process.cwd() + "/webda.module.json");
    }
    if (files.length) {
      this.log("DEBUG", "Found modules", files);
      files.forEach(file => {
        let info = require(file);
        this._loadModule(info, path.dirname(file));
      });
    }
  }

  /**
   *
   * @param {Object} executor The executor to expose as executor
   * @param {String} code to execute
   */
  sandbox(executor, code) {
    var sandbox: Configuration = {
      // Should be custom console
      console: console,
      webda: executor._webda,
      executor: executor,
      module: {},
      require: function(mod) {
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
   * Load the module,
   *
   * @protected
   * @ignore Useless for documentation
   */
  _loadModule(info, parent) {
    for (let key in info.services) {
      let mod = require(path.join(parent, info.services[key]));
      if (mod.default) {
        this._services[key] = mod.default;
      } else {
        this._services[key] = mod;
      }
      this._modules.services[key] =
        "./" +
        path.relative(process.cwd(), path.join(parent, info.services[key]));
    }
    for (let key in info.models) {
      let mod = require(path.join(parent, info.models[key]));
      if (mod.default) {
        this._models[key] = mod.default;
      } else {
        this._models[key] = mod;
      }
      this._modules.models[key] =
        "./" +
        path.relative(process.cwd(), path.join(parent, info.models[key]));
    }
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
   * Load the configuration,
   *
   * @protected
   * @ignore Useless for documentation
   * @param {Object|String}
   */
  loadConfiguration(config: any = undefined): Configuration {
    if (typeof config === "object") {
      return config;
    }
    var fs = require("fs");
    if (config !== undefined) {
      if (fs.existsSync(config)) {
        this.log("INFO", "Load " + config);
        return require(config);
      }
    }
    // Default load from file
    if (process.env.WEBDA_CONFIG == undefined) {
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
      return require(process.env.WEBDA_CONFIG);
    }
  }

  migrateConfig(config: Configuration): Configuration {
    this.log("WARN", "Old webda.config.json format, trying to migrate");
    let newConfig: Configuration = {
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
    }
    for (let i in domain) {
      if (i === "global") continue;
      newConfig.routes[i] = domain[i];
    }
    return newConfig;
  }

  /**
   * Return webda current version
   *
   * @returns package version
   * @since 0.4.0
   */
  getVersion(): string {
    return JSON.parse(
      fs.readFileSync(__dirname + "/../package.json").toString()
    ).version;
  }

  /**
   * To define the locales just add a locales: ['en-GB', 'fr-FR'] in your host global configuration
   *
   * @return The configured locales or "en-GB" if none are defined
   */
  getLocales(): string[] {
    if (!this._config || !this._config.parameters.locales) {
      return ["en-GB"];
    }
    return this._config.parameters.locales;
  }

  /**
   * Add a route dynamicaly
   *
   * @param {String} url of the route can contains dynamic part like {uuid}
   * @param {Object} info the type of executor
   */
  addRoute(url, info): void {
    this._config.routes[url] = info;
    if (this._config._initiated) {
      this.remapRoutes();
    }
  }

  /**
   * Remove a route dynamicly
   *
   * @param {String} url to remove
   */
  removeRoute(url): void {
    this._config.routes[url] = undefined;
  }

  /**
   * Check for a service name and return the wanted singleton or undefined if none found
   *
   * @param {String} name The service name to retrieve
   */
  getService(name: string): Service {
    if (!this._config || !name) {
      return;
    }
    name = name.toLowerCase();
    if (this._config._services !== undefined) {
      return this._config._services[name];
    }
  }

  getTypedService<T extends Service>(service: string): T {
    return <T>this.getService(service);
  }

  /**
   * Return a map of defined services
   * @returns {{}}
   */
  getServices(): Map<string, Service> {
    return this._config._services || {};
  }

  /**
   * Return a map of all known services modda
   * @param type The type of implementation if null all moddas
   * @returns {{}}
   */
  getModdas(type = undefined) {
    let result = {};
    for (let i in this._services) {
      if (!type) {
        result[i] = this._services[i].getModda();
      } else if (this._services[i].prototype instanceof type) {
        result[i] = this._services[i].getModda();
      }
    }
    return result;
  }

  /**
   * Return a map of services that extends type
   * @param type The type of implementation
   * @returns {{}}
   */
  getServicesImplementations(type): Map<string, Service> {
    let result = new Map();
    for (let i in this._config._services) {
      if (this._config._services[i] instanceof type) {
        result[i] = this._config._services[i];
      }
    }
    return result;
  }

  /**
   * Return a map of defined stores
   * @returns {{}}
   */
  getStores(): Map<string, Service> {
    return this.getServicesImplementations(Store);
  }

  /**
   * Return a map of defined models
   * @returns {{}}
   */
  getModels(): Map<string, CoreModelDefinition> {
    return this._config._models || {};
  }

  /**
   * Check for a model name and return the wanted class or throw exception if none found
   *
   * @param {String} name The model name to retrieve
   */
  getModel(name): any {
    if (!this._config || !name) {
      throw Error("Undefined model " + name);
    }
    name = name.toLowerCase();
    if (
      this._config._models !== undefined &&
      this._config._models[name] !== undefined
    ) {
      return this._config._models[name];
    }
    throw Error("Undefined model " + name);
  }

  /**
   * Get all method for a specific url
   * @param config
   * @param method
   * @param url
   */
  getRouteMethodsFromUrl(url): string[] {
    let config = this._config;
    let methods = [];
    for (let i in config._pathMap) {
      var routeUrl = config._pathMap[i].url;
      var map = config._pathMap[i].config;

      if (
        routeUrl !== url &&
        (map["_uri-template-parse"] === undefined ||
          map["_uri-template-parse"].fromUri(url) === undefined)
      ) {
        continue;
      }

      if (Array.isArray(map["method"])) {
        methods = methods.concat(map["method"]);
      } else {
        methods.push(map["method"]);
      }
    }
    return methods;
  }

  /**
   * Get the route from a method / url
   */
  private getRouteFromUrl(ctx: Context, config, method, url): any {
    for (let i in config._pathMap) {
      var routeUrl = config._pathMap[i].url;
      var map = config._pathMap[i].config;

      // Check method
      if (Array.isArray(map["method"])) {
        if (map["method"].indexOf(method) === -1) {
          continue;
        }
      } else if (map["method"] !== method) {
        continue;
      }

      if (routeUrl === url) {
        ctx.setServiceParameters(config.parameters);
        return map;
      }

      if (map["_uri-template-parse"] === undefined) {
        continue;
      }
      var parse_result = map["_uri-template-parse"].fromUri(url);
      if (parse_result !== undefined) {
        ctx.setServiceParameters(config.parameters);
        ctx.setPathParameters(parse_result);

        return map;
      }
    }
  }

  /**
   * Get the executor corresponding to a request
   * It can be usefull in unit test so you can test the all stack
   *
   * @protected
   * @param {String} vhost The host for the request
   * @param {String} method The http method
   * @param {String} url The url path
   * @param {String} protocol http or https
   * @param {String} port Port can be usefull for auto redirection
   * @param {Object} headers The headers of the request
   */
  getExecutorWithContext(ctx: Context): Executor {
    let http = ctx.getHttpContext();
    // Check mapping
    var route = this.getRouteFromUrl(
      ctx,
      this._config,
      http.getMethod(),
      http.getUrl()
    );
    if (route === undefined) {
      return;
    }
    return this.getServiceWithRoute(ctx, route);
  }

  /**
   * Get the executor corresponding to a request
   * It can be usefull in unit test so you can test the all stack
   *
   * @protected
   * @param {String} vhost The host for the request
   * @param {String} method The http method
   * @param {String} url The url path
   * @param {String} protocol http or https
   * @param {String} port Port can be usefull for auto redirection
   * @param {Object} headers The headers of the request
   */
  protected getExecutor(
    ctx: Context,
    vhost: string,
    method: string,
    url: string,
    protocol: string,
    port: number = 80,
    headers = {}
  ): Executor {
    // Check mapping
    var route = this.getRouteFromUrl(ctx, this._config, method, url);
    if (route === undefined) {
      return;
    }
    return this.getServiceWithRoute(ctx, route);
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
    return this._config.parameters.sessionSecret;
  }

  /**
   * Return a salt to use when doing digest
   *
   * @returns {String} Current salt
   */
  public getSalt(): string {
    // For now a static config file but should have a rolling service secret
    return this._config.parameters.salt;
  }

  /**
   * @hidden
   */
  protected getServiceWithRoute(ctx: Context, route): Executor {
    var name = route.executor;
    var executor = <Executor>this.getService(name);
    // If no service is found then check for routehelpers
    if (executor === undefined && this._routehelpers[name] !== undefined) {
      executor = new this._routehelpers[name](
        this,
        name,
        _extend(_extend({}, this._config.parameters), route)
      );
    }
    if (executor === undefined) {
      return;
    }
    ctx.setRoute(this.extendParams(route, this._config));
    executor.updateContext(ctx);
    return executor;
  }

  /**
   * @hidden
   */
  protected initURITemplates(config: Configuration): void {
    // Prepare tbe URI parser
    for (var map in config) {
      if (map.indexOf("{") != -1) {
        config[map]["_uri-template-parse"] = uriTemplates(map);
      }
    }
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
   * @hidden
   */
  protected extendParams(local, wider): any {
    var params = _extend({}, wider);
    return _extend(params, local);
  }

  /**
   * Return the global parameters of a domain
   */
  public getGlobalParams(): any {
    return this._config.parameters || {};
  }

  public async reinit(updates: Map<string, any>): Promise<void> {
    let configuration = JSON.parse(JSON.stringify(this._config.services));
    for (let service in updates) {
      jsonpath.value(configuration, service, updates[service]);
    }
    if (
      JSON.stringify(Object.keys(configuration)) !==
      JSON.stringify(Object.keys(this._config.services))
    ) {
      this.log("ERROR", "Configuration update cannot modify services");
      return this._initPromise;
    }
    this._config.services = configuration;
    for (let service in this._config._services) {
      try {
        // TODO Define parralel initialization
        this.log("TRACE", "Re-Initializing service", service);
        let serviceBean = this._config._services[service];
        await serviceBean.reinit(this.getServiceParams(serviceBean._name));
      } catch (err) {
        this._config._services[service]._reinitException = err;
        this.log("ERROR", "Re-Init service " + service + " failed", err);
        this.log("TRACE", err.stack);
      }
    }
  }

  protected getServiceParams(service: string): any {
    var params = this.extendParams(
      this._config.services[service],
      this._config.parameters
    );
    delete params.require;
    return params;
  }
  /**
   * @hidden
   *
   */
  protected createServices(excludes: string[] = []): Promise<void> {
    var services = this._config.services;
    if (this._config._services === undefined) {
      this._config._services = {};
    }
    if (services === undefined) {
      return;
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
      if (type.indexOf("/") < 2) {
        type = "Webda/" + type;
      }
      var include = services[service].require;
      var serviceConstructor = undefined;
      if (include === undefined) {
        serviceConstructor = this._services[type];
      } else {
        try {
          if (typeof include === "string") {
            if (include.startsWith("./")) {
              include = process.cwd() + "/" + include;
            }
            serviceConstructor = require(include);
            if (serviceConstructor.default) {
              serviceConstructor = serviceConstructor.default;
            }
          } else {
            serviceConstructor = include;
          }
        } catch (ex) {
          this.log("ERROR", "Create service " + service + " failed");
          this.log("TRACE", ex.stack);
          continue;
        }
      }
      if (serviceConstructor === undefined) {
        this.log("ERROR", "No constructor found for service " + service);
        continue;
      }

      try {
        this.log("TRACE", "Constructing service", service);
        this._config._services[service.toLowerCase()] = new serviceConstructor(
          this,
          service,
          this.getServiceParams(service)
        );
        if (this._config._services[service.toLowerCase()] instanceof Logger) {
          this._loggers.push(this._config._services[service.toLowerCase()]);
        }
      } catch (err) {
        this.log("ERROR", "Cannot create service", service, err);
        this._config.services[service]._createException = err;
      }
    }

    this.autoConnectServices();

    this.emit("Webda.Create.Services", this._config._services);
  }

  /**
   * Return all methods that are setters (startsWith("set"))
   * @param obj service get setter from
   */
  protected _getSetters(obj): any[] {
    let methods = [];
    while ((obj = Reflect.getPrototypeOf(obj))) {
      let keys = Reflect.ownKeys(obj).filter(k =>
        k.toString().startsWith("set")
      );
      keys.forEach(k => methods.push(k));
    }
    return methods;
  }

  /**
   * Auto connect services with setters
   */
  protected autoConnectServices(): void {
    // TODO Leverage decorators instead of setter name
    for (let service in this._config._services) {
      let serviceBean = this._config._services[service];
      serviceBean.resolve();
      let setters = this._getSetters(serviceBean);
      setters.forEach(setter => {
        let targetService = this._config._services[
          setter.substr(3).toLowerCase()
        ];
        if (targetService) {
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
    if (!this._config.routes) {
      this._config.routes = {};
    }
    this.initModdas(this._config);

    // Add models
    this.initModels(this._config);

    if (this._config.services !== undefined) {
      this.createServices();
    }

    this.remapRoutes();

    this._config._initiated = true;
    this.emit("Webda.Init", this._config);
  }

  protected remapRoutes() {
    this.initURITemplates(this._config.routes);

    // Order path desc
    this._config._pathMap = [];
    for (var i in this._config.routes) {
      if (i === "global") continue;
      // Might need to trail the query string
      this._config._pathMap.push({
        url: i,
        config: this._config.routes[i]
      });
    }
    this._config._pathMap.sort(this.comparePath);
  }
  /**
   * Not usefull anymore
   * @deprecated
   * @param config
   */
  protected initModdas(config): void {
    // Moddas are the custom type of service
    // They are either coming from npm or are direct lambda feature or local with require
    if (config.moddas === undefined) return;

    for (let i in config.moddas) {
      let modda = config.moddas[i];
      if (modda.type == "local") {
        if (modda.require.startsWith("./")) {
          modda.require = process.cwd() + modda.require.substr(1);
        }
        // Add the required type
        let serviceConstructor: any = require(modda.require);
        if (serviceConstructor.default) {
          this._services[i] = serviceConstructor.default;
        } else {
          this._services[i] = serviceConstructor;
        }
      } else if (modda.type == "npm") {
        // The package should export the default
        this._services[i] = require(modda.package);
      }
    }
    this.emit("Webda.Init.Moddas");
  }

  protected initModels(config): void {
    if (config._models === undefined) {
      config._models = {};
    }
    for (let i in config.models) {
      var type = i;
      if (type.indexOf("/") < 2) {
        type = "Webda/" + type;
      }
      var include = config.models[i];
      try {
        if (typeof include === "string") {
          if (include.startsWith("./")) {
            include = process.cwd() + "/" + include;
          }
          let model = require(include);
          if (model.default) {
            config._models[type.toLowerCase()] = model.default;
          } else {
            config._models[type.toLowerCase()] = model;
          }
        }
      } catch (ex) {
        this.log("ERROR", "Create model " + type + " failed");
        this.log("TRACE", ex.stack);
        continue;
      }
    }
    for (let i in this._models) {
      if (config._models[i.toLowerCase()]) continue;
      config._models[i.toLowerCase()] = this._models[i];
    }
    this.emit("Webda.Init.Models", config._models);
  }

  protected comparePath(a, b): number {
    // Normal node works with localeCompare but not Lambda...
    // Local compare { to a return: 26 on Lambda
    let bs = b.url.split("/");
    let as = a.url.split("/");
    for (let i in as) {
      if (bs[i] === undefined) return -1;
      if (as[i] === bs[i]) continue;
      if (as[i][0] === "{" && bs[i][0] !== "{") return 1;
      if (as[i][0] !== "{" && bs[i][0] === "{") return -1;
      return bs[i] < as[i] ? -1 : 1;
    }
    return 1;
  }

  /**
   * Create a new context for a request
   *
   * @class Service
   * @param httpContext THe HTTP request context
   * @param stream - The request output stream if any
   * @return A new context object to pass along
   */
  public async newContext(
    httpContext: HttpContext,
    stream = undefined
  ): Promise<Context> {
    let res: Context = <Context>(
      new (this.getModel(
        this.getGlobalParams().contextModel || "WebdaCore/Context"
      ))(this, httpContext, stream)
    );
    await res.init();
    return res;
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
  public log(level, ...args): void {
    this._loggers.forEach((logger: Logger) => {
      logger.log(level, ...args);
    });
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
  protected async checkCSRF(ctx: Context): Promise<boolean> {
    let httpContext = ctx.getHttpContext();
    let website = this.getGlobalParams().website || "";

    if (!Array.isArray(website)) {
      if (typeof website === "object") {
        website = [website.url];
      } else {
        website = [website];
      }
    }
    for (let i in this._corsFilters) {
      if (await this._corsFilters[i].checkCSRF(ctx)) {
        return true;
      }
    }
    let origins = this.getGlobalParams().csrfOrigins || [];
    for (let i in origins) {
      if (!origins[i].endsWith("$")) {
        origins[i] += "$";
      }
      if (!origins[i].startsWith("^")) {
        origins[i] = "^" + origins[i];
      }
      let regexp = new RegExp(origins[i]);
      if (httpContext.origin.match(regexp)) {
        return true;
      }
      if (httpContext.root.match(regexp)) {
        return true;
      }
    }
    // Host match or complete match
    if (
      website.indexOf(httpContext.root) >= 0 ||
      website.indexOf(httpContext.origin) >= 0 ||
      website === "*"
    ) {
      return true;
    }
    return false;
  }
}

export { Webda, _extend, Configuration };
