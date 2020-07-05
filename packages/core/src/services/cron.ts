import { Service, Bean, Cache } from "..";
import * as crontab from "node-cron";

@Bean
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
  private _scanned: boolean = false;

  static Annotation(cron: string, description: string = "", ...args) {
    return (target: any, property: string, descriptor: PropertyDescriptor) => {
      descriptor.value.cron = descriptor.value.cron || [];
      descriptor.value.cron.push({
        cron,
        description,
        args
      });
    };
  }

  @Cache()
  static loadAnnotations(services) {
    let cronsResult = [];
    for (let i in services) {
      let props = Object.getOwnPropertyDescriptors(services[i].constructor.prototype);
      for (let method in props) {
        // @ts-ignore
        let crons = props[method].value.cron;
        if (crons) {
          crons.forEach(cron => {
            cronsResult.push({ ...cron, method, serviceName: i });
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

  async work(annotations: string = "true") {
    await this.run(annotations === "true");
  }

  async run(annotations: boolean = true) {
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
          this.getService(i.serviceName)[i.method](...i.args);
        });
      }
    });

    let msgs = [];
    // Display before
    this.crons.forEach(c => {
      if (c.cb) {
        msgs.push(`[NativeCode:${c.context || ""}]`);
      } else {
        msgs.push(`${c.serviceName}.${c.method}(${c.args.length ? "..." + c.args : ""})`);
      }
    });
    let cronPad = Math.max(...this.crons.map(c => c.cron.length));
    let servicePad = Math.max(...msgs.map(c => c.length));
    this.crons.forEach((c, i) => {
      this.log(
        "INFO",
        `${c.cron.padEnd(cronPad)} : ${msgs[i].padEnd(servicePad)}${c.description ? "  # " + c.description : ""}`
      );
    });
    // Remove from memory
    this.crons = [];
    // Never ending promise
    return new Promise(resolve => {});
  }

  schedule(cron: string, cb: () => any, description: string = "") {
    if (this.enable) {
      crontab.schedule(cron, cb);
    } else {
      let context;
      try {
        throw new Error();
      } catch (err) {
        // Based on stack trace (not super clean)
        let info = err.stack.split("\n")[2].match(/\((.*)\)/);
        if (info) {
          context = info[1].replace(process.cwd() + "/", "");
        }
      }
      this.crons.push({ cron, cb, description, context });
    }
  }
}

const Cron = CronService.Annotation;

export { Cron, CronService };
