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

export class MemoryLoggerService extends Service {
  workoutLogger: MemoryLogger;
  constructor(webda: Core, name: string, params: any) {
    super(webda, name, params);
    this.workoutLogger = new MemoryLogger(webda.getWorkerOutput(), params.includeAll, params.logLevel, params.limit);
  }
}

export class ConsoleLoggerService extends Service {
  workoutLogger: ConsoleLogger;
  constructor(webda: Core, name: string, params: any) {
    super(webda, name, params);
    this.workoutLogger = new ConsoleLogger(webda.getWorkerOutput(), params.logLevel, params.format);
  }
}

export class FileLoggerService extends Service {
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
