import { WorkerOutput } from "@webda/workout";
import { Application } from "./application.js";
import { type CachedModule, type Configuration, type GitInformation, type ProjectInformation, type UnpackedConfiguration } from "./iconfiguration.js";
/**
 * Empty git information
 */
export declare const EmptyGitInformation: GitInformation;
/**
 * An unpacked application load dynamically all webda.module.json
 * And load also all the package description
 *
 * The normal Application is designed to load all this information from
 * the cachedModule to avoid any unecessary action within a production environment
 */
export declare class UnpackedApplication extends Application {
    constructor(file: string | Partial<UnpackedConfiguration>, logger?: WorkerOutput);
    /**
     * Ensure default configuration after load
     * @returns
     */
    load(): Promise<this>;
    /**
     * Ensure default parameters are set on our application
     * Creating the default services if they do not exist
     *
     * Might want to have only this in unpackaged application as Application should
     * have a perfectly valid configuration
     * @param configuration
     */
    ensureDefaultConfiguration(configuration: Configuration): void;
    /**
     * Load full configuration
     *
     * webda.config.json and complete the cachedModule
     *
     * @param file
     * @returns
     */
    loadConfiguration(file: string): Promise<void>;
    /**
     * Add Moddas, Models and Deployers definitions
     * It also add the project metadata
     *
     * @param configuration
     * @returns
     */
    completeConfiguration(configuration: Configuration): Configuration;
    /**
     * @returns empty git information
     */
    getGitInformation(_name?: string, _version?: string): GitInformation;
    upgradeConfigToV4(): void;
    /**
     * Check package.json
     */
    loadProjectInformation(): ProjectInformation;
    /**
     * Search the node_modules structure for webda.module.json files
     *
     * @param path
     * @returns
     */
    static findModulesFiles<T extends any>(this: T, path: string): Promise<string[]>;
    /**
     * Load all imported modules and current module
     * It will compile module
     * Generate the current module file
     * Load any imported webda.module.json
     */
    findModules(module: CachedModule): Promise<string[]>;
    /**
     * Only allow local and core module and sample-app
     */
    filterModule(_filename: string): boolean;
    /**
     * Load a webda.module.json file
     * Resolve the linked file to current application
     *
     * @param moduleFile to load
     * @returns
     */
    loadWebdaModule(moduleFile: string): CachedModule;
    /**
     * Merge all modules into one cached module
     *
     * @param module
     */
    mergeModules(configuration: Configuration): Promise<CachedModule>;
}
//# sourceMappingURL=unpackedapplication.d.ts.map