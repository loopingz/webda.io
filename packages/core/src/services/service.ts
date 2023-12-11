import { WorkerLogLevel } from "@webda/workout";
import { deepmerge } from "deepmerge-ts";
import * as events from "events";
import {
  Constructor,
  Core,
  Counter,
  EventEmitterUtils,
  Gauge,
  Histogram,
  Logger,
  MetricConfiguration,
  OperationContext
} from "../index";
import { OpenAPIWebdaDefinition } from "../router";
import { HttpMethodType } from "../utils/httpcontext";
import { EventService } from "./asyncevents";

/**
 * Represent a Inject annotation
 *
 * @see Inject
 */
class Injector {
  parameter: string;
  value: string;
  property: string;
  optional: boolean;

  /**
   *
   * @param property annotated
   * @param parameterOrName to inject from
   * @param defaultValue in case of a parameter
   * @param optional if set to true, won't throw an error if not found
   */
  constructor(property: string, parameterOrName: string, defaultValue?: string, optional: boolean = false) {
    this.property = property;
    this.optional = optional;
    if (!defaultValue) {
      if (parameterOrName.startsWith("params:")) {
        this.parameter = parameterOrName.substring(7);
      } else {
        this.value = parameterOrName;
      }
    } else {
      this.value = defaultValue;
      this.parameter = parameterOrName;
    }
  }

  /**
   * Resolve the current Inject annotation inside the service
   *
   * @param service to resolve
   */
  resolve(service: Service): void {
    let name = this.value;
    if (this.parameter) {
      name = service.getParameters()[this.parameter] || this.value;
    }
    service[this.property] = service.getService(name);
    if (!service[this.property] && !this.optional) {
      if (this.parameter) {
        throw new Error(
          `Injector did not found bean '${name}'(parameter:${this.parameter}) for '${service.getName()}'`
        );
      }
      throw new Error(`Injector did not found bean '${name}' for '${service.getName()}'`);
    }
  }

  /**
   * Inject all annotated dependencies to the current service
   *
   * @param service to inject to
   */
  static resolveAll(service: Service) {
    (Object.getPrototypeOf(service).Injectors || []).forEach(injector => injector.resolve(service));
  }
}

/**
 * Inject a Bean inside this attribute
 *
 * If defaultValue is undefined and parameter is not starting with `params:`, it will
 * resolve by calling `this.getService(parameterOrName)`
 *
 * If defaultValue is defined or parameterOrName starts with `params:` then first argument is
 * consider a parameter and it will resolve by calling `this.getService(this.getParameters()[parameterOrName] || defaultValue)`
 *
 * @param parameterOrName of the service to inject
 *
 * Might consider to split into two annotations
 */
export function Inject(parameterOrName?: string, defaultValue?: string | boolean, optional?: boolean) {
  return function (target: any, propertyName: string): void {
    target.Injectors = target.Injectors || [];
    if (typeof defaultValue === "boolean") {
      target.Injectors.push(new Injector(propertyName, parameterOrName || propertyName, undefined, defaultValue));
    } else {
      target.Injectors.push(new Injector(propertyName, parameterOrName || propertyName, defaultValue, optional));
    }
  };
}

/**
 * Register an Operation within the framework
 *
 * An operation is a callable method with an input and output
 * The method will receive a Context from where it can execute
 *
 * @param id
 * @param input
 * @param output
 */
export function Operation(
  properties?: {
    /**
     * Id of the Operation
     *
     * @default methodName
     */
    id?: string;
    /**
     * WebdaQL to execute on session object to ensure it can access
     */
    permission?: string;
  },
  route?: {
    url: string;
    method?: HttpMethodType;
    openapi?: OpenAPIWebdaDefinition;
  }
) {
  return function (target: any, executor: string) {
    target.constructor.operations ??= {};
    properties ??= {};
    properties.id ??= executor;
    const id = properties.id;
    if (target.constructor.operations[id]) {
      console.error("Operation already exists", id);
      return;
    }
    target.constructor.operations[id] ??= {
      method: executor,
      ...properties
    };
    // If url is specified define the openapi
    if (route) {
      route.method ??= "GET";
      route.openapi ??= {};
      route.openapi[route.method.toLowerCase()] ??= {};
      let def = route.openapi[route.method.toLowerCase()];
      def.operationId = id;
      def.schemas ??= {};
      def.schemas.input ??= properties.id.toLowerCase() + ".input";
      def.schemas.output ??= properties.id.toLowerCase() + ".output";
      Route(route.url, route.method, route.openapi)(target, executor);
    }
  };
}

