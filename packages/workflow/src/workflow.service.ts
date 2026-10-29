import {
  callOperation,
  hasSchema,
  listOperations,
  registerOperation,
  registerSchema,
  runAsSystem,
  Service,
  ServiceParameters,
  Session,
  SimpleOperationContext,
  useApplication,
  useContext,
  useSystem,
  WebdaError,
  type OperationContext
} from "@webda/core";
import { Duration } from "@webda/utils";
import { createHash, randomUUID } from "node:crypto";
import {
  BUILTINS,
  flowVersion,
  type FlowDefinition,
  type FlowDefinitionData,
  type FlowError,
  type JournalEntry
} from "./graph.js";
import { run, type ScheduledTask } from "./interpreter.js";
import { WorkflowInstance, type WorkflowLauncher } from "./models/workflowinstance.model.js";
import { WorkflowTask } from "./models/workflowtask.model.js";

/**
 * Output schema of every flow launch operation
 */
export const LAUNCH_OUTPUT_SCHEMA = "Webda/WorkflowLaunch.output";

/**
 * Status of a task error that is never retried: the same call would fail the same way
 */
const NOT_RETRYABLE_STATUS: Record<number, string> = {
  400: "BadRequest",
  401: "Unauthorized",
  403: "Forbidden",
  404: "NotFound"
};

/**
 * An error of a task, as the engine reports it in the flow
 */
class TaskError extends Error {
  /**
   * @param code - error code
   * @param message - error message
   * @param retryable - whether another attempt may succeed
   */
  constructor(
    public code: string,
    message: string,
    public retryable: boolean = true
  ) {
    super(message);
  }
}

/**
 * Abort reason of an attempt whose outcome must not be written: its lease was lost, or the service stopped
 */
const DROPPED = "WorkflowAttemptDropped";

/**
 * Abort signal of the current workflow task attempt
 *
 * It is aborted on timeout, when the worker loses the task lease, and when the service stops. An operation run by a
 * workflow should observe it to stop early: an attempt that keeps running is ignored, and the task may run again
 * (operations are assumed idempotent).
 * @returns the signal, undefined outside a workflow task
 */
export function useAbortSignal(): AbortSignal | undefined {
  try {
    return useContext()?.getExtension?.<AbortSignal>("abortSignal");
  } catch {
    // A context without extensions (the global context)
    return undefined;
  }
}

/**
 * An attempt running on this replica
 */
interface RunningAttempt {
  task: WorkflowTask;
  controller: AbortController;
}

/**
 * Parameters of the {@link WorkflowService}
 */
export class WorkflowServiceParameters extends ServiceParameters {
  /**
   * Interval between two polls of the worker (ms)
   * @default 1000
   */
  pollInterval: number;
  /**
   * Maximum number of tasks running at once on this replica
   * @default 10
   */
  concurrency: number;
  /**
   * Lease of a claimed task (ms), renewed while it runs
   * @default 60000
   */
  leaseDuration: number;
  /**
   * Maximum size of the journal and input of an instance (bytes of JSON)
   * @default 262144
   */
  maxContextSize: number;
  /**
   * Run the worker loop on this replica
   * @default true
   */
  worker: boolean;
  /**
   * Allow `useSystem` tasks in stored workflows
   * @default false
   */
  allowStoredSystem: boolean;
  /**
   * Interval of the recovery sweep (ms): an active instance not updated for this long and without a live task is
   * replayed
   * @default 60000
   */
  sweepInterval: number;
  /**
   * Grace period of stop() for the running attempts (ms), then they are aborted and their outcome dropped
   * @default 30000
   */
  stopTimeout: number;
  /**
   * Flows to register
   */
  flows?: FlowDefinitionData[];

