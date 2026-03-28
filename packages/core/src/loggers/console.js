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
import { useWorkerOutput } from "./ilogger.js";
export class ConsoleLoggerService extends LoggerService {
    resolve() {
        this.workoutLogger = new ConsoleLogger(useWorkerOutput(), this.parameters.logLevel, this.parameters.format);
        return super.resolve();
    }
    /**
     * @inheritdoc
     */
    loadParameters(params) {
        return new ConsoleLoggerServiceParameters().load(params);
    }
}
//# sourceMappingURL=console.js.map