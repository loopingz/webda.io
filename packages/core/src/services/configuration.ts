import jsonpath from "jsonpath";
import { WebdaError } from "../index";
import { Service, ServiceParameters } from "./service";

/**
 * Service that can store configuration
 */
interface ConfigurationProvider {
  /**
   *
   * @param id of the configuration to retrieve
   */
  getConfiguration(id: string): Promise<{ [key: string]: any }>;
  /**
   * Return true if the service can detect modification
   *
   * If false, then ConfigurationService will set an interval
   * and check every checkInterval @{ConfigurationServiceParameters.checkInterval}
   *
   * @param id of the source to check
   * @param callback to call if source has changed
   */
  canTriggerConfiguration(id: string, callback: () => void): boolean;
}

export class ConfigurationServiceParameters extends ServiceParameters {
  /**
   * Check configuration every {checkInterval} seconds
   */
  checkInterval?: number;
  /**
   * Format sourceServiceName:sourceId
   */
  source: string;
  /**
   * Default configuration to use
   */
  default: any;
  constructor(params: any) {
    super(params);
    this.checkInterval ??= 3600;
    this.default ??= {};
  }
}

export type ConfigurationEvents = {
  "Configuration.Applied": any;
  "Configuration.Applying": any;
  "Configuration.Loaded": any;
};

/**
 * Handle sessionSecret ( rolling between two secrets ) expire every hour
 * Handle longTermSecret ( rolling between two longer secret ) expire every month
 *
 * Load configuration from another service
 *
 * If the result contains `webda.services` in his object then webda configuration will
 * be dynamically reloaded
 *
 * @category CoreServices
 * @WebdaModda
 */
class ConfigurationService<
  T extends ConfigurationServiceParameters = ConfigurationServiceParameters,
  E extends ConfigurationEvents = ConfigurationEvents
