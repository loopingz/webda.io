import { createHash } from "crypto";
import { schedule } from "node-cron";
import { CancelablePromise } from "../index";
import { Service } from "./service";

/**
 * Cron item
 */
export class CronDefinition {
  /**
   * Cron definition
   * * * * 0 3
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
   * @param cron
   * @param args
   * @param serviceName
   * @param method
   * @param description
   */
  constructor(
    cron: string,
    args: any[] = [],
    serviceName: string = "",
    method: string = "",
    description: string = ""
  ) {
    this.cron = cron;
    this.serviceName = serviceName;
    this.method = method;
    this.description = description;
    this.args = args;
  }

  toString() {
    return `${this.cron}: ${this.serviceName}.${this.method}(${this.args
      .map((a) => a.toString())
      .join(",")})${this.description !== "" ? ` # ${this.description}` : ""}`;
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

  static Annotation(cron: string, description: string = "", ...args) {
    return (_target: any, property: string, descriptor: PropertyDescriptor) => {
      descriptor.value.cron = descriptor.value.cron || [];
      descriptor.value.cron.push(
        new CronDefinition(cron, args, "", property, description)
      );
    };
  }

  static getCronId(cron: CronDefinition, name: string = "") {
    let hash = createHash("sha256");
    return hash
      .update(JSON.stringify(cron) + name)
      .digest("hex")
      .substring(0, 8);
  }

  static loadAnnotations(services): CronDefinition[] {
    let cronsResult: CronDefinition[] = [];
    for (let i in services) {
      let props = Object.getOwnPropertyDescriptors(
        services[i].constructor.prototype
      );
      for (let method in props) {
        // @ts-ignore
        let crons: CronDefinition[] = props[method].value?.cron;
        if (crons) {
          crons.forEach((cron) => {
            cron.method = method;
            cron.serviceName = i;
            cronsResult.push(cron);
          });
        }
      }
    }
    return cronsResult;
  }

  addAnnotations() {
    if (this._scanned) {
      return;
    }
    this._scanned = true;
    this.crons.push(...CronService.loadAnnotations(this._webda.getServices()));
  }

  getCrontab() {
    // Load all annotations
    this.addAnnotations();
    return this.crons;
  }

  work(annotations: string = "true"): CancelablePromise {
    return this.run(annotations === "true");
  }

  run(annotations: boolean = true): CancelablePromise {
    this.log(
      "INFO",
      "Running crontab with" + (annotations ? "" : "out"),
      "annotations"
    );
    // Load all annotations
    if (annotations) {
      this.addAnnotations();
    }
    this.enable = true;
    // Run schedule
    this.crons.forEach((i) => {
      if (i.cb) {
        this.schedule(i.cron, i.cb);
      } else {
        this.schedule(i.cron, () => {
          this.getService(i.serviceName)[i.method](...i.args);
        });
      }
    });

    let msgs = [];
    // Display before
    this.crons.forEach((c) => {
      if (c.cb) {
        msgs.push(`[NativeCode:${c.context || ""}]`);
      } else {
        msgs.push(
          `${c.serviceName}.${c.method}(${c.args.length ? "..." + c.args : ""})`
        );
      }
    });
    let cronPad = Math.max(...this.crons.map((c) => c.cron.length));
    let servicePad = Math.max(...msgs.map((c) => c.length));
    this.crons.forEach((c, i) => {
      this.log(
        "INFO",
        `${c.cron.padEnd(cronPad)} : ${msgs[i].padEnd(servicePad)}${
          c.description ? "  # " + c.description : ""
        }`
      );
    });
    // Remove from memory
    this.crons = [];
    return new CancelablePromise();
  }

  schedule(cron: string, cb: () => any, description: string = "") {
    if (this.enable) {
      this.crontabSchedule(cron, cb);
    } else {
      let context;
      try {
        throw new Error();
      } catch (err) {
        // Based on stack trace (not super clean)
        let info = err.stack.split("\n")[2].match(/\((.*)\)/);
        context = info[1].replace(process.cwd() + "/", "");
      }
      this.crons.push({ cron, cb, description, context });
    }
  }
}

const Cron = CronService.Annotation;

export { Cron, CronService };
