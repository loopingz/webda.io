import { WorkerLogLevel } from "@webda/workout";
import { ServiceParameters } from "../services/serviceparameters.js";
export declare class LoggerServiceParameters extends ServiceParameters {
    /**
     * Specify the log level of this service
     */
    logLevel: WorkerLogLevel;
    /**
     * Add file and line number of the log producer (if possible)
     */
    addLogProducerLine?: boolean;
    /**
     * @inheritdoc
     */
    load(params?: any): this;
}
export declare class MemoryLoggerServiceParameters extends LoggerServiceParameters {
    /**
     * Max size of the logs in memory
     */
    limit?: number;
}
export declare class ConsoleLoggerServiceParameters extends LoggerServiceParameters {
    /**
     * Format of the logs
     */
    format?: string;
}
export declare class FileLoggerServiceParameters extends LoggerServiceParameters {
    /**
     * Format of the logs
     */
    format?: string;
    /**
     * File to log into
     */
    file: string;
    /**
     * Limit of the file
     */
    sizeLimit?: number;
}
//# sourceMappingURL=params.d.ts.map