  /**
   * @override
   * @param params - the input parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.pollInterval ??= 1000;
    this.concurrency ??= 10;
    this.leaseDuration ??= 60000;
    this.maxContextSize ??= 262144;
    this.worker ??= true;
    this.allowStoredSystem ??= false;
    this.sweepInterval ??= 60000;
    this.stopTimeout ??= 30000;
    return this;
  }
}

/**
 * Whether an instance still runs
 * @param instance - the instance
 * @returns true when RUNNING or WAITING
 */
function isActive(instance?: WorkflowInstance): boolean {
  return instance?.status === "RUNNING" || instance?.status === "WAITING";
}

/**
 * Uuid of the n-th row of a task key: the same for every worker, so two advances cannot create it twice
 * @param instance - instance uuid
 * @param key - task key
 * @param index - row index of the key, from 1
 * @returns a uuid
 */
function taskUuid(instance: string, key: string, index: number): string {
  const h = createHash("sha256").update(`${instance}\n${key}\n${index}`).digest("hex");
  return `${h.substring(0, 8)}-${h.substring(8, 12)}-5${h.substring(13, 16)}-a${h.substring(17, 20)}-${h.substring(20, 32)}`;
}

/**
 * Runs durable workflows: registers each flow as an operation, launches instances and runs their tasks
 *
 * Every replica runs the worker loop: a task is claimed with a lease (a conditional patch on `leaseUntil`), so it
 * runs on one replica at a time. Its outcome goes to the instance journal (a conditional patch on `revision`), then
 * the flow is replayed to find the next tasks.
 *
 * @WebdaModda WorkflowService
 */
export class WorkflowService<T extends WorkflowServiceParameters = WorkflowServiceParameters> extends Service<T> {
  /**
   * Flows registered on this service, by flow id
   */
  protected flows = new Map<string, FlowDefinition>();
  /**
   * Worker id, the lease owner of the tasks it claims
   */
  protected workerId = randomUUID();
  /**
   * Attempts running on this replica, by task uuid
   */
  protected running = new Map<string, RunningAttempt>();
  /**
   * Tasks reclaimed after too many crashes: they fail without running
   */
  protected crashed = new WeakSet<WorkflowTask>();
  /**
   * The service is stopping: nothing more is claimed
   */
  protected stopping = false;
  /**
   * Poll in progress
   */
  protected pollPromise?: Promise<void>;
  /**
   * Last recovery sweep (ms)
   */
  protected lastSweep = 0;
  /**
   * Executions started by the worker loop
   */
  protected executions = new Set<Promise<void>>();
  /**
   * Worker loop timer
   */
  protected timer?: NodeJS.Timeout;

  /**
   * @override
   */
  resolve(): this {
    super.resolve();
    // Before the transports init: they snapshot the operations
    for (const def of this.parameters.flows ?? []) {
      this.registerFlow({ ...def, version: def.version ?? "", source: def.source ?? "code" });
    }
    return this;
  }

  /**
   * @override
   */
  async init(): Promise<this> {
    await super.init();
    if (this.parameters.worker) {
      this.startWorker();
    }
    return this;
  }

  /**
   * Stop the worker loop
   *
   * Running attempts get `stopTimeout` to finish, then they are aborted and their outcome dropped: their lease
   * expires and another worker runs them again.
   * @override
   */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    // A poll in flight may still start executions
    await this.pollPromise;
    let timer: NodeJS.Timeout | undefined;
    const grace = new Promise<void>(resolve => {
      timer = setTimeout(resolve, this.parameters.stopTimeout);
    });
    await Promise.race([Promise.allSettled([...this.executions]), grace]);
    clearTimeout(timer);
    for (const attempt of this.running.values()) {
      attempt.controller.abort(DROPPED);
    }
    await super.stop();
  }

  /**
   * Register a schema in the validator and the application
   * @param name - schema name
   * @param schema - the JSON schema
   */
  protected registerSchema(name: string, schema: any) {
    if (!hasSchema(name)) {
      registerSchema(name, schema);
    }
    useApplication().getSchemas()[name] = schema;
  }

  /**
   * Register a flow as an operation `<flow id>` served by {@link launch}
   * @param def - the flow definition
   */
  registerFlow(def: FlowDefinition): void {
    const flow: FlowDefinition = { ...def, version: def.version || flowVersion(def) };
    this.flows.set(flow.id, flow);
    const input = `${flow.id}.input`;
    // The parameters are given to launch in this order
    this.registerSchema(input, {
      type: "object",
      ...flow.input,
      properties: (flow.input as any)?.properties ?? {},
      "x-webda-arguments": flow.params
    });
    this.registerSchema(LAUNCH_OUTPUT_SCHEMA, {
      type: "object",
      properties: { uuid: { type: "string" } },
      required: ["uuid"]
    });
    registerOperation(flow.id, {
      service: this.getName(),
      method: "launch",
      input,
      output: LAUNCH_OUTPUT_SCHEMA,
      context: { flowId: flow.id },
      graphql: false,
      grpc: false
    } as any);
  }

