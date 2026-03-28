import { ConfigurationService, ConfigurationServiceParameters } from "./configuration.js";
/**
 * Parameters for KubernetesConfigurationService
 * Throw error if default is set
 */
export declare class KubernetesConfigurationParameters extends ConfigurationServiceParameters {
    load(params: any): this;
}
/**
 * Allow for dynamic configuration from ConfigMap or Secrets
 *
 * Read a ConfigMap from Kubernetes and auto-update
 * @WebdaModda
 */
export declare class KubernetesConfigurationService<T extends KubernetesConfigurationParameters = KubernetesConfigurationParameters> extends ConfigurationService<T> {
    sourcePaths: Record<string, string>;
    getFilePath(id: string): string;
    /**
     * Check if the configuration can be triggered
     * @returns
     */
    canTriggerConfiguration(id: string, callback: () => void): boolean;
    /**
     * Load configuration from a ConfigMap or a Secret
     * @override
     */
    getConfiguration(id: string): Promise<{
        [key: string]: any;
    }>;
}
//# sourceMappingURL=kubernetesconfiguration.d.ts.map