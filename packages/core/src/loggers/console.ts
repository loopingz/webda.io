/**
 * Log to the console
 *
 * Send logs to stdout
 *
 * @see @webda/workout.ConsoleLogger
 * @WebdaModda ConsoleLogger
 */

import { ConsoleLogger } from "@webda/workout";
import { LoggerService } from "./logger";
import { ConsoleLoggerServiceParameters } from "./params";
import { useWorkerOutput } from "./ilogger";

export class ConsoleLoggerService<
  T extends ConsoleLoggerServiceParameters = ConsoleLoggerServiceParameters
> extends LoggerService<T> {
  workoutLogger: ConsoleLogger;
  resolve() {
    this.workoutLogger = new ConsoleLogger(useWorkerOutput(), this.parameters.logLevel, this.parameters.format);
    return super.resolve();
  }

  /**
   * @inheritdoc
   */
  loadParameters(params: any) {
    return new ConsoleLoggerServiceParameters(params);
  }
}
