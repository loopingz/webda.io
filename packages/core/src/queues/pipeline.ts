import { ServiceParameters, Service } from "../services/service";
import { FileUtils, YAMLUtils } from "../utils/serializers";
import { CancelablePromise } from "../utils/waiter";
import { Queue } from "./queueservice";


/**
 * Represent a pipeline of transformation
 */
export class Pipeline {
    /**
     * 
     */
    private _processors: Processor[] = [];
    /**
     * Description
     */
    public description: string;
    /**
     * Processors definition
     */
    public processors?: any[];
    /**
     * URL of the 
     */
    public definition?: string;

    constructor(protected service: PipelineService) {}
    
    /**
     * Process one item
     * @param input 
     * @param pipelineName 
     */
    process(input: any) : boolean {
        return this._processors.find(p => p.process(input)) !== undefined;
    }

    /**
     * Load a pipeline definition
     * @param info 
     */
    async load(info: Partial<Pipeline>) : Promise<void> {
        if (!info.processors && info.definition) {
            // Load from the url
            const content = await (await fetch(info.definition)).text();
            if (info.definition.endsWith(".json")) {
                info = JSON.parse(content);
            } else if (info.definition.match(/\.ya?ml$/)) {
                info = YAMLUtils.parse(info.definition);
            }
        }
        if (!info.processors) {
            throw new Error("Invalid pipeline processors should exist");
        }
        this._processors = info.processors.map((params) => {
            this.service.log("INFO", params);
            const name = Object.keys(params).pop();
            return this.service.getProcessorInstance(this, name, params[name]);
        })
    }

    /**
     * Pipeline service
     */
    getService() {
        return this.service;
    }
}

/**
 * Define a Pipeline processor
 */
export abstract class Processor {

    /**
     * Should parse the parameters
     * @param params 
     */
    constructor(protected pipeline: Pipeline, params: any) {
    }

    /**
     * 
     * @param input 
     * @returns true if processor request pipeline interruption
     */
    process(input: any): boolean {
        return true;
    }

    /**
     * Implement the processing
     * Common filtering will happen within the process method
     * @param input 
     */
    abstract subprocess(input: any) : boolean;
}

/**
 * 
 */
export class SetProcessor extends Processor {
    /**
     * 
     * @param params 
     */
    constructor(pipeline: Pipeline, params: any) {
        super(pipeline, params);
    }

    subprocess(input: any): boolean {

        return false;
    }
}

/**
 * Pipeline Service parameters
 */
 class PipelineServiceParameters extends ServiceParameters {
     /**
      * Input queue name
      */
    inputQueue?: string;
    /**
     * Pipelines definition
     * Can be a file or a folder (if a folder every .yml, .json, .yaml files will be read)
     */
    pipelines: string[];
}

/**
 * Consume a queue and repost to another queue with a transformation
 * 
 * Can also transform manually
 */
export class PipelineService<T extends PipelineServiceParameters = PipelineServiceParameters> extends Service<T> {
    private processors : {[key: string]: new (pipeline: Pipeline, params: any) => Processor} = {};

    /**
     * @override
     */
    resolve() {
        super.resolve();
        return this;
    }

    /**
     * Register processors type
     * @param info 
     */
    registerProcessorType(name: string, constructor: new (pipeline: Pipeline, params: any) => Processor) {
        this.processors[name] = constructor;
    }

    /**
     * Create a new processor instance
     * @param name 
     * @param params 
     * @returns 
     */
    getProcessorInstance(pipeline: Pipeline, name: string, params: any) : Processor {
        return new this.processors[name](pipeline, params);
    }

    /**
     * Consume the queue
     */
     consume(): CancelablePromise {
         return this.getService<Queue>(this.parameters.inputQueue).consume(async (msg) => {
            this.process(msg);
         });
     }

     /**
      * Load a pipeline definition from filesystem
      * @param file 
      */
     loadDefinitionFile(file: string) {
        this.loadDefinition(FileUtils.load(file));
     }

     /**
      * Load pipeline definition
      * @param definition 
      */
     loadDefinition(definition: any) {
        console.log(definition);
     }

     process(input: any, pipelineName?: string) : boolean {
         return false;
     }
}