  /**
   * Get a registered flow
   * @param flowId - the flow id
   * @returns the definition
   */
  getFlow(flowId: string): FlowDefinition | undefined {
    return this.flows.get(flowId);
  }

  /**
   * Launch the flow of the current operation, as the caller
   * @param args - the flow parameters, in order
   * @returns the instance uuid
   */
  async launch(...args: any[]): Promise<{ uuid: string }> {
    const context = useContext<OperationContext>();
    const flowId = context.getExtension<{ flowId?: string }>("operationContext")?.flowId;
    const def = flowId ? this.flows.get(flowId) : undefined;
    if (!def) {
      throw new WebdaError.NotFound(`Unknown flow ${flowId}`);
    }
    const input: Record<string, any> = {};
    def.params.forEach((name, i) => {
      if (args[i] !== undefined) input[name] = args[i];
    });
    let launcher: WorkflowLauncher;
    if (context.isGlobalContext()) {
      launcher = { system: true };
    } else {
      launcher = { userId: context.getCurrentUserId() || undefined, identId: context.getSession()?.identUsed };
    }
    const instance = await runAsSystem(() => this.createInstance(def, input, launcher));
    return { uuid: instance.uuid };
  }

  /**
   * Create an instance and run it to its first tasks
   * @param def - the flow definition, pinned in the instance
   * @param input - the flow input
   * @param launcher - the identity of the steps
   * @returns the instance
   */
  protected async createInstance(
    def: FlowDefinition,
    input: Record<string, any>,
    launcher: WorkflowLauncher
  ): Promise<WorkflowInstance> {
    const now = Date.now();
    const instance = await WorkflowInstance.create({
      flowId: def.id,
      version: def.version,
      definition: def,
      input,
      journal: {},
      status: "RUNNING",
      launcher: JSON.parse(JSON.stringify(launcher)),
      revision: 0,
      createdAt: now,
      updatedAt: now
    } as any);
    await this.advance(instance.uuid);
    return instance;
  }

