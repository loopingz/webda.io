import { WorkerLogLevel, WorkerOutput } from "@webda/workout";
import Ajv, { ValidationError } from "ajv";
import addFormats from "ajv-formats";
import { deepmerge } from "deepmerge-ts";
import jsonpath from "jsonpath";
import { Application } from "../application/application";
import { Configuration } from "../internal/iapplication";
import { BinaryService } from "../services/binary";
import { Model, ModelClass, registerRepository, Storable } from "@webda/models";
import { Router } from "../rest/router";
import { useCrypto } from "../services/cryptoservice";
import * as WebdaError from "../errors/errors";
import { Store } from "../stores/store";
import { UnpackedApplication } from "../application/unpackedapplication";
import { Logger } from "../loggers/ilogger";
import type { ConfigurationService } from "../configurations/configuration";
import { OperationContext } from "../contexts/operationcontext";
import { WebContext } from "../contexts/webcontext";
import { getUuid, JSONUtils, State, StateOptions } from "@webda/utils";
import {
  ICore,
  AbstractService,
  OperationDefinitionInfo,
  ServiceConstructor,
  SchemaValidResult,
  NoSchemaResult
} from "./icore";
import { emitCoreEvent } from "../events/events";
import { useConfiguration, useInstanceStorage, useParameters } from "./instancestorage";
import { useApplication, useModel, useModelId } from "../application/hooks";
import { Context, ContextProvider, ContextProviderInfo } from "../contexts/icontext";
import { useRouter } from "../rest/hooks";
import { RegistryModel } from "../models/registry";
import { Modda } from "../internal/iapplication";
import { Prototype } from "@webda/tsc-esm";
import { InstanceCache } from "../cache/cache";
import { Service } from "../services/service";

export type CoreStates = "initial" | "loading" | "initializing" | "reinitializing" | "ready" | "stopping" | "stopped";

