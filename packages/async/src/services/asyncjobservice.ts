import {
  CancelableLoopPromise,
  CloudBinary,
  Constructor,
  Core,
  CronDefinition,
  CronService,
  FileUtils,
  JSONUtils,
  OperationContext,
  OperationError,
  Queue,
  RequestFilter,
  Service,
  ServiceParameters,
  SimpleOperationContext,
  Store,
  WebContext,
  WebdaError,
  WebdaQL
} from "@webda/core";
import { WorkerLogLevel } from "@webda/workout";
import axios, { AxiosResponse } from "axios";
import * as crypto from "crypto";
import { JSONSchema7 } from "json-schema";
import { schedule as crontabSchedule } from "node-cron";
import { AsyncAction, AsyncActionQueueItem, AsyncOperationAction, AsyncWebdaAction } from "../models";
import { Runner } from "./runner";
import ServiceRunner from "./servicerunner";

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
   * Store name to use for async actions
   * @default AsyncActions
   */
  store: string;
  /**
   * If we want to expose a way to upload/download binary for the job
   *
   * It will expose a /download and /upload additional url
   */
  binaryStore?: string;
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
   * @default /async/jobs
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

  constructor(params: any) {
    super(params);
    this.url ??= "/async/jobs";
    this.queue ??= "AsyncActionsQueue";
    this.store ??= "AsyncActions";
    this.runners ??= [];
    this.schedulerResolution ??= 60000;
    this.onlyHttpHook ??= false;
    this.includeCron ??= true;
    this.logsLimit ??= 500;
    this.asyncActionModel ??= "Webda/AsyncWebdaAction";
    this.asyncOperationModel ??= "Webda/AsyncOperationAction";
  }
}

/**
 * AsyncService allows you to launch jobs and report status
 *
 * @WebdaModda
 */