  /**
   * Start the worker loop
   */
  protected startWorker(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), this.parameters.pollInterval);
    this.timer.unref?.();
  }

  /**
   * One iteration of the worker loop: claim due tasks and run them in the background
   * @returns the poll in progress, it ends when the tasks are claimed and started
   */
  protected poll(): Promise<void> {
    if (this.pollPromise) return this.pollPromise;
    if (this.stopping) return Promise.resolve();
    this.pollPromise = this.claimDue()
      .then(tasks => {
        for (const task of tasks) {
          const execution = this.execute(task)
            .catch(err => this.log("ERROR", "Workflow task failed", task.uuid, err))
            .finally(() => this.executions.delete(execution));
          this.executions.add(execution);
        }
      })
      .then(() => this.maybeSweep())
      .catch(err => this.log("ERROR", "Workflow poll failed", err))
      .finally(() => {
        this.pollPromise = undefined;
      });
    return this.pollPromise;
  }

  /**
   * Run the recovery sweep when `sweepInterval` passed since the last one
   */
  protected async maybeSweep(): Promise<void> {
    if (this.stopping || Date.now() - this.lastSweep < this.parameters.sweepInterval) return;
    this.lastSweep = Date.now();
    await this.sweep();
  }

  /**
   * Replay the stranded instances: active, not updated for `sweepInterval`, without a PENDING or RUNNING task
   *
   * A crash between two steps leaves such an instance: replay is idempotent, and the revision CAS of
   * {@link advance} guards against a concurrent writer.
   * @returns the number of instances replayed
   */
  protected async sweep(): Promise<number> {
    return runAsSystem(async () => {
      const before = Date.now() - this.parameters.sweepInterval;
      let count = 0;
      for (const status of ["RUNNING", "WAITING"]) {
        const { results } = await WorkflowInstance.query(`status = ? AND updatedAt < ? LIMIT 100`, [status, before]);
        for (const instance of results as WorkflowInstance[]) {
          const live = (
            await WorkflowTask.query(`instance = ? AND (status = 'PENDING' OR status = 'RUNNING') LIMIT 1`, [
              instance.uuid
            ])
          ).results;
          if (live.length) continue;
          await this.advance(instance.uuid);
          count++;
        }
      }
      return count;
    });
  }

  /**
   * One poll: claim the due tasks and run them
   * @returns the number of tasks claimed
   */
  protected async tick(): Promise<number> {
    const tasks = await this.claimDue();
    await Promise.all(tasks.map(task => this.execute(task)));
    return tasks.length;
  }

  /**
   * Claim the due tasks, up to the free slots of this replica
   *
   * The PENDING tasks due now, and the RUNNING ones whose lease expired (their worker crashed)
   * @returns the tasks claimed
   */
  protected async claimDue(): Promise<WorkflowTask[]> {
    const slots = this.parameters.concurrency - this.running.size;
    if (slots <= 0) return [];
    return runAsSystem(async () => {
      const now = Date.now();
      const candidates = [
        ...(await WorkflowTask.query(`status = 'PENDING' AND runAt <= ${now} LIMIT ${slots}`)).results,
        ...(await WorkflowTask.query(`status = 'RUNNING' AND leaseUntil < ${now} LIMIT ${slots}`)).results
      ] as WorkflowTask[];
      const claimed: WorkflowTask[] = [];
      for (const task of candidates) {
        if (claimed.length >= slots || this.stopping) break;
        if (await this.claim(task)) {
          claimed.push(task);
        }
      }
      return claimed;
    });
  }

  /**
   * Claim a task with a lease: a conditional patch on its `leaseUntil`
   *
   * Reclaiming an expired lease counts as a new attempt.
   * @param task - the task, as queried
   * @returns true when this worker holds the task
   */
  protected async claim(task: WorkflowTask): Promise<boolean> {
    const now = Date.now();
    const patch: Partial<WorkflowTask> = {
      status: "RUNNING",
      owner: this.workerId,
      leaseUntil: now + this.parameters.leaseDuration,
      startedAt: now
    };
    const reclaim = task.status === "RUNNING";
    if (reclaim) {
      patch.attempt = task.attempt + 1;
    }
    const previous = task.leaseUntil;
    try {
      await WorkflowTask.ref(task.uuid).patch(patch as any, "leaseUntil", previous);
    } catch (err) {
      const current = (await WorkflowTask.ref(task.uuid).get()) as WorkflowTask;
      if (current && current.leaseUntil === previous) throw err;
      // Another worker has it
      return false;
    }
    Object.assign(task, patch);
    // A crash recovery gets one more attempt than the retries: past it the task keeps killing its workers
    if (reclaim && task.attempt - 1 > (task.options?.retries ?? 0) + 1) {
      this.crashed.add(task);
    }
    return true;
  }

  /**
   * Run a claimed task, write its outcome and advance its instance
   *
   * Every write of the attempt is conditional on the lease this worker holds: an attempt whose lease was lost (its
   * worker was too slow and another one reclaimed it) drops its outcome.
   * @param task - the task
   */
  protected async execute(task: WorkflowTask): Promise<void> {
    const instance = await runAsSystem(() => WorkflowInstance.ref(task.instance).get() as Promise<WorkflowInstance>);
    if (!isActive(instance) || instance.journal?.[task.key]) {
      // Cancelled, or its outcome is already journaled (a crash before the row was finished): never run it again
      await this.finishTask(task, { status: "CANCELLED" });
      return;
    }
    const controller = new AbortController();
    this.running.set(task.uuid, { task, controller });
    const renew = setInterval(() => this.renewLease(task), Math.max(this.parameters.leaseDuration / 2, 1));
    renew.unref?.();
    let entry: JournalEntry;
    let retryable = false;
    try {
      if (this.crashed.has(task)) {
        throw new TaskError(
          "Crashed",
          `${task.operation} was abandoned by its worker ${task.attempt - 1} times`,
          false
        );
      }
      entry = { result: await this.runTask(task, instance, controller) };
    } catch (err) {
      const error = this.toFlowError(err, task.operation);
      retryable =
        !(err instanceof TaskError && !err.retryable) && !Object.values(NOT_RETRYABLE_STATUS).includes(error.code);
      entry = { error };
    } finally {
      clearInterval(renew);
      this.running.delete(task.uuid);
    }
    if (controller.signal.reason === DROPPED || !(await this.holdsLease(task))) {
      this.log("DEBUG", "Workflow task attempt dropped", task.uuid);
      return;
    }
    if ("error" in entry) {
      const retries = task.options?.retries ?? 0;
      if (retryable && task.attempt <= retries) {
        await this.scheduleRetry(task);
        await this.finishTask(task, { status: "ERROR", error: entry.error });
        return;
      }
    }
    await this.writeJournal(task.instance, task.key, entry);
    await this.finishTask(
      task,
      "error" in entry ? { status: "ERROR", error: entry.error } : { status: "SUCCESS", output: entry.result }
    );
    await this.advance(task.instance);
  }

  /**
   * Conditional patch of a task row on the lease this worker holds
   * @param task - the task, with the lease this worker holds
   * @param data - the changes
   * @returns false when another worker holds the lease now
   */
  protected async patchLeased(task: WorkflowTask, data: Partial<WorkflowTask>): Promise<boolean> {
    return runAsSystem(async () => {
      try {
        await WorkflowTask.ref(task.uuid).patch(data as any, "leaseUntil", task.leaseUntil);
      } catch (err) {
        const current = (await WorkflowTask.ref(task.uuid).get()) as WorkflowTask;
        if (current && current.leaseUntil === task.leaseUntil) throw err;
        return false;
      }
      Object.assign(task, data);
      return true;
    });
  }

  /**
   * Check this worker still holds the lease of a task, and extend it
   * @param task - the task
   * @returns false when the lease was lost
   */
  protected holdsLease(task: WorkflowTask): Promise<boolean> {
    return this.patchLeased(task, { leaseUntil: Date.now() + this.parameters.leaseDuration });
  }

  /**
   * Extend the lease of a running task, abort the attempt when the lease was lost
   * @param task - the task
   */
  protected async renewLease(task: WorkflowTask): Promise<void> {
    let held = false;
    try {
      held = await this.holdsLease(task);
    } catch (err) {
      this.log("WARN", "Cannot renew the lease of workflow task", task.uuid, err);
    }
    if (!held) {
      this.running.get(task.uuid)?.controller.abort(DROPPED);
    }
  }

  /**
   * Record the end of an attempt, if this worker still holds its lease
   *
   * `leaseUntil` becomes the end time, never 0: a worker that queried the task before cannot claim it again.
   * @param task - the task
   * @param data - status and outcome
   * @returns false when the lease was lost
   */
  protected finishTask(task: WorkflowTask, data: Partial<WorkflowTask>): Promise<boolean> {
    const endedAt = Date.now();
    return this.patchLeased(task, { ...data, endedAt, leaseUntil: endedAt });
  }

  /**
   * Create the next attempt of a failed task, after the backoff delay
   * @param task - the failed attempt
   */
  protected async scheduleRetry(task: WorkflowTask): Promise<void> {
    const delay = new Duration(task.options?.delay ?? "1s").toMs();
    const factor = (task.options?.backoff ?? "exponential") === "exponential" ? 2 ** (task.attempt - 1) : 1;
    await this.createTask(
      task.instance,
      { key: task.key, operation: task.operation, input: task.input, options: task.options },
      task.launcherId,
      Date.now() + delay * factor,
      task.attempt + 1
    );
  }

  /**
   * Run the operation (or built-in) of a task
   * @param task - the task
   * @param instance - its instance
   * @param controller - aborted on timeout
   * @returns the result
   */
  protected async runTask(task: WorkflowTask, instance: WorkflowInstance, controller: AbortController): Promise<any> {
    switch (task.operation) {
      case BUILTINS.DateNow:
        return Date.now();
      case BUILTINS.RandomNumber:
        return Math.random();
      case BUILTINS.RandomUuid:
        return randomUUID();
      case BUILTINS.Sleep:
        // The timer is the runAt of the task
        return null;
      case BUILTINS.WaitForEvent:
      case BUILTINS.Start:
        throw new TaskError("NotImplemented", `${task.operation} is not implemented yet`, false);
    }
    if ((listOperations()[task.operation] as any)?.context?.flowId) {
      throw new TaskError("NotImplemented", `Child flow ${task.operation} is not implemented yet`, false);
    }
    const options = task.options ?? {};
    if (options.useSystem && instance.definition?.source === "stored" && !this.parameters.allowStoredSystem) {
      throw new TaskError("SystemNotAllowed", "A stored workflow cannot run a task as the system", false);
    }
    const ctx =
      options.useSystem || instance.launcher?.system
        ? useSystem(task.input ?? null)
        : this.launcherContext(instance.launcher, task.input);
    ctx.setExtension("abortSignal", controller.signal);
    await ctx.init();
    const call = callOperation(ctx, task.operation);
    if (options.timeout) {
      const timeoutMs = new Duration(options.timeout).toMs();
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new TaskError("Timeout", `${task.operation} timed out after ${options.timeout}`));
        }, timeoutMs);
      });
      // An attempt still running after its timeout is ignored
      call.catch(() => {});
      try {
        await Promise.race([call, timeout]);
      } finally {
        clearTimeout(timer);
      }
    } else {
      await call;
    }
    const output = ctx.getOutput();
    if (!output) return null;
    try {
      return JSON.parse(output);
    } catch {
      // A string result is written as is
      return output;
    }
  }

  /**
   * Build the context of the launcher: the session is rebuilt from the user id, so the permissions are fresh
   * @param launcher - the launcher
   * @param input - the operation input
   * @returns the context
   */
  protected launcherContext(launcher: WorkflowLauncher, input: any): SimpleOperationContext {
    const ctx = new SimpleOperationContext();
    const session = new Session();
    if (launcher?.userId) {
      session.login(launcher.userId, launcher.identId ?? "");
    }
    ctx.setSession(session);
    ctx.setInput(Buffer.from(JSON.stringify(input ?? null)));
    return ctx;
  }

  /**
   * Convert an error to the data the flow sees
   * @param err - the error
   * @param operation - the operation of the task
   * @returns the flow error
   */
  protected toFlowError(err: any, operation: string): FlowError {
    let code: string;
    const status = typeof err?.getResponseCode === "function" ? err.getResponseCode() : undefined;
    if (err instanceof TaskError) {
      code = err.code;
    } else if (NOT_RETRYABLE_STATUS[status]) {
      code = NOT_RETRYABLE_STATUS[status];
    } else if (err instanceof WebdaError.HttpError) {
      code = err.constructor.name;
    } else {
      code = typeof err?.code === "string" && err.code ? err.code : err?.name || "Error";
    }
    return { code, message: String(err?.message ?? err), operation };
  }

  /**
   * Write a task outcome to the instance journal: a conditional patch on `revision`, retried on conflict
   *
   * The first outcome of a key wins. A journal over `maxContextSize` fails the instance.
   * @param instanceId - the instance uuid
   * @param key - the task key
   * @param entry - the outcome
   * @returns true when the outcome is in the journal
   */
  protected async writeJournal(instanceId: string, key: string, entry: JournalEntry): Promise<boolean> {
    return runAsSystem(async () => {
      for (;;) {
        const instance = (await WorkflowInstance.ref(instanceId).get()) as WorkflowInstance;
        if (!isActive(instance)) return false;
        if (instance.journal?.[key]) return true;
        const journal = { ...instance.journal, [key]: { ...entry, at: Date.now() } };
        const size =
          Buffer.byteLength(JSON.stringify(journal)) + Buffer.byteLength(JSON.stringify(instance.input ?? {}));
        if (size > this.parameters.maxContextSize) {
          const error: FlowError = {
            code: "ContextTooLarge",
            message: `The context of the workflow is ${size} bytes, over ${this.parameters.maxContextSize}`,
            operation: instance.flowId
          };
          if (await this.patchInstance(instance, { status: "ERROR", error })) return false;
          continue;
        }
        if (await this.patchInstance(instance, { journal })) return true;
      }
    });
  }

  /**
   * Patch an instance if its revision did not change
   * @param instance - the instance as read
   * @param data - the changes
   * @returns false when another writer changed it first
   */
  protected async patchInstance(instance: WorkflowInstance, data: Partial<WorkflowInstance>): Promise<boolean> {
    try {
      await WorkflowInstance.ref(instance.uuid).patch(
        { ...data, revision: instance.revision + 1, updatedAt: Date.now() } as any,
        "revision",
        instance.revision
      );
      return true;
    } catch (err) {
      const current = (await WorkflowInstance.ref(instance.uuid).get()) as WorkflowInstance;
      if (current?.revision === instance.revision) throw err;
      return false;
    }
  }

  /**
   * Replay an instance and act on the result: finish it, or create its missing tasks
   * @param instanceId - the instance uuid
   */
  protected async advance(instanceId: string): Promise<void> {
    await runAsSystem(async () => {
      for (;;) {
        const instance = (await WorkflowInstance.ref(instanceId).get()) as WorkflowInstance;
        if (!isActive(instance)) return;
        const res = run(instance.definition as FlowDefinition, instance.input, instance.journal ?? {});
        if (res.status === "done") {
          if (await this.patchInstance(instance, { status: "SUCCESS", output: res.output })) return;
          continue;
        }
        if (res.status === "error") {
          if (await this.patchInstance(instance, { status: "ERROR", error: res.error })) return;
          continue;
        }
        for (const scheduled of res.schedule) {
          await this.scheduleTask(instance, scheduled);
        }
        const status = res.schedule.every(t => t.operation === BUILTINS.Sleep) ? "WAITING" : "RUNNING";
        if (status === instance.status || (await this.patchInstance(instance, { status }))) return;
      }
    });
  }

  /**
   * Create the task of a scheduled key, unless a PENDING or RUNNING one exists
   * @param instance - the instance
   * @param scheduled - the task to run
   */
  protected async scheduleTask(instance: WorkflowInstance, scheduled: ScheduledTask): Promise<void> {
    const existing = (await WorkflowTask.query(`instance = ? AND key = ?`, [instance.uuid, scheduled.key]))
      .results as WorkflowTask[];
    // A SUCCESS row is journaled before it is finished: the replay read the instance before it
    if (existing.some(t => t.status === "PENDING" || t.status === "RUNNING" || t.status === "SUCCESS")) return;
    let runAt = Date.now();
    if (scheduled.operation === BUILTINS.Sleep) {
      runAt = this.sleepUntil(scheduled.input, runAt);
    }
    await this.createTask(instance.uuid, scheduled, instance.launcher?.userId, runAt, 1, existing.length + 1);
  }

  /**
   * End of a `Workflow.Sleep`
   * @param input - `{ duration?: string, until?: number }`
   * @param now - the current time
   * @returns when the timer fires
   */
  protected sleepUntil(input: any, now: number): number {
    if (typeof input?.until === "number") {
      return input.until;
    }
    try {
      return now + new Duration(input?.duration ?? 0).toMs();
    } catch {
      // An invalid duration fires at once
      return now;
    }
  }

  /**
   * Create a task row, unless another worker created the same row first
   * @param instance - the instance uuid
   * @param scheduled - the task
   * @param launcherId - user id of the launcher
   * @param runAt - when it becomes runnable
   * @param attempt - attempt number
   * @param index - row index of the key, when known
   */
  protected async createTask(
    instance: string,
    scheduled: ScheduledTask,
    launcherId: string | undefined,
    runAt: number,
    attempt: number,
    index?: number
  ): Promise<void> {
    await runAsSystem(async () => {
      index ??= (await WorkflowTask.query(`instance = ? AND key = ?`, [instance, scheduled.key])).results.length + 1;
      const uuid = taskUuid(instance, scheduled.key, index);
      try {
        await WorkflowTask.create({
          uuid,
          instance,
          key: scheduled.key,
          operation: scheduled.operation,
          input: scheduled.input,
          options: scheduled.options ?? {},
          attempt,
          status: "PENDING",
          runAt,
          leaseUntil: 0,
          launcherId
        } as any);
      } catch (err) {
        if (!(await WorkflowTask.ref(uuid).exists())) throw err;
        // Created by another worker
      }
    });
  }
}

export default WorkflowService;
