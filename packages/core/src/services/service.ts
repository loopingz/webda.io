import type { WorkerLogLevel } from "@webda/workout";
import { AsyncEventUnknown, EventEmitterUtils } from "../events/asynceventemitter.js";

import type { OpenAPIWebdaDefinition } from "../rest/irest.js";
import type { HttpMethodType } from "../contexts/httpcontext.js";
import { createPropertyDecorator, CustomConstructor } from "@webda/tsc-esm";
import { useMetric, type Counter, type Gauge, type Histogram, type MetricConfiguration } from "../metrics/metrics.js";

import type { Logger } from "../loggers/ilogger.js";
import type { OperationContext } from "../contexts/operationcontext.js";
import { ServiceParameters } from "./serviceparameters.js";
import { useDynamicService, useService } from "../core/hooks.js";
import { registerOperation } from "../core/operations.js";
import { deepmerge } from "deepmerge-ts";
import type { ServiceName, ServicesMap } from "../core/hooks.js";
import { useApplication } from "../application/hooks.js";
import { AbstractService } from "../core/icore.js";
import { useLogger } from "../loggers/hooks.js";
import { WEBDA_EVENTS } from "@webda/models";
import { State } from "@webda/utils";
import { ServiceState, ServiceStates } from "./iservice.js";
import { DecoratorPropertyParameters, getMetadata } from "@webda/decorators";

/**
 * Represent a Inject annotation
 *
 * @see Inject
 */
class Injector {
  parameter: string;
  value: ServiceName;
  property: string;
  optional: boolean;

