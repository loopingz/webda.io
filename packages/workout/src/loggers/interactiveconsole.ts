import { LogFilter, WorkerLog, WorkerLogLevel, WorkerMessage, WorkerOutput } from "../core";
import { ConsoleLogger } from "./console";
import chalk from "yoctocolors";
const isUnicodeSupported = process.platform !== "win32" || Boolean(process.env.WT_SESSION);

function humanizeDuration(millis) {
  const totalSeconds = Math.floor(millis / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || hours > 0) {
    // Always show minutes if hours are present
    parts.push(`${minutes}m`);
  }
  if (parts.length < 2) {
    // Show seconds if only one unit is present or no hours/minutes
    parts.push(`${seconds}s`);
  }
  if (parts.length < 2) {
    // Show seconds if only one unit is present or no hours/minutes
    parts.push(`${millis % 1000}ms`);
  }

  return parts.slice(0, 2).join(" "); // Keep only the first two units
}

const statuses = {
  info: chalk.blue(isUnicodeSupported ? "ℹ" : "i"),
  success: chalk.green(isUnicodeSupported ? "✔" : "√"),
  warning: chalk.yellow(isUnicodeSupported ? "⚠" : "‼"),
  error: chalk.red(isUnicodeSupported ? "✖️" : "×")
};

const defaultSpinner = {
  frames: isUnicodeSupported ? ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] : ["-", "\\", "|", "/"],
  interval: 80
};

class SimpleProgress {
  title: string;
  size: number = 40;
  empty: string = isUnicodeSupported ? "⠒" : ".";
  full: string = isUnicodeSupported ? "█" : ""; // ⠿
  current: number;
  total: number = -1;
  lastValue: string = "";
  interval;
  spinnerState = 0;
  started: number;
  stopped: number;

  constructor(protected stream = process.stdout) {}

  clear() {
    this.stream.write("\r\x1b[K");
  }

  status(status: string) {
    this.stream.write(`${statuses[status] || "?"} ${this.title}\n`);
  }

  hideCursor() {
    this.stream.write("\u001B[?25l");
  }

  showCursor() {
    this.stream.write("\u001B[?25h");
  }

  getElapsed() {
    return (this.stopped ?? Date.now()) - this.started;
  }

  start() {
    this.started ??= Date.now();
    this.hideCursor();
    this.interval ??= setInterval(() => {
      this.spinnerState++;
      if (defaultSpinner.frames.length <= this.spinnerState) {
        this.spinnerState = 0;
      }
      this.render();
    }, defaultSpinner.interval);
  }

  update(value) {
    this.current = value;
    this.render();
  }

  stop() {
    clearInterval(this.interval);
    this.interval = undefined;
    this.clear();
    this.showCursor();
    this.stopped = Date.now();
  }

  render() {
    if (this.total === -1) {
      const str = chalk.yellow(defaultSpinner.frames[this.spinnerState]) + " " + this.title;
      let update = str;
      if (this.lastValue.substring(1) === str.substring(1)) {
        update = update.substring(0, 1);
      }
      process.stdout.write(`\x1b[${str.length}D` + update);
      this.lastValue = str;
      return;
    }
    const title = this.title.substring(0, 40);
    const full = Math.floor((this.current / this.total) * 40);
    const percent = Math.floor((this.current / this.total) * 10000) / 100;
    const empty = this.size - full - 1;
    const progressBar = `${this.full.repeat(full)}${defaultSpinner.frames[this.spinnerState]}${this.empty.repeat(
      empty
    )}`;
    let str = `| ${chalk.yellow(progressBar)} | ${title} | ${percent}`;
    if (this.total >= 200) {
      str += `| ${this.current} / ${this.total}`;
    }
    let start = 0;
    for (let i = 0; i < this.lastValue.length && i < str.length; i++) {
      if (str[i] === this.lastValue[i]) {
        start++;
      }
      break;
    }
    this.stream.write(`\x1b[${this.lastValue.substring(start).length}D` + str.substring(start));
    this.lastValue = str;
  }
}

export class InteractiveConsoleLogger extends ConsoleLogger {
  input: Promise<string> & {
    cancel: () => void;
  };
  spinner: SimpleProgress;

  constructor(output: WorkerOutput, level: WorkerLogLevel = "INFO", format: string = ConsoleLogger.defaultFormat) {
    super(output, level, format);
    output.setInteractive(true);
  }

  onMessage(msg: WorkerMessage): void {
    if (msg.type === "input.request") {
      this.onInput(msg);
    } else if (msg.type === "input.timeout") {
      this.input?.cancel();
    } else if (msg.type.startsWith("progress.")) {
      this.onProgress(msg);
    } else if (msg.type === "log" && LogFilter(msg.log.level, this.level)) {
      this.spinner?.clear();
      ConsoleLogger.display(msg, this.format);
    }
  }

  async onProgress(msg: WorkerMessage) {
    if (msg.type === "progress.start") {
      this.spinner ??= new SimpleProgress();
      this.spinner.title = msg.progresses[msg.currentProgress].title;
      this.spinner.total = msg.progresses[msg.currentProgress].total;
      this.spinner.start();
    } else if (msg.type === "progress.stop") {
      this.spinner.stop();
      if (msg.status) {
        ConsoleLogger.display(
          new WorkerMessage("log", this.output, {
            log: new WorkerLog(
              "INFO",
              `${statuses[msg.status] || ""} ${msg.title || this.spinner.title} in ${humanizeDuration(this.spinner.getElapsed())}`
            )
          }),
          this.format
        );
      }
    } else if (msg.type === "progress.update") {
      this.spinner.title = msg.progresses[msg.currentProgress].title;
      this.spinner.update(msg.progresses[msg.currentProgress].current);
    }
  }

  async onInput(msg: WorkerMessage) {
    // @ts-ignore
    const { input } = await import("@inquirer/prompts");
    if (!input) {
      throw new Error("Inquirer is not available, please install it with npm install @inquirer/prompts");
    }
    this.input = input({
      message: msg.input.title,
      validate: (value: string) => {
        return msg.input.validate(value);
      }
    });
    this.input
      .then((value: string) => {
        this.output.returnInput(msg.input.uuid, value);
      })
      .catch(err => {
        // Ignore the error for now
      });
  }
}
