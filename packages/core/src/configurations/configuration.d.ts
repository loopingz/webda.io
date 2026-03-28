import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
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
    getConfiguration(id: string): Promise<{
        [key: string]: any;
    }>;
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
export declare class ConfigurationServiceParameters extends ServiceParameters {
    /**
     * Check configuration every {checkInterval} seconds
     * @default 1h
     */
    checkInterval: Duration;
    /**
     * Check interval in ms
     */
    get checkIntervalMs(): number;
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
    load(params: any): this;
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
declare class ConfigurationService<T extends ConfigurationServiceParameters = ConfigurationServiceParameters, E extends ConfigurationEvents = ConfigurationEvents> extends Service<T, E> implements ConfigurationProvider {
    protected serializedConfiguration: any;
    /**
     *
     */
    protected nextCheck: number;
    /**
     * List of sources (service and id) to load and merge ( in order )
     */
    protected sources: {
        service: ConfigurationProvider;
        id: string;
    }[];
    /**
     * Interval between two checks
     */
    private interval;
    /**
     * Current configuration
     */
    protected configuration: any;
    /**
     * Resolve the service
     * @returns
     */
    resolve(): this;
    /**
     * @inheritdoc
     */
    init(): Promise<this>;
    /**
     * Check if the configuration can be triggered
     * @returns
     */
    canTriggerConfiguration(_id: string, _callback: () => void): boolean;
    /**
     * Clear the check interval if exist
     */
    stop(): Promise<void>;
    /**
     *
     * @returns current configuration
     */
    getConfiguration(_id: string): Promise<{
        [key: string]: any;
    }>;
    /**
     * Load the configuration by calling the source service with the source id
     * @returns
     */
    protected loadConfiguration(): Promise<{
        [key: string]: any;
    }>;
    /**
     * Checking for configuration updates
     *
     * @returns
     */
    protected checkUpdate(dynamic?: boolean): Promise<void>;
    /**
     * Update the next check time
     */
    protected updateNextCheck(): void;
    /**
     *
     * @param core
     */
    bootstrap(core: Core): Promise<void>;
}
export { ConfigurationService };
export type { ConfigurationProvider };
//# sourceMappingURL=configuration.d.ts.map