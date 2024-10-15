import { EventEmitter } from "events";
import { format } from "util";
import { randomUUID } from "crypto";

export interface Logger {
  log: (level: WorkerLogLevel, ...args: any[]) => void;
  logGroupOpen: (name: string) => void;
  logGroupClose: () => void;
  logProgressStart: (uid: string, total: number, title: string) => void;
  logProgressIncrement: (inc: number, uid: string) => void;
  logProgressUpdate: (current: number, uid: string, title: string) => void;
}

let moduleOutput;

/**
 * Return or set the WorkerOutput
 * @param output
 * @returns
 */
export function useWorkerOutput(output?: WorkerOutput) {
  if (output) {
    moduleOutput = output;
  }
  moduleOutput ??= new WorkerOutput();
  return moduleOutput;
}

/**
 * Log a message
 * @returns
 */
export function useLog(...args: Parameters<Logger["log"]>) {
  moduleOutput ??= new WorkerOutput();
  return moduleOutput.log(...args);
}

/**
 * Represents a progress indicator
 */
export class WorkerProgress {
  title: string;
  groups: string[] = [];
  uid: string;
  total: number;
  current: number = 0;
  running: boolean = true;

  constructor(uid: string, total: number, groups: string[], title?: string) {
    this.uid = uid;
    this.total = total;
    this.groups = [...groups];
    this.title = title || uid;
  }

  getRatio(): number {
    return this.current / this.total;
  }

  incrementProgress(inc: number) {
    this.updateProgress(this.current + inc);
  }

  updateProgress(current: number) {
    this.current = current;
    if (this.current >= this.total) {
      this.current = this.total;
      this.running = false;
    }
  }
}

export function LogFilter(logLineLevel: WorkerLogLevel, loggerLevel: WorkerLogLevel): boolean {
  return WorkerLogLevelEnum[logLineLevel] <= WorkerLogLevelEnum[loggerLevel];
}

export enum WorkerInputType {
  STRING,
  PASSWORD,
  CONFIRMATION,
  LIST
}
/**
 * Represents a Input request
 */
export class WorkerInput {
  title: string;
  validators: RegExp[];
  type: WorkerInputType;
  uuid: string;
  value?: string;

  constructor(
    uuid: string,
    title: string,
    type: WorkerInputType = WorkerInputType.STRING,
    validators: (string | RegExp)[] = []
  ) {
    this.uuid = uuid;
    this.title = title;
    this.validators = validators.map(v => {
      if (typeof v !== "string") {
        return v;
      }
      if (!v.endsWith("$")) {
        v += "$";
      }
      if (!v.startsWith("^")) {
        v = "^" + v;
      }
      return new RegExp(v);
    });
    this.type = type;
  }

  validate(input: string): boolean {
    if (!this.validators.length) {
      return true;
    }
    for (const i in this.validators) {
      if (this.validators[i].exec(input)) {
        return true;
      }
    }
    return false;
  }
}

class WorkerInputEmitter extends WorkerInput {
  promise?: Promise<string>;
  resolve?: (value?: string) => void;
  timeout?: NodeJS.Timeout;

  toMessage() {
    return new WorkerInput(this.uuid, this.title, this.type, this.validators);
  }
}

/**
 * LogLevel as ENUM to compare with integer values
 */
export enum WorkerLogLevelEnum {
  ERROR,
  WARN,
  INFO,
  DEBUG,
  TRACE
}

/**
 * LogLevel as intersection to compare with integer values
 */
export type WorkerLogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE";

/**
 * Represents a Log line
 */
export class WorkerLog {
  level: WorkerLogLevel;
  args: any[];
  constructor(level: WorkerLogLevel, ...args: any[]) {
    this.level = level;
    this.args = args;
  }
}

/**
 * Different types of message emitted by WorkerOutput
 */
export type WorkerMessageType =
  | "progress.start"
  | "progress.stop"
  | "progress.update"
  | "group.open"
  | "group.close"
  | "log"
  | "input.request"
  | "input.received"
  | "input.timeout"
  | "title.set";

