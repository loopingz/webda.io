import { CloudBinary, Context, Queue, RequestFilter, Service, ServiceParameters, Store } from "@webda/core";
import axios, { AxiosResponse } from "axios";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { AsyncAction, AsyncActionQueueItem, WebdaAsyncAction } from "../models";
import { Runner } from "./runner";

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

  constructor(params: any) {
    super(params);
    this.url ??= "/async/jobs";
    this.queue ??= "AsyncActionsQueue";
    this.store ??= "AsyncActions";
    this.runners ??= [];
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
    this.queue = this.getService(this.parameters.queue);
    if (!this.queue) {
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
    const action = await this.verifyJobRequest(context);
    const body = await context.getRequestBody();

    action._lastJobUpdate = Number.parseInt(context.getHttpContext().getUniqueHeader("X-Job-Time")) || 0;
    if (Date.now() - action._lastJobUpdate > 60) {
      action._lastJobUpdate = Date.now();
    }

    if (body.logs && Array.isArray(body.logs)) {
      action.logs.push(...body.logs);
      // Prevent having too much logs
      if (action.logs.length > 100) {
        action.logs = action.logs.slice(-100);
      }
    }
    ["status", "errorMessage", "statusDetails", "results"].forEach(k => {
      if (body[k] !== undefined) {
        // @ts-ignore
        action[k] = body[k];
      }
    });
    await this.store.save(action);
    context.write({ ...action, logs: undefined, statusDetails: undefined });
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
      await this.store.patch({
        uuid: event.uuid,
        status: "ERROR",
        errorMessage: `No runner found for the job`
      });
      return;
    }
    await this.store.patch({
      uuid: event.uuid,
      status: "STARTING"
    });
    const action = await this.store.get(event.uuid);
    const info: JobInfo = {
      JOB_SECRET_KEY: action.__secretKey,
      JOB_ID: action.getUuid(),
      JOB_HOOK: this.getWebda().getApiUrl(this.parameters.url), // How to find the absolute url
      JOB_ORCHESTRATOR: this.getName()
    };
    await action.patch({
      job: await selectedRunner.launchAction(action, info)
    });
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
   * Wrap async job and call the job status hook
   */
  async runWebdaAsyncAction(jobInfo?: JobInfo): Promise<void> {
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
      throw new Error("Cannot run AsyncAction without context");
    }
    // If we are not the target redirect to the right one
    if (jobInfo.JOB_ORCHESTRATOR !== this.getName()) {
      return this.getService<AsyncJobService>(jobInfo.JOB_ORCHESTRATOR).runWebdaAsyncAction(jobInfo);
    }

    // Get action info by calling the hook
    let action = (
      await axios.post<any, AxiosResponse<WebdaAsyncAction>>(
        jobInfo.JOB_HOOK,
        {
          agent: {
            ...Runner.getAgentInfo(),
            nodeVersion: process.version
          },
          status: "RUNNING"
        },
        {
          headers: this.getHeaders(jobInfo)
        }
      )
    ).data;

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
      await axios.post(
        jobInfo.JOB_HOOK,
        {
          errorMessage: <string | undefined>err?.message,
          status: "ERROR"
        },
        {
          headers: this.getHeaders(jobInfo)
        }
      );
      return;
    }
    // Update status
    await axios.post(
      jobInfo.JOB_HOOK,
      {
        results,
        status: "SUCCESS"
      },
      {
        headers: this.getHeaders(jobInfo)
      }
    );
  }
}

export { AsyncJobService };
