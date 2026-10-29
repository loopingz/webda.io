import {
  callOperation,
  canCallOperation,
  CronService,
  hasSchema,
  Operation,
  listFullOperations,
  registerOperation,
  registerSchema,
  runAsSystem,
  Service,
  ServiceParameters,
  Session,
  SimpleOperationContext,
  useApplication,
  useContext,
  useDynamicService,
  useInstanceStorage,
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
import { keysOf, run, statementIdOf, type ScheduledTask } from "./interpreter.js";
import { setWorkflowControls, type WorkflowControls } from "./hooks.js";
import { WorkflowInstance, type WorkflowLauncher } from "./models/workflowinstance.model.js";
import { WorkflowTask, type WorkflowTaskStatus } from "./models/workflowtask.model.js";
import { WorkflowSignal } from "./models/workflowsignal.model.js";
import { Workflow as StoredWorkflow } from "./models/workflow.model.js";
import { validateExpr } from "./expression.js";
import { useRepository } from "@webda/models";

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
 * Statuses of a task row that will still produce an outcome
 */
const LIVE_TASK: WorkflowTaskStatus[] = ["PENDING", "RUNNING", "WAITING_EVENT", "WAITING_CHILD"];

/**
 * `runAt` of a wait without timeout (JSON has no Infinity)
 */
export const NO_TIMEOUT = Number.MAX_SAFE_INTEGER;

/**
 * Built-ins an instance waits on: when all its pending tasks are of these, it is WAITING
 */
const WAITING_OPERATIONS: string[] = [BUILTINS.Sleep, BUILTINS.WaitForEvent];

/**
 * Statement kinds of a flow graph, with their expression fields
 */
const STATEMENT_EXPRESSIONS: Record<string, string[]> = {
  task: ["input"],
  assign: ["value"],
  if: ["cond"],
  forOf: ["items"],
  while: ["cond"],
  try: [],
  parallel: [],
  map: ["items"],
  return: ["value"],
  throw: ["value"]
};

/**
 * Operation id syntax
 */
const OPERATION_ID = /^([A-Z][A-Za-z0-9]*\.)*([A-Z][a-zA-Z0-9]*)$/;

/**
 * A stored workflow registered on this replica
 */
interface RegisteredStoredFlow {
  flowId: string;
  version: string;
  updatedBy?: string;
  /**
   * JSON of its crons, to notice a change
   */
  crons: string;
  /**
   * Export ids of the crons registered for it: only those are removed
   */
  cronIds: string[];
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
   * How long a signal sent before any wait is kept (Duration syntax)
   * @default "1d"
   */
  signalTtl: string;
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
   * Maximum size of a signal payload (bytes of JSON)
   * @default 65536
   */
  maxSignalPayload: number;
  /**
   * Maximum number of unexpired buffered signals per `(event, key)`: a new one past it is refused
   * @default 100
   */
  maxBufferedSignals: number;
  /**
   * Role needed to create, update or delete a stored workflow
   * @default "workflow-admin"
   */
  storedWorkflowRole: string;
  /**
   * PubSub service announcing the stored workflow changes to the other replicas
   */
  syncPubSub?: string;
  /**
   * Without `syncPubSub`, interval between two reloads of the stored workflows (ms)
   * @default 60000
   */
  syncInterval: number;

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
    this.signalTtl ??= "1d";
    this.storedWorkflowRole ??= "workflow-admin";
    this.maxSignalPayload ??= 65536;
    this.maxBufferedSignals ??= 100;
    this.syncInterval ??= 60000;
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
 * Whether two flow errors are the same
 * @param a - an error
 * @param b - another error
 * @returns true when code, message and operation match
 */
function sameError(a?: FlowError, b?: FlowError): boolean {
  return !!a && !!b && a.code === b.code && a.message === b.message && a.operation === b.operation;
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
export class WorkflowService<T extends WorkflowServiceParameters = WorkflowServiceParameters>
  extends Service<T>
  implements WorkflowControls
{
  /**
   * Flows registered on this service, by flow id
   */
  protected flows = new Map<string, FlowDefinition>();
  /**
   * Every version registered of each flow, for migrate
   */
  protected versions = new Map<string, Map<string, FlowDefinition>>();
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
   * Stored workflows registered here, by workflow uuid
   */
  protected storedFlows = new Map<string, RegisteredStoredFlow>();
  /**
   * Stored workflows reload timer
   */
  protected syncTimer?: NodeJS.Timeout;
  /**
   * Subscription to the stored workflow changes
   */
  protected syncConsumer?: { cancel: () => any };

  /**
   * @override
   */
  resolve(): this {
    super.resolve();
    // The configured service serves the WorkflowInstance actions
    setWorkflowControls(this);
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
    this.listenStored();
    await this.reloadStored();
    this.startSync();
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
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    await this.syncConsumer?.cancel();
    this.syncConsumer = undefined;
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
    if (!this.versions.has(flow.id)) this.versions.set(flow.id, new Map());
    this.versions.get(flow.id)!.set(flow.version, flow);
    // Core cannot remove a schema: a stored flow, which changes at runtime, has one per version
    const input = flow.source === "stored" ? `${flow.id}.input.${flow.version}` : `${flow.id}.input`;
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
   * Find a flow registered on any WorkflowService, by its operation
   * @param flowId - the flow id
   * @returns the current definition, undefined when the operation is not a flow
   */
  resolveFlow(flowId: string | undefined): FlowDefinition | undefined {
    if (!flowId) return undefined;
    const local = this.flows.get(flowId);
    if (local) return local;
    const operation: any = listFullOperations()[flowId];
    if (operation?.context?.flowId !== flowId || !operation.service) return undefined;
    const service: any = useDynamicService(operation.service);
    return typeof service?.getFlow === "function" ? service.getFlow(flowId) : undefined;
  }

  /**
   * Find a version of a flow
   * @param flowId - the flow id
   * @param version - the version
   * @returns the definition
   */
  getFlowVersion(flowId: string, version: string): FlowDefinition | undefined {
    const local = this.versions.get(flowId)?.get(version);
    if (local) return local;
    const operation: any = listFullOperations()[flowId];
    const service: any = operation?.service ? useDynamicService(operation.service) : undefined;
    return service !== this && typeof service?.getFlowVersion === "function"
      ? service.getFlowVersion(flowId, version)
      : undefined;
  }

  /**
   * Role needed to write a stored workflow
   * @returns the role
   */
  getStoredWorkflowRole(): string {
    return this.parameters.storedWorkflowRole;
  }

  /**
   * Validate and stamp stored workflows on save, and register them once saved
   */
  protected listenStored(): void {
    const repo: any = useRepository(StoredWorkflow as any);
    const uuidOf = (id: any): string => (typeof id === "object" && id !== null ? (id.uuid ?? String(id)) : String(id));
    repo.on("Create", ({ object }: any) => this.prepareStored(object, object));
    repo.on("Update", ({ object }: any) => this.prepareStored(object, object));
    repo.on("Patch", async ({ object_id, object }: any) => {
      const current = await runAsSystem(() => StoredWorkflow.ref(uuidOf(object_id)).get());
      await this.prepareStored({ ...current, ...object, uuid: uuidOf(object_id) }, object);
    });
    // Partial updates (increments, collections, attribute removal) would skip the validation
    repo.on("PartialUpdate", () => {
      throw new WebdaError.BadRequest("A stored workflow is changed with update or patch, not partial updates");
    });
    for (const event of ["Created", "Updated", "Patched", "Deleted", "PartialUpdated"]) {
      repo.on(event, ({ object_id }: any) => this.storedChanged(uuidOf(object_id)));
    }
  }

  /**
   * Validate a stored workflow about to be saved and stamp its version and last saver
   * @param workflow - the workflow as it will be saved
   * @param target - the data written: receives `version` and `updatedBy`
   */
  protected prepareStored(workflow: any, target: any): void {
    this.validateStored(workflow);
    target.version = flowVersion(workflow);
    const context = useContext();
    // A save by the system keeps the last saver: its crons never run as the system
    if (context && !context.isGlobalContext() && context.getCurrentUserId()) {
      target.updatedBy = context.getCurrentUserId();
    }
  }

  /**
   * Validate a stored workflow
   * @param workflow - the workflow
   * @throws BadRequest when its name, graph or options are refused
   */
  validateStored(workflow: any): void {
    const fail = (message: string): never => {
      throw new WebdaError.BadRequest(`Invalid workflow: ${message}`);
    };
    const name = workflow?.name;
    if (typeof name !== "string" || !OPERATION_ID.test(name)) {
      fail(`name ${name} must be an operation id (Group.Name)`);
    }
    // The registered operation decides: a module enabled later wins over a stored flow
    if (listFullOperations()[name]) {
      const flow = this.operationFlow(name);
      if (!flow) fail(`${name} is already an operation`);
      if (flow!.source !== "stored") fail(`${name} is already a code flow`);
    }
    if ([...this.storedFlows].some(([uuid, f]) => f.flowId === name && uuid !== workflow.uuid)) {
      fail(`${name} is already a stored workflow`);
    }
    if (!Array.isArray(workflow.params) || workflow.params.some((p: any) => typeof p !== "string")) {
      fail("params must be an array of names");
    }
    if (workflow.input === null || typeof workflow.input !== "object") {
      fail("input must be a JSON schema");
    }
    if (!Array.isArray(workflow.body)) {
      fail("body must be an array of statements");
    }
    if (workflow.options?.useSystem && !this.parameters.allowStoredSystem) {
      fail("useSystem is not allowed in a stored workflow");
    }
    for (const cron of workflow.crons ?? []) {
      if (typeof cron?.cron !== "string" || (cron.input !== undefined && typeof cron.input !== "object")) {
        fail("a cron needs a cron expression and an object input");
      }
    }
    const walk = (stmts: any[], path: string) => {
      if (!Array.isArray(stmts)) fail(`${path} must be an array of statements`);
      stmts.forEach((stmt, i) => {
        const where = typeof stmt?.id === "string" ? stmt.id : `${path}[${i}]`;
        if (typeof stmt?.id !== "string") fail(`${where} has no id`);
        const fields = STATEMENT_EXPRESSIONS[stmt.kind];
        if (!fields) fail(`${where}: unknown statement kind ${stmt.kind}`);
        for (const field of fields) {
          if (stmt[field] === undefined && field === "value" && stmt.kind === "return") continue;
          const invalid = validateExpr(stmt[field], `$.${field}`);
          if (invalid.length) fail(`${where}: invalid expression at ${invalid.join(", ")}`);
        }
        if (stmt.kind === "task") {
          const known =
            Object.values(BUILTINS).includes(stmt.operation) ||
            stmt.operation === name ||
            !!listFullOperations()[stmt.operation];
          if (!known) fail(`${where}: unknown operation ${stmt.operation}`);
          if (stmt.options?.useSystem && !this.parameters.allowStoredSystem) {
            fail(`${where}: useSystem is not allowed in a stored workflow`);
          }
        }
        for (const key of ["then", "else", "body", "catch", "finally"]) {
          if (stmt[key] !== undefined) walk(stmt[key], `${where}.${key}`);
        }
        (stmt.branches ?? []).forEach((branch: any[], b: number) => walk(branch, `${where}.branches[${b}]`));
      });
    };
    walk(workflow.body, "body");
  }

  /**
   * The flow served by an operation, if it is a flow
   * @param flowId - the operation id
   * @returns the flow of the WorkflowService serving the operation
   */
  protected operationFlow(flowId: string): FlowDefinition | undefined {
    const operation: any = listFullOperations()[flowId];
    if (operation?.context?.flowId !== flowId || !operation.service) return undefined;
    const service: any = operation.service === this.getName() ? this : useDynamicService(operation.service);
    return typeof service?.getFlow === "function" ? service.getFlow(flowId) : undefined;
  }

  /**
   * User a stored flow runs as when the system launches it: its last saver
   * @param flowId - the flow id
   * @returns the user id, undefined when unknown
   */
  storedRunAs(flowId: string): string | undefined {
    const local = [...this.storedFlows.values()].find(f => f.flowId === flowId);
    if (local) return local.updatedBy;
    const operation: any = listFullOperations()[flowId];
    const service: any = operation?.service ? useDynamicService(operation.service) : undefined;
    return service && service !== this && typeof service.storedRunAs === "function"
      ? service.storedRunAs(flowId)
      : undefined;
  }

  /**
   * Identity of a new instance: a stored flow never runs as the system, it runs as its last saver
   * @param def - the flow
   * @param launcher - the identity of the caller (launch) or of the parent instance (child flows)
   * @returns the launcher of the instance
   * @throws Forbidden when a stored flow launched by the system has no user to run as
   */
  protected instanceLauncher(def: FlowDefinition, launcher: WorkflowLauncher): WorkflowLauncher {
    if (!launcher?.system || def.source !== "stored") return launcher;
    const updatedBy = this.storedRunAs(def.id);
    if (!updatedBy) {
      throw new WebdaError.Forbidden(`${def.id} has no user to run as`);
    }
    return { userId: updatedBy };
  }

  /**
   * Identity of a child flow, which must be allowed to call the flow operation like a launch
   * @param def - the child flow
   * @param launcher - the launcher of the parent
   * @param input - the child input
   * @returns the launcher of the child
   * @throws TaskError Forbidden when the child may not be started
   */
  protected async childLauncher(
    def: FlowDefinition,
    launcher: WorkflowLauncher,
    input: any
  ): Promise<WorkflowLauncher> {
    let child: WorkflowLauncher;
    try {
      child = this.instanceLauncher(def, launcher);
    } catch (err) {
      throw new TaskError("Forbidden", (err as Error).message, false);
    }
    const ctx = child.system ? useSystem(input) : this.launcherContext(child, input);
    if (!(await canCallOperation(ctx, def.id, { input }))) {
      throw new TaskError("Forbidden", `${def.id} PermissionDenied`, false);
    }
    return child;
  }

  /**
   * A stored workflow changed on this replica: register it here and tell the others
   * @param uuid - the workflow uuid
   */
  protected async storedChanged(uuid: string): Promise<void> {
    await this.syncStored(uuid);
    if (this.parameters.syncPubSub) {
      await useDynamicService<any>(this.parameters.syncPubSub).sendMessage({ workflow: uuid });
    }
  }

  /**
   * Register, re-register or remove a stored workflow from the store
   * @param uuid - the workflow uuid
   */
  protected async syncStored(uuid: string): Promise<void> {
    const workflow = await runAsSystem(async () =>
      (await StoredWorkflow.ref(uuid).exists()) ? ((await StoredWorkflow.ref(uuid).get()) as StoredWorkflow) : undefined
    );
    if (workflow) {
      this.registerStored(workflow);
    } else {
      this.unregisterStored(uuid);
    }
  }

  /**
   * Validate then register a stored workflow; an invalid one is removed and logged
   * @param workflow - the stored workflow
   * @returns true when registered
   */
  protected registerStored(workflow: StoredWorkflow): boolean {
    try {
      // Every registration path: the store may hold a workflow written behind the validation
      this.validateStored(workflow);
      this.applyStored(workflow);
      return true;
    } catch (err) {
      this.log("ERROR", `Stored workflow ${workflow?.name} (${workflow?.uuid}) is not registered`, err);
      this.unregisterStored(workflow.uuid);
      return false;
    }
  }

  /**
   * Register a stored workflow as a flow, with its crons
   * @param workflow - the stored workflow
   */
  protected applyStored(workflow: StoredWorkflow): void {
    const known = this.storedFlows.get(workflow.uuid);
    const crons = JSON.stringify(workflow.crons ?? []);
    const version = workflow.version || flowVersion(workflow);
    if (known && known.flowId === workflow.name && known.version === version && known.crons === crons) {
      known.updatedBy = workflow.updatedBy;
      return;
    }
    if (known && known.flowId !== workflow.name) {
      this.unregisterStored(workflow.uuid);
    }
    this.registerFlow({
      id: workflow.name,
      version,
      params: workflow.params ?? [],
      input: workflow.input ?? { type: "object" },
      body: workflow.body ?? [],
      options: workflow.options,
      source: "stored"
    });
    for (const id of known?.cronIds ?? []) CronService.unregister(id);
    const cronIds: string[] = [];
    for (const cron of workflow.crons ?? []) {
      try {
        cronIds.push(CronService.getExportId(CronService.register(workflow.name, cron)));
      } catch (err) {
        this.log("ERROR", `Cannot register the cron ${cron.cron} of ${workflow.name}`, err);
      }
    }
    this.storedFlows.set(workflow.uuid, {
      flowId: workflow.name,
      version,
      updatedBy: workflow.updatedBy,
      crons,
      cronIds
    });
  }

  /**
   * Remove a stored workflow: its operation and its crons (running instances keep their pinned definition)
   * @param uuid - the workflow uuid
   */
  protected unregisterStored(uuid: string): void {
    const known = this.storedFlows.get(uuid);
    if (!known) return;
    this.storedFlows.delete(uuid);
    for (const id of known.cronIds) CronService.unregister(id);
    // Only what this stored flow registered: a code flow or another operation of the same name stays
    if (this.flows.get(known.flowId)?.source !== "stored") return;
    this.flows.delete(known.flowId);
    const operation: any = useInstanceStorage().operations?.[known.flowId];
    if (operation?.service === this.getName() && operation.context?.flowId === known.flowId) {
      delete useInstanceStorage().operations![known.flowId];
    }
  }

  /**
   * Load every stored workflow: register the new and changed ones, remove the deleted ones
   */
  protected async reloadStored(): Promise<void> {
    const workflows = await runAsSystem(async () => {
      const all: StoredWorkflow[] = [];
      for await (const workflow of StoredWorkflow.iterate("")) all.push(workflow as StoredWorkflow);
      return all;
    });
    const seen = new Set<string>();
    for (const workflow of workflows) {
      seen.add(workflow.uuid);
      this.registerStored(workflow);
    }
    for (const uuid of [...this.storedFlows.keys()]) {
      if (!seen.has(uuid)) this.unregisterStored(uuid);
    }
  }

  /**
   * Follow the stored workflow changes of the other replicas: through `syncPubSub`, or a reload every
   * `syncInterval`
   */
  protected startSync(): void {
    if (this.parameters.syncPubSub) {
      this.syncConsumer ??= useDynamicService<any>(this.parameters.syncPubSub).consume(async (event: any) => {
        if (event?.workflow) await this.syncStored(String(event.workflow));
      });
      return;
    }
    if (this.syncTimer) return;
    this.syncTimer = setInterval(() => {
      this.reloadStored().catch(err => this.log("ERROR", "Cannot reload the stored workflows", err));
    }, this.parameters.syncInterval);
    this.syncTimer.unref?.();
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
    // A stored workflow never runs as the system: a cron tick runs it as the user who saved it last
    const launcher = this.instanceLauncher(
      def,
      context.isGlobalContext()
        ? { system: true }
        : { userId: context.getCurrentUserId() || undefined, identId: context.getSession()?.identUsed }
    );
    const instance = await runAsSystem(() => this.createInstance(def, input, launcher));
    return { uuid: instance.uuid };
  }

  /**
   * Create an instance and run it to its first tasks
   * @param def - the flow definition, pinned in the instance
   * @param input - the flow input
   * @param launcher - the identity of the steps
   * @param options - the parent of an awaited child, a fixed uuid (created once)
   * @param options.parent - parent instance and task key
   * @param options.parent.instance - parent instance uuid
   * @param options.parent.key - task key in the parent
   * @param options.uuid - uuid of the instance: an existing one is not created again
   * @returns the instance
   */
  protected async createInstance(
    def: FlowDefinition,
    input: Record<string, any>,
    launcher: WorkflowLauncher,
    options: { parent?: { instance: string; key: string }; uuid?: string } = {}
  ): Promise<WorkflowInstance> {
    const now = Date.now();
    if (options.uuid && (await WorkflowInstance.ref(options.uuid).exists())) {
      return (await WorkflowInstance.ref(options.uuid).get()) as WorkflowInstance;
    }
    const instance = await WorkflowInstance.create({
      ...(options.uuid ? { uuid: options.uuid } : {}),
      ...(options.parent ? { parent: options.parent } : {}),
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
            await WorkflowTask.query(
              `instance = ? AND (status = 'PENDING' OR status = 'RUNNING' OR status = 'WAITING_EVENT' OR status = 'WAITING_CHILD') LIMIT 1`,
              [instance.uuid]
            )
          ).results;
          if (live.length) continue;
          await this.advance(instance.uuid);
          count++;
        }
      }
      // Buffered signals nobody consumed in time
      const expired = (await WorkflowSignal.query(`expiresAt <= ? LIMIT 100`, [Date.now()])).results;
      for (const signal of expired) {
        await WorkflowSignal.ref(signal.uuid)
          .delete()
          .catch(() => {});
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
        ...(await WorkflowTask.query(`status = 'RUNNING' AND leaseUntil < ${now} LIMIT ${slots}`)).results,
        // Waits whose timeout passed
        ...(await WorkflowTask.query(`status = 'WAITING_EVENT' AND runAt <= ${now} LIMIT ${slots}`)).results
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
   * @param extra - other fields to set with the claim
   * @returns true when this worker holds the task
   */
  protected async claim(task: WorkflowTask, extra: Partial<WorkflowTask> = {}): Promise<boolean> {
    const now = Date.now();
    const patch: Partial<WorkflowTask> = {
      ...extra,
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
   * @param advance - advance the instance after the outcome is journaled
   */
  protected async execute(task: WorkflowTask, advance: boolean = true): Promise<void> {
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
      if (task.signaled) {
        // Resolved by a signal or a child: the outcome is on the row
        entry = task.error ? { error: task.error } : { result: task.output };
      } else {
        entry = { result: await this.runTask(task, instance, controller) };
      }
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
    if (advance) {
      await this.advance(task.instance);
    }
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
        throw new TaskError("Timeout", `No ${task.event} event for ${task.eventKey} before the timeout`, false);
      case BUILTINS.Start: {
        const def = this.resolveFlow(task.input?.flow);
        if (!def) {
          throw new TaskError("NotFound", `Unknown flow ${task.input?.flow}`, false);
        }
        const input = task.input?.input ?? {};
        const launcher = await this.childLauncher(def, instance.launcher, input);
        // The same uuid for every attempt: a child started twice is created once
        const uuid = taskUuid(task.uuid, "start", 1);
        await runAsSystem(() => this.createInstance(def, input, launcher, { uuid }));
        return { uuid };
      }
    }
    if (this.resolveFlow(task.operation)) {
      throw new TaskError("InvalidTask", `Child flow ${task.operation} runs as a WAITING_CHILD task`, false);
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
        const journal = { ...instance.journal, [key]: { ...entry, at: Date.now(), seq: instance.revision + 1 } };
        const size =
          Buffer.byteLength(JSON.stringify(journal)) + Buffer.byteLength(JSON.stringify(instance.input ?? {}));
        if (size > this.parameters.maxContextSize) {
          const error: FlowError = {
            code: "ContextTooLarge",
            message: `The context of the workflow is ${size} bytes, over ${this.parameters.maxContextSize}`,
            operation: instance.flowId
          };
          if (await this.patchInstance(instance, { status: "ERROR", error })) {
            await this.deliverToParent(instance.uuid);
            return false;
          }
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
        if (res.status === "done" || res.status === "error") {
          const end: Partial<WorkflowInstance> =
            res.status === "done" ? { status: "SUCCESS", output: res.output } : { status: "ERROR", error: res.error };
          if (await this.patchInstance(instance, end)) {
            await this.deliverToParent(instanceId);
            return;
          }
          continue;
        }
        let resolved = false;
        for (const scheduled of res.schedule) {
          resolved = (await this.scheduleTask(instance, scheduled)) || resolved;
        }
        // A buffered signal resolved a new wait: replay again
        if (resolved) continue;
        const status = res.schedule.every(
          t => WAITING_OPERATIONS.includes(t.operation) || this.resolveFlow(t.operation)
        )
          ? "WAITING"
          : "RUNNING";
        if (status === instance.status || (await this.patchInstance(instance, { status }))) return;
      }
    });
  }

  /**
   * Create the task of a scheduled key, unless a PENDING or RUNNING one exists
   * @param instance - the instance
   * @param scheduled - the task to run
   * @returns true when the task was resolved at once (a buffered signal): the journal changed
   */
  protected async scheduleTask(instance: WorkflowInstance, scheduled: ScheduledTask): Promise<boolean> {
    const existing = (await WorkflowTask.query(`instance = ? AND key = ?`, [instance.uuid, scheduled.key]))
      .results as WorkflowTask[];
    // A SUCCESS row is journaled before it is finished: the replay read the instance before it
    if (existing.some(t => LIVE_TASK.includes(t.status) || t.status === "SUCCESS")) return false;
    const now = Date.now();
    let runAt = now;
    let extra: Partial<WorkflowTask> = {};
    if (scheduled.operation === BUILTINS.Sleep) {
      runAt = this.sleepUntil(scheduled.input, runAt);
    } else if (this.resolveFlow(scheduled.operation)) {
      return this.scheduleChild(instance, scheduled, existing.length + 1);
    } else if (scheduled.operation === BUILTINS.WaitForEvent) {
      const input = scheduled.input ?? {};
      extra = {
        status: "WAITING_EVENT",
        event: String(input.name),
        eventKey: String(input.key),
        allow: Array.isArray(input.allow) ? input.allow.map(String) : undefined
      };
      runAt = input.timeout ? this.sleepUntil({ duration: input.timeout }, now) : NO_TIMEOUT;
    }
    const task = await this.createTask(
      instance.uuid,
      scheduled,
      instance.launcher?.userId,
      runAt,
      1,
      existing.length + 1,
      extra
    );
    return task?.status === "WAITING_EVENT" ? this.consumeBuffered(instance, task) : false;
  }

  /**
   * Start an awaited child flow: the task waits for the child instance, which runs as the same launcher
   * @param instance - the parent instance
   * @param scheduled - the task, its operation is a flow id
   * @param index - row index of the key
   * @returns true when the child finished at once: the parent journal changed
   */
  protected async scheduleChild(instance: WorkflowInstance, scheduled: ScheduledTask, index: number): Promise<boolean> {
    const def = this.resolveFlow(scheduled.operation)!;
    // Created with the row: a worker resuming after a crash finds the same child
    const child = taskUuid(instance.uuid, `${scheduled.key}#child`, index);
    const task = await this.createTask(instance.uuid, scheduled, instance.launcher?.userId, NO_TIMEOUT, 1, index, {
      status: "WAITING_CHILD",
      child
    });
    if (!task) return false;
    let launcher: WorkflowLauncher;
    try {
      launcher = await this.childLauncher(def, instance.launcher, scheduled.input ?? {});
    } catch (err) {
      // Refused: the task fails like any task, the flow can catch it
      if (await this.claim(task, { signaled: true, error: this.toFlowError(err, scheduled.operation) })) {
        await this.execute(task, false);
        return true;
      }
      return false;
    }
    await this.createInstance(def, scheduled.input ?? {}, launcher, {
      parent: { instance: instance.uuid, key: scheduled.key },
      uuid: child
    });
    return ((await WorkflowTask.ref(task.uuid).get()) as WorkflowTask).status !== "WAITING_CHILD";
  }

  /**
   * Journal the end of a child into its parent: its output, its error, or `Cancelled`
   * @param childId - the child instance uuid
   */
  protected async deliverToParent(childId: string): Promise<void> {
    await runAsSystem(async () => {
      const child = (await WorkflowInstance.ref(childId).get()) as WorkflowInstance;
      if (!child?.parent || isActive(child)) return;
      const rows = (
        await WorkflowTask.query(`instance = ? AND key = ? AND status = 'WAITING_CHILD'`, [
          child.parent.instance,
          child.parent.key
        ])
      ).results as WorkflowTask[];
      const row = rows.find(r => r.child === child.uuid);
      if (!row) return;
      const outcome: Partial<WorkflowTask> =
        child.status === "SUCCESS"
          ? { signaled: true, output: child.output }
          : {
              signaled: true,
              error: child.error ?? {
                code: "Cancelled",
                message: "The child flow was cancelled",
                operation: child.flowId
              }
            };
      if (await this.claim(row, outcome)) {
        await this.execute(row);
      }
    });
  }

  /**
   * Cancel an instance, its live tasks and the children it waits on
   * @param uuid - the instance uuid
   */
  async cancelInstance(uuid: string): Promise<void> {
    await runAsSystem(async () => {
      if (!(await this.cancelTree(uuid))) {
        throw new WebdaError.BadRequest("cancel: the instance is not running");
      }
    });
  }

  /**
   * Cancel an instance and, recursively, the children it waits on
   * @param uuid - the instance uuid
   * @returns false when the instance was not running
   */
  protected async cancelTree(uuid: string): Promise<boolean> {
    for (;;) {
      const instance = (await WorkflowInstance.ref(uuid).get()) as WorkflowInstance;
      if (!isActive(instance)) return false;
      if (await this.patchInstance(instance, { status: "CANCELLED" })) break;
    }
    for (const row of (await WorkflowTask.query(`instance = ?`, [uuid])).results as WorkflowTask[]) {
      if (!LIVE_TASK.includes(row.status)) continue;
      // A local attempt stops now, a remote one loses its lease and drops its outcome
      this.running.get(row.uuid)?.controller.abort(DROPPED);
      await this.supersede(row);
      if (row.status === "WAITING_CHILD" && row.child) {
        await this.cancelTree(row.child);
      }
    }
    // A child cancelled on its own throws Cancelled in its parent
    await this.deliverToParent(uuid);
    return true;
  }

  /**
   * Mark a task row CANCELLED, conditionally on its lease: whoever holds it can no longer write its outcome
   * @param row - the task row, as read
   */
  protected async supersede(row: WorkflowTask): Promise<void> {
    const status = row.status;
    for (let current: WorkflowTask | undefined = row; current && current.status !== "CANCELLED";) {
      const now = Date.now();
      if (await this.patchLeased(current, { status: "CANCELLED", endedAt: now, leaseUntil: now })) break;
      current = (await WorkflowTask.ref(row.uuid).get()) as WorkflowTask;
    }
    // Keep the status seen by the caller
    row.status = status;
  }

  /**
   * Restart a failed instance: drop the outcome that failed it and every outcome journaled after it, then replay
   * @param uuid - the instance uuid
   */
  async retryInstance(uuid: string): Promise<void> {
    await runAsSystem(async () => {
      let kept: Record<string, JournalEntry>;
      for (;;) {
        const instance = (await WorkflowInstance.ref(uuid).get()) as WorkflowInstance;
        if (instance?.status !== "ERROR") {
          throw new WebdaError.BadRequest("retry: only a failed instance can be retried");
        }
        const order = (entry: JournalEntry) => entry.seq ?? entry.at ?? 0;
        const entries = Object.entries(instance.journal ?? {});
        const failing = entries
          .filter(([, entry]) => "error" in entry && sameError(entry.error, instance.error))
          .sort(([, a], [, b]) => order(b) - order(a))[0];
        if (!failing) {
          throw new WebdaError.BadRequest("retry: the error does not come from a task");
        }
        kept = Object.fromEntries(
          entries.filter(([key, entry]) => key !== failing[0] && order(entry) < order(failing[1]))
        );
        if (await this.patchInstance(instance, { status: "RUNNING", journal: kept, error: null as any })) break;
      }
      // Finished rows of the dropped keys would stop them from being scheduled again
      for (const row of (await WorkflowTask.query(`instance = ?`, [uuid])).results as WorkflowTask[]) {
        if ((row.status === "SUCCESS" || row.status === "ERROR") && !kept[row.key]) {
          await this.supersede(row);
        }
      }
      await this.advance(uuid);
    });
  }

  /**
   * Move a running instance to another version of its flow
   *
   * Refused when a journaled or live task key has no statement in the target graph.
   * @param uuid - the instance uuid
   * @param version - the target version, the latest registered when undefined
   */
  async migrateInstance(uuid: string, version?: string): Promise<void> {
    await runAsSystem(async () => {
      for (;;) {
        const instance = (await WorkflowInstance.ref(uuid).get()) as WorkflowInstance;
        if (!isActive(instance)) {
          throw new WebdaError.BadRequest("migrate: the instance is not running");
        }
        const target = version ? this.getFlowVersion(instance.flowId, version) : this.resolveFlow(instance.flowId);
        if (!target) {
          throw new WebdaError.BadRequest(`migrate: unknown version ${version ?? "(latest)"} of ${instance.flowId}`);
        }
        const ids = keysOf(target);
        const live = ((await WorkflowTask.query(`instance = ?`, [uuid])).results as WorkflowTask[])
          .filter(row => LIVE_TASK.includes(row.status))
          .map(row => row.key);
        const missing = [...new Set([...Object.keys(instance.journal ?? {}), ...live])].filter(
          key => !ids.has(statementIdOf(key))
        );
        if (missing.length) {
          throw new WebdaError.BadRequest(`migrate: ${missing.join(", ")} not in version ${target.version}`);
        }
        if (await this.patchInstance(instance, { definition: target, version: target.version })) break;
      }
      await this.advance(uuid);
    });
  }

  /**
   * Deliver a signal: resolve the waits on `(event, key)` whose instance accepts the caller, or buffer it when
   * nothing waits
   * @param event - event name
   * @param key - business key
   * @param payload - the result of the waits
   * @returns the number of waits resolved
   */
  @Operation({
    id: "Workflow.Signal",
    rest: { method: "post", path: "workflows/signal" },
    graphql: false,
    grpc: false
  })
  async signal(event: string, key: string, payload?: any): Promise<{ delivered: number }> {
    const context = useContext<OperationContext>();
    if (!context.isGlobalContext() && !context.getCurrentUserId()) {
      throw new WebdaError.Unauthorized("Workflow.Signal needs an authenticated caller");
    }
    if (Buffer.byteLength(JSON.stringify(payload ?? null)) > this.parameters.maxSignalPayload) {
      throw new WebdaError.BadRequest(`Workflow.Signal payload is over ${this.parameters.maxSignalPayload} bytes`);
    }
    const waits = await runAsSystem(() => this.waitsFor(event, key));
    if (waits.length === 0) {
      const buffered = await this.bufferSignal(context, event, key, payload);
      // A wait created meanwhile looked for buffered signals before this one was saved
      return { delivered: (await this.deliverBuffered(buffered)) ? 1 : 0 };
    }
    let delivered = 0;
    let refused = 0;
    for (const { instance, task } of waits) {
      if (!(await this.canSignal(context, instance, task))) {
        refused++;
        continue;
      }
      if (await runAsSystem(() => this.resolveWait(task, payload))) {
        delivered++;
      }
    }
    // Refused by every wait, or waits resolved by a concurrent signal: not delivered, not buffered. A refused sender
    // gets the answer of "nothing waits", so the pending waits cannot be probed
    return { delivered };
  }

  /**
   * The waits on `(event, key)` of active instances
   * @param event - event name
   * @param key - business key
   * @returns the waits and their instance
   */
  protected async waitsFor(event: string, key: string): Promise<{ instance: WorkflowInstance; task: WorkflowTask }[]> {
    const tasks = (await WorkflowTask.query(`status = 'WAITING_EVENT' AND event = ? AND eventKey = ?`, [event, key]))
      .results as WorkflowTask[];
    const waits: { instance: WorkflowInstance; task: WorkflowTask }[] = [];
    for (const task of tasks) {
      const instance = (await WorkflowInstance.ref(task.instance).get()) as WorkflowInstance;
      if (isActive(instance)) waits.push({ instance, task });
    }
    return waits;
  }

  /**
   * Whether a sender may signal a wait: the launcher, the system, and the users in the `allow` of the wait
   * @param context - the sender
   * @param instance - the instance waiting
   * @param task - the wait
   * @returns true when allowed
   */
  protected async canSignal(
    context: OperationContext,
    instance: WorkflowInstance,
    task: WorkflowTask
  ): Promise<boolean> {
    if ((await instance.canAct(context, "signal")) === true) return true;
    const userId = context.getCurrentUserId();
    return !!userId && (task.allow ?? []).includes(userId);
  }

  /**
   * Save a signal nothing waits for yet
   * @param context - the sender
   * @param event - event name
   * @param key - business key
   * @param payload - the payload
   * @returns the buffered signal
   */
  protected async bufferSignal(
    context: OperationContext,
    event: string,
    key: string,
    payload: any
  ): Promise<WorkflowSignal> {
    const now = Date.now();
    const system = context.isGlobalContext();
    const pending = await runAsSystem(
      async () =>
        (
          await WorkflowSignal.query(
            `event = ? AND key = ? AND expiresAt > ? LIMIT ${this.parameters.maxBufferedSignals}`,
            [event, key, now]
          )
        ).results.length
    );
    if (pending >= this.parameters.maxBufferedSignals) {
      // Refused rather than dropping an older one: an accepted signal is never lost
      throw new WebdaError.TooManyRequests(`Too many buffered signals for ${event}/${key}`);
    }
    return runAsSystem(
      () =>
        WorkflowSignal.create({
          event,
          key,
          payload,
          senderId: system ? undefined : context.getCurrentUserId() || undefined,
          senderIdent: system ? undefined : context.getSession()?.identUsed,
          system: system || undefined,
          createdAt: now,
          expiresAt: now + new Duration(this.parameters.signalTtl).toMs()
        } as any) as Promise<WorkflowSignal>
    );
  }

  /**
   * Deliver a just buffered signal to a wait created while it was being saved
   * @param signal - the buffered signal
   * @returns true when a wait consumed it
   */
  protected async deliverBuffered(signal: WorkflowSignal): Promise<boolean> {
    return runAsSystem(async () => {
      for (const { instance, task } of await this.waitsFor(signal.event, signal.key)) {
        if (await this.consumeSignal(signal, instance, task, true)) return true;
      }
      return false;
    });
  }

  /**
   * Resolve a new wait with the oldest unexpired buffered signal its instance accepts
   * @param instance - the instance
   * @param task - the wait
   * @returns true when a signal was consumed
   */
  protected async consumeBuffered(instance: WorkflowInstance, task: WorkflowTask): Promise<boolean> {
    const signals = (
      (await WorkflowSignal.query(`event = ? AND key = ? AND expiresAt > ?`, [task.event, task.eventKey, Date.now()]))
        .results as WorkflowSignal[]
    ).sort((a, b) => a.createdAt - b.createdAt);
    for (const signal of signals) {
      // Advanced by the caller (advance)
      if (await this.consumeSignal(signal, instance, task, false)) return true;
    }
    return false;
  }

  /**
   * Consume a buffered signal for a wait: its sender is checked now, against this instance
   * @param signal - the buffered signal
   * @param instance - the instance waiting
   * @param task - the wait
   * @param advance - advance the instance once the payload is journaled
   * @returns true when consumed and delivered
   */
  protected async consumeSignal(
    signal: WorkflowSignal,
    instance: WorkflowInstance,
    task: WorkflowTask,
    advance: boolean
  ): Promise<boolean> {
    if (signal.expiresAt <= Date.now()) return false;
    const sender = signal.system
      ? useSystem()
      : this.launcherContext({ userId: signal.senderId, identId: signal.senderIdent }, null);
    if (!(await this.canSignal(sender, instance, task))) return false;
    try {
      // Consumed once: a concurrent consumer fails the condition
      await WorkflowSignal.ref(signal.uuid).delete("expiresAt" as any, signal.expiresAt as any);
    } catch {
      return false;
    }
    if (await this.resolveWait(task, signal.payload, advance)) return true;
    // The wait timed out or another signal resolved it first: the signal stays buffered
    const { uuid, event, key, payload, senderId, senderIdent, system, createdAt, expiresAt } = signal;
    await WorkflowSignal.create({
      uuid,
      event,
      key,
      payload,
      senderId,
      senderIdent,
      system,
      createdAt,
      expiresAt
    } as any);
    return false;
  }

  /**
   * Resolve a wait with a payload: claimed like a task, so it resolves once
   * @param task - the wait
   * @param payload - its result
   * @param advance - advance the instance once the payload is journaled
   * @returns false when the wait was already resolved or timed out
   */
  protected async resolveWait(task: WorkflowTask, payload: any, advance: boolean = true): Promise<boolean> {
    if (!(await this.claim(task, { signaled: true, output: payload }))) return false;
    await this.execute(task, advance);
    return true;
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
   * @param extra - other fields of the row
   * @returns the task created, undefined when another worker created it
   */
  protected async createTask(
    instance: string,
    scheduled: ScheduledTask,
    launcherId: string | undefined,
    runAt: number,
    attempt: number,
    index?: number,
    extra: Partial<WorkflowTask> = {}
  ): Promise<WorkflowTask | undefined> {
    return runAsSystem(async () => {
      index ??= (await WorkflowTask.query(`instance = ? AND key = ?`, [instance, scheduled.key])).results.length + 1;
      const uuid = taskUuid(instance, scheduled.key, index);
      try {
        return (await WorkflowTask.create({
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
          launcherId,
          ...extra
        } as any)) as WorkflowTask;
      } catch (err) {
        if (!(await WorkflowTask.ref(uuid).exists())) throw err;
        // Created by another worker
        return undefined;
      }
    });
  }
}

export default WorkflowService;