> extends Service<T, E> {
  protected serializedConfiguration: any;
  /**
   *
   */
  protected nextCheck: number;
  /**
   * Service that will provide the information
   */
  protected sourceService: ConfigurationProvider;
  /**
   * Source id to retrieve
   */
  protected sourceId: string;
  /**
   * Interval between two checks
   */
  private interval: NodeJS.Timer | number;
  /**
   * Watchs for configuration update
   */
  protected watchs: any[] = [];
  /**
   * Current configuration
   */
  protected configuration: any;

  /**
   * Load parameters
   *
   * @param params
   * @ignore
   */
  loadParameters(params: any): ServiceParameters {
    return new ConfigurationServiceParameters(params);
  }

  /**
   * @inheritdoc
   */
  async init(): Promise<this> {
    // Check interval by default every hour

    if (!this.parameters.source) {
      throw new WebdaError.CodeError("CONFIGURATION_SOURCE_MISSING", "Need a source for ConfigurationService");
    }
    const source = this.parameters.source.split(":");
    this.sourceService = <ConfigurationProvider>(<unknown>this.getService(source[0]));
    if (!this.sourceService) {
      throw new WebdaError.CodeError(
        "CONFIGURATION_SOURCE_INVALID",
        'Need a valid service for source ("sourceService:sourceId")'
      );
    }
    this.sourceId = source[1];
    if (!this.sourceId) {
      throw new WebdaError.CodeError("CONFIGURATION_SOURCE_INVALID", 'Need a valid source ("sourceService:sourceId")');
    }
    if (!this.sourceService.getConfiguration) {
      throw new WebdaError.CodeError(
        "CONFIGURATION_SOURCE_INVALID",
        `Service '${source[0]}' is not implementing ConfigurationProvider interface`
      );
    }
    this.serializedConfiguration = JSON.stringify(this.parameters.default);
    await this.checkUpdate();
    if (!this.sourceService.canTriggerConfiguration(this.sourceId, this.checkUpdate.bind(this, true))) {
      this.interval = setInterval(this.checkUpdate.bind(this), 1000);
    }

    // Add webda info
    this.watch("$.services", (updates: any) => this._webda.reinit(updates));
    return this;
  }

  /**
   * Watch a specific configuration modification
   *
   * @param jsonPath JSON Path to the object to watch
   * @param callback Method to call with the updated version
   * @param defaultValue Default value of the jsonPath if it does not exist
   */
  watch(jsonPath: string, callback: (update: any) => void | Promise<void>, defaultValue: any = undefined) {
    this.watchs.push({ path: jsonPath, callback, defaultValue });
  }

  /**
   * Clear the check interval if exist
   */
  async stop() {
    if (this.interval !== undefined) {
      // @ts-ignore
      clearInterval(this.interval);
    }
    return super.stop();
  }

  /**
   *
   * @returns current configuration
   */
  getConfiguration() {
    return this.configuration || {};
  }

  /**
   * We cannot reinit the configurationService by itself
   *
   * @inheritdoc
   */
  async reinit(_config: any): Promise<this> {
    // Need to prevent any reinit
    return this;
  }

  /**
   * Load the configuration by calling the source service with the source id
   * @returns
   */
  protected async loadConfiguration(): Promise<{ [key: string]: any }> {
    return this.sourceService.getConfiguration(this.sourceId);
  }

  async initConfiguration(): Promise<{ [key: string]: any }> {
    throw new Error("ConfigurationService with dependencies cannot be used");
  }

  /**
   * Checking for configuration updates
   *
   * If configuration is updated, it will trigger all the watchs accordingly
   *
   * @returns
   */
  protected async checkUpdate(dynamic: boolean = false) {
    // If the ConfigurationProvider cannot trigger we check at interval
    if (!dynamic && this.interval && this.nextCheck > Date.now()) {
      return;
    }

    this.log("DEBUG", "Refreshing configuration");
    const newConfig = await this.loadGoodConfiguration();
    this.emit("Configuration.Loaded", newConfig);
    const serializedConfig = JSON.stringify(newConfig);
    if (serializedConfig !== this.serializedConfiguration) {
      this.emit("Configuration.Applying", newConfig);
      this.log("DEBUG", "Apply new configuration");
      this.serializedConfiguration = serializedConfig;
      this.configuration = newConfig;
      // Add the webda parameters logical
      if (this.configuration && this.configuration.services) {
        // Merge parameters with each service - cannot add new services for security
        for (const i in this.configuration.services) {
          if (this.getWebda().getService(i)) {
            this.configuration.services[i] = this.getWebda().getServiceParams(i, this.configuration);
          }
        }
      }
      const promises = [];
      this.watchs.forEach(w => {
        this.log("TRACE", "Apply new configuration value", jsonpath.query(newConfig, w.path).pop() || w.defaultValue);
        const p = w.callback(jsonpath.query(newConfig, w.path).pop() || w.defaultValue);
        if (p) {
          promises.push(p);
        }
      });
      await Promise.all(promises);
      this.emit("Configuration.Applied", newConfig);
    }
    // If the ConfigurationProvider cannot trigger we check at interval
    if (this.interval) {
      this.updateNextCheck();
      this.log("DEBUG", "Next configuration refresh in", this.parameters.checkInterval, "s");
    }
  }

  /**
   * Update the next check time
   */
  protected updateNextCheck() {
    this.nextCheck = Date.now() + this.parameters.checkInterval * 1000;
  }

  /**
   * Complete the configuration
   */
  private completeConfiguration(cfg: any) {
    cfg.parameters ??= {};
    cfg.services ??= {};
    return cfg;
  }

  /**
   * Load the configuration and complete it
   */
  private async loadGoodConfiguration() {
    return this.completeConfiguration((await this.loadConfiguration()) || this.parameters.default);
  }

  /**
   * Read the file and store it
   */
  async loadAndStoreConfiguration(): Promise<{ [key: string]: any }> {
    const res = await this.loadGoodConfiguration();
    this.emit("Configuration.Loaded", res);
    this.serializedConfiguration = JSON.stringify(res);
    return res;
  }
}

export { ConfigurationProvider, ConfigurationService };
