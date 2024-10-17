import { MemoryLogger } from "@webda/workout";
import { useWorkerOutput } from "./ilogger";
import { MemoryLoggerServiceParameters } from "./params";
import { LoggerService } from "./logger";

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

  /**
   * @inheritdoc
   */
  loadParameters(params: any) {
    return <T>new MemoryLoggerServiceParameters().load(params);
  }
}
