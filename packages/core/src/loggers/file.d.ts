import { FileLogger } from "@webda/workout";
import { FileLoggerServiceParameters } from "./params.js";
import { LoggerService } from "./logger.js";
import { ServicePartialParameters } from "../services/iservice.js";
/**
 * Save logs into a file
 *
 * Can define rotation etc
 *
 * @see `@webda/workout FileLogger`
 * @WebdaModda FileLogger
 */
export declare class FileLoggerService<T extends FileLoggerServiceParameters = FileLoggerServiceParameters> extends LoggerService<T> {
    workoutLogger: FileLogger;
    /**
     *
     * @returns
     */
    resolve(): this;
    /**
     * @inheritdoc
     */
    loadParameters(params: ServicePartialParameters<T>): T;
}
//# sourceMappingURL=file.d.ts.map