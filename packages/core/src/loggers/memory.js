import { MemoryLogger } from "@webda/workout";
import { useWorkerOutput } from "./ilogger.js";
import { LoggerService } from "./logger.js";
/**
 * Store logs within memory
 *
 * Useful for test and other last logs
 * @WebdaModda Webda/MemoryLogger
 */
export class MemoryLoggerService extends LoggerService {
    resolve() {
        this.workoutLogger = new MemoryLogger(useWorkerOutput(), this.parameters.logLevel, this.parameters.limit);
        return super.resolve();
    }
}
//# sourceMappingURL=memory.js.map