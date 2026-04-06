import type { WebdaModule } from "../definition";
import type { ModuleGenerator, WebdaObjects } from "../module";

/** Base class for compiler plugins that extract metadata from Webda module types */
export abstract class MetadataPlugin {
    /** Create a new MetadataPlugin.
     * @param moduleGenerator - the module generator instance
     */
    constructor(protected moduleGenerator: ModuleGenerator) {}

    abstract getMetadata(module: WebdaModule, objects: WebdaObjects): void;
}