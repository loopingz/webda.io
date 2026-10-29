import { createHash } from "crypto";
import { schedule } from "node-cron";
import { Service } from "./service.js";
import { CancelablePromise } from "@webda/utils";
import { useCore } from "../core/hooks.js";
import { Command } from "./command.js";
import { FatalInitError } from "../errors/errors.js";
import { getMetadata } from "@webda/decorators";
import { useLog } from "@webda/workout";
import { useInstanceStorage } from "../core/instancestorage.js";
import { callOperation } from "../core/operations.js";
import { validateSchema, ValidationError } from "../schemas/hooks.js";
import { useSystem } from "../contexts/globaloperationcontext.js";
import { Cluster, useCluster } from "./cluster.service.js";

export const CronSymbol = Symbol("WebdaCron");

/**
 * Check a cron input is a plain object
 * @param input - the cron input
 * @returns whether it is a plain object
 */
function isPlainObject(input: any): input is Record<string, any> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return false;
  }
  const proto = Object.getPrototypeOf(input);
  return proto === Object.prototype || proto === null;
}

/**
 * Cron item
 */
export class CronDefinition {
  /**
   * Cron definition
   * * * * 0 3
   * @pattern ^(\*|([0-5]?\d)) (\*|([01]?\d|2[0-3])) (\*|([01]?\d|2[0-3])) (\*|([0-6])) (\*|([0-6]))$
   */
  cron: string;

  /**
   * Description of the task
   */
  description: string;
  /**
   * Input of the operation, validated against its input schema
   */
  input: Record<string, any>;
  /**
   * Method to call
   */
  method: string;
  /**
   * Webda service name
   */
  serviceName: string;
  /**
   * Operation called at each tick
   */
  operationId: string;

  /**
   *
   * @param cron - the cron expression
   * @param input - the operation input
   * @param serviceName - the service name
   * @param method - the service method
   * @param description - the description
   * @param operationId - the operation called
   */
  constructor(
    cron: string,
    input: Record<string, any> = {},
    serviceName: string = "",
    method: string = "",
    description: string = "",
    operationId: string = ""
  ) {
    this.cron = cron;
    this.serviceName = serviceName;
    this.method = method;
    this.description = description;
    this.input = input;
    this.operationId = operationId;
  }