/*
 * This function dumps long stack traces for exceptions having a cause()
 * method. The error classes from
 * [verror](https://github.com/davepacheco/node-verror) and
 * [restify v2.0](https://github.com/mcavage/node-restify) are examples.
 *
 * Based on `dumpException` in
 * https://github.com/davepacheco/node-extsprintf/blob/master/lib/extsprintf.js
 */
function getFullErrorStack(ex) {
  let ret = ex.stack || ex.toString();
  if (ex.cause && typeof ex.cause === "function") {
    const cex = ex.cause();
    if (cex) {
      ret += "\nCaused by: " + getFullErrorStack(cex);
    }
  }
  return ret;
}

/**
 * Represents a message emitted by WorkerOutput
 */
export class WorkerMessage {
  groups: string[];
  type: WorkerMessageType;
  progresses: { [key: string]: WorkerProgress } = {};
  currentProgress?: string;
  log?: WorkerLog;
  timestamp: number;
  [key: string]: any;
  input?: WorkerInput;

  constructor(type: WorkerMessageType, workout: WorkerOutput, infos: any = {}) {
    this.type = type;
    if (workout) {
      this.groups = workout.groups;
      this.progresses = workout.progresses;
      this.currentProgress = workout.currentProgress;
      this.timestamp = Date.now();
    }
    Object.assign(this, infos);
  }
}

/**
 * This class allow you to abstract the output for your program
 *
 * You can sned output, ask for input and depending if you are in terminal
 * It will show progress in the terminal, or send it via WebSockets or store it in a DB or in a logfile
 */
export class WorkerOutput extends EventEmitter {
  title?: string;
  groups: string[] = [];
  progresses: { [key: string]: WorkerProgress } = {};
  progressesStack: string[] = [];
  currentProgress?: string;
  interactive: boolean = false;
  inputs: { [key: string]: WorkerInputEmitter } = {};

  /**
   * Send an event with default informations
   *
   * @param event
   * @param infos
   */
  protected emitMessage(event: WorkerMessageType, infos: any = {}): void {
    this.emit("message", new WorkerMessage(event, this, infos));
  }

  /**
   * Set the output title
   *
   * @param title to set
   */
  setTitle(title: string): void {
    this.emitMessage("title.set", { title });
  }

  /**
   * Start a new progress indicator
   *
   * @param uid
   * @param total
   * @param title
   */
  startProgress(uid: string, total: number, title?: string): void {
    this.currentProgress = uid;
    this.progressesStack.push(uid);
    this.progresses[uid] = new WorkerProgress(uid, total, this.groups, title);
    this.emitMessage("progress.start", { progress: uid });
  }

  /**
   * Increment to add to progress
   *
   * @param inc
   * @param uid
   */
  incrementProgress(inc: number = 1, uid: string = this.currentProgress, title?: string): void {
    if (!this.progresses[uid]) {
      throw new Error("Unknown progress");
    }
    this.updateProgress(this.progresses[uid].current + inc, uid, title);
  }

  /**
   * Update a progress indicator
   *
   * @param current value
   * @param uid id of the progress or default one
   * @param title update title as well
   */
  updateProgress(current: number, uid: string = this.currentProgress, title?: string): void {
    if (!this.progresses[uid]) {
      throw new Error("Unknown progress");
    }
    this.progresses[uid].title = title || this.progresses[uid].title;
    this.progresses[uid].updateProgress(current);
    if (this.progresses[uid].running) {
      this.emitMessage("progress.update", { progress: uid });
    } else {
      delete this.progresses[uid];
      this.progressesStack.splice(this.progressesStack.indexOf(uid), 1);
      if (uid === this.currentProgress) {
        this.currentProgress = this.progressesStack[this.progressesStack.length - 1];
      }
      this.emitMessage("progress.stop", { progress: uid });
    }
  }

  /**
   * Create a new group of output
   * Groups will stack
   *
   * @param name of group
   */
  openGroup(name: string = ""): void {
    this.groups.push(name);
    this.emitMessage("group.open", { group: name });
  }

  /**
   * Close a group of output
   */
  closeGroup(): void {
    if (this.groups.length === 0) {
      return;
    }
    const name = this.groups.pop();
    this.emitMessage("group.close", { group: name });
  }

  /**
   * Log something
   *
   * @param level of log to use with filtering
   * @param args anything you want to log
   */
  log(level: WorkerLogLevel, ...args: any[]): void {
    this.logWithContext(level, undefined, ...args);
  }

