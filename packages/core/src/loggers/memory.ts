import { MemoryLogger } from "@webda/workout";
import { useWorkerOutput } from "./ilogger.js";
import { MemoryLoggerServiceParameters } from "./params.js";
import { LoggerService } from "./logger.js";

/**
 * Store logs within memory
 *
 * Useful for test and other last logs
 * @WebdaModda Webda/MemoryLogger
 */
export class MemoryLoggerService<
  T extends MemoryLoggerServiceParameters = MemoryLoggerServiceParameters
> extends LoggerService<T> {
  workoutLogger: MemoryLogger;

  resolve() {
    this.workoutLogger = new MemoryLogger(useWorkerOutput(), this.parameters.logLevel, this.parameters.limit);
    return super.resolve();
  }
}
