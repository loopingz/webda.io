import {
  canCallOperation,
  Command,
  CronDefinition,
  CronService,
  listFullOperations,
  OperationContext,
  Queue,
  registerOperation,
  registerSchema,
  RequestFilter,
  Service,
  ServiceParameters,
  SimpleOperationContext,
  useApplication,
  useCore,
  useDynamicService,
  useModel,
  useParameters,
  validateSchema,
  ValidationError,
  WebContext,
  WebdaError
} from "@webda/core";
import type { ModelClass } from "@webda/core";
import * as WebdaQL from "@webda/ql";
import { CancelableLoopPromise, CancelablePromise, FileUtils, getUuid, JSONUtils, sleep } from "@webda/utils";
import { WorkerLogLevel } from "@webda/workout";
import axios, { AxiosResponse } from "axios";
import * as crypto from "node:crypto";
import { JSONSchema7 } from "json-schema";
import { schedule as crontabSchedule } from "node-cron";
import { AsyncAction, AsyncActionQueueItem, AsyncOperationAction, AsyncWebdaAction } from "../asyncaction.model.js";
import { Runner } from "./runner.service.js";
import { ServiceRunner, ServiceRunnerParameters } from "./servicerunner.service.js";

/**
 * Represent a Job information as you will find in env
 */
export interface JobInfo {
  JOB_ID: string;
  JOB_SECRET_KEY: string;
  JOB_HOOK: string;
  JOB_ORCHESTRATOR: string;
}

/**
 * @inheritdoc
 */
export class AsyncJobServiceParameters extends ServiceParameters {
  /**
   * If set runner will be called without queue
   *
   * @default false
   */
  localLaunch?: boolean;
  /**
   * Queue to post execution to
   * @default AsyncActionsQueue
   */
  queue: string;
  /**
   * URL to expose job status report hook
   *
   * @default /async
   */
  url: string;
  /**
   * Fallback on first runner if none match
   * @default false
   */
  fallbackOnFirst: boolean;
  /**
   * Runners to use
   */
  runners: string[];
  /**
   * Limit the maximum number of jobs running in //
   */
  concurrencyLimit?: number;
  /**
   * Define if we should only use an http hook and not rely on store for AsyncOperation
   *
   * @default false
   */
  onlyHttpHook?: boolean;
  /**
   * Include Cron annotation to launch them as AsyncOperationAction
   *
   * @default true
   */
  includeCron?: boolean;
  /**
   * Include the scheduler system in the worker
   */
  includeSchedulerInWorker?: boolean;

  /**
   * Schedule action resolution
   *
   * If set to 1000ms, you can schedule action per second
   * by default it resolve per minute
   *
   * @default 60000
   */
  schedulerResolution?: number;

  /**
   * Limit the number of lines of logs available for an async action
   *
   * If you need to store large amount of logs then you should use the CloudWatchLogger or similar logger
   *
   * @default 500
   */
  logsLimit: number;

  /**
   * Model to use when launching async action
   *
   * @default Webda/AsyncWebdaAction
   */
  asyncActionModel?: string;

  /**
   * Model to use when launching async operation
   *
   * @default Webda/AsyncOperationAction
   */
  asyncOperationModel?: string;
  /**
   * JSON file of the AsyncOperation definition
   *
   * Generated with `webda operations operations.json`
   */
  asyncOperationDefinition?: string;

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.url ??= "/async";
    this.queue ??= "AsyncActionsQueue";
    this.runners ??= [];
    this.schedulerResolution ??= 60000;
    this.onlyHttpHook ??= false;
    this.includeCron ??= true;
    this.logsLimit ??= 500;
    this.asyncActionModel ??= "Webda/AsyncWebdaAction";
    this.asyncOperationModel ??= "Webda/AsyncOperationAction";
    return this;
  }
}

/**
 * AsyncService allows you to launch jobs and report status
 *
 * @WebdaModda
 */
