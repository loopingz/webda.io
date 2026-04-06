import { createHash } from "crypto";
import { schedule } from "node-cron";
import { Service } from "./service.js";
import { CancelablePromise } from "@webda/utils";
import { ServiceName, useCore, useService } from "../core/hooks.js";

export const CronSymbol = Symbol("WebdaCron");
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
   * Argument to be passed to the function
   */
  args: any[];
  /**
   * Method to call
   */
  method: string;
  /**
   * Webda service name
   */
  serviceName: string;

  /**
   *
   * @param cron - the cron expression
   * @param args - additional arguments
   * @param serviceName - the service name
   * @param method - the HTTP method
   * @param description - the description
   */
  constructor(cron: string, args: any[] = [], serviceName: string = "", method: string = "", description: string = "") {
    this.cron = cron;
    this.serviceName = serviceName;
    this.method = method;
    this.description = description;
    this.args = args;
  }

  /**
   * Format the cron definition as a human-readable string
   * @returns the result
   */
  toString() {
    return `${this.cron}: ${this.serviceName}.${this.method}(${this.args.map(a => a.toString()).join(",")})${
      this.description !== "" ? ` # ${this.description}` : ""
    }`;
  }
}

/**
 * @WebdaModda
 */
class CronService extends Service {
  enable: boolean;
  crons: {
    cron: string;
    description?: string;
    serviceName?: string;
    method?: string;
    context?: string;
    args?: any[];
    cb?: () => void;
  }[] = [];
  crontabSchedule = schedule;
  private _scanned: boolean = false;

  /**
   * Legacy decorator factory for annotating a method with a cron schedule
   * @param cron - the cron expression
   * @param description - the description
   * @param args - additional arguments
   * @returns the result
   */
  static Annotation(cron: string, description: string = "", ...args): MethodDecorator {
    return (_target: any, property: string | symbol, descriptor: PropertyDescriptor) => {
      descriptor.value.cron = descriptor.value.cron || [];
      descriptor.value.cron.push(new CronDefinition(cron, args, "", <string>property, description));
    };
  }

  /**
   * Generate a short hash-based identifier for a cron definition
   * @param cron - the cron expression
   * @param name - the name to use
   * @returns the result
   */
  static getCronId(cron: CronDefinition, name: string = "") {
    const hash = createHash("sha256");
    return hash
      .update(JSON.stringify(cron) + name)
      .digest("hex")
      .substring(0, 8);
  }

  /**
   * Collect all @Cron-annotated methods from the provided services
   * @param services - the services
   * @returns the list of results
   */
  static loadAnnotations(services): CronDefinition[] {
    const cronsResult: CronDefinition[] = [];
    for (const i in services) {
      if (services[i]?.[CronSymbol]) {
        services[i]?.[CronSymbol].forEach((cron: CronDefinition) => {
          cron.serviceName = i;
          cronsResult.push(cron);
        });
      }
    }
    return cronsResult;
  }

  /** Scan all services for cron annotations and add them to the schedule (once) */
  addAnnotations() {
    if (this._scanned) {
      return;
    }
    this._scanned = true;
    this.crons.push(...CronService.loadAnnotations(useCore().getServices()));
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
    // Run schedule
    this.crons.forEach(i => {
      if (i.cb) {
        this.schedule(i.cron, i.cb);
      } else {
        this.schedule(i.cron, () => {
          useService(i.serviceName as ServiceName)[i.method](...i.args);
        });
      }
    });

    const msgs = [];
    // Display before
    this.crons.forEach(c => {
      if (c.cb) {
        msgs.push(`[NativeCode:${c.context || ""}]`);
      } else {
        msgs.push(`${c.serviceName}.${c.method}(${c.args.length ? "..." + c.args : ""})`);
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
    return new CancelablePromise();
  }

  /**
   * Register a cron expression to execute a callback, buffering if not yet enabled
   * @param cron - the cron expression
   * @param cb - the callback function
   * @param description - the description
   */
  schedule(cron: string, cb: () => any, description: string = "") {
    if (this.enable) {
      this.crontabSchedule(cron, cb);
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
 * Decorator to schedule a service method with a cron expression
 * @param cron - the cron expression
 * @param description - the description
 * @param args - additional arguments
 * @returns the result
 */
export function Cron(cron: string, description = "", ...args: any[]) {
  return function cronDecorator<T extends (this: Service, ...a: any[]) => Promise<any>>(
    value: T,
    context: ClassMethodDecoratorContext<Service, T>
  ) {
    // Store metadata on each instance when it's constructed
    context.addInitializer(function cronInitializer(this: Service) {
      (this[CronSymbol] ??= []).push(new CronDefinition(cron, args, this.name, context.name as string, description));
    });

    // You can return the same method, or wrap it if you need
    return value;
  };
}

export { CronService };
