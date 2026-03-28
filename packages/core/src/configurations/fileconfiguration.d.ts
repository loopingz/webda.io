import { ConfigurationService, ConfigurationServiceParameters } from "./configuration.js";
/**
 * Allow for dynamic configuration from a file
 * @WebdaModda Webda/FileConfiguration
 */
export declare class FileConfigurationService<T extends ConfigurationServiceParameters = ConfigurationServiceParameters> extends ConfigurationService<T> {
    sourcePaths: Record<string, string>;
    getFilePath(id: string): string;
    canTriggerConfiguration(id: string, callback: () => void, defaultValue?: any): boolean;
    /**
     * Load the JSON from source defined file
     * @override
     */
    getConfiguration(id: string): Promise<{
        [key: string]: any;
    }>;
}
//# sourceMappingURL=fileconfiguration.d.ts.map