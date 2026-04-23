import { WorkerLogLevel } from "@webda/workout";
import { deepmerge } from "deepmerge-ts";
import type { Application } from "../application/application.js";
import { UnpackedApplication } from "../application/unpackedapplication.js";
import { Configuration } from "../application/iconfiguration.js";
import { BinaryService } from "../services/binary.js";
import { Model, type ModelClass } from "@webda/models";
import * as WebdaError from "../errors/errors.js";
import { Store } from "../stores/store.js";
import { Logger } from "../loggers/ilogger.js";
import { CancelablePromise, getUuid, State, StateOptions } from "@webda/utils";
import { ICore, AbstractService, OperationDefinitionInfo } from "./icore.js";
import { emitCoreEvent } from "../events/events.js";
import { useInstanceStorage } from "./instancestorage.js";
import { useApplication, useModel, useModelId } from "../application/hooks.js";
import { Modda } from "../services/iservice.js";
import { InstanceCache } from "../cache/cache.js";
import { CustomConstructor } from "@webda/tsc-esm";
import { AsyncLocalStorage } from "node:async_hooks";
import * as jsondiffpatch from "jsondiffpatch";
import { ConfigurationService } from "../configurations/configuration.js";

export type CoreStates =
  | "initial"
  | "loading"
  | "resolving"
  | "resolved"
  | "initializing"
  | "reinitializing"
  | "ready"
  | "stopping"
  | "stopped";

const CoreState = (options: StateOptions<CoreStates>) => State(options);

const depsDetector = new AsyncLocalStorage<Set<string>>();

/**
 * This is the main class of the framework, it handles the routing, the services initialization and resolution
 *
 * @class Core
 * @category CoreFeatures
 */
export class Core implements ICore {
  /**
   * Webda Services
   * @hidden
   */
  protected services: Record<string, AbstractService> = {};
  /**
   * Modda for services
   * @hidden
   */
  protected moddas: Record<string, Modda> = {};
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
  private instanceId: string;
  /**
   * Contains all operations defined by services
   */
  protected operations: { [key: string]: OperationDefinitionInfo } = {};
  /**
   * Order of services initialization
   */
  initOrders: string[] = [];
  /**
   * Dependencies for each service
   */
  dependencies: Record<string, Set<string>> = {};
  /**
   * Configuration service name
   */
  configurationService?: string;
  applicationConfiguration: Configuration;

  /**
   * Create a new Core
   * @param application - the application instance
   */
  constructor(application?: Application) {
    useInstanceStorage().core = this;
    this.logger = new Logger(application.getWorkerOutput(), { class: "@webda/core" });
    this.application = application || new UnpackedApplication(".");

    // Load the configuration and migrate
    this.configuration = {};
    this.applicationConfiguration = this.application.getConfiguration();
    for (const [key, value] of Object.entries(this.applicationConfiguration.services)) {
      try {
        this.moddas[key] = this.application.getModda(value.type || key);
      } catch (err) {
        this.log("ERROR", `Cannot load modda ${value.type || key} for service ${key}`, err);
      }
      this.configuration[key] = Object.freeze(
        (this.moddas[key]?.filterParameters || (p => p))({
          ...this.applicationConfiguration.parameters,
          ...(value as object)
        })
      );
    }
    if (
      this.applicationConfiguration.application?.configurationService &&
      this.configuration[this.applicationConfiguration.application.configurationService]
    ) {
      this.configurationService = this.applicationConfiguration.application.configurationService;
      // Freeze the configuration service parameters to avoid changes at runtime
      Object.freeze(this.configuration[this.applicationConfiguration.application.configurationService]);
    }
  }

  /**
   * Get the configuration object
   * @returns {Configuration} the result
   */
  getConfiguration() {
    return this.configuration;
  }

