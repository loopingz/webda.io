import { FileLogger } from "@webda/workout";
import { FileLoggerServiceParameters } from "./params";
import { LoggerService } from "./logger";
import { useWorkerOutput } from "./ilogger";

/**
 * Save logs into a file
 *
 * Can define rotation etc
 *
 * @see `@webda/workout FileLogger`
 * @WebdaModda FileLogger
 */
export class FileLoggerService<
  T extends FileLoggerServiceParameters = FileLoggerServiceParameters
> extends LoggerService<T> {
  workoutLogger: FileLogger;
  /**
   *
   * @returns
   */
  resolve() {
    if (this.parameters.file === undefined) {
      throw new Error("You must specify a file to log into");
    }
    this.workoutLogger = new FileLogger(
      useWorkerOutput(),
      this.parameters.logLevel,
      this.parameters.file,
      this.parameters.sizeLimit,
      this.parameters.format
    );
    return super.resolve();
  }

  /**
   * @inheritdoc
   */
  loadParameters(params: any) {
    return <T>new FileLoggerServiceParameters().load(params);
  }
}
