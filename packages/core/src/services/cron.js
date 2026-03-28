import { createHash } from "crypto";
import { schedule } from "node-cron";
import { Service } from "./service.js";
import { CancelablePromise } from "@webda/utils";
import { useCore, useService } from "../core/hooks.js";
export const CronSymbol = Symbol("WebdaCron");
/**
 * Cron item
 */
export class CronDefinition {
    /**
     *
     * @param cron
     * @param args
     * @param serviceName
     * @param method
     * @param description
     */
    constructor(cron, args = [], serviceName = "", method = "", description = "") {
        this.cron = cron;
        this.serviceName = serviceName;
        this.method = method;
        this.description = description;
        this.args = args;
    }
    toString() {
        return `${this.cron}: ${this.serviceName}.${this.method}(${this.args.map(a => a.toString()).join(",")})${this.description !== "" ? ` # ${this.description}` : ""}`;
    }
}
/**
 * @WebdaModda
 */
class CronService extends Service {
    constructor() {
        super(...arguments);
        this.crons = [];
        this.crontabSchedule = schedule;
        this._scanned = false;
    }
    static Annotation(cron, description = "", ...args) {
        return (_target, property, descriptor) => {
            descriptor.value.cron = descriptor.value.cron || [];
            descriptor.value.cron.push(new CronDefinition(cron, args, "", property, description));
        };
    }
    static getCronId(cron, name = "") {
        const hash = createHash("sha256");
        return hash
            .update(JSON.stringify(cron) + name)
            .digest("hex")
            .substring(0, 8);
    }
    static loadAnnotations(services) {
        const cronsResult = [];
        for (const i in services) {
            if (services[i]?.[CronSymbol]) {
                services[i]?.[CronSymbol].forEach((cron) => {
                    cron.serviceName = i;
                    cronsResult.push(cron);
                });
            }
        }
        return cronsResult;
    }
    addAnnotations() {
        if (this._scanned) {
            return;
        }
        this._scanned = true;
        this.crons.push(...CronService.loadAnnotations(useCore().getServices()));
    }
    getCrontab() {
        // Load all annotations
        this.addAnnotations();
        return this.crons;
    }
    work(annotations = "true") {
        return this.run(annotations === "true");
    }
    run(annotations = true) {
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
            }
            else {
                this.schedule(i.cron, () => {
                    useService(i.serviceName)[i.method](...i.args);
                });
            }
        });
        const msgs = [];
        // Display before
        this.crons.forEach(c => {
            if (c.cb) {
                msgs.push(`[NativeCode:${c.context || ""}]`);
            }
            else {
                msgs.push(`${c.serviceName}.${c.method}(${c.args.length ? "..." + c.args : ""})`);
            }
        });
        const cronPad = Math.max(...this.crons.map(c => c.cron.length));
        const servicePad = Math.max(...msgs.map(c => c.length));
        this.crons.forEach((c, i) => {
            this.log("INFO", `${c.cron.padEnd(cronPad)} : ${msgs[i].padEnd(servicePad)}${c.description ? "  # " + c.description : ""}`);
        });
        // Remove from memory
        this.crons = [];
        return new CancelablePromise();
    }
    schedule(cron, cb, description = "") {
        if (this.enable) {
            this.crontabSchedule(cron, cb);
        }
        else {
            let context;
            try {
                throw new Error();
            }
            catch (err) {
                // Based on stack trace (not super clean)
                const info = err.stack.split("\n")[2].match(/\((.*)\)/);
                context = info[1].replace(process.cwd() + "/", "");
            }
            this.crons.push({ cron, cb, description, context });
        }
    }
}
export function Cron(cron, description = "", ...args) {
    return function (value, context) {
        // Store metadata on each instance when it's constructed
        context.addInitializer(function () {
            (this[CronSymbol] ?? (this[CronSymbol] = [])).push(new CronDefinition(cron, args, this.name, context.name, description));
        });
        // You can return the same method, or wrap it if you need
        return value;
    };
}
export { CronService };
//# sourceMappingURL=cron.js.map