export default class AsyncJobService<T extends AsyncJobServiceParameters = AsyncJobServiceParameters>
  extends Service<T>
  implements RequestFilter<WebContext>
{
  /**
   * Queue for execution
   */
  protected queue: Queue<AsyncActionQueueItem>;

  /**
   * Runner to use
   */
  protected runners: Runner[];
  /**
   * HMAC Algorithm used for simple auth
   */
  static HMAC_ALGO: string = "sha256";
  /**
   * Model to use when launching action
   */
  model: (new (serviceName?: string, method?: string, ...args: any[]) => AsyncWebdaAction) &
    ModelClass<AsyncWebdaAction>;
  /**
   * Model to use when launching operation
   */
  operationModel: new (
    operationId: string,
    context: OperationContext,
    logLevel?: WorkerLogLevel
  ) => AsyncOperationAction;
  /**
   * Operations definition
   */
  protected operations: {
    application: { name: string; version: string };
    operations: { [key: string]: { id: string; input: string; output?: string; permission?: string } };
    schemas: { [key: string]: JSONSchema7 };
  };
  /**
   * Validator of sessions
   */
  protected operationsQueries: { [key: string]: WebdaQL.QueryValidator } = {};

  /**
   * @inheritdoc
   * @returns this
   */
  resolve(): this {
    super.resolve();
    this.model = <any>useModel(this.parameters.asyncActionModel);
    this.queue = this.parameters.queue ? useDynamicService(this.parameters.queue) : undefined;
    if (!this.queue && !this.parameters.localLaunch) {
      throw new Error(`AsyncService requires a valid queue. '${this.parameters.queue}' is invalid`);
    }
    // Get all runners
    this.runners = this.parameters.runners
      .map(n => {
        const res = useDynamicService<Runner>(n);
        if (res === undefined) {
          this.log("WARN", `Runner ${n} does not exist`);
        }
        return res;
      })
      .filter(r => r !== undefined);

    // Add route for operations launch
    if (this.parameters.asyncOperationDefinition) {
      this.log("INFO", "Loading operations", this.parameters.asyncOperationDefinition);
      this.addRoute(`${this.parameters.url}{?full}`, ["GET"], this.listOperations);
      this.addRoute(`${this.parameters.url}/{operationId}{?schedule}`, ["PUT"], this.launchOperation);
      this.operationModel = <any>useModel(this.parameters.asyncOperationModel);
      this.registerOperations(FileUtils.load(this.parameters.asyncOperationDefinition));
    }

    // This is internal job reporting so no need to document the api
    this.addRoute(`${this.parameters.url}/status`, ["POST"], this.statusHook, {
      hidden: true
    });
    return this;
  }

  /**
   * Register new operations
   * @param operations - the operations definition
   */
  registerOperations(operations: typeof this.operations) {
    this.operations ??= {
      application: operations.application || { name: "Unknown", version: "0.0.0" },
      operations: {},
      schemas: {}
    };
    // Register all schemas
    const app = useApplication();
    Object.keys(operations?.schemas || {})
      .filter(key => !app.getSchema(key))
      .forEach(key => {
        app.getSchemas()[key] = operations.schemas[key];
        registerSchema(key, operations.schemas[key]);
        this.operations.schemas[key] = operations.schemas[key];
      });
    // Register all operations now
    Object.keys(operations?.operations || {}).forEach(key => {
      registerOperation(key, {
        ...operations.operations[key],
        method: "callOperation",
        service: this.getName()
      });
      this.operations.operations[key] = operations.operations[key];
    });
  }

  /**
   * Allow job status report url
   * @param context - the web context
   * @returns true if the request is a job status report
   */
  async checkRequest(context: WebContext): Promise<boolean> {
    const url = context.getHttpContext().getRelativeUri();
    // Only for status endpoint - operations endpoint should still be authorized by something else
    if (url === `${this.parameters.url}/status`) {
      // Allow status url to be called without other mechanism
      const httpContext = context.getHttpContext();
      return ["X-Job-Id", "X-Job-Time", "X-Job-Hash"].every(v => httpContext.getUniqueHeader(v) !== undefined);
    }
    return false;
  }

  /**
   * Status hook for job report
   *
   * Only updates specific fields: status, errorMessage, statusDetails, results, logs (appending)
   * @param context - the web context
   */
  protected async statusHook(context: WebContext) {
    if (!context.getHttpContext().getUniqueHeader("X-Job-Id")) {
      throw new WebdaError.NotFound("X-Job-Id header required");
    }
    const jobId = context.getHttpContext().getUniqueHeader("X-Job-Id");
    if (!(await this.model.ref(jobId).exists())) {
      throw new WebdaError.NotFound(`Unknown Job Id '${jobId}'`);
    }
    const action = await this.model.ref(jobId).get();
    await action.statusAction(context);
  }

  /**
   * Worker
   *
   * This will launch actions based on defined runners
   * @returns a cancelable promise
   */
  @Command("async worker", { description: "Launch the async actions worker" })
  worker(): CancelablePromise<void> {
    if (this.runners.length === 0) {
      throw new Error(`AsyncJobService.worker requires runners`);
    }
    const p: CancelablePromise[] = [this.queue.consume(this.handleEvent.bind(this))];
    if (this.parameters.includeSchedulerInWorker) {
      p.push(this.scheduler());
    }
    // Return a cancelable promise for both worker and scheduler
    return new CancelablePromise(
      (resolve, reject) => {
        Promise.all(p).then(() => resolve(), reject);
      },
      async () => {
        this.log("INFO", "Worker stopped");
        await Promise.all(p.map(pi => (pi.cancel ? pi.cancel() : "")));
      }
    );
  }

  /**
   * Handle one event from the queue and launch the job
   * @param event - the queue item
   * @returns the job promise if any
   */
  protected async handleEvent(event: AsyncActionQueueItem): Promise<void> {
    let selectedRunner;
    // Take first to acknowledge the job
    for (const runner of this.runners) {
      if (runner.handleType(event.type)) {
        selectedRunner = runner;
        break;
      }
    }
    // Fallback if needed
    if (selectedRunner === undefined && this.parameters.fallbackOnFirst) {
      selectedRunner = this.runners[0];
    }
    if (selectedRunner === undefined) {
      this.log("ERROR", `Cannot find a runner for action ${event.uuid}`);
      await this.model.ref(event.uuid).patch({
        status: "ERROR",
        errorMessage: `No runner found for the job`
      });
      return;
    }
    this.log("INFO", `Starting action ${event.uuid}`);
    await this.model.ref(event.uuid).patch({
      status: "STARTING"
    });
    const action = await this.model.ref(event.uuid).get();
    const job = await selectedRunner.launchAction(action, this.getJobInfo(action));
    await action.patch({ job });
    return job.promise || Promise.resolve();
  }

  /**
   * Absolute url of the status hook remote runners POST their reports to
   *
   * It is this service status route: its request filter lets the job headers through
   * and the HMAC is then verified by the action
   * @returns the hook url
   */
  getHookUrl(): string {
    return `${useParameters().apiUrl ?? ""}${this.parameters.url}/status`;
  }

  /**
   * Get the job info
   * @param action - the action
   * @returns the job information
   */
  getJobInfo(action: AsyncAction): JobInfo {
    return {
      JOB_SECRET_KEY: action.__secretKey,
      JOB_ID: action.uuid,
      JOB_HOOK: this.parameters.onlyHttpHook || !action.isInternal() ? this.getHookUrl() : "store",
      JOB_ORCHESTRATOR: this.getName()
    };
  }

  /**
   * List available operations through this service
   * @param context - the web context
   */
  async listOperations(context: WebContext<void, { full?: boolean }>): Promise<void> {
    const filtered: typeof this.operations = JSONUtils.duplicate(this.operations);
    // Filter operations based on permissions
    Object.keys(filtered.operations)
      .filter(key => filtered.operations[key].permission && !canCallOperation(context, key))
      .forEach(key => delete filtered.operations[key]);

    // Remove permission definition
    Object.values(filtered.operations)
      .filter(def => def.permission)
      .forEach(def => delete def.permission);
    if (!context.getParameters().full) {
      context.write(Object.keys(filtered.operations));
      return;
    }
    const schemas = [];
    Object.values(filtered.operations).forEach((operation: any) => {
      if (operation.input && operation.input !== "void") {
        schemas.push(operation.input);
      }
      if (operation.output && operation.output !== "void") {
        schemas.push(operation.output);
      }
    });
    // Filter schemas
    Object.keys(filtered.schemas)
      .filter(key => !schemas.includes(key))
      .forEach(key => {
        delete filtered.schemas[key];
      });
    context.write(filtered);
  }

  /**
   * Call an operation for an external system
   * @param context - the operation context
   * @returns the launched action
   */
  async callOperation(context: OperationContext) {
    return await this.launchAction(new this.operationModel(context.getExtension("operation"), context));
  }

  /**
   * Check the operation exists, is allowed and its input is valid
   * @param context - the operation context
   * @param operationId - the operation id
   */
  async checkOperation(context: OperationContext, operationId: string): Promise<void> {
    const operation = listFullOperations()[operationId];
    if (!operation) {
      throw new WebdaError.NotFound(`${operationId} Unknown`);
    }
    if (!canCallOperation(context, operationId)) {
      throw new WebdaError.Forbidden(`${operationId} PermissionDenied`);
    }
    if (operation.input && operation.input !== "void") {
      try {
        validateSchema(operation.input, await context.getInput());
      } catch (err) {
        if (err instanceof ValidationError) {
          throw new WebdaError.BadRequest(`${operationId} InvalidInput ${err.message}`);
        }
        throw err;
      }
    }
  }

  /**
   * Launch an operation through this service
   * @param context - the web context
   */
  async launchOperation(context: WebContext) {
    const { operationId, schedule } = context.getParameters();
    await this.checkOperation(context, operationId);
    let action;
    if (schedule) {
      action = await this.scheduleAction(
        new this.operationModel(operationId, await SimpleOperationContext.fromContext(context)),
        schedule
      );
    } else {
      action = await this.callOperation(
        (await SimpleOperationContext.fromContext(context)).setExtension("operation", operationId)
      );
    }
    context.write(action);
  }

  /**
   * Launch the action asynchronously
   * @param action - the action
   * @returns the action
   */
  async launchAction<A extends AsyncAction>(action: A): Promise<A> {
    action.status = "QUEUED";
    action.type = action.constructor.name;
    action.__secretKey = getUuid();
    await action.save();
    const item = { uuid: action.uuid, __secretKey: action.__secretKey, type: action.type };
    if (this.parameters.localLaunch) {
      // Directly call the handler but not wait for its result
      this.handleEvent(item);
    } else {
      await this.queue.sendMessage(item);
    }
    return action;
  }

  /**
   * Schedule action for later execution
   *
   * @param action - the action
   * @param timestamp - when to launch it
   * @returns the action
   */
  async scheduleAction<A extends AsyncAction>(action: A, timestamp: number): Promise<A> {
    action.status = "SCHEDULED";
    action.type = action.constructor.name;
    // Schedule based on the scheduler resolution
    action.scheduled = timestamp - (timestamp % this.parameters.schedulerResolution);
    await action.save();
    return action;
  }

  /**
   * Return headers to request status hook
   *
   * @param jobInfo - the job information
   * @returns the headers
   */
  getHeaders(jobInfo: JobInfo) {
    const res: { [key: string]: string } = {
      "X-Job-Id": jobInfo.JOB_ID,
      "X-Job-Time": Date.now().toString()
    };
    res["X-Job-Hash"] = crypto
      .createHmac(AsyncJobService.HMAC_ALGO, jobInfo.JOB_SECRET_KEY)
      .update(res["X-Job-Time"])
      .digest("hex");
    return res;
  }

  /**
   * Post hook to a remote url or use local store to update status
   * @param jobInfo - the job information
   * @param message - the status report
   * @returns the updated action
   */
  async postHook(jobInfo: JobInfo, message: any): Promise<AsyncWebdaAction> {
    // Http allow to break paradigm between the executor and the orchestrator
    if (jobInfo.JOB_HOOK.startsWith("http")) {
      return (
        await axios.post<any, AxiosResponse<AsyncWebdaAction>>(jobInfo.JOB_HOOK, message, {
          headers: this.getHeaders(jobInfo)
        })
      ).data;
    } else if (jobInfo.JOB_HOOK === "store") {
      // If executor and orchestrator runs within same privilege it simplify the infrastructure
      return <Promise<AsyncWebdaAction>>(await this.model.ref(jobInfo.JOB_ID).get()).update(message);
    }
  }

  /**
   * Launch a service.method as an AsyncAction
   * @param serviceName - the service
   * @param method - the method
   * @param args - the arguments
   * @returns the action
   */
  async launchAsAsyncAction(serviceName: string, method: string, ...args: any[]) {
    return this.launchAction(new this.model(serviceName, method, ...args));
  }

  /**
   * Execute a service.method as an AsyncAction
   *
   * Useful for crontab execution
   * @param serviceName - the service
   * @param method - the method
   * @param args - the arguments
   * @returns the execution promise
   */
  async executeAsAsyncAction(serviceName: string, method: string, ...args): Promise<void> {
    let runner = <ServiceRunner>Object.values(useCore().getServices()).find(s => s instanceof ServiceRunner);
    // Create a temporary one if needed
    runner ??= await new ServiceRunner(
      this.getName() + "_temprunner",
      new ServiceRunnerParameters().load({ type: "Webda/ServiceRunner" })
    )
      .resolve()
      .init();
    // Save action
    const action = await new this.model(serviceName, method, ...args).save();
    // Run it
    return (await runner.launchAction(action, this.getJobInfo(action))).promise;
  }

  /**
   * Run the AsyncAction described by the JOB_* environment variables
   * @returns the execution promise
   */
  @Command("async run", { description: "Run the async action described by the JOB_* environment variables" })
  async runAction(): Promise<void> {
    return this.runAsyncOperationAction();
  }

  /**
   * Wrap async job and call the job status hook
   * @param jobInfo - the job information, from environment if not provided
   * @returns a promise resolved once the job is reported
   */
  async runAsyncOperationAction(jobInfo?: JobInfo): Promise<void> {
    // Get it from environment
    if (jobInfo === undefined) {
      jobInfo = <JobInfo>{};
      Object.keys(process.env)
        .filter(k => k.startsWith("JOB_"))
        // @ts-ignore
        .forEach((k: string) => (jobInfo[k] = process.env[k]));
    }
    // Ensure correct context
    if (!jobInfo.JOB_ORCHESTRATOR || !jobInfo.JOB_ID || !jobInfo.JOB_SECRET_KEY || !jobInfo.JOB_HOOK) {
      this.log("ERROR", "Cannot run AsyncAction without context");
      throw new Error("Cannot run AsyncAction without context");
    }
    // If we are not the target redirect to the right one
    if (jobInfo.JOB_ORCHESTRATOR !== this.getName()) {
      this.log("DEBUG", `Passing jobInfo ${jobInfo} to targeted service`);
      return useDynamicService<AsyncJobService>(jobInfo.JOB_ORCHESTRATOR).runAsyncOperationAction(jobInfo);
    }
    this.log("DEBUG", "Getting action to execute from hook", jobInfo);
    // Get action info by calling the hook
    const action = await this.postHook(jobInfo, {
      agent: {
        ...Runner.getAgentInfo(),
        nodeVersion: process.version
      },
      status: "RUNNING"
    });
    this.log("DEBUG", "Action received", action.serviceName, action.method, action.arguments);
    let results;
    try {
      // Check it contains the right info
      if (!action.method || !action.serviceName) {
        throw new Error("WebdaAsyncAction must have method and serviceName defined at least");
      }
      // Call the service[method](...args)
      const service = useDynamicService(action.serviceName);
      if (!service) {
        throw new Error(`WebdaAsyncAction Service '${action.serviceName}' not found: mismatch app version`);
      }
      // @ts-ignore
      if (!service[action.method]) {
        throw new Error(
          `WebdaAsyncAction Method '${action.method}' not found in service ${action.serviceName}: mismatch app version`
        );
      }
      // @ts-ignore
      results = await service[action.method](...(action.arguments || []));
    } catch (err) {
      // Job is in error
      await this.postHook(jobInfo, {
        errorMessage: <string | undefined>err?.message,
        status: "ERROR"
      });
      return;
    }
    // Update status
    await this.postHook(jobInfo, {
      results,
      status: "SUCCESS"
    });
  }

  /**
   * Get the cron callback function
   * @param cron - the cron definition
   * @returns the cron callback
   */
  getCronExecutor(cron: CronDefinition) {
    return async () => {
      try {
        this.log(
          "INFO",
          `Execute cron ${cron.cron}: ${cron.serviceName}.${cron.method}(...) # ${cron.description} as an AsyncOperationAction`
        );
        await this.launchAction(new this.model(cron.serviceName, cron.method, cron.args));
      } catch (err) {
        this.log(
          "ERROR",
          `Execution error cron ${cron.cron}: ${cron.serviceName}.${cron.method}(...) # ${cron.description} - ${err}`
        );
      }
    };
  }

  /**
   * Manage scheduled actions and crontab actions
   * @returns a cancelable loop promise
   */
  @Command("async scheduler", { description: "Launch the async actions scheduler" })
  scheduler(): CancelableLoopPromise {
    // Map cron to an AsyncOperationAction
    // It allows you to keep a trace of the cron execution in the AsyncAction
    if (this.parameters.includeCron) {
      CronService.loadAnnotations(useCore().getServices()).forEach(cron => {
        this.log("INFO", `Schedule cron ${cron.cron}: ${cron.serviceName}.${cron.method}(...) # ${cron.description}`);
        crontabSchedule(cron.cron, this.getCronExecutor(cron));
      });
    }
    // Every schedulerResolution will check for scheduled task
    return new CancelableLoopPromise(async () => {
      let time = Date.now();
      time -= time % this.parameters.schedulerResolution;
      // Queue all actions
      await Promise.all(
        (await this.model.query(`status = 'SCHEDULED' AND scheduled < ${time + 1}`)).results.map(a =>
          this.launchAction(a)
        )
      );
      time += this.parameters.schedulerResolution;
      // Wait for next scheduler resolution
      if (time > Date.now()) {
        await sleep(time - Date.now());
        /* c8 ignore next */
      }
    });
  }
}

export { AsyncJobService };
