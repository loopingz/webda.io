import { MemoryLogger } from "@webda/workout";
import { MemoryLoggerServiceParameters } from "./params.js";
import { LoggerService } from "./logger.js";
/**
 * Store logs within memory
 *
 * Useful for test and other last logs
 * @WebdaModda Webda/MemoryLogger
 */
export declare class MemoryLoggerService<T extends MemoryLoggerServiceParameters = MemoryLoggerServiceParameters> extends LoggerService<T> {
    workoutLogger: MemoryLogger;
    resolve(): this;
}
//# sourceMappingURL=memory.d.ts.map