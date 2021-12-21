"use strict";
import events = require("events");
import { Core, Logger } from "../index";
import { HttpMethodType } from "../utils/context";
import { EventService } from "./asyncevents";
import { WorkerLogLevel } from "@webda/workout";
import { ModdaDefinition } from "../core";
import { JSONSchema6 } from "json-schema";

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
        this.parameter = parameterOrName.substr(7);
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
export function Inject(parameterOrName: string, defaultValue?: string | boolean, optional?: boolean) {
  return function (target: any, propertyName: string): void {
    target.Injectors = target.Injectors || [];
    if (typeof defaultValue === "boolean") {
      target.Injectors.push(new Injector(propertyName, parameterOrName, undefined, defaultValue));
    } else {
      target.Injectors.push(new Injector(propertyName, parameterOrName, defaultValue, optional));
    }
  };
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
   * Copy all parameters into the object by default
   *
   * @param params from webda.config.json
   */
  constructor(params: any) {
    Object.assign(this, params);
  }
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
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
abstract class Service<T extends ServiceParameters = ServiceParameters> extends events.EventEmitter {
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
   * Return service representation
   */
  toString() {
    return this.parameters.type + "[" + this._name + "]";
  }

  /**
   * Resolve parameters
   * Call initRoutes and initBeanRoutes
   */
  resolve(): void {
    // Inject dependencies
    Injector.resolveAll(this);

    // We wait for all services to be created before calling computeParameters
    this.computeParameters();

    this.initRoutes();
    this._webda.initBeanRoutes(this);
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
    openapi: object = {},
    allowPath: boolean = false
  ) {
    let info: any = {};
    info._method = executer;
    info.method = methods;
    info.executor = this._name;
    info.allowPath = allowPath;
    info.openapi = openapi;
    this._webda.addRoute(url, {
      _method: executer,
      executor: this._name,
      allowPath,
      openapi,
      methods
    });
  }

  /**
   * Init the routes
   */
  initRoutes() {
    // Can be overriden by subclasses if needed
  }

  /**
   * Convert an object to JSON using the Webda json filter
   *
   * @class Service
   * @param {Object} object - The object to export
   * @return {String} The export of the strip object ( removed all attribute with _ )
   */
  toPublicJSON(object) {
    return this._webda.toPublicJSON(object);
  }

  /**
   * Will be called after all the Services are created
   *
   * @param config for the host so you can add your own route here
   * @abstract
   */
  async init(): Promise<void> {
    // Can be overriden by subclasses if needed
  }

  /**
   *
   * @param config new parameters for the service
   */
  async reinit(config): Promise<void> {
    this.parameters = <T>this.loadParameters(config);
    this.computeParameters();
    return this.init();
  }

  /**
   * Display a message if the listener takes too long
   * @param start
   */
  elapse(start: number) {
    let elapsed = Date.now() - start;
    if (elapsed > 100) {
      this.log("INFO", "Long listener", elapsed, "ms");
    }
  }

  /**
   * Emit the event with data and wait for Promise to finish if listener returned a Promise
   */
  emitSync(event, data): Promise<any[]> {
    var promises = [];
    for (let listener of this.listeners(event)) {
      let start = Date.now();
      let result = listener(data);
      if (result instanceof Promise) {
        promises.push(
          result
            .catch(err => {
              this.log("ERROR", "Listener error", err);
            })
            .then(() => {
              this.elapse(start);
            })
        );
      } else {
        this.elapse(start);
      }
    }
    return Promise.all(promises);
  }

  /**
   * Override to allow capturing long listeners
   * @override
   */
  emit(event: symbol | string, ...args: any[]): boolean {
    for (let listener of this.listeners(event)) {
      let start = Date.now();
      listener(...args);
      this.elapse(start);
    }
    return true;
  }

  /**
   * Listen to an event as on(...) would do except that it will be asynchronous
   * @param event
   * @param callback
   * @param queue Name of queue to use, can be undefined, queue name are used to define differents priorities
   */
  onAsync(event, callback, queue: string = undefined) {
    this._webda.getService<EventService>("AsyncEvents").bindAsyncListener(this, event, callback, queue);
  }

  /**
   * Return a webda service
   * @param service name to retrieve
   */
  getService<K extends Service<ServiceParameters>>(service: string): K {
    return this._webda.getService<K>(service);
  }

  /**
   * Return the Modda definition if any
   *
   */
  static getModda(): ModdaDefinition | void {
    // Can be overriden by subclasses if needed
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
    this.logger.log(level, ...args);
  }

  /**
   * Allow to specify the JSONSchema to configure this service
   *
   * Return undefined by default to fallback on the guess from ServiceParamaters
   *
   * Using this method should only be exception
   */
  static getSchema(): JSONSchema6 {
    return undefined;
  }
}

export { Service };
