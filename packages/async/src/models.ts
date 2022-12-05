import { CoreModel, OperationContext } from "@webda/core";
import { WorkerLogLevel } from "@webda/workout";

/**
 * Represent an item for processing queue
 */
export interface AsyncActionQueueItem {
  /**
   * Item to launch
   */
  uuid: string;
  /**
   * Secret key for status hook
   */
  __secretKey: string;
  /**
   * Type of action
   */
  type: string;
}

/**
 * Job information
 */
export interface Job {}

/**
 * Define here a model that can be used along with Store service
 * @WebdaModel
 */
export default class AsyncAction extends CoreModel {
  /**
   * Set type
   */
  constructor() {
    super();
    this.type = this.constructor.name;
  }

  /**
   * By default AsyncAction are not considered internal
   *
   * Internal: That execute a method or operation of Webda application framework
   * @returns
   */
  isInternal(): boolean {
    return false;
  }
  /**
   * Action uuid
   */
  public uuid: string;
  /**
   * Current status
   */
  public status: "RUNNING" | "SUCCESS" | "ERROR" | "QUEUED" | "STARTING" | "TIMEOUT" | "SCHEDULED";

  /**
   * Timestamp when the action was scheduled
   */
  public scheduled?: number;

  /**
   * If an error occured it should contain the message
   */
  public errorMessage?: string;
  /**
   * Job information
   */
  public job: Job;

  /**
   * Last time the job was updated
   */
  public _lastJobUpdate: number;
  /**
   * Results from the job
   */
  public results: any;

  /**
   * Job current status
   */
  public statusDetails: any;

  /**
   *
   */
  public type: string;

  /**
   *
   */
  public arguments?: any[];

  /**
   * Current logs
   */
  public logs: string[];

  /**
   * Secret key to post feedback
   */
  public __secretKey: string;

  /**
   * Expected action for the job
   *
   * It should be a verb
   */
  public action?: "STOP" | string;
}

/**
 * Define a Webda Async Action
 *
 * @WebdaModel
 */
export class AsyncWebdaAction extends AsyncAction {
  public logLevel: WorkerLogLevel = "INFO";
  /**
   *
   * @param serviceName service to call
   * @param method method to call
   * @param arguments to call with the method
   */
  constructor(public serviceName?: string, public method?: string, ...args: any[]) {
    super();
    this.arguments = args;
  }

  /**
   * Execute a serviceName.method(...args) so this is internal
   * @returns
   */
  isInternal() {
    return true;
  }
}

/**
 * Operation called asynchronously
 *
 * @WebdaModel
 */
export class AsyncOperationAction extends AsyncAction {
  constructor(public operationId: string, public context: OperationContext, public logLevel: WorkerLogLevel = "INFO") {
    super();
  }

  /**
   * Execute a webda.callOperation(context ,id) so this is internal
   * @returns
   */
  isInternal() {
    return true;
  }
}

export { AsyncAction };