// @Route to declare route on Bean
export function Route(
  route: string,
  methods: HttpMethodType | HttpMethodType[] = ["GET"],
  openapi: OpenAPIWebdaDefinition = {}
) {
  return function (target: any, executor: string) {
    target.constructor.routes ??= {};
    target.constructor.routes[route] ??= [];
    target.constructor.routes[route].push({
      methods: Array.isArray(methods) ? methods : [methods],
      executor,
      openapi
    });
  };
}

/**
 * A utility class that takes a array of string or string transformed into regex that includes
 * a start line and end line
 */
export class RegExpValidator {
  protected validators: RegExp[];
  constructor(info: string | string[]) {
    info = Array.isArray(info) ? info : [info];
    this.validators = info.map(i => RegExpValidator.getRegExp(i));
  }

  static getRegExp(reg: string): RegExp {
    if (!reg.startsWith("^")) {
      reg = "^" + reg;
    }
    if (!reg.endsWith("$")) {
      reg += "$";
    }
    return new RegExp(reg);
  }

  validate(value: string) {
    return this.validators.some(p => p.test(value));
  }
}
/**
 * Standardized way to allow string/regex validation within configuration
 *
 * If url is prefixed with `regex:` it is considered a regex
 *
 * @example
 * ```typescript
 * class MyServiceParameters extends ServiceParameters {
 *    urls: string[];
 * }
 *
 * class MyService extends Service {
 *    loadParameters(params:any) {
 *      const parameters = new MyServiceParameters(params);
 *      this.urlsValidator = new RegExpStringValidator(parameters.urls);
 *      return parameters;
 *    }
 * }
 * ```
 */
export class RegExpStringValidator extends RegExpValidator {
  stringValidators: string[];
  constructor(info: string | string[]) {
    info = Array.isArray(info) ? info : [info];
    super(info.filter(i => i.startsWith("regex:")).map(i => i.substring(6)));
    this.stringValidators = info.filter(i => !i.startsWith("regex:"));
  }

  /**
   * Add string validation
   * @param value
   * @returns
   */
  validate(value: string) {
    return this.stringValidators.find(p => p === value) !== undefined || super.validate(value);
  }
}

/**
 * Interface to specify the Service parameters
 */
export class ServiceParameters {
  /**
   * Type of the service
   */
  type: string;
  /**
   * URL on which to serve the content
   */
  url?: string;
  /**
   * OpenAPI override
   * @SchemaIgnore
   */
  openapi?: OpenAPIWebdaDefinition;

  /**
   * Copy all parameters into the object by default
   *
   * @param params from webda.config.json
   */
  constructor(params: any) {
    Object.assign(this, params);
  }
}

/**
 * Create a new type with only optional
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type PartialModel<T> = {
  [P in keyof T]: T[P] extends Function ? T[P] : T[P] extends object ? null | PartialModel<T[P]> : T[P] | null;
};

export type Events = {
  [key: string]: unknown;
};

/**
 * Use this object for representing a service in the application
 * A Service is a singleton in the application, that is init after all others services are created
 *
 * You can use a Service to create Listeners or implement shared behavior between others services
 *
 * @exports
 * @abstract
 * @class Service
 */
abstract class Service<
  T extends ServiceParameters = ServiceParameters,
  E extends Events = Events
