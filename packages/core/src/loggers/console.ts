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

/** Logger service that outputs to the console via @webda/workout ConsoleLogger */
export class ConsoleLoggerService<
  T extends ConsoleLoggerServiceParameters = ConsoleLoggerServiceParameters
> extends LoggerService<T> {
  workoutLogger: ConsoleLogger;
  /**
   * Resolve dependencies and create the underlying ConsoleLogger
   * @returns the result
   */
  resolve() {
    this.workoutLogger = new ConsoleLogger(useWorkerOutput(), this.parameters.logLevel, this.parameters.format);
    return super.resolve();
  }

  /**
   * @inheritdoc
   */
  loadParameters(params: any): T {
    return <T>new ConsoleLoggerServiceParameters().load(params);
  }
}
