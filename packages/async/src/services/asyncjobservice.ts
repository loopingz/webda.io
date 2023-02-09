import {
  CancelableLoopPromise,
  CloudBinary,
  Constructor,
  Context,
  Core,
  CoreModel,
  CoreModelDefinition,
  CronDefinition,
  CronService,
  Queue,
  RequestFilter,
  Service,
  ServiceParameters,
  Store
} from "@webda/core";
import axios, { AxiosResponse } from "axios";
import * as crypto from "crypto";
import { schedule as crontabSchedule } from "node-cron";
import { v4 as uuidv4 } from "uuid";
import { AsyncAction, AsyncActionQueueItem, AsyncWebdaAction } from "../models";
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
  model: CoreModelDefinition<CoreModel> | Constructor<any>;

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
    this.model = this.getWebda().getModel(this.parameters.asyncActionModel);
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

    // This is internal job reporting so no need to document the api
    this.addRoute(`${this.parameters.url}/status`, ["POST"], this.statusHook, {
      hidden: true
    });

    // Add upload/download route if needed
    if (this.parameters.binaryStore) {
      this.binaryStore = this.getService<CloudBinary>(this.parameters.binaryStore);
      // Call directly Webda addRoute as we are setting a route for another service in fact
      this.getWebda().addRoute(`${this.parameters.url}/download/{store}/{uid}/{property}/{index}`, {
        _method: this.binaryStore.getRedirectUrlInfo,
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
  async checkRequest(context: Context): Promise<boolean> {
    const url = context.getHttpContext().getRelativeUri();
    if (url.startsWith(this.parameters.url)) {
      // Allow status url to be called without other mechanism
      await this.verifyJobRequest(context);
      return true;
    }
    return false;
  }

  /**
   *
   * @param context
   * @param action
   */
  async verifyJobRequest<K extends AsyncAction = AsyncAction>(context: Context): Promise<K> {
    const jobId = context.getHttpContext().getUniqueHeader("X-Job-Id");
    if (!jobId) {
      this.log("TRACE", "Require Job Id");
      throw 404;
    }
    const action = await this.store.get(jobId);
    if (!action) {
      this.log("TRACE", `Unknown Job Id '${jobId}'`);
      throw 404;
    }
    const jobTime = context.getHttpContext().getUniqueHeader("X-Job-Time");
    const jobHash = context.getHttpContext().getUniqueHeader("X-Job-Hash");
    // Ensure hash mac is correct
    if (jobHash !== crypto.createHmac(AsyncJobService.HMAC_ALGO, action.__secretKey).update(jobTime).digest("hex")) {
      this.log("TRACE", "Invalid Job HMAC");
      throw 403;
    }
    // Set the context extension
    context.setExtension("asyncJob", action);
    return <K>action;
  }

  /**
   * Status hook for job report
   *
   * Only updates specific fields: status, errorMessage, statusDetails, results, logs (appending)
   */
  protected async statusHook(context: Context) {
    let action = await this.verifyJobRequest(context);
    const body = await context.getRequestBody();
    action = await this.updateAction(
      action,
      body,
      Number.parseInt(context.getHttpContext().getUniqueHeader("X-Job-Time")) || 0
    );
    context.write({ ...action, logs: undefined, statusDetails: undefined });
  }

  /**
   * Update the async action from hook
   * @param action
   * @param body
   * @param lastUpdate
   * @returns
   */
  protected async updateAction(action: AsyncAction, body: Partial<AsyncAction>, lastUpdate: number = 0) {
    action._lastJobUpdate = lastUpdate;
    if (Date.now() - action._lastJobUpdate > 60) {
      action._lastJobUpdate = Date.now();
    }

    if (body.logs && Array.isArray(body.logs)) {
      action.logs.push(...body.logs);
      // Prevent having too much logs
      if (action.logs.length > this.parameters.logsLimit) {
        action.logs = action.logs.slice(-1 * this.parameters.logsLimit);
      }
    }
    ["status", "errorMessage", "statusDetails", "results"].forEach(k => {
      if (body[k] !== undefined) {
        // @ts-ignore
        action[k] = body[k];
      }
    });
    await this.store.patch(action, true, null);
    return action;
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
      await this.store.patch(
        {
          uuid: event.uuid,
          status: "ERROR",
          errorMessage: `No runner found for the job`
        },
        null
      );
      return;
    }
    this.log("INFO", `Starting action ${event.uuid}`);
    await this.store.patch(
      {
        uuid: event.uuid,
        status: "STARTING"
      },
      null
    );
    const action = await this.store.get(event.uuid);
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
        this.parameters.onlyHttpHook || !action.isInternal() ? this.getWebda().getApiUrl(this.parameters.url) : "store", // How to find the absolute url
      JOB_ORCHESTRATOR: this.getName()
    };
  }

  /**
   * Launch the action asynchronously
   * @param action
   * @returns
   */
  async launchAction(action: AsyncAction) {
    action.status = "QUEUED";
    action.type = action.constructor.name;
    action.__secretKey = uuidv4();
    await this.store.save(action);
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
    await this.store.save(action);
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
      return <Promise<AsyncWebdaAction>>this.updateAction(await this.store.get(jobInfo.JOB_ID), message);
    }
  }

  /**
   * Launch a service.method as an AsyncAction
   * @param serviceName
   * @param method
   * @param args
   */
  async launchAsAsyncAction(serviceName: string, method: string, ...args) {
    return this.launchAction(
      new (<Constructor<AsyncWebdaAction, [string, string, ...any[]]>>this.model)(serviceName, method, ...args)
    );
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
    const action = await new (<Constructor<AsyncWebdaAction, [string, string, ...any[]]>>this.model)(
      serviceName,
      method,
      ...args
    ).save();
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
        await this.launchAction(
          new (<Constructor<AsyncWebdaAction, [string, string, ...any[]]>>this.model)(
            cron.serviceName,
            cron.method,
            cron.args
          )
        );
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
        (
          await this.store.query(`status = 'SCHEDULED' AND scheduled < ${time + 1}`)
        ).results.map(a => this.launchAction(a))
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
