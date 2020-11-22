"use strict";
import events = require("events");
import { Core, Logger } from "../index";
import { HttpMethodType } from "../utils/context";
import { EventService } from "./asyncevents";
import { WorkerLogLevel } from "@webda/workout";
import { ModdaDefinition } from "../core";

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
  constructor(webda: Core, name: string, params: any = {}) {
    super();
    this.logger = webda ? webda.getLogger(this) : undefined;
    this._initTime = new Date().getTime();
    this._webda = webda;
    this._name = name;
    this.parameters = <T>this.loadParameters(params);
  }

  /**
   * Load the parameters for a service
   */
  loadParameters(params: any): ServiceParameters {
    return new ServiceParameters(params);
  }

  /**
   * Used to compute or derivate input parameter to attribute
   */
  computeParameters(): void {}

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
   * Resolve parameters
   * Call initRoutes and initBeanRoutes
   */
  resolve(): void {
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
  initRoutes() {}

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
  async init(): Promise<void> {}

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
   * Emit the event with data and wait for Promise to finish if listener returned a Promise
   */
  emitSync(event, data): Promise<any[]> {
    var result;
    var promises = [];
    var listeners = this.listeners(event);
    for (var i in listeners) {
      result = listeners[i](data);
      if (result instanceof Promise) {
        promises.push(result);
      }
    }
    return Promise.all(promises);
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
  getService<T extends Service<ServiceParameters>>(service: string): T {
    return this._webda.getService<T>(service);
  }

  /**
   * Return the Modda definition if any
   *
   */
  static getModda(): ModdaDefinition | void {}

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
  __clean(): Promise<any> {
    // @ts-ignore
    if (typeof global.it !== "function") {
      throw Error("Only for test purpose");
    }
    return this.___cleanData();
  }

  /**
   * @private
   */
  ___cleanData(): Promise<any> {
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
}

export { Service };
