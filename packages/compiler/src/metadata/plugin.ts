import { ModuleGenerator, WebdaObjects } from "../module";

export abstract class MetadataPlugin {
    constructor(protected moduleGenerator: ModuleGenerator) {}

    abstract getMetadata(module: any, objects: WebdaObjects): void;
}