import { readFileSync } from "fs";
import { Service, ServiceParameters } from "../services/service";
import { FileUtils, JSONUtils, YAMLUtils } from "../utils/serializers";
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
  process(input: any): any {
    const result = JSONUtils.duplicate(input);
    if (this._processors.find(p => p.process(result)) !== undefined) {
      // Pipeline was interrupted by a Processor
      return undefined;
    }
    return result;
  }

  /**
   * Load a pipeline definition
   * @param info
   */
  async load(info: Partial<Pipeline>): Promise<this> {
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
    this._processors = info.processors.map(params => {
      const name = Object.keys(params).pop();
      return this.service.getProcessorInstance(this, name, params[name]);
    });
    return this;
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
export abstract class Processor<T = any> {
  /**
   * Should parse the parameters
   * @param params
   */
  constructor(protected pipeline: Pipeline, protected params: T) {}

  /**
   *
   * @param input
   * @returns true if processor request pipeline interruption
   */
  process(input: any): boolean | void {
    return this.subprocess(input);
  }

  getValue(value: string) {
    let currentValue = value;
    let res = "";
    let ind;
    // Look for {{ }}
    while ((ind = currentValue.indexOf("{{")) >= 0) {
      // Do something
      res += currentValue.substring(0, ind);
      currentValue = currentValue.substring(ind + 2);
      currentValue = currentValue.substring(currentValue.indexOf("}}") + 2);
    }
    res += currentValue;
    if (res.trim().length === 0) {
      return undefined;
    }
    return res;
  }

  /**
   * Check for {{ }} variables
   */
  setFieldValue(input: any, field: string, value: any) {
    value = this.getValue(value);
    if (value) {
      input[field] = value;
    }
  }
  /**
   * Implement the processing
   * Common filtering will happen within the process method
   * @param input
   */
  abstract subprocess(input: any): boolean | void;
}

/**
 * Set a value for an object
 */
export class SetProcessor extends Processor<{
  /**
   * Field to set
   */
  field: string;
  /**
   * Value to set
   */
  value: string;
}> {
  /**
   *
   * @param params
   */
  constructor(pipeline: Pipeline, params: any) {
    super(pipeline, params);
  }

  subprocess(input: any): boolean | void {
    this.setFieldValue(input, this.params.field, this.params.value);
  }
}

/**
 * Rename a field for an object
 */
export class RenameProcessor extends Processor<{
  /**
   * Field to rename from
   */
  field: string;
  /**
   * Field to rename to
   */
  target_field: string;
  /**
   * Ignore if not found
   */
  ignore_missing: boolean;
}> {
  subprocess(input: any): boolean | void {
    if (!this.params.ignore_missing && input[this.params.field] === undefined) {
      throw new Error("Field not found");
    }
    input[this.params.target_field] = input[this.params.field];
    delete input[this.params.field];
  }
}

/**
 * Uppercase the field
 */
export class UppercaseProcessor extends Processor<{
  /**
   * Field to rename from
   */
  field: string;
  /**
   * Ignore if not found
   */
  ignore_missing: boolean;
}> {
  subprocess(input: any): boolean | void {
    //code implementation
    input[this.params.field] = input[this.params.field].toUpperCase();
  }
}

/**
 * LowerCase the field
 */
export class LowercaseProcessor extends Processor<{
  /**
   * Field to rename from
   */
  field: string;
  /**
   * Ignore if not found
   */
  ignore_missing: boolean;
}> {
  subprocess(input: any): boolean | void {
    //code implementation
    input[this.params.field] = input[this.params.field].toLowerCase();
  }
}
/**
 * Remove the field
 */
export class RemoveProcessor extends Processor<{
  /**
   * Field to remove from
   */
  field: string;
  /**
   * Ignore if not found
   */
  ignore_missing: boolean;
}> {
  subprocess(input: any): boolean | void {
    delete input[this.params.field];
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

export class UnknownProcessorError extends Error {
  constructor(name: string) {
    super(`Unknown Processor for Pipeline ${name}`);
  }
}

/**
 * Consume a queue and repost to another queue with a transformation
 *
 * Can also transform manually
 */
export class PipelineService<T extends PipelineServiceParameters = PipelineServiceParameters> extends Service<T> {
  private processors: { [key: string]: new (pipeline: Pipeline, params: any) => Processor } = {};

  /**
   * @override
   */
  resolve() {
    super.resolve();
    this.registerProcessorType("set", SetProcessor);
    this.registerProcessorType("set", SetProcessor);
    this.registerProcessorType("rename", RenameProcessor);
    this.registerProcessorType("uppercase", UppercaseProcessor);
    this.registerProcessorType("lowercase", LowercaseProcessor);
    this.registerProcessorType("remove", RemoveProcessor);
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
  getProcessorInstance(pipeline: Pipeline, name: string, params: any): Processor {
    if (!this.processors[name]) {
      throw new UnknownProcessorError(name);
    }
    return new this.processors[name](pipeline, params);
  }

  /**
   * Consume the queue
   */
  consume(): CancelablePromise {
    return this.getService<Queue>(this.parameters.inputQueue).consume(async msg => {
      this.process(msg);
    });
  }

  /**
   * Load a pipeline definition from filesystem
   * @param file
   */
  async loadDefinitionFile(file: string): Promise<Pipeline> {
    return this.loadDefinition(FileUtils.load(file));
  }

  /**
   * Load pipeline definition
   * @param definition
   */
  async loadDefinition(definition: any): Promise<Pipeline> {
    return new Pipeline(this).load(definition);
  }

  process(input: any, pipelineName?: string): boolean {
    return false;
  }

  async processLogFile(logFile: string) {
    await this.getWebda().getRegistry().get("pipelineLogs", undefined, {});
    let offset = 0;
    const inputs = readFileSync(logFile)
      .toString()
      .split("\n")
      .map(f => {
        let res: any = {
          "log.offset": offset,
          "input.type": "log",
          "fileset.name": "log"
        };
        offset += f.length + 1;
        try {
          return {
            ...res,
            ...JSON.parse(f)
          };
        } catch (err) {}
        if (f.trim().length === 0) {
          return undefined;
        }
        res = {
          message: f,
          "event.dataset": "awsfargate.log",
          "event.module": "awsfargate",
          "service.type": "awsfargate"
        };
        return res;
      });
    return inputs;
  }
}
