import { WorkerLogLevel, WorkerOutput } from "@webda/workout";
import type { CachedModule, Configuration, GitInformation, PackageDescriptor, ProjectInformation, Section, UnpackedConfiguration, WebdaModule, WebdaPackageDescriptor } from "./iconfiguration.js";
import type { Modda } from "../services/iservice.js";
import type { ModelDefinition } from "../models/types.js";
import { Model, ModelClass, Storable } from "@webda/models";
import { JSONSchema7 } from "json-schema";
import type { Service } from "../services/service.js";
import { ModelMetadata } from "@webda/compiler";
export type ApplicationState = "initial" | "loading" | "ready";
/**
 * Map a Webda Application
 *
 * It allows to:
 *  - Analyse imported modules
 *  - Scan code for Modda and generate the webda.config.json
 *  - Compile and Watch
 *  - Migrate from old configuration
 *  - List deployments
 *
 *
 * @category CoreFeatures
 */
export declare class Application {
    /**
     * Get Application root path
     */
    readonly applicationPath: string;
    /**
     * Base configuration loaded from webda.config.json
     */
    protected baseConfiguration: Configuration;
    /**
     * Current deployment
     */
    protected currentDeployment: string;
    /**
     * Contains definitions of current application
     */
    protected appModule: WebdaModule;
    /**
     * Deployers type registry
     */
    protected deployers: {
        [key: string]: any;
    };
    /**
     * Moddas registry
     */
    protected moddas: {
        [key: string]: Modda;
    };
    /**
     * Models type registry
     */
    protected models: {
        [key: string]: ModelDefinition;
    };
    /**
     * Class Logger
     */
    protected logger: WorkerOutput;
    /**
     * Detect if running as workspace
     */
    protected workspacesPath: string;
    /**
     * Configuration file
     */
    readonly configurationFile: string;
    /**
     * Current deployment file
     */
    deploymentFile: string;
    /**
     *
     * @param {string} fileOrFolder to load Webda Application from
     * @param {Logger} logger
     */
    constructor(file: string | UnpackedConfiguration, logger?: WorkerOutput);
    /**
     * Run the application
     * @returns
     */
    run(): Promise<any>;
    /**
     * Import all required modules
     */
    load(): Promise<this>;
    /**
     * Allow subclass to implement migration
     *
     * @param file
     * @returns
     */
    loadConfiguration(file: string): Promise<void>;
    /**
     * Get a schema from a type
     *
     * Schema should be precomputed in the default app
     * @param type
     * @returns
     */
    getSchema(type: string): JSONSchema7;
    /**
     * Get schemas
     * @returns
     */
    getSchemas(): {
        [key: string]: JSONSchema7;
    };
    /**
     * Check if application has cached modules
     *
     * When deployed the application contains cachedModules in the `webda.config.json`
     * It allows to avoid the search for `webda.module.json` inside node_modules and
     * take the schema from the cached modules also
     */
    isCached(): boolean;
    /**
     * Retrieve specific webda conf from package.json
     *
     * In case of workspaces the object is combined
     */
    getPackageWebda(): WebdaPackageDescriptor;
    /**
     * Retrieve content of package.json
     */
    getPackageDescription(): PackageDescriptor;
    /**
     * Log information
     *
     * @param level to log for
     * @param args anything to display same as console.log
     */
    log(level: WorkerLogLevel, ...args: any[]): void;
    /**
     * Get current logger
     */
    getWorkerOutput(): WorkerOutput;
    /**
     * Return the current app path
     *
     * @param subpath to append to
     */
    getPath(subpath?: string): string;
    /**
     * Add a new service
     *
     * @param name
     * @param service
     */
    addModda(name: string, service: Modda): this;
    /**
     *
     * @param section
     * @param name
     * @param caseSensitive
     */
    hasWebdaObject(section: Section, name: string): boolean;
    /**
     * Define if the model is the last one in the hierarchy
     *
     * TODO Define clearly
     * @param model
     * @returns
     */
    isFinalModel(model: string): boolean;
    /**
     *
     * @param section
     * @param name
     * @returns
     */
    getWebdaObject(section: Section, name: string): any;
    /**
     * Get a service based on name
     *
     * @param name
     */
    getModda(name: string): Modda;
    /**
     * Return all services of the application
     */
    getModdas(): {
        [key: string]: Modda;
    };
    /**
     * Retrieve the model implementation
     *
     * @param name model to retrieve
     */
    getModel<T extends Model = Model>(name: string): ModelDefinition<T>;
    /**
     * Get all models definitions
     */
    getModels(): {
        [key: string]: ModelDefinition<any>;
    };
    /**
     * Return the model name for a object
     * @param object
     */
    getModelFromInstance(object: Storable): string | undefined;
    /**
     * Return the model name for a object
     * @param object
     */
    getModelFromConstructor(model: ModelClass): string | undefined;
    /**
     * Get the model name from a model or a constructor
     *
     * @param model
     * @paramn full if true always include the namespace, default is false e.g Webda/
     * @returns longId for a model
     */
    getModelId(model: ModelClass | Storable): string | undefined;
    /**
     * Return all deployers
     */
    getDeployers(): {
        [key: string]: Modda;
    };
    /**
     * Add a new model
     *
     * @param name
     * @param model
     * @param dynamic class is dynamic so recompute the hierarchy
     */
    addModel(name: string, model: any, metadata?: ModelMetadata): this;
    /**
     *
     * @param this
     * @param json
     * @returns
     */
    static deserialize<T extends Application>(this: new (...args: any[]) => T, json: any): T;
    toJSON(): {
        baseConfiguration: Configuration;
        currentDeployment: string;
        appModule: WebdaModule;
    };
    /**
     * Return webda current version
     *
     * @returns package version
     * @since 0.4.0
     */
    getWebdaVersion(): string;
    /**
     * Retrieve Git Repository information
     *
     * {@link GitInformation} for more details on how the information is gathered
     * @return the git information
     */
    getGitInformation(_packageName?: string, _version?: string): GitInformation;
    /**
     * Retrieve the project information
     * @returns
     */
    getProjectInfo(): ProjectInformation | undefined;
    /**
     * Get current deployment name
     */
    getCurrentDeployment(): string;
    /**
     * Return all application modules merged as one
     *
     * Used when deployed
     * @returns
     */
    getModules(): CachedModule;
    /**
     * Get application configuration
     * @returns
     */
    getConfiguration(_deployment?: string): Configuration;
    /**
     * Return current Configuration of the Application
     *
     * Same as calling
     *
     * ```js
     * getConfiguration(this.currentDeployment);
     * ```
     */
    getCurrentConfiguration(): Configuration;
    /**
     * Import a file
     *
     * If the `default` is set take this or use old format
     *
     * @param info
     */
    protected importFile(info: string, withExport?: boolean): Promise<any>;
    /**
     * Load local module
     */
    loadLocalModule(): Promise<void>;
    /**
     * Get implementations of a class
     * @param object
     * @returns
     */
    getImplementations<T extends Service>(object: T): {
        [key: string]: Modda<T>;
    };
    /**
     * Load the module,
     *
     * @protected
     * @ignore Useless for documentation
     */
    loadModule(module: WebdaModule, parent?: string): Promise<void>;
    /**
     * Set object Metadata
     * Need to be done after all models are loaded to resolve Ancestors and Subclasses
     * @param info
     */
    protected setModelMetadata(info: {
        [key: string]: ModelMetadata;
    }): void;
    /**
     * Return the full name including namespace
     *
     * In Webda the ServiceType include namespace `Webda/Store` or `Webda/Test`
     * This method will make sure the namespace is present, adding it if no '/'
     * is found in the name
     *
     * @param name
     */
    completeNamespace(name?: string): string;
    /**
     * Return current namespace
     * @returns
     */
    getNamespace(): string;
}
//# sourceMappingURL=application.d.ts.map