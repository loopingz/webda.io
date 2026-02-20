import { EventEmitter } from "events";
import { format } from "util";
import { randomUUID } from "crypto";

/**
 * Common interface for objects that can receive log and progress events
 */
export interface Logger {
  /** Log a message at the given level */
  log: (level: WorkerLogLevel, ...args: any[]) => void;
  /** Open a named log group */
  logGroupOpen: (name: string) => void;
  /** Close the current log group */
  logGroupClose: () => void;
  /** Start a progress indicator with a total and title */
  logProgressStart: (uid: string, total: number, title: string) => void;
  /** Increment an active progress indicator */
  logProgressIncrement: (inc: number, uid: string) => void;
  /** Update an active progress indicator to a specific value */
  logProgressUpdate: (current: number, uid: string, title: string) => void;
}

let moduleOutput;

/**
 * Return or set the WorkerOutput
 * @param output
 * @returns
 */
export function useWorkerOutput(output?: WorkerOutput): WorkerOutput {
  if (output) {
    moduleOutput = output;
  }
  moduleOutput ??= new WorkerOutput();
  return moduleOutput;
}

/**
 * Log a message using the global WorkerOutput instance
 * @param args - Log level followed by message arguments
 * @example
 * ```typescript
 * useLog("INFO", "Application started");
 * useLog("ERROR", "Failed to connect:", error);
 * ```
 */
export function useLog(...args: Parameters<Logger["log"]>) {
  moduleOutput ??= new WorkerOutput();
  // We want to capture the caller line, so we use wrapWithStack
  moduleOutput.log(...args);
}

/**
 * Log a message with additional context information
 * @param level - The log level (ERROR, WARN, INFO, DEBUG, TRACE)
 * @param context - Context object to attach to the log. If context.addLogProducerLine is true, adds file/line/function info
 * @param args - Message arguments to log
 * @example
 * ```typescript
 * useLogWithContext("INFO", { userId: 123 }, "User logged in");
 * useLogWithContext("DEBUG", { addLogProducerLine: true }, "Debug info");
 * ```
 */
export function useLogWithContext(level: WorkerLogLevel, context: any, ...args: any[]) {
  moduleOutput ??= new WorkerOutput();
  // Add file and line if needed
  if (context.addLogProducerLine) {
    context = {...context, ...getFileAndLine()};
  }
  // We want to capture the caller line, so we use wrapWithStack
  moduleOutput.logWithContext(level, context, ...args);
}

/**
 * Represents a progress indicator
 */
export class WorkerProgress {
  /** Display title for the progress */
  title: string;
  /** Log groups this progress belongs to */
  groups: string[] = [];
  /** Unique identifier for this progress */
  uid: string;
  /**
   * Total number of units for this progress. If -1 the progress is indeterminate
   */
  total: number;
  /** Current progress value */
  current: number = 0;
  /** Whether the progress is still running */
  running: boolean = true;
  /**
   * Status once done (success, error, warning, info)
   */
  status?: string;

  /**
   * Creates a new progress indicator
   * @param uid - Unique identifier for this progress
   * @param total - Total number of units (use -1 for indeterminate)
   * @param groups - Log groups this progress belongs to
   * @param title - Display title (defaults to uid if not provided)
   */
  constructor(uid: string, total: number, groups: string[], title?: string) {
    this.uid = uid;
    this.total = total;
    this.groups = [...groups];
    this.title = title || uid;
  }

  /**
   * Get the completion ratio (current/total)
   * @returns A number between 0 and 1 representing completion percentage
   */
  getRatio(): number {
    return this.current / this.total;
  }

  /**
   * Increment the progress by a specified amount
   * @param inc - Amount to increment by
   */
  incrementProgress(inc: number) {
    this.updateProgress(this.current + inc);
  }

  /**
   * Update the progress to a specific value
   * @param current - New progress value
   */
  updateProgress(current: number) {
    this.current = current;
    if ((this.current >= this.total && this.total > 0) || this.current === this.total) {
      this.current = this.total;
      this.running = false;
    }
  }
}

/**
 * Filter log messages based on log level
 * @param logLineLevel - The log level of the message being logged
 * @param loggerLevel - The minimum log level configured for the logger
 * @returns True if the message should be logged, false otherwise
 * @example
 * ```typescript
 * LogFilter("DEBUG", "INFO") // false - DEBUG is lower priority than INFO
 * LogFilter("ERROR", "INFO") // true - ERROR is higher priority than INFO
 * ```
 */
export function LogFilter(logLineLevel: WorkerLogLevel, loggerLevel: WorkerLogLevel): boolean {
  return WorkerLogLevelEnum[logLineLevel] <= WorkerLogLevelEnum[loggerLevel];
}

/**
 * Types of interactive input prompts supported by WorkerOutput
 */
export enum WorkerInputType {
  /** Plain text input */
  STRING,
  /** Masked password input */
  PASSWORD,
  /** Yes/no confirmation prompt */
  CONFIRMATION,
  /** Selection from a predefined list */
  LIST
}
/**
 * Represents an interactive input request sent to the user
 */
