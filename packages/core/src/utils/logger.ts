import {
  ConsoleLogger,
  FileLogger,
  Logger as WorkoutLogger,
  MemoryLogger,
  WorkerLogLevel,
  WorkerOutput
} from "@webda/workout";
import { Core } from "../core";
import { Service, ServiceParameters } from "../services/service";

export class LoggerServiceParameters extends ServiceParameters {
  /**
   * Specify the log level of this service
   */
  logLevel: WorkerLogLevel;

  /**
   * @inheritdoc
   */
  constructor(params: any) {
    super(params);
    // Use the environment variable or fallback to INFO
    this.logLevel ??= <any>process.env["LOG_LEVEL"] || "INFO";
  }
}

/**
 * LoggerService is useful for inheritance
 */
export class LoggerService<T extends LoggerServiceParameters = LoggerServiceParameters> extends Service<T> {}

export class MemoryLoggerServiceParameters extends LoggerServiceParameters {
  limit?: number;
}
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
  constructor(webda: Core, name: string, params: any) {
    super(webda, name, params);
    this.workoutLogger = new MemoryLogger(webda.getWorkerOutput(), this.parameters.logLevel, this.parameters.limit);
  }

  /**
   * @inheritdoc
   */
  loadParameters(params: any) {
    return new MemoryLoggerServiceParameters(params);
  }
}

export class ConsoleLoggerServiceParameters extends LoggerServiceParameters {
  format?: string;
}
/**
 * Log to the console
 *
 * Send logs to stdout
 *
 * @see @webda/workout.ConsoleLogger
 * @WebdaModda ConsoleLogger
 */

export class ConsoleLoggerService<
  T extends ConsoleLoggerServiceParameters = ConsoleLoggerServiceParameters
> extends LoggerService<T> {
  workoutLogger: ConsoleLogger;
  constructor(webda: Core, name: string, params: any) {
    super(webda, name, params);
    this.workoutLogger = new ConsoleLogger(webda.getWorkerOutput(), this.parameters.logLevel, this.parameters.format);
  }

  /**
   * @inheritdoc
   */
  loadParameters(params: any) {
    return new ConsoleLoggerServiceParameters(params);
  }
}

export class FileLoggerServiceParameters extends LoggerServiceParameters {
  format?: string;
  file: string;
  sizeLimit?: number;
}
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
  workoutLogger: ConsoleLogger;
  constructor(webda: Core, name: string, params: any) {
    super(webda, name, params);
    this.workoutLogger = new FileLogger(
      webda.getWorkerOutput(),
      this.parameters.logLevel,
      this.parameters.file,
      this.parameters.sizeLimit,
      this.parameters.format
    );
  }

  /**
   * @inheritdoc
   */
  loadParameters(params: any) {
    return new FileLoggerServiceParameters(params);
  }
}

/**
 *
 */
export class Logger implements WorkoutLogger {
  output: WorkerOutput;
  clazz: string;

  constructor(output: WorkerOutput, clazz: string) {
    this.output = output;
    this.clazz = clazz;
  }

  log(level: WorkerLogLevel, ...args) {
    this.logWithContext(level, { class: this.clazz }, ...args);
  }

  logWithContext(level: WorkerLogLevel, context: any, ...args) {
    if (!context.class) {
      context.class = this.clazz;
    }
    this.output.logWithContext(level, context, ...args);
  }

  logGroupOpen(name: string) {
    this.output.openGroup(name);
  }

  logGroupClose() {
    this.output.closeGroup();
  }

  logProgressStart(uid: string, total: number, title: string = undefined) {
    this.output.startProgress(uid, total, title);
  }

  logProgressIncrement(inc: number = 1, uid: string = undefined) {
    this.output.incrementProgress(inc, uid);
  }
  logProgressUpdate(current: number, uid: string = undefined, title: string = undefined) {
    this.output.updateProgress(current, uid, title);
  }

  logTitle(title: string) {
    this.output.setTitle(title);
  }
}