  /**
   * Format the cron definition as a human-readable string
   * @returns the result
   */
  toString() {
    return `${this.cron}: ${this.operationId}(${JSON.stringify(this.input)})${
      this.description !== "" ? ` # ${this.description}` : ""
    }`;
  }
}

/**
 * A cron entry of the crontab: a resolved cron, or a native callback
 */
type CrontabEntry = Partial<CronDefinition> & {
  cron: string;
  /** Location of the native callback */
  context?: string;
  /** Native callback */
  cb?: () => void;
};

/**
 * @WebdaModda
 */
class CronService extends Service {
  enable: boolean;
  crons: CrontabEntry[] = [];
  crontabSchedule: (cron: string, cb: () => any) => { stop: () => any } = schedule;
  private _scanned: boolean = false;
  /** Crons scheduled by {@link run}, started on the cluster leader only */
  protected scheduled: CrontabEntry[] = [];
  /** node-cron tasks running while this instance leads, by cron */
  protected tasks = new Map<CrontabEntry, { stop: () => any }>();
  /** Whether this instance leads and runs the tasks */
  protected leading = false;
  /** Remove the `whenLeader` registration of {@link run} */
  protected unregisterLeader?: () => void;
  /** Services running the annotations and the registered crons: {@link register} adds to their live schedule */
  protected static running = new Set<CronService>();

  /**
   * Legacy decorator factory for annotating a method with a cron schedule
   * @param cron - the cron expression
   * @param description - the description
   * @param input - the operation input
   * @returns the result
   */
  static Annotation(cron: string, description: string = "", input: Record<string, any> = {}): MethodDecorator {
    return (_target: any, property: string | symbol, descriptor: PropertyDescriptor) => {
      descriptor.value.cron = descriptor.value.cron || [];
      descriptor.value.cron.push(new CronDefinition(cron, input, "", <string>property, description));
    };
  }

  /**
   * Generate a short hash-based identifier for a cron definition
   *
   * It hashes the cron expression, the operation, its input and the description: renaming the method of an operation
   * keeps the identifier
   * @param cron - the cron expression
   * @param name - the name to use
   * @returns the result
   */
  static getCronId(cron: CronDefinition, name: string = "") {
    const hash = createHash("sha256");
    const { operationId, input, description } = cron;
    return hash
      .update(JSON.stringify({ cron: cron.cron, operationId, input, description }) + name)
      .digest("hex")
      .substring(0, 8);
  }

  /**
   * Stable identifier of a cron for exported jobs (e.g. Kubernetes CronJob)
   *
   * `webda cron run --id <id>` resolves the cron back from this identifier
   * @param cron - the cron definition
   * @returns the 8 hex characters identifier
   */
  static getExportId(cron: CronDefinition): string {
    return CronService.getCronId(cron, "export");
  }

  /**
   * Validate a cron input against the input schema of its operation
   * @param operationId - the operation
   * @param input - the cron input
   * @throws Error when the input does not match the schema
   */
  protected static validateInput(operationId: string, input: Record<string, any>) {
    const schema = useInstanceStorage().operations[operationId].input;
    if (!schema || schema === "void") {
      return;
    }
    try {
      validateSchema(schema, input);
    } catch (err) {
      if (!(err instanceof ValidationError)) {
        throw err;
      }
      const summary = err.errors
        .map(e => `${e.instancePath || (e.params as any)?.missingProperty || "/"} ${e.message}`)
        .join("; ");
      throw new Error(`Invalid cron input for ${operationId}: ${summary}`);
    }
  }

  /**
   * Resolve the @Cron annotations of the services to their operations, followed by the registered crons
   *
   * A `@Cron` must decorate an `@Operation` method, and its input must match the operation input schema. A cron on
   * an operation disabled by configuration is skipped.
   * @param services - the services
   * @returns the crons
   * @throws Error when a `@Cron` is not on an operation or its input is invalid
   */
  static resolveCrons(services: Record<string, any> = useCore().getServices()): CronDefinition[] {
    const cronsResult: CronDefinition[] = [];
    const operations = Object.values(useInstanceStorage().operations ?? {});
    for (const serviceName in services) {
      const service = services[serviceName];
      for (const cron of <CronDefinition[]>(service?.[CronSymbol] ?? [])) {
        const operation = operations.find(o => o.service === serviceName && o.method === cron.method);
        if (!operation) {
          const declared = ((getMetadata(service.constructor)?.["webda.operations"] as any[]) ?? []).some(
            o => o._methodName === cron.method
          );
          if (!declared) {
            const name = serviceName.substring(0, 1).toUpperCase() + serviceName.substring(1);
            throw new Error(`@Cron on ${name}.${cron.method} requires @Operation`);
          }
          useLog("WARN", `Skipping cron ${cron.cron} on ${serviceName}.${cron.method}: its operation is disabled`);
          continue;
        }
        CronService.validateInput(operation.id, cron.input);
        cronsResult.push(
          new CronDefinition(cron.cron, cron.input, serviceName, cron.method, cron.description, operation.id)
        );
      }
    }
    return [...cronsResult, ...(useInstanceStorage().crons ?? [])];
  }

  /**
   * Collect all @Cron-annotated methods from the provided services
   * @param services - the services
   * @returns the list of results
   * @deprecated use {@link CronService.resolveCrons}
   */
  static loadAnnotations(services): CronDefinition[] {
    return CronService.resolveCrons(services);
  }

  /**
   * Register a cron calling an operation, from a source other than `@Cron` (a stored workflow for example)
   * @param operationId - the operation called at each tick
   * @param def - the cron
   * @param def.cron - the cron expression
   * @param def.description - the description
   * @param def.input - the operation input
   * @returns the registered cron
   * @throws Error when the operation is unknown or the input invalid
   */
  static register(
    operationId: string,
    def: { cron: string; description?: string; input?: Record<string, any> }
  ): CronDefinition {
    const operation = useInstanceStorage().operations?.[operationId];
    if (!operation) {
      throw new Error(`Unknown operation ${operationId}`);
    }
    const input = def.input ?? {};
    if (!isPlainObject(input)) {
      throw new Error(`Cron input of ${operationId} must be a plain object`);
    }
    CronService.validateInput(operationId, input);
    const cron = new CronDefinition(
      def.cron,
      input,
      operation.service ?? "",
      operation.method ?? "",
      def.description ?? "",
      operationId
    );
    const crons = (useInstanceStorage().crons ??= []);
    // Registering the same cron again keeps the first one
    const id = CronService.getExportId(cron);
    const existing = crons.find(c => CronService.getExportId(c) === id);
    if (existing) {
      return existing;
    }
    crons.push(cron);
    CronService.running.forEach(service => service.addScheduled(cron));
    return cron;
  }

  /**
   * Remove registered crons, stopping their running tasks
   *
   * The `@Cron` annotations cannot be removed.
   * @param idOrOperationId - the export id of a cron ({@link CronService.getExportId}), or an operation id to remove
   *   all its registered crons
   * @returns the removed crons
   */
  static unregister(idOrOperationId: string): CronDefinition[] {
    const crons = useInstanceStorage().crons ?? [];
    const removed = crons.filter(
      c => c.operationId === idOrOperationId || CronService.getExportId(c) === idOrOperationId
    );
    useInstanceStorage().crons = crons.filter(c => !removed.includes(c));
    CronService.running.forEach(service => removed.forEach(cron => service.removeScheduled(cron)));
    return removed;
  }

  /**
   * Call the operation of a cron as the system, logging a failure: a failed tick never stops the next ones
   * @param cron - the cron
   * @param rethrow - reject on failure too, for a one-shot run (an exported job must exit non-zero)
   */
  static async execute(cron: CronDefinition, rethrow: boolean = false): Promise<void> {
    try {
      await callOperation(useSystem(cron.input), cron.operationId);
    } catch (err) {
      useLog("ERROR", `Cron ${cron.cron} of operation ${cron.operationId} failed`, err);
      if (rethrow) {
        throw err;
      }
    }
  }

  /**
   * Cluster electing the instance running the crons
   * @returns the application cluster
   */
  protected getCluster(): Cluster {
    return useCluster();
  }

  /**
   * Resolve the crons at startup: an invalid cron stops the application start rather than failing at its first tick
   * @returns this
   */
  async init(): Promise<this> {
    await super.init();
    try {
      CronService.resolveCrons();
    } catch (err) {
      throw new FatalInitError(err.message, { cause: err });
    }
    return this;
  }

  /** Scan all services for cron annotations and add them to the schedule (once) */
  addAnnotations() {
    if (this._scanned) {
      return;
    }
    this._scanned = true;
    this.crons.push(...CronService.resolveCrons());
  }

  /**
   * Get all registered cron entries including annotations
   * @returns the result
   */
  getCrontab() {
    // Load all annotations
    this.addAnnotations();
    return this.crons;
  }

  /**
   * Start the cron worker, optionally including annotated crons
   * @param annotations - the annotations
   * @returns the result
   */
  work(annotations: string = "true"): CancelablePromise {
    return this.run(annotations === "true");
  }

  /**
   * Run once the cron matching an exported cron id
   *
   * Only declared crons can be run, with their declared input
   * @param id - the cron id, as computed by {@link CronService.getExportId}
   */
  @Command("cron run", { description: "Run once the declared cron matching the id" })
  async runCron(id: string): Promise<void> {
    if (!id) {
      throw new Error("A cron id is required");
    }
    const crons = CronService.resolveCrons().filter(c => CronService.getExportId(c) === id);
    if (crons.length === 0) {
      throw new Error(`No cron with id '${id}'`);
    }
    for (const cron of crons) {
      this.log("INFO", `Running cron ${cron.toString()}`);
      await CronService.execute(cron, true);
    }
  }

  /**
   * Schedule and start all registered cron jobs
   * @param annotations - the annotations
   * @returns the result
   */
  run(annotations: boolean = true): CancelablePromise {
    this.log("INFO", "Running crontab with" + (annotations ? "" : "out"), "annotations");
    // Load all annotations
    if (annotations) {
      this.addAnnotations();
    }
    this.enable = true;
    this.crons.forEach(entry => this.addScheduled(entry));

    const msgs = [];
    // Display before
    this.crons.forEach(c => {
      if (c.cb) {
        msgs.push(`[NativeCode:${c.context || ""}]`);
      } else {
        msgs.push(`${c.operationId}(${JSON.stringify(c.input)})`);
      }
    });
    const cronPad = Math.max(...this.crons.map(c => c.cron.length));
    const servicePad = Math.max(...msgs.map(c => c.length));
    this.crons.forEach((c, i) => {
      this.log(
        "INFO",
        `${c.cron.padEnd(cronPad)} : ${msgs[i].padEnd(servicePad)}${c.description ? "  # " + c.description : ""}`
      );
    });
    // Remove from memory
    this.crons = [];
    if (annotations) {
      // Crons registered after the scan join the live schedule
      CronService.running.add(this);
      (useInstanceStorage().crons ?? []).forEach(cron => this.addScheduled(cron));
    }
    // Only the cluster leader runs the crons: each tick fires once across the replicas
    this.unregisterLeader ??= this.getCluster().whenLeader(
      () => this.startTasks(),
      () => this.stopTasks()
    );
    return new CancelablePromise(undefined, () => this.stop());
  }

  /**
   * Start a node-cron task for a cron
   * @param entry - the cron
   */
  protected startTask(entry: CrontabEntry) {
    if (this.tasks.has(entry)) {
      return;
    }
    this.tasks.set(
      entry,
      this.crontabSchedule(entry.cron, entry.cb ?? (() => CronService.execute(<CronDefinition>entry)))
    );
  }

  /**
   * Add a cron to the schedule, started at once when leading
   * @param entry - the cron
   */
  protected addScheduled(entry: CrontabEntry) {
    if (this.scheduled.includes(entry)) {
      return;
    }
    this.scheduled.push(entry);
    if (this.leading) {
      this.startTask(entry);
    }
  }

  /**
   * Remove a cron from the schedule, stopping its task
   * @param entry - the cron
   */
  protected removeScheduled(entry: CrontabEntry) {
    this.scheduled = this.scheduled.filter(e => e !== entry);
    this.tasks.get(entry)?.stop();
    this.tasks.delete(entry);
  }

  /**
   * Start the tasks: this instance became the leader
   */
  protected startTasks() {
    this.leading = true;
    this.log("INFO", `Leading the cluster: starting ${this.scheduled.length} cron(s)`);
    this.scheduled.forEach(entry => this.startTask(entry));
  }

  /**
   * Stop the tasks: this instance is not the leader anymore
   */
  protected stopTasks() {
    this.leading = false;
    if (this.tasks.size) {
      this.log("INFO", `Not leading the cluster: stopping ${this.tasks.size} cron(s)`);
    }
    this.tasks.forEach(task => task.stop());
    this.tasks.clear();
  }

  /**
   * Stop running the crons
   */
  async stop(): Promise<void> {
    CronService.running.delete(this);
    this.unregisterLeader?.();
    this.unregisterLeader = undefined;
    // The deregistration is queued: stop the tasks now
    this.stopTasks();
    await super.stop();
  }

  /**
   * Register a cron expression to execute a callback, buffering if not yet enabled
   * @param cron - the cron expression
   * @param cb - the callback function
   * @param description - the description
   */
  schedule(cron: string, cb: () => any, description: string = "") {
    if (this.enable) {
      this.addScheduled({ cron, cb, description });
    } else {
      let context;
      try {
        throw new Error();
      } catch (err) {
        // Based on stack trace (not super clean)
        const info = err.stack.split("\n")[2].match(/\((.*)\)/);
        context = info[1].replace(process.cwd() + "/", "");
      }
      this.crons.push({ cron, cb, description, context });
    }
  }
}

/**
 * Decorator to schedule an operation with a cron expression
 *
 * The method must be an `@Operation`: each tick calls the operation as the system, with `input` validated against
 * the operation input schema
 * @param cron - the cron expression
 * @param description - the description
 * @param input - the operation input
 * @returns the result
 */
export function Cron(cron: string, description = "", input: Record<string, any> = {}) {
  if (!isPlainObject(input)) {
    throw new Error(`@Cron input must be a plain object, got ${JSON.stringify(input)}`);
  }
  return function cronDecorator<T extends (this: Service, ...a: any[]) => Promise<any>>(
    value: T,
    context: ClassMethodDecoratorContext<Service, T>
  ) {
    // Store metadata on each instance when it's constructed
    context.addInitializer(function cronInitializer(this: Service) {
      (this[CronSymbol] ??= []).push(new CronDefinition(cron, input, this.name, context.name as string, description));
    });

    // You can return the same method, or wrap it if you need
    return value;
  };
}

export { CronService };
