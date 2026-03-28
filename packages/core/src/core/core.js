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
import { deepmerge } from "deepmerge-ts";
import { BinaryService } from "../services/binary.js";
import { Model } from "@webda/models";
import * as WebdaError from "../errors/errors.js";
import { Store } from "../stores/store.js";
import { UnpackedApplication } from "../application/unpackedapplication.js";
import { Logger } from "../loggers/ilogger.js";
import { CancelablePromise, getUuid, State } from "@webda/utils";
import { emitCoreEvent } from "../events/events.js";
import { useInstanceStorage } from "./instancestorage.js";
import { useApplication, useModel, useModelId } from "../application/hooks.js";
import { InstanceCache } from "../cache/cache.js";
import { AsyncLocalStorage } from "node:async_hooks";
import * as jsondiffpatch from "jsondiffpatch";
const CoreState = (options) => State(options);
const depsDetector = new AsyncLocalStorage();
/**
 * This is the main class of the framework, it handles the routing, the services initialization and resolution
 *
 * @class Core
 * @category CoreFeatures
 */
let Core = (() => {
    var _a;
    let _instanceExtraInitializers = [];
    let _getModelStoreCached_decorators;
    let _getBinaryStoreCached_decorators;
    let _init_decorators;
    let _stop_decorators;
    return _a = class Core {
            /**
             * @params {Object} config - The configuration Object, if undefined will load the configuration file
             */
            constructor(application) {
                /**
                 * Webda Services
                 * @hidden
                 */
                this.services = (__runInitializers(this, _instanceExtraInitializers), {});
                /**
                 * Modda for services
                 * @hidden
                 */
                this.moddas = {};
                /**
                 * Contains all operations defined by services
                 */
                this.operations = {};
                /**
                 * Order of services initialization
                 */
                this.initOrders = [];
                /**
                 * Dependencies for each service
                 */
                this.dependencies = {};
                useInstanceStorage().core = this;
                /**
                 * SIGINT handler
                 */
                process.on("SIGINT", async () => {
                    console.log("Received SIGINT. Cancelling all interuptables.");
                    await Promise.all([...CancelablePromise.promises].map(p => p.cancel()));
                    await this.stop();
                    process.exit(0);
                });
                this.logger = new Logger(application.getWorkerOutput(), { class: "@webda/core" });
                this.application = application || new UnpackedApplication(".");
                // Load the configuration and migrate
                this.configuration = {};
                this.applicationConfiguration = this.application.getConfiguration();
                for (const [key, value] of Object.entries(this.applicationConfiguration.services)) {
                    try {
                        this.moddas[key] = this.application.getModda(value.type || key);
                    }
                    catch (err) {
                        this.log("ERROR", `Cannot load modda ${value.type || key} for service ${key}`, err);
                    }
                    this.configuration[key] = Object.freeze((this.moddas[key]?.filterParameters || (p => p))({
                        ...this.applicationConfiguration.parameters,
                        ...value
                    }));
                }
                if (this.applicationConfiguration.application?.configurationService &&
                    this.configuration[this.applicationConfiguration.application.configurationService]) {
                    this.configurationService = this.applicationConfiguration.application.configurationService;
                    // Freeze the configuration service parameters to avoid changes at runtime
                    Object.freeze(this.configuration[this.applicationConfiguration.application.configurationService]);
                }
            }
            /**
             * Get the configuration object
             * @returns {Configuration}
             */
            getConfiguration() {
                return this.configuration;
            }
            /**
             * Get the store assigned to this model
             * @param model
             * @returns
             */
            getModelStore(modelOrConstructor) {
                let model;
                if (typeof modelOrConstructor === "string") {
                    model = useModel(modelOrConstructor);
                }
                else {
                    model = (modelOrConstructor instanceof Model ? modelOrConstructor.constructor : modelOrConstructor);
                }
                if (!model) {
                    throw new WebdaError.CodeError("MODEL_NOT_FOUND", "Model not found");
                }
                return this.getModelStoreCached(model);
            }
            /**
             * Get the model store for a specific model
             * Leverage the Process cache
             *
             * @param model
             * @returns
             */
            getModelStoreCached(model) {
                // @ts-ignore
                const stores = useApplication().getImplementations(Store);
                let actualScore;
                let actualStore = this.getService(this.applicationConfiguration?.application?.configurationService || "Registry");
                for (const store in stores) {
                    const score = stores[store].handleModel(model);
                    // As 0 mean exact match we stop there
                    if (score === 0) {
                        return stores[store];
                    }
                    else if (score > 0 && (actualScore === undefined || actualScore > score)) {
                        actualScore = score;
                        actualStore = stores[store];
                    }
                }
                return actualStore;
            }
            /**
             * Get the service that manage a model
             * @param modelOrConstructor
             * @param attribute
             * @returns
             */
            getBinaryStore(modelOrConstructor, attribute) {
                return this.getBinaryStoreCached(typeof modelOrConstructor === "string" ? modelOrConstructor : useModelId(modelOrConstructor), attribute);
            }
            getBinaryStoreCached(model, attribute) {
                const binaries = useApplication().getImplementations(BinaryService);
                let actualScore = -1;
                let actualService;
                for (const binary in binaries) {
                    const score = binaries[binary].handleBinary(model, attribute);
                    // As 0 mean exact match we stop there
                    if (score === 2) {
                        return binaries[binary];
                    }
                    else if (score >= 0 && (actualService === undefined || actualScore > score)) {
                        actualScore = score;
                        actualService = binaries[binary];
                    }
                }
                if (!actualService) {
                    throw new Error("No binary store found for " + model + " " + attribute);
                }
                return actualService;
            }
            /**
             * Return Core instance id
             *
             * It is a random generated string
             */
            getInstanceId() {
                this.instanceId ?? (this.instanceId = getUuid());
                return this.instanceId;
            }
            /**
             * Get absolute url with subpath
             * @param subpath
             */
            getApiUrl(subpath = "") {
                if (subpath.length > 0 && !subpath.startsWith("/")) {
                    subpath = "/" + subpath;
                }
                return this.configuration.parameters.apiUrl + subpath;
            }
            /**
             * Init one service
             * @param service
             */
            async initService(service) {
                try {
                    this.log("TRACE", "Initializing service", service);
                    const start = Date.now();
                    await this.services[service].init();
                    const duration = Date.now() - start;
                    if (duration > 1000) {
                        this.log("WARN", `Service ${service} initialization took ${duration}ms`);
                    }
                    else {
                        this.log("DEBUG", `Service ${service} initialized in ${duration}ms`);
                    }
                }
                catch (err) {
                    this.log("ERROR", "Init service " + service + " failed: " + err.message);
                    this.log("TRACE", err.stack);
                }
            }
            /**
             * Init Webda
             *
             * It will resolve Services init method and autolink
             */
            async init() {
                // Create services
                // First create the configuration service if defined
                const initOrders = [];
                if (this.configurationService) {
                    const service = this.createService(this.configurationService);
                    if (!service) {
                        throw new Error(`Cannot create configuration service ${this.configurationService}`);
                    }
                    // Will update the configuration
                    await service.bootstrap(this);
                    this.getService(this.configurationService);
                    initOrders.push(...this.initOrders);
                    if (!initOrders.includes(this.configurationService)) {
                        initOrders.push(this.configurationService);
                    }
                    this.initOrders = [];
                    // Init all services defined in configuration
                    for (const service of initOrders) {
                        await this.initService(service);
                    }
                }
                // Create all services defined in configuration
                for (const service in this.configuration) {
                    this.getService(service);
                }
                this.initOrders = this.initOrders.filter(s => !initOrders.includes(s) && this.services[s]);
                // Ensure stores are initialized first
                this.initOrders.sort((a, b) => {
                    if (this.services[a] instanceof Store && !(this.services[b] instanceof Store)) {
                        return -1;
                    }
                    else if (!(this.services[a] instanceof Store) && this.services[b] instanceof Store) {
                        return 1;
                    }
                    return 0;
                });
                this.log("DEBUG", "Services init order", [...initOrders, ...this.initOrders]);
                for (const service of this.initOrders) {
                    await this.initService(service);
                }
                await emitCoreEvent("Webda.Init.Services", this.services);
            }
            /**
             * Return webda current version
             *
             * @returns package version
             * @since 0.4.0
             */
            getVersion() {
                return useApplication().getWebdaVersion();
            }
            /**
             * To define the locales just add a locales: ['en-GB', 'fr-FR'] in your host global configuration
             *
             * @return The configured locales or "en-GB" if none are defined
             */
            getLocales() {
                if (!this.configuration || !this.configuration.parameters.locales) {
                    return ["en-GB"];
                }
                return this.configuration.parameters.locales;
            }
            /**
             * Check for a service name and return the wanted singleton or undefined if none found
             *
             * @param {String} name The service name to retrieve
             */
            getService(name = "") {
                var _b;
                depsDetector.getStore()?.add(name);
                // If not defined yet, create it and add it to the init order
                if (this.services[name] === undefined) {
                    (_b = this.dependencies)[name] ?? (_b[name] = new Set());
                    depsDetector.run(this.dependencies[name], () => {
                        this.services[name] = this.createService(name)?.resolve();
                    });
                    this.initOrders.push(name);
                }
                return this.services[name];
            }
            /**
             * Return a map of defined services
             * @returns {{}}
             */
            getServices() {
                return this.services;
            }
            /**
             * Return if Webda is in debug mode
             */
            isDebug() {
                return false;
            }
            /**
             * Log a message
             * @param level
             * @param args
             */
            log(level, ...args) {
                this.logger.log(level, ...args);
            }
            /**
             * Update the configuration with new values
             * @param updates
             */
            updateConfiguration(updates) {
                updates.services ?? (updates.services = {});
                updates.parameters ?? (updates.parameters = {});
                const configuration = this.applicationConfiguration;
                const newConfiguration = {};
                for (const key in updates.services) {
                    if (!this.configuration[key]) {
                        delete updates.services[key];
                        this.log("WARN", `Cannot update configuration for unknown service ${key}`);
                        continue;
                    }
                    if (updates.services[key].type && updates.services[key].type !== this.configuration[key].type) {
                        delete updates.services[key];
                        this.log("WARN", `Cannot update type for service ${key}`);
                        continue;
                    }
                    newConfiguration[key] = (this.moddas[key].filterParameters || (p => p))(deepmerge(configuration.parameters, updates.parameters, configuration[key], updates.services[key]));
                }
                for (const key in this.configuration) {
                    newConfiguration[key] = (this.moddas[key]?.filterParameters || (p => p))(deepmerge(configuration.parameters || {}, updates.parameters || {}, configuration.services[key] || {}, updates.services[key] || {}));
                    newConfiguration[key].type = this.configuration[key].type;
                }
                Object.freeze(newConfiguration);
                const delta = jsondiffpatch.diff(this.configuration, newConfiguration);
                if (!delta) {
                    this.log("DEBUG", "No configuration changes");
                    return;
                }
                emitCoreEvent("Webda.Configuration.Applying", { configuration: newConfiguration, delta });
                for (const service in this.services) {
                    if (delta[service]) {
                        this.log("DEBUG", `Updating ${service} due to configuration change`);
                        this.services[service]?.parameters.load(newConfiguration[service]);
                    }
                }
                // Update the configuration
                this.configuration = newConfiguration;
                emitCoreEvent("Webda.Configuration.Applied", { configuration: newConfiguration, delta });
            }
            /**
             * Create a specific service
             * @param service
             * @returns
             */
            createService(service) {
                const serviceConstructor = this.moddas[service];
                if (!serviceConstructor) {
                    this.log("ERROR", `Create service ${service}(${this.configuration[service]?.type}) failed: unknown type`);
                    return;
                }
                try {
                    this.log("TRACE", "Constructing service", service);
                    this.services[service] = new serviceConstructor(service, serviceConstructor.createConfiguration(this.configuration[service]));
                }
                catch (err) {
                    this.log("ERROR", "Cannot create service", service, err);
                }
                return this.services[service];
            }
            /**
             * Get application beans
             * @returns
             */
            getBeans() {
                // @ts-ignore
                return process.webdaBeans || {};
            }
            /**
             * Stop all services
             */
            async stop() {
                const services = this.getServices();
                await Promise.all([
                    // Stop all interuptables
                    ...[...useInstanceStorage().interruptables.values()].map(i => i.cancel()),
                    // Stop all services
                    ...Object.keys(services).map(async (s) => {
                        try {
                            await services[s]?.stop();
                        }
                        catch (err) {
                            this.log("ERROR", `Cannot stop service ${s}`, err);
                        }
                    })
                ]);
            }
            /**
             * Allow serialization
             */
            toJSON() {
                return {
                    configuration: this.configuration,
                    application: this.application
                };
            }
            static deserialize(json) {
                const core = new _a();
                if (json.configuration) {
                    core.configuration = json.configuration;
                }
                return core;
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _getModelStoreCached_decorators = [InstanceCache()];
            _getBinaryStoreCached_decorators = [InstanceCache()];
            _init_decorators = [CoreState({ start: "initializing", end: "ready" }), InstanceCache()];
            _stop_decorators = [CoreState({ start: "stopping", end: "stopped" })];
            __esDecorate(_a, null, _getModelStoreCached_decorators, { kind: "method", name: "getModelStoreCached", static: false, private: false, access: { has: obj => "getModelStoreCached" in obj, get: obj => obj.getModelStoreCached }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _getBinaryStoreCached_decorators, { kind: "method", name: "getBinaryStoreCached", static: false, private: false, access: { has: obj => "getBinaryStoreCached" in obj, get: obj => obj.getBinaryStoreCached }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _init_decorators, { kind: "method", name: "init", static: false, private: false, access: { has: obj => "init" in obj, get: obj => obj.init }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, _stop_decorators, { kind: "method", name: "stop", static: false, private: false, access: { has: obj => "stop" in obj, get: obj => obj.stop }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { Core };
//# sourceMappingURL=core.js.map