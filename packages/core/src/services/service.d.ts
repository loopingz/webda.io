import type { WorkerLogLevel } from "@webda/workout";
import { AsyncEventUnknown } from "../events/asynceventemitter.js";
import type { OpenAPIWebdaDefinition } from "../rest/irest.js";
import type { HttpMethodType } from "../contexts/httpcontext.js";
import { CustomConstructor } from "@webda/tsc-esm";
import { type Counter, type Gauge, type Histogram, type MetricConfiguration } from "../metrics/metrics.js";
import type { Logger } from "../loggers/ilogger.js";
import type { OperationContext } from "../contexts/operationcontext.js";
import { ServiceParameters } from "./serviceparameters.js";
import { ServiceName, ServicesMap } from "../core/hooks.js";
import { AbstractService } from "../core/icore.js";
import { WEBDA_EVENTS } from "@webda/models";
import { ServiceStates } from "./iservice.js";
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
export declare const Inject: {
    (initialValue: undefined, context: ClassFieldDecoratorContext<Service<ServiceParameters, {}>, Service<ServiceParameters, {}>>): void;
    (parameterOrName?: string, defaultValue?: string | boolean, optional?: boolean): (initialValue: undefined, context: ClassFieldDecoratorContext<Service<ServiceParameters, {}>, Service<ServiceParameters, {}>>) => void;
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
declare abstract class Service<T extends ServiceParameters = ServiceParameters, E extends AsyncEventUnknown = {}> extends AbstractService<T, E> {
    /**
     * Service parameters
     */
    static Parameters: typeof ServiceParameters;
    /**
     * Set the Webda events here
     */
    [WEBDA_EVENTS]: E;
    /**
     * Get the current state
     */
    getState(): ServiceStates;
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
    constructor(name: string, params: T);
    /**
     * Used to compute or derivate input parameter to attribute
     * @deprecated
     */
    computeParameters(): void;
    /**
     * Get the service parameters
     */
    getParameters(): T;
    /**
     * Shutdown the current service if action need to be taken
     */
    stop(): Promise<void>;
    /**
     * Return service representation
     */
    toString(): string;
    /**
     * Resolve parameters
     * Call initRoutes and initBeanRoutes
     */
    resolve(): this;
    /**
     * Init the metrics
     */
    initMetrics(): void;
    /**
     * Get a service by name
     * @param name
     * @returns
     * @deprecated Use useService, might reconsider
     */
    getService<T extends ServiceName>(name: T): ServicesMap[T];
    /**
     * Add service name label
     * @param type
     * @param configuration
     * @returns
     */
    getMetric<T = Gauge | Counter | Histogram>(type: CustomConstructor<T, [MetricConfiguration<T>]>, configuration: MetricConfiguration<T>): T;
    /**
     * Return the events that an external system can subscribe to
     *
     * @returns
     */
    getClientEvents(): string[];
    /**
     * Authorize a public event subscription
     * @param event
     * @param context
     */
    authorizeClientEvent(_event: string, _context: OperationContext): boolean;
    /**
     * Return the full path url based on parameters
     *
     * @param url relative url to service
     * @param _methods in case we need filtering (like Store)
     * @returns absolute url or undefined if need to skip the Route
     */
    getUrl(url: string, _methods: HttpMethodType[]): string;
    /**
     * If undefined is returned it cancel the operation registration
     * @param id
     * @returns
     */
    getOperationId(id: string): string | undefined;
    /**
     * Add a route dynamicaly
     *
     * @param {String} url of the route can contains dynamic part like {uuid}
     * @param {Array[]} methods
     * @param {Function} executer Method to execute for this route
     */
    protected addRoute(url: string, methods: HttpMethodType[], executer: Function, openapi?: OpenAPIWebdaDefinition, override?: boolean): void;
    /**
     * Return variables for replacement in openapi
     * @returns
     */
    getOpenApiReplacements(): any;
    /**
     * Init the routes
     * @deprecated
     */
    initRoutes(): void;
    /**
     * Init the operations
     */
    initOperations(): void;
    /**
     * Prevent service to be serialized
     * @returns
     */
    toJSON(): string;
    /**
     * Will be called after all the Services are created
     *
     * @param config for the host so you can add your own route here
     * @abstract
     */
    init(): Promise<this>;
    /**
     * Emit the event with data and wait for Promise to finish if listener returned a Promise
     */
    emit<Key extends keyof E>(event: Key, data: E[Key]): Promise<void>;
    /**
     * Get service name
     */
    getName(): string;
    /**
     * Clean the service data, can only be used in test mode
     *
     * @abstract
     */
    __clean(): Promise<void>;
    /**
     * @private
     */
    ___cleanData(): Promise<void>;
    /**
     *
     * @param level to log
     * @param args
     */
    log(level: WorkerLogLevel, ...args: any[]): void;
}
export { Service };
//# sourceMappingURL=service.d.ts.map