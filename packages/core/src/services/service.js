var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { EventEmitterUtils } from "../events/asynceventemitter.js";
import { createPropertyDecorator } from "@webda/tsc-esm";
import { useMetric } from "../metrics/metrics.js";
import { ServiceParameters } from "./serviceparameters.js";
import { useService } from "../core/hooks.js";
import { AbstractService } from "../core/icore.js";
import { useLogger } from "../loggers/hooks.js";
import { WEBDA_EVENTS } from "@webda/models";
import { State } from "@webda/utils";
import { ServiceState } from "./iservice.js";
import { getMetadata } from "@webda/decorators";
/**
 * Represent a Inject annotation
 *
 * @see Inject
 */
class Injector {
    /**
     * @param property annotated
     * @param parameterOrName to inject from
     * @param defaultValue in case of a parameter
     * @param optional if set to true, won't throw an error if not found
     */
    constructor(property, parameterOrName, defaultValue, optional = false) {
        this.property = property;
        this.optional = optional;
        if (!defaultValue) {
            if (parameterOrName.startsWith("params:")) {
                this.parameter = parameterOrName.substring(7);
            }
            else {
                this.value = parameterOrName;
            }
        }
        else {
            this.value = defaultValue;
            this.parameter = parameterOrName;
        }
    }
    /**
     * Resolve the current Inject annotation inside the service
     *
     * @param service to resolve
     */
    resolve(service) {
        let name = this.value;
        if (this.parameter) {
            name = service.getParameters()[this.parameter] || this.value;
        }
        service[this.property] = useService(name);
        if (!service[this.property] && !this.optional) {
            if (this.parameter) {
                throw new Error(`Injector did not found bean '${name}'(parameter:${this.parameter}) for '${service.getName()}'`);
            }
            throw new Error(`Injector did not found bean '${name}' for '${service.getName()}'`);
        }
    }
    /**
     * Inject all annotated dependencies to the current service
     *
     * @param service to inject to
     */
    static resolveAll(service) {
        getMetadata(service.constructor)?.["webda.inject"]?.forEach((injector) => {
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
export const Inject = createPropertyDecorator((context, parameterOrName, defaultValue, optional) => {
    var _a;
    (_a = context.metadata)["webda.inject"] ?? (_a["webda.inject"] = []);
    context.metadata["webda.inject"].push(new Injector(context.name, (parameterOrName || context.name), typeof defaultValue === "boolean" ? undefined : defaultValue, typeof defaultValue === "boolean" ? defaultValue : optional));
});
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
let Service = (() => {
    var _a, _b;
    let _classSuper = AbstractService;
    let _instanceExtraInitializers = [];
    let _stop_decorators;
    let _resolve_decorators;
    let _init_decorators;
    return _a = class Service extends _classSuper {
            /**
             * Get the current state
             */
            getState() {
                return State.getCurrentState(this);
            }
            /**
             *
             *
             * @class Service
             * @param {Webda} webda - The main instance of Webda
             * @param {String} name - The name of the service
             * @param {Object} params - The parameters block define in the configuration file
             */
            constructor(name, params) {
                super(name, params);
                /**
                 * Set the Webda events here
                 */
                this[_b] = __runInitializers(this, _instanceExtraInitializers);
                this.logger = useLogger(this);
            }
            /**
             * Used to compute or derivate input parameter to attribute
             * @deprecated
             */
            computeParameters() {
                // Can be overriden by subclasses if needed
            }
            /**
             * Get the service parameters
             */
            getParameters() {
                return this.parameters;
            }
            /**
             * Shutdown the current service if action need to be taken
             */
            async stop() {
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
            resolve() {
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
            getService(name) {
                return useService(name);
            }
            /**
             * Add service name label
             * @param type
             * @param configuration
             * @returns
             */
            getMetric(type, configuration) {
                configuration.labelNames ?? (configuration.labelNames = []);
                configuration.labelNames = [...configuration.labelNames, "service"];
                configuration.name = `${this.getName().toLowerCase()}_${configuration.name}`;
                return useMetric(type, configuration);
            }
            /**
             * Return the events that an external system can subscribe to
             *
             * @returns
             */
            getClientEvents() {
                return [];
            }
            /**
             * Authorize a public event subscription
             * @param event
             * @param context
             */
            authorizeClientEvent(_event, _context) {
                return false;
            }
            /**
             * Return the full path url based on parameters
             *
             * @param url relative url to service
             * @param _methods in case we need filtering (like Store)
             * @returns absolute url or undefined if need to skip the Route
             */
            getUrl(url, _methods) {
                const { url: ServiceUrl } = this.parameters;
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
            getOperationId(id) {
                return id;
            }
            /**
             * Add a route dynamicaly
             *
             * @param {String} url of the route can contains dynamic part like {uuid}
             * @param {Array[]} methods
             * @param {Function} executer Method to execute for this route
             */
            addRoute(url, methods, executer, openapi = {}, override = false) {
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
            getOpenApiReplacements() {
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
             * Init the operations
             */
            initOperations() {
                // @ts-ignore
                const operations = this.constructor.operations || {};
                for (const j in operations) {
                    const id = this.getOperationId(j);
                    if (!id)
                        continue;
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
            async init() {
                // Can be overriden by subclasses if needed
                return this;
            }
            /**
             * Emit the event with data and wait for Promise to finish if listener returned a Promise
             */
            async emit(event, data) {
                await EventEmitterUtils.emit(this, event, data, (level, ...args) => this.log(level, ...args));
            }
            /**
             * Get service name
             */
            getName() {
                return this.name;
            }
            /**
             * Clean the service data, can only be used in test mode
             *
             * @abstract
             */
            __clean() {
                // @ts-ignore
                if (typeof global.it !== "function") {
                    throw Error("Only for test purpose");
                }
                return this.___cleanData();
            }
            /**
             * @private
             */
            ___cleanData() {
                return Promise.resolve();
            }
            /**
             *
             * @param level to log
             * @param args
             */
            log(level, ...args) {
                // Add the service name to avoid confusion
                this.logger.log(level, `[${this.name}]`, ...args);
            }
        },
        _b = WEBDA_EVENTS,
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _stop_decorators = [ServiceState({ start: "stopping", end: "stopped" })];
            _resolve_decorators = [ServiceState({ start: "resolving", end: "resolved" })];
            _init_decorators = [ServiceState({ start: "initializing", end: "running" })];
            __esDecorate(_a, null, _stop_decorators, { kind: "method", name: "stop", static: false, private: false, access: { has: obj => "stop" in obj, get: obj => obj.stop }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _resolve_decorators, { kind: "method", name: "resolve", static: false, private: false, access: { has: obj => "resolve" in obj, get: obj => obj.resolve }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _init_decorators, { kind: "method", name: "init", static: false, private: false, access: { has: obj => "init" in obj, get: obj => obj.init }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        /**
         * Service parameters
         */
        _a.Parameters = ServiceParameters,
        _a;
})();
export { Service };
//# sourceMappingURL=service.js.map