> extends events.EventEmitter {
  /**
   * Webda Core object
   */
  protected _webda: Core;
  /**
   * Service name
   */
  protected _name: string;
  /**
   * Hold the parameters for your service
   *
   * It will be bring from the `webda.config.json`
   */
  protected parameters: T;
  _createException: string;
  _initTime: number;
  _initException: any = undefined;
  /**
   * Logger with class context
   */
  protected logger: Logger;
  /**
   * Get metrics
   */
  protected metrics?: any;
  /**
   *
   *
   * @class Service
   * @param {Webda} webda - The main instance of Webda
   * @param {String} name - The name of the service
   * @param {Object} params - The parameters block define in the configuration file
   */
  constructor(webda: Core, name: string, params: DeepPartial<T> = {}) {
    super();
    this.logger = webda ? webda.getLogger(this) : undefined;
    this._webda = webda;
    this._name = name;
    this.parameters = <T>this.loadParameters(params);
  }

  /**
   * Load the parameters for a service
   */
  loadParameters(params: DeepPartial<T>): ServiceParameters {
    return new ServiceParameters(params);
  }

  /**
   * Used to compute or derivate input parameter to attribute
   */
  computeParameters(): void {
    // Can be overriden by subclasses if needed
  }

  /**
   * Get the service parameters
   */
  getParameters(): T {
    return this.parameters;
  }

  /**
   * Return WebdaCore
   */
  getWebda(): Core {
    return this._webda;
  }

  /**
   * Shutdown the current service if action need to be taken
   */
  async stop(): Promise<void> {
    // Nothing to do
  }

  /**
   * Return service representation
   */
  toString() {
    return this.parameters.type + "[" + this._name + "]";
  }

  /**
   * Resolve parameters
   * Call initRoutes and initBeanRoutes
   */
  resolve(): this {
    this.initMetrics();
    // Inject dependencies
    Injector.resolveAll(this);

    // We wait for all services to be created before calling computeParameters
    this.computeParameters();

    this.initRoutes();
    this.initOperations();
    return this;
  }

  /**
   * Init the metrics
   */
  initMetrics() {
    this.metrics = {};
  }

  /**
   * Add service name label
   * @param type
   * @param configuration
   * @returns
   */
  getMetric<T = Gauge | Counter | Histogram>(
    type: Constructor<T, [MetricConfiguration<T>]>,
    configuration: MetricConfiguration<T>
  ): T {
    configuration.labelNames ??= [];
    configuration.labelNames = [...configuration.labelNames, "service"];
    configuration.name = `${this.getName().toLowerCase()}_${configuration.name}`;
    return this.getWebda().getMetric(type, configuration);
  }

  /**
   * Return the events that an external system can subscribe to
   *
   * @returns
   */
  getPublicEvents(): string[] {
    return [];
  }

  /**
   * Authorize a public event subscription
   * @param event
   * @param context
   */
  authorizePublicEvent(_event: string, _context: OperationContext): boolean {
    return false;
  }

  /**
   * Return the full path url based on parameters
   *
   * @param url relative url to service
   * @param _methods in case we need filtering (like Store)
   * @returns absolute url or undefined if need to skip the Route
   */
  getUrl(url: string, _methods: HttpMethodType[]) {
    // If url is absolute
    if (url.startsWith("/")) {
      return url;
    }
    if (!this.parameters.url) {
      return undefined;
    }
    if (url.startsWith(".")) {
      if (this.parameters.url.endsWith("/") && url.startsWith("./")) {
        return this.parameters.url + url.substring(2);
      }
      return this.parameters.url + url.substring(1);
    }
    return url;
  }

  /**
   * If undefined is returned it cancel the operation registration
   * @param id
   * @returns
   */
  getOperationId(id: string): string | undefined {
    return id;
  }

  /**
   * Add a route dynamicaly
   *
   * @param {String} url of the route can contains dynamic part like {uuid}
   * @param {Array[]} methods
   * @param {Function} executer Method to execute for this route
   */
  protected addRoute(
    url: string,
    methods: HttpMethodType[],
    executer: Function,
    openapi: OpenAPIWebdaDefinition = {},
    override: boolean = false
  ) {
    let finalUrl = this.getUrl(url, methods);
    if (!finalUrl) {
      return;
    }
    this._webda.addRoute(finalUrl, {
      // Create bounded function to keep the context
      _method: executer.bind(this),
      executor: this._name,
      openapi: deepmerge(openapi, this.parameters.openapi || {}),
      methods,
      override
    });
  }

  /**
   * Return variables for replacement in openapi
   * @returns
   */
  getOpenApiReplacements(): any {
    return {};
  }

  /**
   * Init the routes
   */
  initRoutes() {
    // @ts-ignore
    let routes = this.constructor.routes || {};
    for (let j in routes) {
      this.log("TRACE", "Adding route", j, "for bean", this.getName());
      routes[j].forEach(route => {
        this.addRoute(j, route.methods, this[route.executor], route.openapi);
      });
    }
  }

  /**
   * Init the operations
   */
  initOperations() {
    // @ts-ignore
    let operations = this.constructor.operations || {};
    for (let j in operations) {
      const id = this.getOperationId(j);
      if (!id) continue;
      this.log("TRACE", "Adding operation", id, "for bean", this.getName());
      this._webda.registerOperation(j.includes(".") ? j : `${this.getName()}.${j}`, {
        ...operations[j],
        service: this.getName(),
        input: `${this.getName()}.${operations[j].method}.input`,
        output: `${this.getName()}.${operations[j].method}.output`,
        id
      });
    }
  }

  /**
   * Convert an object to JSON using the Webda json filter
   *
   * @class Service
   * @param {Object} object - The object to export
   * @return {String} The export of the strip object ( removed all attribute with _ )
   */
  toPublicJSON(object: unknown) {
    return this._webda.toPublicJSON(object);
  }

  /**
   * Prevent service to be serialized
   * @returns
   */
  toJSON() {
    return this._name;
  }

  /**
   * Will be called after all the Services are created
   *
   * @param config for the host so you can add your own route here
   * @abstract
   */
  async init(): Promise<this> {
    // Can be overriden by subclasses if needed
    return this;
  }

  /**
   *
   * @param config new parameters for the service
   */
  async reinit(config: DeepPartial<T>): Promise<this> {
    this.parameters = <T>this.loadParameters(config);
    this.computeParameters();
    return this.init();
  }

  /**
   * Emit the event with data and wait for Promise to finish if listener returned a Promise
   */
  emitSync<Key extends keyof E>(event: Key, data: E[Key]): Promise<any[]> {
    return EventEmitterUtils.emitSync(this, event, data);
  }

  /**
   * Override to allow capturing long listeners
   * @override
   */
  emit<Key extends keyof E>(event: Key | symbol, data: E[Key]): boolean {
    return EventEmitterUtils.emit(this, event, data);
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
   * Listen to an event as on(...) would do except that it will be asynchronous
   * @param event
   * @param callback
   * @param queue Name of queue to use, can be undefined, queue name are used to define differents priorities
   */
  onAsync<Key extends keyof E>(event: Key, listener: (evt: E[Key]) => void, queue: string = undefined) {
    this._webda.getService<EventService>("AsyncEvents").bindAsyncListener(this, <string>event, listener, queue);
  }

  /**
   * Return a webda service
   * @param service name to retrieve
   */
  getService<K extends Service<ServiceParameters>>(service: string): K {
    return this._webda.getService<K>(service);
  }

  /**
   * Get service name
   */
  getName(): string {
    return this._name;
  }

  /**
   * Clean the service data, can only be used in test mode
   *
   * @abstract
   */
  __clean(): Promise<void> {
    // @ts-ignore
    if (typeof global.it !== "function") {
      throw Error("Only for test purpose");
    }
    return this.___cleanData();
  }

  /**
   * @private
   */
  ___cleanData(): Promise<void> {
    return Promise.resolve();
  }

  /**
   *
   * @param level to log
   * @param args
   */
  log(level: WorkerLogLevel, ...args: any[]) {
    // Add the service name to avoid confusion
    this.logger.log(level, `[${this._name}]`, ...args);
  }
}

export { Service };
