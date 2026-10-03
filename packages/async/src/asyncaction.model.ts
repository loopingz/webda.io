import {
  Action,
  CoreModel,
  IOperationContext,
  OperationContext,
  WebContext,
  WebdaError,
  useContext,
  useLog,
  useParameters,
  useRouter
} from "@webda/core";
import { WorkerLogLevel } from "@webda/workout";
import * as crypto from "node:crypto";

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
 * Headers sent by a job runner to authenticate against the status hook
 */
const JOB_HEADERS = ["X-Job-Hash", "X-Job-Time"];

/**
 * Check if the context carries the job runner headers
 * @param context - the context to check
 * @returns true if both job headers are present
 */
function hasJobHeaders(context: IOperationContext): context is WebContext {
  return (
    context instanceof WebContext &&
    JOB_HEADERS.every(h => context.getHttpContext()?.getUniqueHeader(h) !== undefined)
  );
}

/**
 * Define here a model that can be used along with Store service
 * @WebdaModel
 * @WebdaPlural AsyncActions
 */
export default class AsyncAction extends CoreModel {
  /**
   * Create a new action
   * @param data - initial data
   */
  constructor(data?: Partial<AsyncAction>) {
    super(data);
    if (data) {
      Object.assign(this, data);
    }
    this.type ??= this.constructor.name;
  }

  /**
   * By default AsyncAction are not considered internal
   *
   * Internal: That execute a method or operation of Webda application framework
   * @returns false
   */
  isInternal(): boolean {
    return false;
  }
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
  public job: any;

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
   * Type of action
   */
  public type: string;

  /**
   * Arguments of the action
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

  /**
   * Maximum number of log lines kept
   * @returns the limit
   */
  getLogsLimit() {
    return 1000;
  }

  /**
   * Allow to report status for a job
   *
   * Only a job runner with a valid HMAC can call it
   * @param context - the web context of the job runner
   */
  @Action({ name: "status", openapi: { hidden: true } })
  public async statusAction(context: OperationContext = useContext()) {
    if (!(context instanceof WebContext)) {
      throw new Error("Only WebContext can call this action");
    }
    await this.checkAct(context, "status");
    await this.update(await context.getRequestBody(), context.getHttpContext().getUniqueHeader("X-Job-Time"));
    context.write({ ...this, logs: undefined, statusDetails: undefined });
  }

  /**
   * Return the hook url if empty fallback to the service url
   * @returns the absolute url of this action
   */
  public getHookUrl(): string {
    return `${useParameters().apiUrl ?? ""}${useRouter().getModelUrl(this)}/${this.uuid}`;
  }

  /**
   * Update the action with a status report
   * @param body - the status report
   * @param time - the job time header
   * @returns this
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
   * Verify the job HMAC headers
   * @param context - the web context
   */
  protected async verifyJobRequest(context: WebContext): Promise<void> {
    const jobTime = context.getHttpContext().getUniqueHeader("X-Job-Time");
    const jobHash = context.getHttpContext().getUniqueHeader("X-Job-Hash");

    // Ensure hash mac is correct
    if (jobHash !== this.getHmac(jobTime)) {
      useLog("TRACE", "Invalid Job HMAC");
      throw new WebdaError.Forbidden("Invalid Job HMAC");
    }
    // Set the context extension
    context.setExtension("asyncJob", this);
  }

  /**
   * Get the hmac for the job
   * @param jobTime - the job time header
   * @returns the hex hmac
   */
  getHmac(jobTime: string) {
    return crypto.createHmac("sha256", this.__secretKey).update(jobTime).digest("hex");
  }

  /**
   * Only job runners with a valid HMAC can report status or use binaries
   * @param context - the operation context
   * @param action - the action
   * @returns true or the reason of refusal
   */
  async canAct(context: IOperationContext, action: string): Promise<string | boolean> {
    if ("status" === action || ["get_binary", "attach_binary", "update_binary_metadata"].includes(action)) {
      if (!hasJobHeaders(context)) {
        return "Only Job runner can call this action";
      }
      try {
        await this.verifyJobRequest(context);
        return true;
      } catch (err) {
        return err.message;
      }
    }
    return "This model does not support any action: override canAct";
  }

  /**
   * Throw a Forbidden error if the action is not allowed
   * @param context - the operation context
   * @param action - the action
   */
  async checkAct(context: IOperationContext, action: string): Promise<void> {
    const result = await this.canAct(context, action);
    if (result !== true) {
      throw new WebdaError.Forbidden(typeof result === "string" ? result : "Forbidden");
    }
  }
}

/**
 * Define a Webda Async Action
 *
 * @WebdaModel
 * @WebdaPlural AsyncWebdaActions
 */
export class AsyncWebdaAction extends AsyncAction {
  /**
   * Log level to capture
   */
  public logLevel: WorkerLogLevel;
  /**
   * Service to call
   */
  public serviceName?: string;
  /**
   * Method to call
   */
  public method?: string;

  /**
   * @param serviceName service to call or initial data
   * @param method method to call
   * @param args to call with the method
   */
  constructor(serviceName?: string | Partial<AsyncWebdaAction>, method?: string, ...args: any[]) {
    super(typeof serviceName === "object" ? <any>serviceName : undefined);
    if (typeof serviceName !== "object") {
      this.serviceName = serviceName;
      this.method = method;
      this.arguments = args;
    }
    this.logLevel ??= "INFO";
  }

  /**
   * Execute a serviceName.method(...args) so this is internal
   * @returns true
   */
  isInternal() {
    return true;
  }
}

/**
 * Operation called asynchronously
 *
 * @WebdaModel
 * @WebdaPlural AsyncOperationActions
 */
export class AsyncOperationAction extends AsyncAction {
  /**
   * Operation to call
   */
  public operationId: string;
  /**
   * Context to call the operation with
   */
  public context: any;
  /**
   * Log level to capture
   */
  public logLevel: WorkerLogLevel;

  /**
   * @param operationId operation to call or initial data
   * @param context context to use
   * @param logLevel log level to capture
   */
  constructor(
    operationId?: string | Partial<AsyncOperationAction>,
    context?: OperationContext,
    logLevel: WorkerLogLevel = "INFO"
  ) {
    super(typeof operationId === "object" ? <any>operationId : undefined);
    if (typeof operationId !== "object") {
      this.operationId = operationId;
      this.context = context;
      this.logLevel = logLevel;
    }
    this.logLevel ??= "INFO";
  }

  /**
   * Execute a webda.callOperation(context ,id) so this is internal
   * @returns true
   */
  isInternal() {
    return true;
  }
}

export { AsyncAction };