  /**
   * Get the store assigned to this model
   * @param model - the model to use
   * @param modelOrConstructor - the model or its constructor
   * @returns the result
   */
  getModelStore<T extends Model>(modelOrConstructor: CustomConstructor<T> | T | string): Store {
    let model: ModelClass<T>;
    if (typeof modelOrConstructor === "string") {
      model = useModel<T>(modelOrConstructor);
    } else {
      model = <ModelClass<T>>(
        (<any>(modelOrConstructor instanceof Model ? modelOrConstructor.constructor : modelOrConstructor))
      );
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
   * @param model - the model to use
   * @returns the result
   */
  @InstanceCache()
  private getModelStoreCached<T extends Model>(model: ModelClass<T>): Store {
    // @ts-ignore
    const stores: { [key: string]: Store } = useApplication().getImplementations(Store);
    let actualScore: number;

    let actualStore: Store = this.getService(
      this.applicationConfiguration?.application?.configurationService || "Registry"
    );
    for (const store in stores) {
      const score = stores[store].handleModel(model);
      // As 0 mean exact match we stop there
      if (score === 0) {
        return <Store>stores[store];
      } else if (score > 0 && (actualScore === undefined || actualScore > score)) {
        actualScore = score;
        actualStore = stores[store];
      }
    }
    return <Store>actualStore;
  }

  /**
   * Get the service that manage a model
   * @param modelOrConstructor - the model or its constructor
   * @param attribute - the attribute name
   * @returns the result
   */
  getBinaryStore<T extends Model>(modelOrConstructor: ModelClass<T> | T | string, attribute: string): AbstractService {
    return this.getBinaryStoreCached(
      typeof modelOrConstructor === "string" ? modelOrConstructor : useModelId(modelOrConstructor),
      attribute
    );
  }

  /**
   * Find the best matching BinaryService for a given model and attribute, with caching
   * @param model - the model to use
   * @param attribute - the attribute name
   * @returns the result
   */
  @InstanceCache()
  protected getBinaryStoreCached<T extends Model>(model: string, attribute: string): BinaryService {
    const binaries: { [key: string]: BinaryService } = <any>useApplication().getImplementations(<any>BinaryService);
    let actualScore: number = -1;
    let actualService: BinaryService;
    for (const binary in binaries) {
      const score = binaries[binary].handleBinary(model, attribute);
      // As 0 mean exact match we stop there
      if (score === 2) {
        return binaries[binary];
      } else if (score >= 0 && (actualService === undefined || actualScore > score)) {
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
   * @returns the result string
   */
  getInstanceId(): string {
    this.instanceId ??= getUuid();
    return this.instanceId;
  }

  /**
   * Get absolute url with subpath
   * @param subpath - the subpath to append
   * @returns the result string
   */
  getApiUrl(subpath: string = ""): string {
    if (subpath.length > 0 && !subpath.startsWith("/")) {
      subpath = "/" + subpath;
    }
    return this.configuration.parameters.apiUrl + subpath;
  }

  /**
   * Init one service
   * @param service - the service instance
   */
  protected async initService(service: string) {
    try {
      this.log("TRACE", "Initializing service", service);
      const start = Date.now();
      await this.services[service].init();
      const duration = Date.now() - start;
      if (duration > 1000) {
        this.log("WARN", `Service ${service} initialization took ${duration}ms`);
      } else {
        this.log("DEBUG", `Service ${service} initialized in ${duration}ms`);
      }
    } catch (err) {
      this.log("ERROR", "Init service " + service + " failed: " + err.message);
      this.log("TRACE", err.stack);
    }
  }

  /**
   * Resolve services and their dependencies WITHOUT calling service.init().
   *
   * After this completes:
   * - All services declared in configuration are constructed.
   * - Each service's `resolve()` has been called (via createService / bean registration).
   * - `this.initOrders` is finalized (Store services first).
   * - The configuration service (if any) has been fully initialized — it must run
   *   early so other services can read config during construction.
   *
   * No non-configuration service.init() calls — no DB/network I/O is performed.
   * Build-time hooks (`@BuildCommand`) run after this phase.
   */
  @CoreState({ start: "resolving", end: "resolved" })
  @InstanceCache()
  async resolve() {
    // Create services
    // First create the configuration service if defined
    const initOrders = [];
    if (this.configurationService) {
      const service = this.createService(this.configurationService) as ConfigurationService;
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
      // The configuration service's init() must run now — downstream service
      // construction reads updated config values from it.
      for (const service of initOrders) {
        await this.initService(service);
      }
    }
    // Create all services defined in configuration
    for (const service in this.configuration) {
      this.getService(service);
    }
    // Auto-register application beans as services
    this.registerBeans();
    this.initOrders = this.initOrders.filter(s => !initOrders.includes(s) && this.services[s]);
    // Ensure stores are initialized first
    this.initOrders.sort((a, b) => {
      if (this.services[a] instanceof Store && !(this.services[b] instanceof Store)) {
        return -1;
      } else if (!(this.services[a] instanceof Store) && this.services[b] instanceof Store) {
        return 1;
      }
      return 0;
    });
    this.log("DEBUG", "Services init order", [...initOrders, ...this.initOrders]);
  }

  /**
   * Init Webda
   *
   * It will resolve Services init method and autolink.
   *
   * Delegates to {@link resolve} for service creation + resolve, then calls
   * `init()` on every remaining non-configuration service.
   */
  @CoreState({ start: "initializing", end: "ready" })
  @InstanceCache()
  async init() {
    await this.resolve();
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
  getVersion(): string {
    return useApplication().getWebdaVersion();
  }

  /**
   * To define the locales just add a locales: ['en-GB', 'fr-FR'] in your host global configuration
   *
   * @return The configured locales or "en-GB" if none are defined
   * @returns the list of results
   */
  getLocales(): string[] {
    if (!this.configuration || !this.configuration.parameters.locales) {
      return ["en-GB"];
    }
    return this.configuration.parameters.locales;
  }

  /**
   * Check for a service name and return the wanted singleton or undefined if none found
   *
   * @param {String} name The service name to retrieve
   * @returns the result
   */
  getService<T = AbstractService>(name: string = ""): T {
    depsDetector.getStore()?.add(name);
    // If not defined yet, create it and add it to the init order
    if (this.services[name] === undefined) {
      this.dependencies[name] ??= new Set<string>();
      depsDetector.run(this.dependencies[name], () => {
        this.services[name] = this.createService(name)?.resolve();
      });
      this.initOrders.push(name);
    }
    return <T>this.services[name];
  }

  /**
   * Return a map of defined services
   * @returns {{}} the map of services
   */
  getServices(): { [key: string]: AbstractService } {
    return this.services;
  }
  /**
   * Return if Webda is in debug mode
   * @returns true if the condition is met
   */
  public isDebug(): boolean {
    return false;
  }

  /**
   * Log a message
   * @param level - the log level
   * @param args - additional arguments
   */
  log(level: WorkerLogLevel, ...args: any[]) {
    this.logger.log(level, ...args);
  }

  /**
   * Update the configuration with new values
   * @param updates - the updates to apply
   */
  updateConfiguration(updates: any) {
    updates.services ??= {};
    updates.parameters ??= {};
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
      newConfiguration[key] = (this.moddas[key]?.filterParameters || (p => p))(
        deepmerge(configuration.parameters, updates.parameters, configuration[key], updates.services[key])
      );
    }
    for (const key in this.configuration) {
      newConfiguration[key] = (this.moddas[key]?.filterParameters || (p => p))(
        deepmerge(
          configuration.parameters || {},
          updates.parameters || {},
          configuration.services[key] || {},
          updates.services[key] || {}
        )
      );
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
   * @param service - the service instance
   * @returns the result
   */
  protected createService(service: string) {
    const serviceConstructor = this.moddas[service];
    if (!serviceConstructor) {
      this.log("ERROR", `Create service ${service}(${this.configuration[service]?.type}) failed: unknown type`);
      return;
    }
    try {
      this.log("TRACE", "Constructing service", service);
      const params = serviceConstructor.createConfiguration
        ? serviceConstructor.createConfiguration(this.configuration[service])
        : this.configuration[service];
      this.services[service] = new serviceConstructor(service, params);
    } catch (err) {
      this.log("ERROR", "Cannot create service", service, err.message || err);
    }
    return this.services[service];
  }

  /**
   * Auto-register application beans as services if not already configured.
   * Tests can disable by overriding getBeans() to return empty/undefined.
   */
  registerBeans() {
    const appBeans = (this.application as any).beans || {};
    if (Object.keys(appBeans).length === 0) return;
    for (const beanName in appBeans) {
      // Skip if a service with this bean type is already configured
      if (Object.values(this.applicationConfiguration.services).some((s: any) => s.type === beanName)) {
        continue;
      }
      const serviceName = beanName.split("/").pop();
      if (this.services[serviceName]) continue;
      const beanClass = appBeans[beanName];
      if (!beanClass) continue;
      this.moddas[serviceName] = beanClass;
      this.moddas[beanName] = beanClass;
      const filtered = (beanClass.filterParameters || (p => p))({
        ...this.applicationConfiguration.parameters
      });
      filtered.type = beanName;
      this.configuration[serviceName] = Object.freeze(filtered);
      this.getService(serviceName);
    }
  }

  /**
   * Get application beans
   * @returns the result
   */
  getBeans() {
    // @ts-ignore
    return process.webdaBeans || {};
  }

  /**
   * Stop all services
   */
  @CoreState({ start: "stopping", end: "stopped" })
  async stop() {
    const services = this.getServices();
    await Promise.all([
      // Stop all interuptables
      ...[...useInstanceStorage().interruptables.values()].map(i => i.cancel()),
      // Stop all services
      ...Object.keys(services).map(async s => {
        try {
          await services[s]?.stop();
        } catch (err) {
          this.log("ERROR", `Cannot stop service ${s}`, err);
        }
      })
    ]);
  }

  /**
   * Allow serialization
   * @returns the result
   */
  toJSON() {
    return {
      configuration: this.configuration,
      application: this.application
    };
  }

  /**
   * Deserialize a Core instance from a plain JSON object
   * @param json - the JSON data
   * @returns the result
   */
  static deserialize(json: any): Core {
    const core = new Core();
    if (json.configuration) {
      core.configuration = json.configuration;
    }
    return core;
  }
}
