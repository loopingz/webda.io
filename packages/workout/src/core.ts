import { EventEmitter } from "events";
import { v4 as uuidv4 } from "uuid";

export interface Logger {
  log: (level: WorkerLogLevel, ...args) => void;
  logGroupOpen: (name: string) => void;
  logGroupClose: () => void;
  logProgressStart: (uid: string, total: number, title: string) => void;
  logProgressIncrement: (inc: number, uid: string) => void;
  logProgressUpdate: (current: number, uid: string, title: string) => void;
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

  constructor(uid: string, total: number, groups: string[], title: string = undefined) {
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

/**
 * Represents a Input request
 */
export class WorkerInput {
  title: string;
  validators: string[];
  uuid: string;
  value: string;

  constructor(uuid: string, title: string, validators: string[]) {
    this.uuid = uuid;
    this.title = title;
    this.validators = validators;
  }
}

class WorkerInputEmitter extends WorkerInput {
  promise: Promise<string>;
  resolve: (value?: unknown) => void;
  timeout: NodeJS.Timeout;

  toMessage() {
    return new WorkerInput(this.uuid, this.title, this.validators);
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
  constructor(level: WorkerLogLevel, ...args) {
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
 * Represents a message emitted by WorkerOutput
 */
export class WorkerMessage {
  groups: string[];
  type: WorkerMessageType;
  progresses: { [key: string]: WorkerProgress } = {};
  currentProgress: string;
  log: WorkerLog = undefined;
  timestamp: number;
  [key: string]: any;
  input?: WorkerInput;

  constructor(type: WorkerMessageType, workout: WorkerOutput, infos: any = {}) {
    if (workout) {
      this.groups = workout.groups;
      this.type = type;
      this.progresses = workout.progresses;
      this.currentProgress = workout.currentProgress;
      this.timestamp = Date.now();
    }
    for (let i in infos) {
      this[i] = infos[i];
    }
  }
}

/**
 * This class allow you to abstract the output for your program
 *
 * You can sned output, ask for input and depending if you are in terminal
 * It will show progress in the terminal, or send it via WebSockets or store it in a DB or in a logfile
 */
export class WorkerOutput extends EventEmitter {
  title: string;
  groups: string[] = [];
  progresses: { [key: string]: WorkerProgress } = {};
  progressesStack: string[] = [];
  currentProgress: string;
  interactive: boolean = false;
  inputs: { [key: string]: WorkerInputEmitter } = {};

  /**
   * Send an event with default informations
   *
   * @param event
   * @param infos
   */
  protected emitMessage(event: WorkerMessageType, infos: any = {}) {
    this.emit("message", new WorkerMessage(event, this, infos));
  }

  /**
   * Set the output title
   *
   * @param title to set
   */
  setTitle(title: string) {
    this.emitMessage("title.set", { title });
  }

  /**
   * Start a new progress indicator
   *
   * @param uid
   * @param total
   * @param title
   */
  startProgress(uid: string, total: number, title: string = undefined) {
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
  incrementProgress(inc: number = 1, uid: string = undefined) {
    if (!uid) {
      uid = this.currentProgress;
    }
    if (!this.progresses[uid]) {
      throw new Error("Unknown progress");
    }
    this.updateProgress(this.progresses[uid].current + inc, uid);
  }

  /**
   * Update a progress indicator
   *
   * @param current value
   * @param uid id of the progress or default one
   * @param title update title as well
   */
  updateProgress(current: number, uid: string = undefined, title: string = undefined) {
    if (!uid) {
      uid = this.currentProgress;
    }
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
  openGroup(name: string = "") {
    this.groups.push(name);
    this.emitMessage("group.open", { group: name });
  }

  /**
   * Close a group of output
   */
  closeGroup() {
    if (this.groups.length === 0) {
      return;
    }
    let name = this.groups.pop();
    this.emitMessage("group.close", { group: name });
  }

  /**
   * Log something
   *
   * @param level of log to use with filtering
   * @param args anything you want to log
   */
  log(level: WorkerLogLevel, ...args) {
    this.logWithContext(level, undefined, ...args);
  }

  /**
   *
   * @param interactive
   */
  logWithContext(level: WorkerLogLevel, context: any, ...args) {
    this.emitMessage("log", { context, log: new WorkerLog(level, ...args) });
  }

  /**
   * Indicate that some listeners allow input
   *
   * @param interactive
   */
  setInteractive(interactive: boolean) {
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
    regexp: string[],
    waitFor: boolean = true,
    timeout: number = 60000
  ): Promise<string> {
    if (!this.interactive) {
      throw new Error("No interactive session registered");
    }
    let uuid = uuidv4();
    this.inputs[uuid] = new WorkerInputEmitter(uuid, title, regexp);
    this.inputs[uuid].promise = new Promise((resolve, reject) => {
      this.inputs[uuid].resolve = resolve;
      this.inputs[uuid].timeout = setTimeout(() => {
        this.emitMessage("input.timeout", { input: this.inputs[uuid].toMessage() });
        delete this.inputs[uuid];
        reject("Request input timeout");
      }, timeout);
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
  returnInput(uuid: string, value: string) {
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
