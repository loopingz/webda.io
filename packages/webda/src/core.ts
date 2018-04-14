import * as uriTemplates from 'uri-templates';
import * as fs from 'fs';
import * as vm from 'vm';
import * as Ajv from 'ajv';
import * as path from 'path';
import {
  serialize as cookieSerialize
} from "cookie";
import {
  Context
} from "./utils/context";
import * as events from 'events';
import {
  Store,
  Service,
  Executor,
  SecureCookie,
  MemoryStore,
  FileStore,
  DynamoStore,
  Authentication,
  CoreModel,
  Ident,
  Mailer,
  MongoStore,
  MemoryQueue,
  SQSQueue,
  EventService,
  FileBinary,
  S3Binary
} from './index';
import {
  CoreModelDefinition
} from "./models/coremodel";

const _extend = require('util')._extend;

interface Configuration {
  [key: string]: any
}

interface ServiceMap {
  [key: string]: any
}

interface ModelsMap {
  [key: string]: CoreModelDefinition
}

/**
 * This is the main class of the framework, it handles the routing, the services initialization and resolution
 *
 * @class Webda
 */
class Webda extends events.EventEmitter {
  _services: ServiceMap;
  _modules: any;
  _config: Configuration;
  _routehelpers: any;
  _models: ModelsMap;
  _vhost: string;
  _ajv: any;
  _ajvSchemas: any;
  _currentExecutor: any;
  _configFile: string;
  /**
   * @params {Object} config - The configuration Object, if undefined will load the configuration file
   */
  constructor(config = undefined) {
    /** @ignore */
    super();
    this._vhost = '';
    // Schema validations
    this._ajv = Ajv();
    this._ajvSchemas = {};
    // on the spot routehelpers
    this._routehelpers = {};
    this._routehelpers['debug'] = Executor;

    this._routehelpers['lambda'] = require('./routehelpers/lambda').LambdaRouteHelper;
    this._routehelpers['inline'] = require('./routehelpers/inline').InlineRouteHelper;
    this._routehelpers['string'] = require('./routehelpers/string').StringRouteHelper;
    this._routehelpers['resource'] = require('./routehelpers/resource').ResourceRouteHelper;
    this._routehelpers['file'] = require('./routehelpers/file').FileRouteHelper;

    // real service - modda
    this._services = {};
    this._services['Webda/Authentication'] = Authentication;
    this._services['Webda/FileStore'] = FileStore;
    this._services['Webda/MemoryStore'] = MemoryStore;
    this._services['Webda/MongoStore'] = MongoStore;
    this._services['Webda/DynamoStore'] = DynamoStore;
    this._services['Webda/FileBinary'] = FileBinary;
    this._services['Webda/S3Binary'] = S3Binary;
    this._services['Webda/Mailer'] = Mailer;
    this._services['Webda/AsyncEvents'] = EventService;
    this._services['Webda/MemoryQueue'] = MemoryQueue;
    this._services['Webda/SQSQueue'] = SQSQueue;
    // Models
    this._models = {};
    this._models['Webda/CoreModel'] = CoreModel;
    this._models['Webda/Ident'] = Ident;
    // Load the configuration
    this._config = this.loadConfiguration(config);
    if (!this._config.version) {
      this._config = this.migrateConfig(this._config);
    }
    // Load modules
    this._loadModules();

    this.init();
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
        this._services[key] = require(this._config.cachedModules.services[key]);
      }
      for (let key in this._config.cachedModules.models) {
        this._models[key] = require(this._config.cachedModules.models[key]);
      }
      return;
    }
    this._modules = {
      services: {},
      models: {}
    }
    const Finder = require('fs-finder');
    // Modules should be cached on deploy
    var files = [];
    if (fs.existsSync('./node_modules')) {
      files = Finder.from('./node_modules').findFiles('webda.module.json');
    }
    if (files.length) {
      this.log('DEBUG', 'Found modules', files);
      files.forEach((file) => {
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
        if (mod === 'net') {
          throw Error('not allowed');
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
      this._modules.services[key] = path.join(parent, info.services[key]);
    }
    for (let key in info.models) {
      let mod = require(path.join(parent, info.models[key]));
      if (mod.default) {
        this._models[key] = mod.default;
      } else {
        this._models[key] = mod;
      }
      this._modules.models[key] = path.join(parent, info.models[key]);
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
      this._ajv.addSchema(require(schema), schema)
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
    if (typeof(config) === 'object') {
      return config;
    }
    var fs = require('fs');
    if (config !== undefined) {
      if (fs.existsSync(config)) {
        this.log('INFO', 'Load ' + config);
        return require(config);
      }
    }
    // Default load from file
    if (process.env.WEBDA_CONFIG == undefined) {
      config = './webda.config.json';
      if (fs.existsSync(config)) {
        this._configFile = path.resolve(config);
        return require(this._configFile);
      }
      config = '/etc/webda/config.json';
      if (fs.existsSync(config)) {
        this._configFile = path.resolve(config);
        return require(this._configFile);
      }
    } else {
      this.log('INFO', 'Load ' + process.env.WEBDA_CONFIG);
      return require(process.env.WEBDA_CONFIG);
    }
  }

  migrateConfig(config: Configuration): Configuration {
    this.log('WARN', 'Old webda.config.json format, trying to migrate');
    let newConfig: Configuration = {
      parameters: {},
      services: {},
      models: {},
      routes: {},
      version: 1
    };
    let domain;
    if (config['*']) {
      domain = config[config['*']];
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
      if (i === 'global') continue;
      newConfig.routes[i] = domain[i];
    }
    return newConfig;
  }

  /**
   * Get the current session object
   *
   * @returns A session object
   */
  getSession(): any {
    if (this._currentExecutor) {
      return this._currentExecutor.session;
    }
  }

  /**
   * Return webda current version
   *
   * @returns package version
   * @since 0.4.0
   */
  getVersion(): string {
    return JSON.parse(fs.readFileSync(__dirname + '/../package.json').toString()).version;
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
   * Get a new session object initiate with the data object
   * Can be used to create short term encrypted data, the keys of the session should be refresh frequently
   *
   * @returns A new session
   */
  getNewSession(data) {
    return new SecureCookie({
      secret: 'WebdaSecret'
    }, data);
  }

  /**
   * Add a route dynamicaly
   *
   * @param {String} url of the route can contains dynamic part like {uuid}
   * @param {Object} info the type of executor
   */
  addRoute(url, info): void {
    this._config.routes[url] = info;
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

  getTypedService < T extends Service > (service: string): T {
    return <T > this.getService(service);
  }

  /**
   * Return a map of defined services
   * @returns {{}}
   */
  getServices(): ServiceMap {
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
  getServicesImplementations(type): ServiceMap {
    let result = {};
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
  getStores(): ServiceMap {
    return this.getServicesImplementations(Store);
  }

  /**
   * Return a map of defined models
   * @returns {{}}
   */
  getModels(): ModelsMap {
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
    if (this._config._models !== undefined && this._config._models[name] !== undefined) {
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

      if (routeUrl !== url &&
        (map['_uri-template-parse'] === undefined ||
          map['_uri-template-parse'].fromUri(url) === undefined)) {
        continue;
      }

      if (Array.isArray(map['method'])) {
        methods = methods.concat(map['method'])
      } else {
        methods.push(map['method']);
      }
    }
    return methods;
  }

  /**
   * Get the route from a method / url
   * @private
   */
  getRouteFromUrl(ctx, config, method, url): any {
    for (let i in config._pathMap) {
      var routeUrl = config._pathMap[i].url;
      var map = config._pathMap[i].config;

      // Check method
      if (Array.isArray(map['method'])) {
        if (map['method'].indexOf(method) === -1) {
          continue;
        }
      } else if (map['method'] !== method) {
        continue;
      }

      if (routeUrl === url) {
        ctx._params = _extend(ctx._params, config.parameters);
        return map;
      }

      if (map['_uri-template-parse'] === undefined) {
        continue;
      }
      var parse_result = map['_uri-template-parse'].fromUri(url);
      if (parse_result !== undefined) {
        ctx._params = _extend(ctx._params, config.parameters);
        ctx._params = _extend(ctx._params, parse_result);
        ctx.query = parse_result;
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
  getExecutor(ctx, vhost, method, url, protocol, port, headers): Executor {
    // Check mapping
    var route = this.getRouteFromUrl(ctx, this._config, method, url);
    if (route === undefined) {
      return;
    }
    route._http = {
      "host": vhost,
      "method": method,
      "url": url,
      "protocol": protocol,
      "port": port,
      "headers": headers,
      "root": protocol + "://" + vhost
    };
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
  getSecret(): string {
    // For now a static config file but should have a rolling service secret
    return this._config.parameters.secret;
  }

  /**
   * Return a salt to use when doing digest
   *
   * @returns {String} Current salt
   */
  getSalt(): string {
    // For now a static config file but should have a rolling service secret
    return this._config.parameters.salt;
  }

  /**
   * @private
   */
  getServiceWithRoute(ctx, route): Executor {
    var name = route.executor;
    var executor = < Executor > this.getService(name);
    // If no service is found then check for routehelpers
    if (executor === undefined && this._routehelpers[name] !== undefined) {
      executor = new this._routehelpers[name](this, name, _extend(_extend({}, this._config.parameters), route));
    }
    if (executor === undefined) {
      return;
    }
    ctx.setRoute(this.extendParams(route, this._config));
    executor.updateContext(ctx);
    return executor;
  }

  /**
   * @private
   */
  initURITemplates(config: Configuration): void {
    // Prepare tbe URI parser
    for (var map in config) {
      if (map.indexOf("{") != -1) {
        config[map]['_uri-template-parse'] = uriTemplates(map);
      }
    }
  }

  /**
   * Flush the headers to the response, no more header modification is possible after that
   * @abstract
   */
  flushHeaders(context): void {

  }

  /**
   * Flush the entire response to the client
   */
  flush(context): void {

  }

  /**
   * Return if Webda is in debug mode
   */
  isDebug(): boolean {
    return false;
  }

  /**
   * @private
   */
  extendParams(local, wider): any {
    var params = _extend({}, wider);
    return _extend(params, local);
  }

  /**
   * Return the global parameters of a domain
   * @param {String} vhost The domain to retrieve or default if not specified
   */
  getGlobalParams(): any {
    return this._config.parameters || {};
  }

  /**
   * Encode the cookie into a header form
   *
   * @ignore
   * @protected
   */
  getCookieHeader(executor): string {
    var session = executor.session;
    var params = {
      'path': '/',
      'domain': executor._route._http.host,
      'httpOnly': true,
      secure: false,
      maxAge: 86400 * 7
    };
    if (executor._route._http.protocol == "https") {
      params.secure = true;
    }
    if (executor._route._http.wildcard) {
      params.domain = executor._route._http.vhost;
    }
    if (executor._params.cookie !== undefined) {
      if (executor._params.cookie.domain) {
        params.domain = executor._params.cookie.domain;
      } else {
        params.domain = executor._route._http.host;
      }
      if (executor._params.cookie.maxAge) {
        params.maxAge = executor._params.cookie.maxAge;
      }
    }
    // Expiracy at one week - should configure it
    var res = cookieSerialize('webda', session.save(), params);
    return res;
  }

  /**
   * @ignore
   *
   */
  initServices(): void {
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
      var type = services[service].type;
      if (type === undefined) {
        type = service;
      }
      if (type.indexOf('/') < 2) {
        type = "Webda/" + type;
      }
      var include = services[service].require;
      var serviceConstructor = undefined;
      if (include === undefined) {
        serviceConstructor = this._services[type];
      } else {
        try {
          if (typeof(include) === "string") {
            if (include.startsWith("./")) {
              include = process.cwd() + '/' + include;
            }
            serviceConstructor = require(include);
          } else {
            serviceConstructor = include;
          }
        } catch (ex) {
          this.log('ERROR', 'Create service ' + service + ' failed');
          this.log('TRACE', ex.stack);
          continue;
        }
      }
      if (serviceConstructor === undefined) {
        this.log('ERROR', 'No constructor found for service ' + service);
        continue;
      }
      var params = this.extendParams(services[service], this._config.parameters);
      delete params.require;
      try {
        this._config._services[service.toLowerCase()] = new serviceConstructor(this, service, params);
      } catch (err) {
        this.log('ERROR', 'Cannot create service', service, err);
        this._config.services[service]._createException = err;
      }
    }
    // Add models
    this.initModels(this._config);

    this.autoConnectServices();

    // Init services
    for (service in this._config._services) {
      if (this._config._services[service].init !== undefined) {
        try {
          this._config._services[service].init(this._config);
        } catch (err) {
          this._config._services[service]._initException = err;
          this.log('ERROR', "Init service " + service + " failed");
          this.log('TRACE', err.stack);
        }
      }
    }

    this.emit('Webda.Init.Services', this._config._services);
  }


  _getSetters(obj): any[] {
    let methods = [];
    while (obj = Reflect.getPrototypeOf(obj)) {
      let keys = Reflect.ownKeys(obj).filter(k => k.toString().startsWith('set'))
      keys.forEach((k) => methods.push(k));
    }
    return methods;
  }

  autoConnectServices(): void {
    for (let service in this._config._services) {
      let setters = this._getSetters(this._config._services[service]);
      setters.forEach((setter) => {
        let targetService = this._config._services[setter.substr(3).toLowerCase()];
        if (targetService) {
          this._config._services[service][setter](targetService);
        }
      });
    }
  }

  jsonFilter(key: string, value: any): any {
    if (key[0] === '_') return undefined;
    return value;
  }

  init(): void {
    if (!this._config.routes) {
      this._config.routes = {};
    }
    this.initModdas(this._config);

    if (this._config.services !== undefined) {
      this.initServices();
    }
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
    this._config._initiated = true;
    this.emit('Webda.Init', this._config);
  }

  initModdas(config): void {
    // Moddas are the custom type of service
    // They are either coming from npm or are direct lambda feature or local with require
    if (config.moddas === undefined) return;

    for (let i in config.moddas) {
      let modda = config.moddas[i];
      if (modda.type == "local") {
        // Add the required type
        this._services[i] = require(modda.require);
      } else if (modda.type == "lambda") {
        // This should start the lambda
        this._services[i] = require('./routehelpers/lambda');
        this._services[i]._arn = modda.arn;
      } else if (modda.type == "npm") {
        // The package should export the default
        this._services[i] = require(modda.package);
      }
    }
    this.emit('Webda.Init.Moddas');
  }

  initModels(config): void {
    if (config._models === undefined) {
      config._models = {};
    }
    for (let i in config.models) {
      var type = i;
      if (type.indexOf('/') < 2) {
        type = "Webda/" + type;
      }
      var include = config.models[i];
      try {
        if (typeof(include) === "string") {
          if (include.startsWith("./")) {
            include = process.cwd() + '/' + include;
          }
          let model = require(include);
          if (model.default) {
            config._models[type.toLowerCase()] = model.default;
          } else {
            config._models[type.toLowerCase()] = model;
          }
        }

      } catch (ex) {
        this.log('ERROR', 'Create model ' + type + ' failed');
        this.log('TRACE', ex.stack);
        continue;
      }
    }
    for (let i in this._models) {
      if (config._models[i.toLowerCase()]) continue;
      config._models[i.toLowerCase()] = this._models[i];
    }
    this.emit('Webda.Init.Models', config._models);
  }

  comparePath(a, b): number {
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
   * @param {Object} body - The request body
   * @param {Object} session - The request session
   * @param {Object} stream - The request output stream if any
   * @param {Object} files - The files input stream
   * @param {Object} headers - The request headers if any
   * @return {Object} A new context object to pass along
   */
  newContext(body, session, stream = undefined, files = []) {
    return new Context(this, body, session, stream, files);
  }

  /**
   * Convert an object to JSON using the Webda json filter
   *
   * @class Service
   * @param {Object} object - The object to export
   * @return {String} The export of the strip object ( removed all attribute with _ )
   */
  toPublicJSON(object): string {
    return JSON.stringify(object, this.jsonFilter);
  }

  /**
   * Logs
   * @param level
   * @param args
   */
  log(level, ...args): void {
    console.log(level, ...args);
  }
}

export {
  Webda,
  _extend,
  Configuration,
  ServiceMap,
  ModelsMap
};