export class WorkerInput {
  /** Prompt text shown to the user */
  title: string;
  /** Regular expressions used to validate the user's answer */
  validators: RegExp[];
  /** Input type controlling how the prompt is rendered */
  type: WorkerInputType;
  /** Unique identifier for this input request */
  uuid: string;
  /** Value entered by the user once the input is fulfilled */
  value?: string;

  /**
   * Create a new input request
   * @param uuid - Unique identifier for this request
   * @param title - Prompt text shown to the user
   * @param type - Input type (STRING, PASSWORD, CONFIRMATION, LIST)
   * @param validators - Optional validators as strings or RegExp instances
   */
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

  /**
   * Convert this input to a message format
   * @returns The WorkerInput instance itself
   */
  toMessage(): WorkerInput {
    return this;
  }

  /**
   * Serialize this input to JSON format
   * @returns A plain object representation suitable for JSON serialization
   */
  toJSON() {
    return {
      uuid: this.uuid,
      title: this.title,
      type: this.type,
      value: this.value,
      validators: this.validators.map(v => {
        const r = v.toString().substring(1);
        return r.substring(0, r.length - 1);
      })
    };
  }

  /**
   * Validate an input value against the configured validators
   * @param input - The string value to validate
   * @returns True if the input matches at least one validator, or if no validators are configured
   */
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

/**
 * Internal extension of WorkerInput that holds the promise infrastructure
 * needed to await the user's response
 */
class WorkerInputEmitter extends WorkerInput {
  /** Promise that resolves when the user provides an answer */
  promise?: Promise<string>;
  /** Resolver function for the promise */
  resolve?: (value?: string) => void;
  /** Timeout handle that rejects the promise after a configurable delay */
  timeout?: NodeJS.Timeout;

