import { WorkerLogLevel, WorkerOutput, Logger as WorkoutLogger } from "@webda/workout";
/**
 * Get the worker output
 * @returns
 */
export declare function useWorkerOutput(): WorkerOutput;
/**
 * Set the worker output
 * @param output
 */
export declare function setWorkerOutput(output: WorkerOutput): void;
/**
 * Logger default implementation
 */
export declare class Logger implements WorkoutLogger {
    context: any;
    private _output;
    set output(output: WorkerOutput);
    get output(): WorkerOutput;
    constructor(output: WorkerOutput, context?: any);
    log(level: WorkerLogLevel, ...args: any[]): void;
    logWithContext(level: WorkerLogLevel, context: any, ...args: any[]): void;
    logGroupOpen(name: string): void;
    logGroupClose(): void;
    logProgressStart(uid: string, total: number, title?: string): void;
    logProgressIncrement(inc?: number, uid?: string): void;
    logProgressUpdate(current: number, uid?: string, title?: string): void;
    logTitle(title: string): void;
}
//# sourceMappingURL=ilogger.d.ts.map