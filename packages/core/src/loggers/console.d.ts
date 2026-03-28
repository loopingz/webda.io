/**
 * Log to the console
 *
 * Send logs to stdout
 *
 * @see @webda/workout.ConsoleLogger
 * @WebdaModda ConsoleLogger
 */
import { ConsoleLogger } from "@webda/workout";
import { LoggerService } from "./logger.js";
import { ConsoleLoggerServiceParameters } from "./params.js";
export declare class ConsoleLoggerService<T extends ConsoleLoggerServiceParameters = ConsoleLoggerServiceParameters> extends LoggerService<T> {
    workoutLogger: ConsoleLogger;
    resolve(): this;
    /**
     * @inheritdoc
     */
    loadParameters(params: any): T;
}
//# sourceMappingURL=console.d.ts.map