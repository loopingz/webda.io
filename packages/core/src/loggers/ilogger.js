import { WorkerOutput } from "@webda/workout";
let workerOutput;
/**
 * Get the worker output
 * @returns
 */
export function useWorkerOutput() {
    workerOutput ?? (workerOutput = new WorkerOutput());
    return workerOutput;
}
/**
 * Set the worker output
 * @param output
 */
export function setWorkerOutput(output) {
    workerOutput = output;
}
/**
 * Logger default implementation
 */
export class Logger {
    set output(output) {
        this._output = output;
    }
    get output() {
        return this._output || useWorkerOutput();
    }
    constructor(output, context = {}) {
        this.context = {};
        this.output = output || useWorkerOutput();
        this.context = context;
    }
    log(level, ...args) {
        this.logWithContext(level, this.context, ...args);
    }
    logWithContext(level, context, ...args) {
        if (!context.class) {
            context.class = this.context.class;
        }
        this.output?.logWithContext(level, { ...this.context, ...context }, ...args);
    }
    logGroupOpen(name) {
        this.output.openGroup(name);
    }
    logGroupClose() {
        this.output.closeGroup();
    }
    logProgressStart(uid, total, title = undefined) {
        this.output.startProgress(uid, total, title);
    }
    logProgressIncrement(inc = 1, uid = undefined) {
        this.output.incrementProgress(inc, uid);
    }
    logProgressUpdate(current, uid = undefined, title = undefined) {
        this.output.updateProgress(current, uid, title);
    }
    logTitle(title) {
        this.output.setTitle(title);
    }
}
//# sourceMappingURL=ilogger.js.map