  /**
   *
   * @returns
   */
  getBunyanLogger() {
    const bunyanFormatter = (level: WorkerLogLevel, ...args) => {
      if (args.length === 0) {
        // We cannot know which level is enabled
        return true;
      }
      let fields: any = {};
      if (args[0] instanceof Error) {
        // We do not handle fields for now
        fields.err = args.shift();
      } else if (typeof args[0] !== "string" && typeof args[0] !== "number") {
        // We do not handle fields for now
        fields = args.shift();
      }
      if (fields.err) {
        fields.err = {
          message: fields.err.message,
          name: fields.err.name,
          stack: getFullErrorStack(fields.err),
          code: fields.err.code,
          signal: fields.err.signal
        };
      }
      this.logWithContext(level, fields, format(args.shift() || "", ...args));
    };
    return {
      info: (...args: any[]): void | boolean => {
        return bunyanFormatter("INFO", ...args);
      },
      trace: (...args: any[]): void | boolean => {
        return bunyanFormatter("TRACE", ...args);
      },
      warn: (...args: any[]): void | boolean => {
        return bunyanFormatter("WARN", ...args);
      },
      debug: (...args: any[]): void | boolean => {
        return bunyanFormatter("DEBUG", ...args);
      },
      error: (...args: any[]): void | boolean => {
        return bunyanFormatter("ERROR", ...args);
      },
      fatal: (...args: any[]): void | boolean => {
        // Reroute fatal to error as we do not have FATAL
        return bunyanFormatter("ERROR", ...args);
      }
    };
  }

  /**
   *
   * @param interactive
   */
  logWithContext(level: WorkerLogLevel, context: any, ...args: any[]): void {
    this.emitMessage("log", { context, log: new WorkerLog(level, ...args) });
  }

  /**
   * Indicate that some listeners allow input
   *
   * @param interactive
   */
  setInteractive(interactive: boolean): void {
    this.interactive = interactive;
  }

  /**
   * Request a user input
   *
   * @param title of the input
   * @param regexp to validate the input
   * @param waitFor call waitFor method
   * @param timeout before giving up on input
   *
   * Return the input request uuid if no waitFor or the input value
   * Reject with "Request input timmeout" if timeout
   */
  async requestInput(
    title: string,
    type: WorkerInputType = WorkerInputType.STRING,
    regexp: (string | RegExp)[] = [/.*/],
    waitFor: boolean = true,
    timeout: number = 0
  ): Promise<string> {
    if (!this.interactive) {
      throw new Error("No interactive session registered");
    }
    const uuid = randomUUID();
    this.inputs[uuid] = new WorkerInputEmitter(uuid, title, type, regexp);
    this.inputs[uuid].promise = new Promise<string>((resolve, reject) => {
      this.inputs[uuid].resolve = resolve;
      if (timeout > 0) {
        this.inputs[uuid].timeout = setTimeout(() => {
          this.emitMessage("input.timeout", { input: this.inputs[uuid].toMessage() });
          delete this.inputs[uuid];
          reject("Request input timeout");
        }, timeout);
      }
    });

    this.emitMessage("input.request", {
      input: this.inputs[uuid].toMessage()
    });
    if (waitFor) {
      return this.waitForInput(uuid);
    }
    return uuid;
  }

  /**
   * Wait until an answer is provided
   *
   * @param uuid of input to wait for
   */
  async waitForInput(uuid: string): Promise<string> {
    if (!this.interactive) {
      throw new Error("No interactive session registered");
    }
    if (!this.inputs[uuid]) {
      throw new Error("Unknown input");
    }
    return this.inputs[uuid].promise;
  }

  /**
   * Send the result of an input
   * To be used by the listeners
   *
   * @param uuid of input
   * @param value entered by user
   */
  returnInput(uuid: string, value: string): void {
    if (!this.inputs[uuid]) {
      throw new Error("Unknown input");
    }
    this.inputs[uuid].value = value;
    this.inputs[uuid].resolve(value);
    clearTimeout(this.inputs[uuid].timeout);
    this.emitMessage("input.received", { input: this.inputs[uuid].toMessage() });
    delete this.inputs[uuid];
  }
}
