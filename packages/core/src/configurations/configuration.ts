import * as WebdaError from "../errors/errors.js";
import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { useCore, useService } from "../core/hooks.js";
import { deepmerge } from "deepmerge-ts";
import type { Core } from "../core/core.js";
import { Duration } from "@webda/utils";

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
   * @param defaultValue if the source is not found
   */
  canTriggerConfiguration(id: string, callback: () => void, defaultValue?: any): boolean;
}

export class ConfigurationServiceParameters extends ServiceParameters {
  /**
   * Check configuration every {checkInterval} seconds
   * @default 1h
   */
  checkInterval: Duration;
  /**
   * Check interval in ms
   */
  get checkIntervalMs() {
    return this.checkInterval.toMs();
  }
  /**
   * Format sourceServiceName:sourceId or sourceId if source is this service
   */
  source: string;
  /**
   * List of sources to load and merge ( in order )
   * Format sourceServiceName:sourceId or sourceId if source is this service
   */
  sources: string[];
  /**
   * Default configuration to use
   * @default { services: {}, parameters: {} }
   */
  default?: any;

  load(params: any) {
    super.load(params);
    this.default ??= {
      services: {},
      parameters: {}
    };
    if (this.sources && this.source) {
      throw new WebdaError.CodeError(
        "CONFIGURATION_SOURCE_BOTH",
        "Cannot use both source and sources parameters in ConfigurationServiceParameters"
      );
    }
    this.sources ??= [];
    if (this.source) {
      this.sources.push(this.source);
      delete this.source;
    }
    this.checkInterval = new Duration(params.checkInterval ?? "1h");
    return this;
  }
}

export type ConfigurationEvents = {
  "Configuration.Applied": Record<string, any>;
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
  >
  extends Service<T, E>
  implements ConfigurationProvider
{
  protected serializedConfiguration: any;
  /**
   *
   */
  protected nextCheck: number;
  /**
   * List of sources (service and id) to load and merge ( in order )
   */
  protected sources: { service: ConfigurationProvider; id: string }[] = [];
  /**
   * Interval between two checks
   */
  private interval: NodeJS.Timer | number;
  /**
   * Current configuration
   */
  protected configuration: any;

  /**
   * Resolve the service
   * @returns
   */
  resolve() {
    super.resolve();
    console.log("Resolving configuration service", this.parameters.sources);
    for (const s of this.parameters.sources) {
      let sourceService: ConfigurationProvider | undefined;
      let sourceId: string | undefined;
      if (s.includes(":")) {
        const [service, id] = s.split(":");
        console.log("Loading configuration source", service, id);
        sourceService = useService(service);
        sourceId = id;
      } else {
        sourceService = this;
        sourceId = s;
      }
      if (!sourceService.getConfiguration) {
        throw new WebdaError.CodeError(
          "CONFIGURATION_SOURCE_INVALID",
          `Service '${sourceService}' is not implementing ConfigurationProvider interface`
        );
      }
      this.sources.push({ service: sourceService, id: sourceId });
    }
    return this;
  }

  /**
   * @inheritdoc
   */
  async init(): Promise<this> {
    // Check interval by default every hour
    // Initialize sources
    this.parameters.sources.forEach(source => {
      if (source.includes(":")) {
        const [serviceName, sourceId] = source.split(":");
        this.sources.push({ service: useService(serviceName), id: sourceId });
      } else {
        this.sources.push({ service: this, id: source });
      }
    });
    this.serializedConfiguration ??= JSON.stringify(this.parameters.default);
    let allDynamic = true;
    for (const source of this.sources) {
      // Try to trigger configuration update
      allDynamic &&= source.service.canTriggerConfiguration(
        source.id,
        this.checkUpdate.bind(this),
        this.parameters.default
      );
    }
    if (!allDynamic) {
      this.interval = setInterval(this.checkUpdate.bind(this), this.parameters.checkIntervalMs);
    }

    return this;
  }

  /**
   * Check if the configuration can be triggered
   * @returns
   */
  canTriggerConfiguration(_id: string, _callback: () => void): boolean {
    return false;
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
  async getConfiguration(_id: string): Promise<{ [key: string]: any }> {
    throw new Error("ConfigurationService cannot be used as ConfigurationProvider");
  }

  /**
   * Load the configuration by calling the source service with the source id
   * @returns
   */
  protected async loadConfiguration(): Promise<{ [key: string]: any }> {
    let finalConfig: any = this.parameters.default || { services: {}, parameters: {} };
    for (const source of this.sources) {
      finalConfig = deepmerge(finalConfig, await source.service.getConfiguration(source.id));
    }
    // Prevent reconfiguring ourself
    if (finalConfig.services[this.getName()]) {
      delete finalConfig.services[this.getName()];
    }
    return finalConfig;
  }

  /**
   * Checking for configuration updates
   *
   * @returns
   */
  protected async checkUpdate(dynamic: boolean = false) {
    // If the ConfigurationProvider cannot trigger we check at interval
    if (!dynamic && this.interval && this.nextCheck > Date.now()) {
      return;
    }

    this.log("DEBUG", "Refreshing configuration");
    const newConfig = await this.loadConfiguration();
    this.emit("Configuration.Loaded", newConfig);
    const serializedConfig = JSON.stringify(newConfig);
    if (serializedConfig !== this.serializedConfiguration) {
      this.log("DEBUG", "Apply new configuration");
      this.serializedConfiguration = serializedConfig;
      this.configuration = newConfig;
      useCore().updateConfiguration(newConfig);
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
    this.nextCheck = Date.now() + this.parameters.checkIntervalMs;
  }

  /**
   *
   * @param core
   */
  async bootstrap(core: Core): Promise<void> {
    this.log("DEBUG", "Bootstrapping configuration service");
    let configuration: any;
    for (const source of this.parameters.sources) {
      if (source.includes(":")) {
        // We apply configuration if already existing
        // So you can have a configuration that is from file, then from a service
        // and the service configuration will be read from file too
        if (configuration) {
          core.updateConfiguration(configuration);
        }
        const [serviceName, sourceId] = source.split(":");
        const service = core.getService<ConfigurationProvider & Service>(serviceName);
        configuration = deepmerge(configuration || {}, await service.getConfiguration(sourceId));
      } else {
        configuration = deepmerge(configuration || {}, await this.getConfiguration(source));
      }
    }
    // Store the configuration
    this.serializedConfiguration = JSON.stringify(configuration);
    core.updateConfiguration(configuration);
  }
}

export { ConfigurationService };
export type { ConfigurationProvider };
