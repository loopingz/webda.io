// organize-imports-ignore
import {
  callOperation,
  loadModelForAction,
  runWithContext,
  registerOperation,
  registerSchema,
  Service,
  ServiceParameters,
  Session,
  SimpleOperationContext,
  useApplication,
  useContext,
  useDynamicService,
  useInstanceStorage,
  useSystem
} from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import { vi } from "vitest";
import type { FlowDefinition, Stmt, TaskOptions } from "../src/graph.js";
import { WorkflowInstance } from "../src/models/workflowinstance.model.js";
import { WorkflowTask } from "../src/models/workflowtask.model.js";
import { WorkflowSignal } from "../src/models/workflowsignal.model.js";
import { Workflow } from "../src/models/workflow.model.js";

/**
 * Models of the package, by identifier
 */
export const WORKFLOW_MODELS: [string, any][] = [
  ["Webda/WorkflowInstance", WorkflowInstance],
  ["Webda/WorkflowTask", WorkflowTask],
  ["Webda/WorkflowSignal", WorkflowSignal],
  ["Webda/Workflow", Workflow]
];
import { useAbortSignal, WorkflowService, WorkflowServiceParameters } from "../src/workflow.service.js";

/**
 * Operations the test flows call
 */
export class FlowTestService extends Service {
  calls: Record<string, number> = {};
  /**
   * Abort signals seen by slow()
   */
  signals: AbortSignal[] = [];
  /**
   * Resolve the pending slow() calls
   */
  releases: ((value: any) => void)[] = [];

  /**
   * Count a call
   * @param name - the method
   */
  count(name: string) {
    this.calls[name] = (this.calls[name] ?? 0) + 1;
  }

  /**
   * @param a - left
   * @param b - right
   * @returns the sum
   */
  async add(a: number, b: number) {
    this.count("add");
    return a + b;
  }

  /**
   * Always fails
   */
  async fail() {
    this.count("fail");
    throw new Error("boom");
  }

  /**
   * @returns the current user id
   */
  async whoAmI() {
    this.count("whoAmI");
    return useContext().getCurrentUserId();
  }

  /**
   * Never ends until aborted
   * @returns a promise resolved on abort
   */
  async slow() {
    this.count("slow");
    const signal = useAbortSignal();
    this.signals.push(signal);
    return new Promise(resolve => {
      this.releases.push(resolve);
      signal?.addEventListener("abort", () => resolve("aborted"));
    });
  }

  /**
   * Guarded by a permission query
   * @returns ok
   */
  async guarded() {
    this.count("guarded");
    return "ok";
  }

  /**
   * A large result
   * @returns 500 characters
   */
  async big() {
    return "x".repeat(500);
  }
}

/**
 * Task statement shortcut
 * @param id - statement id
 * @param operation - operation id
 * @param input - input expression
 * @param assign - variable
 * @param options - task options
 * @returns the statement
 */
export function task(
  id: string,
  operation: string,
  input: any = { lit: {} },
  assign?: string,
  options?: TaskOptions
): Stmt {
  return { kind: "task", id, operation, input, assign, options };
}

/**
 * Test application with the workflow models and service from sources, and test operations
 */
export class WorkflowTestBase extends WebdaApplicationTest {
  service: WorkflowService;
  ops: FlowTestService;
  flowCount = 0;