  /**
   * @param property annotated
   * @param parameterOrName to inject from
   * @param defaultValue in case of a parameter
   * @param optional if set to true, won't throw an error if not found
   */
  constructor(
    property: string,
    parameterOrName: `params:${string}` | ServiceName,
    defaultValue?: ServiceName,
    optional: boolean = false
  ) {
    this.property = property;
    this.optional = optional;
    if (!defaultValue) {
      if (parameterOrName.startsWith("params:")) {
        this.parameter = parameterOrName.substring(7);
      } else {
        this.value = parameterOrName as ServiceName;
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
    getMetadata(service.constructor as any)?.["webda.inject"]?.forEach((injector: any) => {
      injector.resolve(service);
    });
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
 * TODO @webda/compiler could get all interfaces and ancestors classes to find the correct service
 */
export const Inject = createPropertyDecorator(
  (
    context: ClassFieldDecoratorContext<Service, Service>,
    parameterOrName?: string,
    defaultValue?: string | boolean,
    optional?: boolean
  ) => {
    context.metadata!["webda.inject"] ??= [];
    (context.metadata!["webda.inject"] as Injector[]).push(
      new Injector(
        context.name as string,
        (parameterOrName || (context.name as string)) as ServiceName,
        typeof defaultValue === "boolean" ? undefined : (defaultValue as ServiceName),
        typeof defaultValue === "boolean" ? defaultValue : optional
      )
    );
  }
);
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
   
  E extends AsyncEventUnknown = {}
> extends AbstractService<T, E> {
  /**
   * Service parameters
   */
  static Parameters = ServiceParameters;
  /**
   * Set the Webda events here
   */
  [WEBDA_EVENTS]: E;

  /**
   * Get the current state
   * @returns the result
   */
  getState(): ServiceStates {
    return State.getCurrentState(this) as ServiceStates;
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
   * @deprecated
   */
  computeParameters(): void {
    // Can be overriden by subclasses if needed
  }

  /**
   * Get the service parameters
   * @returns the result
   */
  getParameters(): T {
    return this.parameters;
  }

  /**
   * Shutdown the current service if action need to be taken
   */
  @ServiceState({ start: "stopping", end: "stopped" })
  async stop(): Promise<void> {
    // Nothing to do
  }

  /**
   * Return service representation
   * @returns the result
   */
  toString() {
    return this.parameters.type + "[" + this.name + "]";
  }

  /**
   * Resolve parameters
   * Call initRoutes and initBeanRoutes
   * @returns the result
   */
  @ServiceState({ start: "resolving", end: "resolved" })
  resolve(): this {
    this.initMetrics();
    // Inject dependencies
    Injector.resolveAll(this);

    // We wait for all services to be created before calling computeParameters
    this.computeParameters();

    this.loadCapabilities();
    this.initRoutes();
    this.initOperations();
    return this;
  }

  /**
   * Load capabilities from webda.module.json metadata into {@link _compiledCapabilities}.
   *
   * Called during {@link resolve} after dependency injection. Reads the service's
   * type name from parameters, looks it up in the application's module metadata
   * (moddas or beans section), and populates `_compiledCapabilities` with an
   * empty object for each declared capability name.
   *
   * Fails silently if the application is not available (e.g., in unit tests
   * where services are instantiated without a full application context).
   *
   * @example
   * ```typescript
   * // If webda.module.json contains:
   * // { "moddas": { "MyApp/HawkService": { "capabilities": ["request-filter", "cors-filter"] } } }
   * // Then after resolve(), this.getCapabilities() returns:
   * // { "request-filter": {}, "cors-filter": {} }
   * ```
   *
   * @see getCapabilities
   */
  protected loadCapabilities() {
    try {
      const app = useApplication();
      const modules = app.getModules();
      const type = this.parameters.type;
      const metadata = modules.moddas?.[type] || modules.beans?.[type];
      if (metadata?.capabilities) {
        this._compiledCapabilities = {};
        for (const cap of metadata.capabilities) {
          this._compiledCapabilities[cap] = {};
        }
      }
    } catch {
      // Application may not be available in tests
    }
  }

  /**
   * Init the metrics
   */
  initMetrics() {
    this.metrics = {};
  }

  /**
   * Get a service by name
   * @param name - the name to use
   * @returns the result map
   * @deprecated Use useService, might reconsider
   */
  getService<T extends ServiceName>(name: T): ServicesMap[T] {
    return useService(name);
  }

  /**
   * Add service name label
   * @param type - the type to look up
   * @param configuration - the configuration
   * @returns the result
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
   * @returns the list of results
   */
  getClientEvents(): string[] {
    return [];
  }

  /**
   * Authorize a public event subscription
   * @param event - the event name
   * @param context - the execution context
   * @param _event - the event name
   * @param _context - the execution context
   * @returns true if the condition is met
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
   * @param id - the identifier
   * @returns the result
   */
  getOperationId(id: string): string | undefined {
    return id;
  }

  /**
   * Add a route dynamicaly
   *
   * @param {String} url of the route can contains dynamic part like {uuid}
   * @param {Array[]} methods - the HTTP methods
   * @param {Function} executer Method to execute for this route
   * @param openapi - the OpenAPI specification
   * @param override - whether to override existing
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
    const router = useDynamicService<any>("Router");
    if (!router) {
      this.log("WARN", `No Router service available, skipping route ${finalUrl}`);
      return;
    }
    router.addRouteToRouter(finalUrl, {
      _method: executer.bind(this),
      executor: this.getName(),
      openapi: deepmerge(openapi, (<any>this.parameters).openapi || {}),
      methods,
      override
    });
  }

  /**
   * Return variables for replacement in openapi
   * @returns the result
   */
  getOpenApiReplacements(): any {
    return {};
  }

  /**
   * Init the routes
   * @deprecated
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
   * Init the operations from @Operation decorators on this service
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
      const operationId = j.includes(".") ? j : `${name}.${j}`;
      registerOperation(operationId, {
        ...operations[j],
        service: this.getName(),
        input: `${this.getName()}.${operations[j].method}.input`,
        output: `${this.getName()}.${operations[j].method}.output`,
        id: operationId
      });
    }
  }

  /**
   * Prevent service to be serialized
   * @returns the result
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
  @ServiceState({ start: "initializing", end: "running" })
  async init(): Promise<this> {
    // Can be overriden by subclasses if needed
    return this;
  }

  /**
   * Emit the event with data and wait for Promise to finish if listener returned a Promise
   * @param event - the event name
   * @param data - the data to process
   */
  async emit<Key extends keyof E>(event: Key, data: E[Key]): Promise<void> {
    await EventEmitterUtils.emit(this, event, data, (level: WorkerLogLevel, ...args: any[]) =>
      this.log(level, ...args)
    );
  }

  /**
   * Get service name
   * @returns the result string
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
   * @returns the result
   */
  ___cleanData(): Promise<void> {
    return Promise.resolve();
  }

  /**
   *
   * @param level to log
   * @param args - additional arguments
   */
  log(level: WorkerLogLevel, ...args: any[]) {
    // Add the service name to avoid confusion
    this.logger.log(level, `[${this.name}]`, ...args);
  }
}

export { Service };
