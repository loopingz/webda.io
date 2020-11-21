import { Service } from "../services/service";
import {
  Logger as WorkoutLogger,
  WorkerOutput,
  WorkerLogLevel,
  MemoryLogger,
  ConsoleLogger,
  FileLogger
} from "@webda/workout";
import { Core } from "../core";

/**
 * LoggerService is useful for inheritance
 */
export class LoggerService extends Service {};

/**
 * MemoryLoggerService expose MemoryLogger from @webda/workout
 */
export class MemoryLoggerService extends LoggerService {
  workoutLogger: MemoryLogger;
  constructor(webda: Core, name: string, params: any) {
    super(webda, name, params);
    this.workoutLogger = new MemoryLogger(webda.getWorkerOutput(), params.logLevel, params.limit);
  }
}


/**
 * ConsoleLoggerService expose ConsoleLogger from @webda/workout
 */
export class ConsoleLoggerService extends LoggerService {
  workoutLogger: ConsoleLogger;
  constructor(webda: Core, name: string, params: any) {
    super(webda, name, params);
    this.workoutLogger = new ConsoleLogger(webda.getWorkerOutput(), params.logLevel, params.format);
  }
}


/**
 * FileLoggerService expose FileLogger from `@webda/workout`
 */
export class FileLoggerService extends LoggerService {
  workoutLogger: ConsoleLogger;
  constructor(webda: Core, name: string, params: any) {
    super(webda, name, params);
    this.workoutLogger = new FileLogger(
      webda.getWorkerOutput(),
      params.logLevel,
      params.file,
      params.sizeLimit,
      params.format
    );
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