const CoreState = (options: StateOptions<CoreStates>) => State(options);

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
  protected services: { [key: string]: AbstractService } = {};
  /**
   * Application that generates this Core
   */
  protected application: Application;
  /**
   * Router that will route http request in
   */
  protected router: Router = new Router("RESTService", <any>{});
  /**
   * If Core is already initiated
   * @deprecated
   */
  protected _initiated: boolean = false;
  /**
   * Services who failed to create or initialize
   * @deprecated
   */
  protected failedServices: { [key: string]: any } = {};
  /**
   * Configuration loaded from webda.config.json
   * @hidden
   */
  protected configuration: Configuration;

  /**
   * JSON Schema validator instance
   */
  protected _ajv: Ajv;
  /**
   * JSON Schema registry
   * Save if a schema was added to Ajv already
   */
  protected _ajvSchemas: { [key: string]: true };
  /**
   * Current executor
   */
  protected _currentExecutor: any;

  protected _configFile: string;
  /**
   * Console logger
   * @hidden
   */
  protected logger: Logger;
  /**
   * Worker output
   *
   * @see @webda/workout
   */
  private workerOutput: WorkerOutput;
  /**
   * Store the instance id
   */
  private instanceId: string;
  /**
   * Contains all operations defined by services
   */
  protected operations: { [key: string]: OperationDefinitionInfo } = {};

  /**
   * True if the dual import warning has been sent
   */
  private _dualImportWarn: boolean = false;
  /**
   * Registered context providers
   */
  private contextProviders: ContextProvider[] = [
    {
      getContext: (info: ContextProviderInfo) => {
        // If http is defined, return a WebContext
        if (info.http) {
          return new WebContext(info.http, info.stream);
        }
        return new OperationContext(info.stream);
      }
    }
  ];
  /**
   *
   */
  interuptables: { cancel: () => Promise<void> }[] = [];

  /**
   * @params {Object} config - The configuration Object, if undefined will load the configuration file
   */
  constructor(application?: Application) {
    useInstanceStorage().core = this;
    /**
     * SIGINT handler
     */
    process.on("SIGINT", async () => {
      console.log("Received SIGINT. Cancelling all interuptables.");
      await this.stop();
      process.exit(0);
    });
    this.workerOutput = application.getWorkerOutput();
    this.logger = new Logger(this.workerOutput, "@webda/core/lib/core.js");
    this.application = application || new UnpackedApplication(".");
    // Schema validations
    this._ajv = new Ajv();
    this._ajv.addKeyword("$generated");
    addFormats(this._ajv);
    this._ajvSchemas = {};

    // Load the configuration and migrate
    this.configuration = useConfiguration();
  }

  /**
   * Get the store assigned to this model
   * @param model
   * @returns
   */
  getModelStore<T extends Model>(modelOrConstructor: ModelClass<T> | T | string): Store {
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
   * @param model
   * @returns
   */
  @InstanceCache()
  private getModelStoreCached<T extends Model>(model: ModelClass<T>): Store {
    // @ts-ignore
    const stores: { [key: string]: Store } = useApplication().getImplementations(Store);
    let actualScore: number;

    let actualStore: Store = this.getService(useParameters().defaultStore || "Registry");
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
   * @param modelOrConstructor
   * @param attribute
   * @returns
   */
  getBinaryStore<T extends Model>(modelOrConstructor: ModelClass<T> | T | string, attribute: string): AbstractService {
    return this.getBinaryStoreCached(
      typeof modelOrConstructor === "string" ? modelOrConstructor : useModelId(modelOrConstructor, true),
      attribute
    );
  }

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
   */
  getInstanceId(): string {
    this.instanceId ??= getUuid();
    return this.instanceId;
  }

  /**
   * Get absolute url with subpath
   * @param subpath
   */
  getApiUrl(subpath: string = ""): string {
    if (subpath.length > 0 && !subpath.startsWith("/")) {
      subpath = "/" + subpath;
    }
    return this.configuration.parameters.apiUrl + subpath;
  }

  /**
   * Return application path with subpath
   *
   * Helper that redirect to this.application.getAppPath
   *
   * @param subpath
   * @returns
   */
  getAppPath(subpath: string = ""): string {
    return this.application.getAppPath(subpath);
  }

  /**
   * Retrieve all detected modules definition
   */
  getModules() {
    return this.application.getModules();
  }

  /**
   * Return application definition
   */
  getApplication() {
    return this.application;
  }

  /**
   * Get WorkerOutput
   */
  getWorkerOutput() {
    return this.workerOutput;
  }

  /**
   * Init one service
   * @param service
   */
  protected async initService(service: string) {
    try {
      this.log("TRACE", "Initializing service", service);
      (<any>this.services[service])._initTime = Date.now();
      await this.services[service].init();
    } catch (err) {
      this.log("ERROR", "Init service " + service + " failed: " + err.message);
      this.log("TRACE", err.stack);
      (<any>this.services[service])._initException = err.message;
      this.failedServices[service] = { _initException: err };
    }
  }

  /**
   * Init Webda
   *
   * It will resolve Services init method and autolink
   */
  @CoreState({ start: "initializing", end: "ready" })
  @InstanceCache()
  async init() {
    if (
      this.configuration.parameters.configurationService &&
      this.configuration.services[this.configuration.parameters.configurationService]
    ) {
      try {
        this.log("INFO", `Using ConfigurationService '${this.configuration.parameters.configurationService}'`);
        // Create the configuration service
        this.createService(this.configuration.parameters.configurationService);
        const cfg = await this.getService<ConfigurationService>(
          this.configuration.parameters.configurationService
        ).initConfiguration();
        if (cfg) {
          this.configuration.parameters = deepmerge(this.configuration.parameters, cfg.parameters);
          // Ensure beans are known too
          Object.keys(this.getBeans())
            .filter(
              i =>
                !(Array.isArray(this.configuration.parameters.ignoreBeans)
                  ? this.configuration.parameters.ignoreBeans.includes(i)
                  : this.configuration.parameters.ignoreBeans)
            )
            .forEach(bean => {
              this.configuration.services[bean] ??= {
                type: `Beans/${bean}`
              };
            });
          // Merge services - for security reason we cannot add new services from configuration
          for (const i in this.configuration.services) {
            this.configuration.services[i] = {
              ...deepmerge(this.configuration.services[i], cfg.services[i] || {}),
              type: this.configuration.services[i].type
            };
          }
        }
        await this.getService<ConfigurationService>(this.configuration.parameters.configurationService).init();
      } catch (err) {
        this.log("ERROR", "Cannot use ConfigurationService", this.configuration.parameters.configurationService, err);
        this.services = {};
      }
    }

    // Init the other services
    this.initStatics();
    // Reset the model cache
    InstanceCache.clear(this, "getModelStoreCached");
    InstanceCache.clear(this, "getModelBinaryCached");

    this.log("TRACE", "Create Webda init promise");

    await this.initService("Router");
    await this.initService("Registry");
    // By pass the store checks
    Model["Store"] = <any>this.services["Registry"];
    RegistryModel["Store"] = <any>this.services["Registry"];

    await this.initService("CryptoService");

    const criticalServices: Service[] = [useCrypto(), useRouter(), <any>this.services["Registry"]];
    if (criticalServices.some(s => s.getState() !== "running")) {
      criticalServices
        .filter(s => s.getState() !== "running")
        .forEach(s => {
          this.log("ERROR", "Service not running", s.getName());
        });
      throw new Error("Cannot init Webda core services (Router, Registry, CryptoService)");
    }
    // Init services
    let service;
    const inits = [];
    for (service in this.services) {
      if (
        this.services[service].init !== undefined &&
        !(<any>this.services[service])._createException &&
        !(<any>this.services[service])._initTime
      ) {
        inits.push(this.initService(service));
      }
    }
    await Promise.all(inits);
    await emitCoreEvent("Webda.Init.Services", this.services);
  }

  /**
   * Return webda current version
   *
   * @returns package version
   * @since 0.4.0
   */
  getVersion(): string {
    return this.getApplication().getWebdaVersion();
  }

  /**
   * To define the locales just add a locales: ['en-GB', 'fr-FR'] in your host global configuration
   *
   * @return The configured locales or "en-GB" if none are defined
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
   * @deprecated
   */
  getService<T = AbstractService>(name: string = ""): T {
    return <T>this.services[name];
  }

  /**
   * Return a map of defined services
   * @returns {{}}
   * @deprecated
   */
  getServices(): { [key: string]: AbstractService } {
    return this.services;
  }
  /**
   * Return if Webda is in debug mode
   */
  public isDebug(): boolean {
    return false;
  }

  /**
   * Reinit one service
   * @param service
   */
  protected async reinitService(service: string): Promise<void> {
    try {
      this.log("TRACE", "Re-Initializing service", service);
      const serviceBean = this.services[service];
      await serviceBean.parameters.load(useParameters(serviceBean.getName()));
    } catch (err) {
      this.log("ERROR", "Re-Init service " + service + " failed", err);
      this.log("TRACE", err.stack);
    }
  }

  /**
   * Reinit all services with updated parameters
   * @param updates
   * @returns
   */
  @CoreState({ start: "reinitializing", end: "ready" })
  public async reinit(updates: any): Promise<void> {
    const configuration = JSON.parse(JSON.stringify(this.configuration.services));
    for (const service in updates) {
      jsonpath.value(configuration, service, updates[service]);
    }
    if (JSON.stringify(Object.keys(configuration)) !== JSON.stringify(Object.keys(this.configuration.services))) {
      this.log("ERROR", "Configuration update cannot modify services");
      throw new WebdaError.CodeError(
        "REINIT_SERVICE_INJECTION",
        "Configuration is not designed to add dynamically services"
      );
    }
    this.configuration.services = configuration;
    const inits: Promise<void>[] = [];
    for (const service in this.services) {
      inits.push(this.reinitService(service));
    }
    await Promise.all(inits);
  }

  /**
   * Log a message
   * @param level
   * @param args
   */
  log(level: WorkerLogLevel, ...args: any[]) {
    this.logger.log(level, ...args);
  }

  /**
   * Create a specific service
   * @param service
   * @returns
   */
  protected createService(service: string) {
    const params = useParameters(service);
    let serviceConstructor: Modda = undefined;
    try {
      serviceConstructor = this.application.getModda(params.type);
    } catch (ex) {
      this.log("ERROR", `Create service ${service}(${params.type}) failed ${ex.message}`);
      this.log("TRACE", ex.stack);
      return;
    }

    try {
      const paramsClass = serviceConstructor.createConfiguration(params);
      this.log("TRACE", "Constructing service", service);
      this.services[service] = new serviceConstructor(service, paramsClass);
    } catch (err) {
      this.log("ERROR", "Cannot create service", service, err);
      // @ts-ignore
      this.failedServices[service] = { _createException: err };
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
   * @hidden
   *
   */
  protected createServices(excludes: string[] = []): void {
    const services = this.configuration.services;
    let beans: { [key: string]: Modda } = this.getBeans();
    if (this.configuration.parameters.ignoreBeans) {
      if (Array.isArray(this.configuration.parameters.ignoreBeans)) {
        this.configuration.parameters.ignoreBeans.forEach(bean => {
          delete beans[bean];
        });
      } else {
        beans = {};
      }
    }
    this.log("DEBUG", "BEANS", beans, "IGNORING", this.configuration.parameters.ignoreBeans);
    for (const i in beans) {
      const name = beans[i].name;
      if (!services[name]) {
        services[name] = {};
      }
      // Force type to Bean
      services[name].type = `Beans/${name}`;
      // Register the type
      this.application.addModda(`Beans/${name}`, beans[i]);
    }

    // Construct services
    Object.keys(services)
      .filter(s => !excludes.includes(s))
      .forEach(s => this.createService(s));

    // Call resolve on all services as all services now exist
    Object.keys(this.services)
      .filter(s => !excludes.includes(s))
      .forEach(s => {
        try {
          this.services[s].resolve();
        } catch (err) {
          this.log("ERROR", `Service(${s})`, err);
        }
      });

    // Register all stores
    Object.values(this.application.getModels())
      .filter(m => m)
      .forEach(model => {
        registerRepository(model, this.getModelStoreCached(model).getRepository(model));
      });
    emitCoreEvent("Webda.Create.Services", this.services);
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
          await services[s].stop();
        } catch (err) {
          this.log("ERROR", `Cannot stop service ${s}`, err);
        }
      })
    ]);
  }

  /**
   * Init services and Beans along with Routes
   */
  initStatics() {
    // For all final models, call resolve so they can declare their operations
    Object.values(this.application.getModels())
      .filter(model => {
        return model && this.application.isFinalModel(useModelId(model));
      })
      .forEach(model => {
        //model.resolve();
      });
    // Init the registry

    let service = this.createService("Registry");
    if (!service) {
      throw new Error("Cannot create Registry service");
    }
    this.application.addModel("Webda/RegistryModel", RegistryModel);
    RegistryModel["Store"] = <any>this.getService<Store>("Registry");
    service.resolve();

    service = this.createService("CryptoService");
    if (!service) {
      throw new Error("Cannot create Cryptographic service");
    }
    service.resolve();

    if (this.configuration.services !== undefined) {
      const excludes = ["Registry", "CryptoService"];
      if (this.configuration.parameters.configurationService) {
        excludes.push(this.configuration.parameters.configurationService);
      }
      // Do not recreate the configuration services
      this.createServices(excludes);
    }

    this.router.remapRoutes();

    emitCoreEvent("Webda.Init", this.configuration);
  }

  /**
   * Get a context based on the info
   * @param info
   * @returns
   */
  async newContext<T extends Context>(info: ContextProviderInfo, noInit: boolean = false): Promise<Context> {
    let context: Context;
    this.contextProviders.find(provider => (context = <Context>provider.getContext(info)) !== undefined);
    if (!noInit) {
      await context.init();
    }
    await emitCoreEvent("Webda.NewContext", { context, info });
    return <T>context;
  }

  /**
   * Register a new context provider
   * @param provider
   */
  registerContextProvider(provider: ContextProvider) {
    this.contextProviders ??= [];
    this.contextProviders.unshift(provider);
  }

  /**
   * @override
   * @deprecated use schemas hook instead and move to schemas/hooks.ts
   */
  validateSchema(
    webdaObject: Model | string,
    object: any,
    ignoreRequired?: boolean
  ): NoSchemaResult | SchemaValidResult {
    let name = typeof webdaObject === "string" ? webdaObject : useModelId(webdaObject);
    let cacheName = name;
    if (name?.endsWith("?")) {
      name = name.substring(0, name.length - 1);
      ignoreRequired = true;
    }
    if (ignoreRequired) {
      cacheName += "_noRequired";
    }
    if (!this._ajvSchemas[cacheName]) {
      let schema = this.application.getSchema(name);
      if (!schema) {
        return null;
      }
      if (ignoreRequired) {
        schema = JSONUtils.duplicate(schema);
        schema.required = [];
      }
      this.log("TRACE", "Add schema for", name);
      this._ajv.addSchema(schema, cacheName);
      this._ajvSchemas[cacheName] = true;
    }
    if (this._ajv.validate(cacheName, object)) {
      return true;
    }
    throw new ValidationError(this._ajv.errors);
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

  static deserialize(json: any): Core {
    const core = new Core();
    if (json.configuration) {
      core.configuration = json.configuration;
    }
    return core;
  }
}
