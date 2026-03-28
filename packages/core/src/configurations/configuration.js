import * as WebdaError from "../errors/errors.js";
import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { useCore, useDynamicService } from "../core/hooks.js";
import { deepmerge } from "deepmerge-ts";
import { Duration } from "@webda/utils";
export class ConfigurationServiceParameters extends ServiceParameters {
    /**
     * Check interval in ms
     */
    get checkIntervalMs() {
        return this.checkInterval.toMs();
    }
    load(params) {
        super.load(params);
        this.default ?? (this.default = {
            services: {},
            parameters: {}
        });
        if (this.sources && this.source) {
            throw new WebdaError.CodeError("CONFIGURATION_SOURCE_BOTH", "Cannot use both source and sources parameters in ConfigurationServiceParameters");
        }
        this.sources ?? (this.sources = []);
        if (this.source) {
            this.sources.push(this.source);
            delete this.source;
        }
        this.checkInterval =
            params.checkInterval instanceof Duration ? params.checkInterval : new Duration(params.checkInterval ?? "1h");
        return this;
    }
}
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
class ConfigurationService extends Service {
    constructor() {
        super(...arguments);
        /**
         * List of sources (service and id) to load and merge ( in order )
         */
        this.sources = [];
    }
    /**
     * Resolve the service
     * @returns
     */
    resolve() {
        super.resolve();
        console.log("Resolving configuration service", this.parameters.sources);
        for (const s of this.parameters.sources) {
            let sourceService;
            let sourceId;
            if (s.includes(":")) {
                const [service, id] = s.split(":");
                console.log("Loading configuration source", service, id);
                sourceService = useDynamicService(service);
                sourceId = id;
            }
            else {
                sourceService = this;
                sourceId = s;
            }
            if (!sourceService.getConfiguration) {
                throw new WebdaError.CodeError("CONFIGURATION_SOURCE_INVALID", `Service '${sourceService}' is not implementing ConfigurationProvider interface`);
            }
            this.sources.push({ service: sourceService, id: sourceId });
        }
        return this;
    }
    /**
     * @inheritdoc
     */
    async init() {
        // Check interval by default every hour
        // Initialize sources
        this.parameters.sources.forEach(source => {
            if (source.includes(":")) {
                const [serviceName, sourceId] = source.split(":");
                this.sources.push({ service: useDynamicService(serviceName), id: sourceId });
            }
            else {
                this.sources.push({ service: this, id: source });
            }
        });
        this.serializedConfiguration ?? (this.serializedConfiguration = JSON.stringify(this.parameters.default));
        let allDynamic = true;
        for (const source of this.sources) {
            // Try to trigger configuration update
            allDynamic && (allDynamic = source.service.canTriggerConfiguration(source.id, this.checkUpdate.bind(this), this.parameters.default));
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
    canTriggerConfiguration(_id, _callback) {
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
    async getConfiguration(_id) {
        throw new Error("ConfigurationService cannot be used as ConfigurationProvider");
    }
    /**
     * Load the configuration by calling the source service with the source id
     * @returns
     */
    async loadConfiguration() {
        let finalConfig = this.parameters.default || { services: {}, parameters: {} };
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
    async checkUpdate(dynamic = false) {
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
    updateNextCheck() {
        this.nextCheck = Date.now() + this.parameters.checkIntervalMs;
    }
    /**
     *
     * @param core
     */
    async bootstrap(core) {
        this.log("DEBUG", "Bootstrapping configuration service");
        let configuration;
        for (const source of this.parameters.sources) {
            if (source.includes(":")) {
                // We apply configuration if already existing
                // So you can have a configuration that is from file, then from a service
                // and the service configuration will be read from file too
                if (configuration) {
                    core.updateConfiguration(configuration);
                }
                const [serviceName, sourceId] = source.split(":");
                const service = core.getService(serviceName);
                configuration = deepmerge(configuration || {}, await service.getConfiguration(sourceId));
            }
            else {
                configuration = deepmerge(configuration || {}, await this.getConfiguration(source));
            }
        }
        // Store the configuration
        this.serializedConfiguration = JSON.stringify(configuration);
        core.updateConfiguration(configuration);
    }
}
export { ConfigurationService };
//# sourceMappingURL=configuration.js.map