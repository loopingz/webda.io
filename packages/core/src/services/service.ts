import type { WorkerLogLevel } from "@webda/workout";
import { AsyncEventUnknown, EventEmitterUtils } from "../events/asynceventemitter";

import type { OpenAPIWebdaDefinition } from "../rest/irest";
import type { HttpMethodType } from "../contexts/httpcontext";
import { createPropertyDecorator, CustomConstructor, type Constructor } from "@webda/tsc-esm";
import { useMetric, type Counter, type Gauge, type Histogram, type MetricConfiguration } from "../metrics/metrics";

import type { Logger } from "../loggers/ilogger";
import type { OperationContext } from "../contexts/operationcontext";
import { ServiceParameters } from "../interfaces";
import { useService } from "../core/hooks";
import { AbstractService } from "../core/icore";
import { useLogger } from "../loggers/hooks";
import { WEBDA_EVENTS } from "@webda/models";
import { getMetadata } from "@webda/test";

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
    service[this.property] = useService(name);
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
export const Inject = createPropertyDecorator(
  (value: Service, context: ClassFieldDecoratorContext, parameterOrName?: string, defaultValue?: string | boolean, optional?: boolean) => {

  } 
)
/*
export function Inject(parameterOrName?: string, defaultValue?: string | boolean, optional?: boolean) {
  return (target: Service, context: ClassFieldDecoratorContext): void => {
    context.metadata["webda.inject"] ??= {};
    context.metadata["webda.inject"][context.name] = { parameterOrName, defaultValue, optional };

    /*
    target.Injectors = target.Injectors || [];
    if (typeof defaultValue === "boolean") {
      target.Injectors.push(new Injector(propertyName, parameterOrName || propertyName, undefined, defaultValue));
    } else {
      target.Injectors.push(new Injector(propertyName, parameterOrName || propertyName, defaultValue, optional));
    }
      /
  };
}
  */

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
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  E extends AsyncEventUnknown = {}
> extends AbstractService<T, E> {
  protected state: "initial" | "resolved" | "errored" | "initializing" | "running" | "stopping" | "stopped" = "initial";

  public readonly stateInfo: {
    method: "resolve" | "init" | "stop";
    duration: number;
    exception?: any;
  }[] = [];

  /**
   * Set the Webda events here
   */
  [WEBDA_EVENTS]: E;

  /**
   * Get the current state
   */
  getState() {
    return this.state;
  }

  /**
   * Logger with class context
   */
  protected logger: Logger;
  /**
   * Get metrics
   */
  protected metrics?: {};
  /**
   *
   *
   * @class Service
   * @param {Webda} webda - The main instance of Webda
   * @param {String} name - The name of the service
   * @param {Object} params - The parameters block define in the configuration file
   */
  constructor(name: string, params: T) {
    super(name, params);
    this.logger = useLogger(this);
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
   * Shutdown the current service if action need to be taken
   */
  async stop(): Promise<void> {
    // Nothing to do
  }

  /**
   * Return service representation
   */
  toString() {
    return this.parameters.type + "[" + this.name + "]";
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
   * Get a service by name
   * @param name
   * @returns
   * @deprecated Use useService, might reconsider
   */
  getService<T extends Service>(name: string): T {
    return <T>useService(name);
  }

  /**
   * Add service name label
   * @param type
   * @param configuration
   * @returns
   */
  getMetric<T = Gauge | Counter | Histogram>(
    type: CustomConstructor<T, [MetricConfiguration<T>]>,
    configuration: MetricConfiguration<T>
  ): T {
    configuration.labelNames ??= [];
    configuration.labelNames = [...configuration.labelNames, "service"];
    configuration.name = `${this.getName().toLowerCase()}_${configuration.name}`;
    return useMetric(type, configuration);
  }

  /**
   * Return the events that an external system can subscribe to
   *
   * @returns
   */
  getClientEvents(): string[] {
    return [];
  }

  /**
   * Authorize a public event subscription
   * @param event
   * @param context
   */
  authorizeClientEvent(_event: string, _context: OperationContext): boolean {
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
    const { url: ServiceUrl } = <T & { url: string }>this.parameters;
    // If url is absolute
    if (url.startsWith("/")) {
      return url;
    }
    if (!ServiceUrl) {
      return undefined;
    }
    if (url.startsWith(".")) {
      if (ServiceUrl.endsWith("/") && url.startsWith("./")) {
        return ServiceUrl + url.substring(2);
      }
      return ServiceUrl + url.substring(1);
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
    const finalUrl = this.getUrl(url, methods);
    if (!finalUrl) {
      return;
    }
    /**
     * TODO Add route
    this._webda.addRoute(finalUrl, {
      // Create bounded function to keep the context
      _method: executer.bind(this),
      executor: this._name,
      openapi: deepmerge(openapi, this.parameters.openapi || {}),
      methods,
      override
    });
    */
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
    const routes = this.constructor.routes || {};
    for (const j in routes) {
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
    const operations = this.constructor.operations || {};
    for (const j in operations) {
      const id = this.getOperationId(j);
      if (!id) continue;
      this.log("TRACE", "Adding operation", id, "for bean", this.getName());
      let name = this.getName();
      name = name.substring(0, 1).toUpperCase() + name.substring(1);
      /*
      TODO Fix this
      this._webda.registerOperation(j.includes(".") ? j : `${name}.${j}`, {
        ...operations[j],
        service: this.getName(),
        input: `${this.getName()}.${operations[j].method}.input`,
        output: `${this.getName()}.${operations[j].method}.output`,
        id
      });
      */
    }
  }

  /**
   * Prevent service to be serialized
   * @returns
   */
  toJSON() {
    return this.toString();
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
   * Emit the event with data and wait for Promise to finish if listener returned a Promise
   */
  async emit<Key extends keyof E>(event: Key, data: E[Key]): Promise<void> {
    await EventEmitterUtils.emit(this, event, data, (level: WorkerLogLevel, ...args: any[]) =>
      this.log(level, ...args)
    );
  }

  /**
   * Get service name
   */
  getName(): string {
    return this.name;
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
    this.logger.log(level, `[${this.name}]`, ...args);
  }
}

export { Service };
