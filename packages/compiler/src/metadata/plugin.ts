import { WebdaModule } from "../definition";
import { ModuleGenerator, WebdaObjects } from "../module";

export abstract class MetadataPlugin {
    constructor(protected moduleGenerator: ModuleGenerator) {}

    abstract getMetadata(module: WebdaModule, objects: WebdaObjects): void;
}