export default class AsyncJobService<T extends AsyncJobServiceParameters = AsyncJobServiceParameters>
  extends Service<T>
  implements RequestFilter
{
  /**
   * Queue for execution
   */
  protected queue: Queue<AsyncActionQueueItem>;
  /**
   * Store for async actions
   */
  protected store: Store<AsyncAction>;

  /**
   * Runner to use
   */
  protected runners: Runner[];
  /**
   * HMAC Algorithm used for simple auth
   */
  static HMAC_ALGO: string = "sha256";
  /**
   * If we want job to be able to upload/download
   */
  protected binaryStore: CloudBinary;
  /**
   * Model to use when launching action
   */
  model: Constructor<AsyncWebdaAction, [string, string, ...any[]]>;
  /**
   * Model to use when launching action
   */
  operationModel: Constructor<AsyncOperationAction, [string, OperationContext, WorkerLogLevel?]>;
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
   */
  loadParameters(params: any): ServiceParameters {
    return new AsyncJobServiceParameters(params);
  }
  /**
   * @inheritdoc
   */
  resolve(): this {
    super.resolve();
    this.model = <any>this.getWebda().getModel(this.parameters.asyncActionModel);
    this.queue = this.getService(this.parameters.queue);
    if (!this.queue && !this.parameters.localLaunch) {
      throw new Error(`AsyncService requires a valid queue. '${this.parameters.queue}' is invalid`);
    }
    this.store = this.getService(this.parameters.store);
    if (!this.store) {
      throw new Error(`AsyncService requires a valid store. '${this.parameters.store}' is invalid`);
    }
    // Get all runners
    this.runners = this.parameters.runners
      .map(n => {
        const res = this.getService<Runner>(n);
        if (res === undefined) {
          this.log("WARN", `Runner ${n} does not exist`);
        }
        return res;
      })
      .filter(r => r !== undefined);

    // Add route for operations launch
    if (this.parameters.asyncOperationDefinition) {
      this.log("INFO", "Loading operations", this.parameters.asyncOperationDefinition);
      this.operations = FileUtils.load(this.parameters.asyncOperationDefinition);
      this.addRoute(`${this.parameters.url}{?full}`, ["GET"], this.listOperations);
      this.addRoute(`${this.parameters.url}/{operationId}{?schedule}`, ["PUT"], this.launchOperation);
      this.operationModel = <any>this.getWebda().getModel(this.parameters.asyncOperationModel);
      // Register all schemas
      Object.keys(this.operations?.schemas || {})
        .filter(key => !this.getWebda().getApplication().hasSchema(key))
        .forEach(key => {
          this.getWebda().getApplication().registerSchema(key, this.operations.schemas[key]);
        });
      // Register all operations now
      Object.keys(this.operations?.operations || {}).forEach(key => {
        this.getWebda().registerOperation(key, {
          ...this.operations.operations[key],
          method: "callOperation",
          service: this.getName()
        });
      });
    }

    // This is internal job reporting so no need to document the api
    this.addRoute(`${this.parameters.url}/status`, ["POST"], this.statusHook, {
      hidden: true
    });

    // Add upload/download route if needed
    if (this.parameters.binaryStore) {
      this.binaryStore = this.getService<CloudBinary>(this.parameters.binaryStore);
      // Call directly Webda addRoute as we are setting a route for another service in fact
      this.getWebda().addRoute(`${this.parameters.url}/download/{store}/{uid}/{property}/{index}`, {
        _method: this.binaryStore.httpGet,
        executor: this.parameters.binaryStore,
        openapi: { hidden: true },
        methods: ["GET"]
      });
      this.getWebda().addRoute(`${this.parameters.url}/upload/{store}/{uid}/{property}`, {
        _method: this.binaryStore.httpChallenge,
        executor: this.parameters.binaryStore,
        openapi: { hidden: true },
        methods: ["PUT"]
      });
    }
    this.getWebda().registerRequestFilter(this);
    return this;
  }

  /**
   * Allow job status report url
   */
  async checkRequest(context: WebContext): Promise<boolean> {
    const url = context.getHttpContext().getRelativeUri();
    // Only for status endpoint - operations endpoint should still be authorized by something else
    if (url === `${this.parameters.url}/status`) {
      // Allow status url to be called without other mechanism
      return true;
    }
    return false;
  }

  /**
   * Status hook for job report
   *
   * Only updates specific fields: status, errorMessage, statusDetails, results, logs (appending)
   */
  protected async statusHook(context: WebContext) {
    if (!context.getHttpContext().getUniqueHeader("X-Job-Id")) {
      throw new WebdaError.NotFound("X-Job-Id header required");
    }
    const action = await AsyncAction.ref(context.getHttpContext().getUniqueHeader("X-Job-Id")).get();
    if (!action) {
      throw new WebdaError.NotFound(`Unknown Job Id '${context.getHttpContext().getUniqueHeader("X-Job-Id")}'`);
    }
    await action.checkAct(context, "status");
    await action.statusAction(context);
  }

  /**
   * Worker
   *
   * This will launch actions based on defined runners
   */
  async worker() {
    if (this.runners.length === 0) {
      throw new Error(`AsyncJobService.worker requires runners`);
    }

    return this.queue.consume(this.handleEvent.bind(this));
  }

  /**
   * Handle one event from the queue and launch the job
   * @param event
   */
  protected async handleEvent(event: AsyncActionQueueItem) {
    let selectedRunner;
    // Take first to acknowledge the job
    for (let runner of this.runners) {
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
      await AsyncAction.ref(event.uuid).patch({
        status: "ERROR",
        errorMessage: `No runner found for the job`
      });
      return;
    }
    this.log("INFO", `Starting action ${event.uuid}`);
    await AsyncAction.ref(event.uuid).patch({
      uuid: event.uuid,
      status: "STARTING"
    });
    const action = await AsyncAction.ref(event.uuid).get();
    let job = await selectedRunner.launchAction(action, this.getJobInfo(action));
    await action.patch({ job }, null);
    return job.promise || Promise.resolve();
  }

  /**
   * Get the job info
   * @param action
   * @returns
   */
  getJobInfo(action: AsyncAction): JobInfo {
    return {
      JOB_SECRET_KEY: action.__secretKey,
      JOB_ID: action.getUuid(),
      JOB_HOOK:
        this.parameters.onlyHttpHook || !action.isInternal()
          ? action.getHookUrl() || this.getWebda().getApiUrl(this.parameters.url)
          : "store", // How to find the absolute url
      JOB_ORCHESTRATOR: this.getName()
    };
  }

  /**
   * List available operations through this service
   * @param context
   */
  async listOperations(
    context: WebContext<
      void,
      | {
          application: {
            name: string;
            version: string;
          };
          operations: {
            [key: string]: {
              id: string;
              input?: string;
              output?: string;
            };
          };
          schemas: { [key: string]: JSONSchema7 };
        }
      | string[]
    >
  ): Promise<void> {
    this.log("INFO", "Listing operations called");
    let filtered: typeof this.operations = JSONUtils.duplicate(this.operations);
    // Filter operations based on permissions
    Object.keys(filtered.operations)
      .filter(key => filtered.operations[key].permission && !this.getWebda().checkOperationPermission(context, key))
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
      if (operation.input) {
        schemas.push(operation.input);
      }
      if (operation.output) {
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
   * @param context
   * @returns
   */
  async callOperation(context: OperationContext) {
    return await this.launchAction(new this.operationModel(context.getExtension("operation"), context));
  }

  /**
   * Launch an operation through this service
   */
  async launchOperation(context: WebContext) {
    const { operationId, schedule } = context.getParameters();
    try {
      await this.getWebda().checkOperation(context, operationId);
    } catch (err) {
      if (err instanceof OperationError) {
        if (err.type === "InvalidInput") {
          throw new WebdaError.BadRequest("Invalid Input");
        } else if (err.type === "PermissionDenied") {
          throw new WebdaError.Forbidden("Permission Denied");
        } else if (err.type === "Unknown") {
          throw new WebdaError.NotFound("Operation not found");
        }
      } else {
        throw err;
      }
    }
    if (schedule) {
      await this.scheduleAction(
        new this.operationModel(operationId, await SimpleOperationContext.fromContext(context)),
        schedule
      );
    } else {
      await this.callOperation(
        (await SimpleOperationContext.fromContext(context)).setExtension("operation", operationId)
      );
    }
  }

  /**
   * Launch the action asynchronously
   * @param action
   * @returns
   */
  async launchAction(action: AsyncAction) {
    action.status = "QUEUED";
    action.type = action.constructor.name;
    action.__secretKey = this.getWebda().getUuid();
    await action.save();
    if (this.parameters.localLaunch) {
      return this.handleEvent({ uuid: action.getUuid(), __secretKey: action.__secretKey, type: action.type });
    }
    return this.queue.sendMessage({ uuid: action.getUuid(), __secretKey: action.__secretKey, type: action.type });
  }

  /**
   * Schedule action for later execution
   *
   * @param action
   * @param timestamp
   */
  async scheduleAction(action: AsyncAction, timestamp: number) {
    action.status = "SCHEDULED";
    action.type = action.constructor.name;
    // Schedule based on the scheduler resolution
    action.scheduled = timestamp - (timestamp % this.parameters.schedulerResolution);
    await action.save();
  }

  /**
   * Return headers to request status hook
   *
   * @param jobInfo
   * @returns
   */
  getHeaders(jobInfo: JobInfo) {
    let res: { [key: string]: string } = {
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
   * @param jobInfo
   * @param message
   * @returns
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
      return <Promise<AsyncWebdaAction>>(await AsyncAction.ref(jobInfo.JOB_ID).get()).update(message);
    }
  }

  /**
   * Launch a service.method as an AsyncAction
   * @param serviceName
   * @param method
   * @param args
   */
  async launchAsAsyncAction(serviceName: string, method: string, ...args: any[]) {
    return this.launchAction(new this.model(serviceName, method, ...args));
  }

  /**
   * Execute a service.method as an AsyncAction
   *
   * Useful for crontab execution
   * @param serviceName
   * @param method
   * @param args
   */
  async executeAsAsyncAction(serviceName: string, method: string, ...args): Promise<void> {
    let runner: ServiceRunner = Object.values(this.getWebda().getServicesOfType(ServiceRunner)).shift();
    // Create a temporary one if needed
    runner ??= await new ServiceRunner(this.getWebda(), this.getName() + "_temprunner").resolve().init();
    // Save action
    const action = await new this.model(serviceName, method, ...args).save();
    // Run it
    return (await runner.launchAction(action, this.getJobInfo(action))).promise;
  }

  /**
   * Wrap async job and call the job status hook
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
      return this.getService<AsyncJobService>(jobInfo.JOB_ORCHESTRATOR).runAsyncOperationAction(jobInfo);
    }
    this.log("DEBUG", "Getting action to execute from hook", jobInfo);
    // Get action info by calling the hook
    let action = await this.postHook(jobInfo, {
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
      let service = this.getService(action.serviceName);
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
   * @param cron
   * @returns
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
   * @returns
   */
  scheduler(): CancelableLoopPromise {
    // Map cron to an AsyncOperationAction
    // It allows you to keep a trace of the cron execution in the AsyncAction
    if (this.parameters.includeCron) {
      CronService.loadAnnotations(this._webda.getServices()).forEach(cron => {
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
        (await AsyncAction.query(`status = 'SCHEDULED' AND scheduled < ${time + 1}`)).results.map(a =>
          this.launchAction(a)
        )
      );
      time += this.parameters.schedulerResolution;
      // Wait for next scheduler resolution
      if (time > Date.now()) {
        await Core.sleep(time - Date.now());
        /* c8 ignore next */
      }
    });
  }
}

export { AsyncJobService };
