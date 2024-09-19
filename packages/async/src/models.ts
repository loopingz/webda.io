import { Action, Core, CoreModel, OperationContext, WebContext, WebdaError } from "@webda/core";
import { WorkerLogLevel } from "@webda/workout";
import * as crypto from "crypto";

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
   * If an error occured it should contain the name
   */
  public errorName?: string;
  /**
   * Job information
   */
  public job: unknown;

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

  getLogsLimit() {
    return 1000;
  }

  /**
   * Allow to report status for a job
   * @param context
   */
  @Action({ name: "status", openapi: { hidden: true } })
  public async statusAction(context: WebContext) {
    await this.update(await context.getRequestBody(), context.getHttpContext().getUniqueHeader("X-Job-Time"));
    context.write({ ...this, logs: undefined, statusDetails: undefined });
  }

  /**
   * Return the hook url if empty fallback to the service url
   * @returns
   */
  public getHookUrl(): string {
    return Core.get().getApiUrl(`${Core.get().getRouter().getModelUrl(this)}/${this.uuid}`);
  }

  /**
   *
   * @param body
   */
  public async update(body: any, time: string = undefined) {
    if (body.logs && Array.isArray(body.logs)) {
      this.logs ??= [];
      this.logs.push(...body.logs);
      // Prevent having too much logs
      if (this.logs.length > this.getLogsLimit()) {
        this.logs = this.logs.slice(-1 * this.getLogsLimit());
      }
    }
    this._lastJobUpdate = Number.parseInt(time || "0") || 0;
    if (Date.now() - this._lastJobUpdate > 60) {
      this._lastJobUpdate = Date.now();
    }
    await this.patch(<any>{
      _lastJobUpdate: this._lastJobUpdate,
      logs: this.logs,
      status: body.status || this.status,
      errorMessage: body.errorMessage || this.errorMessage,
      statusDetails: body.statusDetails || this.statusDetails,
      results: body.results || this.results
    });
    return this;
  }

  /**
   *
   * @param context
   * @param action
   */
  protected async verifyJobRequest<K extends AsyncAction = AsyncAction>(context: WebContext): Promise<void> {
    const jobTime = context.getHttpContext().getUniqueHeader("X-Job-Time");
    const jobHash = context.getHttpContext().getUniqueHeader("X-Job-Hash");

    // Ensure hash mac is correct
    if (jobHash !== this.getHmac(jobTime)) {
      context.log("TRACE", "Invalid Job HMAC");
      throw new WebdaError.Forbidden("Invalid Job HMAC");
    }
    // Set the context extension
    context.setExtension("asyncJob", this);
  }

  /**
   * Get the hmac for the job
   * @param jobTime
   * @returns
   */
  getHmac(jobTime: string) {
    return crypto.createHmac("sha256", this.__secretKey).update(jobTime).digest("hex");
  }

  /**
   * Ensure action hook is ok
   * @param context
   * @param _action
   * @returns
   */
  public async checkAct(context: OperationContext<any, any>, action: string): Promise<void> {
    // Only action runner can call status action
    if ("status" === action) {
      if (context instanceof WebContext) {
        if (
          context.getHttpContext().getUniqueHeader("X-Job-Hash") &&
          context.getHttpContext().getUniqueHeader("X-Job-Time")
        ) {
          return await this.verifyJobRequest(context);
        }
      }
      throw new WebdaError.Forbidden("Only Job runner can call this action");
    }
    // Allow to retrieve/update binaries by action runner
    if (
      ["get_binary", "attach_binary", "update_binary_metadata"].includes(action) &&
      context.getHttpContext()?.getUniqueHeader("X-Job-Hash") &&
      context.getHttpContext()?.getUniqueHeader("X-Job-Time")
    ) {
      console.log(
        action,
        context.getHttpContext()?.getUniqueHeader("X-Job-Hash"),
        context.getHttpContext()?.getUniqueHeader("X-Job-Time")
      );
      return await this.verifyJobRequest(<WebContext>context);
    }
    return super.checkAct(context, action);
  }
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
  constructor(
    public serviceName?: string,
    public method?: string,
    ...args: any[]
  ) {
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
  constructor(
    public operationId: string,
    public context: OperationContext,
    public logLevel: WorkerLogLevel = "INFO"
  ) {
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