  /**
   * Use the sources classes with the compiled metadata
   * @param app - the test application
   */
  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    for (const [name, model] of WORKFLOW_MODELS) {
      app.addModel(name, model, app.getModel(name).Metadata);
      model.registerSerializer(true, name);
    }
    (WorkflowService as any).createConfiguration = (params: any = {}) => new WorkflowServiceParameters().load(params);
    app.addModda("Webda/WorkflowService", WorkflowService);
  }

  /**
   * Register the test operations once
   */
  async beforeAll() {
    await super.beforeAll();
    this.ops = this.registerService(new FlowTestService("FlowTest", new ServiceParameters().load({})));
    const schema = {
      type: "object",
      properties: { a: { type: "number" }, b: { type: "number" } },
      "x-webda-arguments": ["a", "b"]
    };
    registerSchema("FlowTest.Add.input", schema);
    useApplication().getSchemas()["FlowTest.Add.input"] = schema;
    registerOperation("FlowTest.Add", { service: "FlowTest", method: "add", input: "FlowTest.Add.input" });
    for (const method of ["fail", "whoAmI", "slow", "guarded", "big"]) {
      registerOperation(`FlowTest.${method[0].toUpperCase()}${method.substring(1)}`, {
        service: "FlowTest",
        method,
        ...(method === "guarded" ? { permission: "userId = 'alice'" } : {})
      });
    }
  }

  /**
   * Fresh stores and counters
   */
  async beforeEach() {
    await super.beforeEach();
    this.service = useDynamicService<WorkflowService>("WorkflowService");
    for (const [, model] of WORKFLOW_MODELS) {
      for (const item of (await model.query("")).results) {
        await model.ref(item.uuid).delete();
      }
    }
    this.ops.calls = {};
    this.ops.signals = [];
    this.ops.releases = [];
    const guarded: any = useInstanceStorage().operations["FlowTest.Guarded"];
    guarded.permission = "userId = 'alice'";
    delete guarded.permissionQuery;
    this.service.getParameters().maxContextSize = 262144;
    this.service.getParameters().signalTtl = "1d";
  }

  /**
   * Restore the timers
   */
  async afterEach() {
    vi.useRealTimers();
  }

  /**
   * Register a flow with a unique id
   * @param body - the statements
   * @param params - the parameters
   * @param extra - other fields of the definition
   * @returns the definition registered
   */
  flow(body: Stmt[], params: string[] = [], extra: Partial<FlowDefinition> = {}): FlowDefinition {
    const def: FlowDefinition = {
      id: `Flows.Test${++this.flowCount}`,
      version: "",
      params,
      input: {
        type: "object",
        properties: Object.fromEntries(params.map(p => [p, {}]))
      },
      body,
      source: "code",
      ...extra
    };
    this.service.registerFlow(def);
    return def;
  }

  /**
   * A user context
   * @param userId - the user id
   * @param input - the operation input
   * @returns the context
   */
  async userContext(userId: string, input: any = {}): Promise<SimpleOperationContext> {
    const ctx = new SimpleOperationContext();
    const session = new Session();
    session.login(userId, `${userId}-ident`);
    ctx.setSession(session);
    ctx.setInput(Buffer.from(JSON.stringify(input)));
    await ctx.init();
    return ctx;
  }

  /**
   * Launch a flow through its operation
   * @param def - the flow
   * @param input - the flow input
   * @param userId - the launcher, the system when undefined
   * @returns the instance uuid
   */
  async launch(def: FlowDefinition, input: any = {}, userId?: string): Promise<string> {
    const ctx = userId ? await this.userContext(userId, input) : useSystem(input);
    await callOperation(ctx, def.id);
    return JSON.parse(ctx.getOutput()).uuid;
  }

  /**
   * Tick until no task is claimed
   * @param service - the service ticking
   * @returns the number of tasks run
   */
  async drain(service: WorkflowService = this.service): Promise<number> {
    let total = 0;
    for (let i = 0; i < 50; i++) {
      const n = await service["tick"]();
      if (n === 0) break;
      total += n;
    }
    return total;
  }

  /**
   * @param uuid - the instance uuid
   * @returns the instance
   */
  instance(uuid: string): Promise<WorkflowInstance> {
    return WorkflowInstance.ref(uuid).get() as Promise<WorkflowInstance>;
  }

  /**
   * @param uuid - the instance uuid
   * @returns the tasks of the instance
   */
  async tasks(uuid: string): Promise<WorkflowTask[]> {
    return (await WorkflowTask.query(`instance = '${uuid}'`)).results as WorkflowTask[];
  }

  /**
   * Send a signal through the Workflow.Signal operation
   * @param userId - the sender, the system when undefined
   * @param event - event name
   * @param key - business key
   * @param payload - the payload
   * @returns the operation result
   */
  async signal(userId: string | undefined, event: string, key: string, payload?: any): Promise<{ delivered: number }> {
    const input = { event, key, payload };
    const ctx = userId ? await this.userContext(userId, input) : useSystem(input);
    await callOperation(ctx, "Workflow.Signal");
    return JSON.parse(ctx.getOutput());
  }

  /**
   * Call an action of an instance as a user, through its canAct like the model operation
   * @param userId - the caller, the system when undefined
   * @param uuid - the instance uuid
   * @param action - the action
   * @param args - the action arguments
   * @returns the action result
   */
  async act(userId: string | undefined, uuid: string, action: string, ...args: any[]): Promise<any> {
    const ctx = userId ? await this.userContext(userId) : useSystem();
    const instance: any = await loadModelForAction(WorkflowInstance, uuid, ctx, action);
    return runWithContext(ctx, () => instance[action](...args));
  }
}
