import { Service, ServiceParameters, Queue, Store, RequestFilter, Context } from "@webda/core";
import { v4 as uuidv4 } from "uuid";
import { AsyncAction, AsyncActionQueueItem } from "../models";
import { Runner } from "./runner";
import * as crypto from "crypto";

/**
 * @inheritdoc
 */
class AsyncJobServiceParameters extends ServiceParameters {
  /**
   * Store name to use for async actions
   * @default AsyncActions
   */
  store: string;
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
   * @inheritdoc
   */
  loadParameters(params: any): ServiceParameters {
    return new AsyncJobServiceParameters(params);
  }
  /**
   * @inheritdoc
   */
  resolve(): void {
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

    this.addRoute(`${this.parameters.url}/status`, ["POST"], this.statusHook);
  }

  /**
   * Allow job status report url
   */
  async checkRequest(context: Context): Promise<boolean> {
    const url = context.getHttpContext().getRelativeUri();
    // Allow status url to be called without other mechanism
    return (
      url.startsWith(this.parameters.url) &&
      url.endsWith("/status") &&
      context.getHttpContext().getHeader("X-Job-Id") !== "" &&
      context.getHttpContext().getHeader("X-Job-Time") !== "" &&
      context.getHttpContext().getHeader("X-Job-Hash") !== ""
    );
  }

  /**
   * Status hook for job report
   */
  protected async statusHook(context: Context) {
    const jobId = context.getHttpContext().getHeader("X-Job-Id");
    if (!jobId) {
      this.log("TRACE", "Require Job Id");
      throw 404;
    }
    const action = await this.store.get(jobId);
    if (!action) {
      this.log("TRACE", `Unknown Job Id '${jobId}'`);
      throw 404;
    }
    const jobTime = context.getHttpContext().getHeader("X-Job-Time");
    const jobHash = context.getHttpContext().getHeader("X-Job-Hash");
    // Ensure hash mac is correct
    if (jobHash !== crypto.createHmac("sha256", action.__secretKey).update(jobTime).digest("hex")) {
      this.log("TRACE", "Invalid Job HMAC");
      throw 403;
    }
    const body = context.getRequestBody();
    if (body.statusDetails) {
      action.statusDetails = body.statusDetails;
    }

    action._lastJobUpdate = Number.parseInt(jobTime) || 0;
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
    if (body.status) {
      action.status = body.status;
    }
    await this.store.save(action);
    context.write({ ...action, logs: undefined, statusDetails: undefined });
  }

  /**
   * Worker
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
    await action.update({
      job: await selectedRunner.launchAction(action)
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
    return this.queue.sendMessage({ uuid: action.getUuid(), __secretKey: action.__secretKey, type: action.type });
  }

  /**
   * Wrap async job and call the job status hook
   */
  async wrapper() {
    // Call the job status to get its arguments
  }

  /**
   * @inheritdoc
   */
  static getModda() {
    return {
      uuid: "Webda/AsyncJobService",
      label: "AsyncJobService",
      description: "Implements a full async job system"
    };
  }
}

export { AsyncJobService };