  toMessage(): WorkerInput {
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
 * Ensure a string is a valid WorkerLogLevel
 * @param level 
 * @returns 
 */
export function isWorkerLogLevel(level: string): level is WorkerLogLevel {
  return ["ERROR", "WARN", "INFO", "DEBUG", "TRACE"].includes(level);
}

/**
 * Represents a single log line captured by WorkerOutput
 */
export class WorkerLog {
  /** Severity level of this log entry */
  level: WorkerLogLevel;
  /** Arguments passed to the log call */
  args: any[];

  /**
   * Create a new log entry
   * @param level - Severity level
   * @param args - Message arguments (strings, objects, errors, etc.)
   */
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

/**
 * Dump long stack traces for exceptions that expose a `cause()` method.
 * Compatible with [verror](https://github.com/davepacheco/node-verror) and
 * [restify v2.0](https://github.com/mcavage/node-restify) error classes.
 *
 * Based on `dumpException` in
 * https://github.com/davepacheco/node-extsprintf/blob/master/lib/extsprintf.js
 * @param ex - The error whose full stack trace should be returned
 * @returns Multi-line stack trace string, including chained causes
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
 * Get the file and lines from the current stack trace
 * @returns An array of objects containing file, line, column, and function information
 */
export function getFileAndLines(): { file: string; line: number; column?: number, function?: string }[] {
  const err = new Error();
  const stacks: { file: string; line: number; column?: number, function?: string }[] = [];
  const matches = err.stack.matchAll(/\s+at\s+(?<method>[^( ]+)([^(]+)?\((?<filename>.+):(?<line>\d+):(?<column>\d+)\)?$/gm);
  for (const match of matches) {
    stacks.push({
      file: match.groups.filename,
      line: parseInt(match.groups.line),
      column: parseInt(match.groups.column),
      function: match.groups.method
    });
  }
  return stacks;
}

/**
 * Get the caller line and filename
 * @returns 
 */
export function getFileAndLine(): { file: string; line: number; column?: number, function?: string } {
  return getFileAndLines().find(s => !s.file.includes("/workout/") && !s.function?.includes(".log")) || { file: "unknown", line: 0 };
}

/**
 * Represents a message emitted by WorkerOutput and consumed by loggers
 */
export class WorkerMessage {
  /** Active log group stack at the time of emission */
  groups: string[];
  /** Discriminator that identifies the kind of event */
  type: WorkerMessageType;
  /** Snapshot of all active progress indicators at emission time */
  progresses: { [key: string]: WorkerProgress } = {};
  /** UID of the currently active progress (if any) */
  currentProgress?: string;
  /** Log entry attached to "log" messages */
  log?: WorkerLog;
  /** Unix timestamp (ms) when the message was created */
  timestamp: number;
  /** PID of the process that emitted the message */
  pid: number;
  /** Additional arbitrary properties merged from `infos` */
  [key: string]: any;
  /** Input request/response attached to input-related messages */
  input?: WorkerInput;
  /** Source location of the log call (populated when addLogProducerLine is enabled) */
  context?: { file?: string; line?: number; column?: number; function?: string };

  /**
   * Create a new WorkerMessage
   * @param type - Event type discriminator
   * @param workout - WorkerOutput instance whose current state is captured
   * @param infos - Additional properties to merge into the message
   */
  constructor(type: WorkerMessageType, workout: WorkerOutput, infos: any = {}) {
    this.type = type;
    this.pid = process.pid;
    if (workout) {
      this.groups = workout.groups;
      this.progresses = workout.progresses;
      this.currentProgress = workout.currentProgress;
      this.timestamp = Date.now();
    }
    Object.assign(this, infos);
  }

  /**
   * Deserialize a WorkerMessage from JSON
   * @param json - JSON string representation of a WorkerMessage
   * @returns A fully reconstructed WorkerMessage instance with proper types
   */
  static fromJSON(json: string): WorkerMessage {
    const obj = JSON.parse(json);
    let message;
    if (obj.type === "log") {
      message = new WorkerMessage(obj.type, undefined, { ...obj, log: new WorkerLog(obj.log.level, ...obj.log.args) });
    } else if (obj.type === "input.request" || obj.type === "input.received" || obj.type === "input.timeout") {
      obj.input.validators = (obj.input.validators || []).map(v => new RegExp(v));
      message = new WorkerMessage(obj.type, undefined, {
        input: new WorkerInput(obj.input.uuid, obj.input.title, obj.input.type, obj.input.validators)
      });
      message.input.value = obj.input.value;
    } else {
      message = new WorkerMessage(obj.type, undefined, obj);
    }
    message.pid = obj.pid;
    return message;
  }
}

/**
 * This class allow you to abstract the output for your program
 *
 * You can send output, ask for input and depending if you are in terminal
 * It will show progress in the terminal, or send it via WebSockets or store it in a DB or in a logfile
 */
export class WorkerOutput extends EventEmitter {
  /** Optional title for the current output session */
  title?: string;
  /** Stack of currently open group names */
  groups: string[] = [];
  /** All active progress indicators keyed by UID */
  progresses: { [key: string]: WorkerProgress } = {};
  /** Ordered stack of active progress UIDs (last = current) */
  progressesStack: string[] = [];
  /** UID of the progress that receives increments by default */
  currentProgress?: string;
  /** Whether the output is connected to an interactive session capable of receiving user input */
  interactive: boolean = false;
  /** Pending input requests awaiting a user response, keyed by UUID */
  inputs: { [key: string]: WorkerInputEmitter } = {};
  /** When true, every log call records the caller's file/line/function in the message context */
  addLogProducerLine: boolean = false;

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
   * Start an undetermined activity
   * @param title
   */
  startActivity(title?: string, uid: string = "activity") {
    if (this.progresses[uid]) {
      this.updateProgress(0, uid, title);
    } else {
      this.startProgress(uid, -1, title);
    }
  }

  /**
   * Stop an activity
   * @param status
   * @param uid
   */
  stopActivity(status?: "info" | "error" | "success" | "warning", title?: string, uid: string = "activity") {
    if (this.progresses[uid]) {
      this.progresses[uid].status = status;
      this.progresses[uid].title = title ?? this.progresses[uid].title;
      this.updateProgress(-1, uid);
    }
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
      const status = this.progresses[uid].status;
      const title = this.progresses[uid].title;
      delete this.progresses[uid];
      this.progressesStack.splice(this.progressesStack.indexOf(uid), 1);
      if (uid === this.currentProgress) {
        this.currentProgress = this.progressesStack[this.progressesStack.length - 1];
      }
      this.emitMessage("progress.stop", { progress: uid, status, title });
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
    let context = undefined;
    if (this.addLogProducerLine) {
      context = getFileAndLine();
    }
    this.logWithContext(level, context, ...args);
  }

  /**
   * Get a Bunyan-compatible logger interface
   * @returns An object with Bunyan-style logging methods (info, trace, warn, debug, error, fatal)
   * @example
   * ```typescript
   * const logger = output.getBunyanLogger();
   * logger.info("App started");
   * logger.error(err, "Request failed");
   * ```
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
   * Log a message with additional context information
   * @param level - The log level (ERROR, WARN, INFO, DEBUG, TRACE)
   * @param context - Context object to attach to the log (can include file, line, column, function, etc.)
   * @param args - Message arguments to log
   */
  logWithContext(level: WorkerLogLevel, context: any, ...args: any[]): void {
    this.emitMessage("log", { context, log: new WorkerLog(level, ...args) });
  }

  /**
   * Enable or disable interactive mode for user input
   * @param interactive - True to allow user input, false to disable
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
   * Forward an event from another WorkerOutput (typically from a forked process)
   * @param rawEvent - JSON string representation of a WorkerMessage
   */
  forwardEvent(rawEvent: string) {
    const event = WorkerMessage.fromJSON(rawEvent);
    if (event.pid === process.pid) {
      // Should not forward an event emitted by itself
      return;
    }
    if (event.input) {
      this.inputs[event.input.uuid] = event.input;
    }
    this.emitMessage(event.type, event);
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
    if (this.inputs[uuid].resolve) {
      this.inputs[uuid].resolve(value);
    }
    if (this.inputs[uuid].timeout) {
      clearTimeout(this.inputs[uuid].timeout);
    }
    this.emitMessage("input.received", { input: this.inputs[uuid].toMessage() });
    delete this.inputs[uuid];
  }
}
