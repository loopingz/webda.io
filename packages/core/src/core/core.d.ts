import { WorkerLogLevel } from "@webda/workout";
import { Application } from "../application/application.js";
import { Configuration } from "../application/iconfiguration.js";
import { BinaryService } from "../services/binary.js";
import { Model, ModelClass } from "@webda/models";
import { Store } from "../stores/store.js";
import { Logger } from "../loggers/ilogger.js";
import { ICore, AbstractService, OperationDefinitionInfo } from "./icore.js";
import { Modda } from "../services/iservice.js";
import { CustomConstructor } from "@webda/tsc-esm";
export type CoreStates = "initial" | "loading" | "initializing" | "reinitializing" | "ready" | "stopping" | "stopped";
/**
 * This is the main class of the framework, it handles the routing, the services initialization and resolution
 *
 * @class Core
 * @category CoreFeatures
 */
export declare class Core implements ICore {
    /**
     * Webda Services
     * @hidden
     */
    protected services: Record<string, AbstractService>;
    /**
     * Modda for services
     * @hidden
     */
    protected moddas: Record<string, Modda>;
    /**
     * Application that generates this Core
     */
    protected application: Application;
    /**
     * Configuration loaded from webda.config.json
     * @hidden
     */
    protected configuration: Record<string, any>;
    /**
     * Console logger
     * @hidden
     */
    protected logger: Logger;
    /**
     * Store the instance id
     */
    private instanceId;
    /**
     * Contains all operations defined by services
     */
    protected operations: {
        [key: string]: OperationDefinitionInfo;
    };
    /**
     * Order of services initialization
     */
    initOrders: string[];
    /**
     * Dependencies for each service
     */
    dependencies: Record<string, Set<string>>;
    /**
     * Configuration service name
     */
    configurationService?: string;
    applicationConfiguration: Configuration;
    /**
     * @params {Object} config - The configuration Object, if undefined will load the configuration file
     */
    constructor(application?: Application);
    /**
     * Get the configuration object
     * @returns {Configuration}
     */
    getConfiguration(): Record<string, any>;
    /**
     * Get the store assigned to this model
     * @param model
     * @returns
     */
    getModelStore<T extends Model>(modelOrConstructor: CustomConstructor<T> | T | string): Store;
    /**
     * Get the model store for a specific model
     * Leverage the Process cache
     *
     * @param model
     * @returns
     */
    private getModelStoreCached;
    /**
     * Get the service that manage a model
     * @param modelOrConstructor
     * @param attribute
     * @returns
     */
    getBinaryStore<T extends Model>(modelOrConstructor: ModelClass<T> | T | string, attribute: string): AbstractService;
    protected getBinaryStoreCached<T extends Model>(model: string, attribute: string): BinaryService;
    /**
     * Return Core instance id
     *
     * It is a random generated string
     */
    getInstanceId(): string;
    /**
     * Get absolute url with subpath
     * @param subpath
     */
    getApiUrl(subpath?: string): string;
    /**
     * Init one service
     * @param service
     */
    protected initService(service: string): Promise<void>;
    /**
     * Init Webda
     *
     * It will resolve Services init method and autolink
     */
    init(): Promise<void>;
    /**
     * Return webda current version
     *
     * @returns package version
     * @since 0.4.0
     */
    getVersion(): string;
    /**
     * To define the locales just add a locales: ['en-GB', 'fr-FR'] in your host global configuration
     *
     * @return The configured locales or "en-GB" if none are defined
     */
    getLocales(): string[];
    /**
     * Check for a service name and return the wanted singleton or undefined if none found
     *
     * @param {String} name The service name to retrieve
     */
    getService<T = AbstractService>(name?: string): T;
    /**
     * Return a map of defined services
     * @returns {{}}
     */
    getServices(): {
        [key: string]: AbstractService;
    };
    /**
     * Return if Webda is in debug mode
     */
    isDebug(): boolean;
    /**
     * Log a message
     * @param level
     * @param args
     */
    log(level: WorkerLogLevel, ...args: any[]): void;
    /**
     * Update the configuration with new values
     * @param updates
     */
    updateConfiguration(updates: any): void;
    /**
     * Create a specific service
     * @param service
     * @returns
     */
    protected createService(service: string): AbstractService<import("../index.js").ServiceParameters, {}>;
    /**
     * Get application beans
     * @returns
     */
    getBeans(): any;
    /**
     * Stop all services
     */
    stop(): Promise<void>;
    /**
     * Allow serialization
     */
    toJSON(): {
        configuration: Record<string, any>;
        application: Application;
    };
    static deserialize(json: any): Core;
}
//# sourceMappingURL=core.d.ts.map