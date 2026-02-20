import { isWorkerLogLevel, LogFilter, WorkerLog, WorkerLogLevel, WorkerMessage, WorkerOutput } from "../core";
import { ConsoleLogger } from "./console";
import chalk from "yoctocolors";
const isUnicodeSupported = process.platform !== "win32" || Boolean(process.env.WT_SESSION);

/**
 * Convert milliseconds to a human-readable duration string
 * @param millis - Duration in milliseconds
 * @returns Formatted string like "1h 30m" or "45s 123ms"
 */
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

/**
 * Simple progress indicator with spinner animation
 * Used internally by InteractiveConsoleLogger for displaying progress
 */
class SimpleProgress {
  /** Display label shown next to the spinner or progress bar */
  title: string;
  /** Total number of character columns used for the bar */
  size: number = 40;
  /** Character used for the unfilled portion of the bar */
  empty: string = isUnicodeSupported ? "⠒" : ".";
  /** Character used for the filled portion of the bar */
  full: string = isUnicodeSupported ? "█" : ""; // ⠿
  /** Current progress value */
  current: number;
  /** Total progress value; -1 means indeterminate (spinner only) */
  total: number = -1;
  /** Last rendered string, used to diff-render only changed characters */
  lastValue: string = "";
  /** setInterval handle for the spinner animation */
  interval: ReturnType<typeof setInterval>;
  /** Current frame index into the spinner frames array */
  spinnerState = 0;
  /** Timestamp (ms) when the progress was started */
  started: number;
  /** Timestamp (ms) when the progress was stopped */
  stopped: number;

  /**
   * Create a new progress indicator
   * @param stream - Output stream (default: process.stdout)
   */
  constructor(protected stream = process.stdout) {}

  /**
   * Clear the current line on the terminal
   */
  clear() {
    this.stream.write("\r\x1b[K");
  }

  /**
   * Display a status icon with the progress title
   * @param status - Status type (info, success, warning, error)
   */
  status(status: string) {
    this.stream.write(`${statuses[status] || "?"} ${this.title}\n`);
  }

  /**
   * Hide the terminal cursor
   */
  hideCursor() {
    this.stream.write("\u001B[?25l");
  }

  /**
   * Show the terminal cursor
   */
  showCursor() {
    this.stream.write("\u001B[?25h");
  }

  /**
   * Get the elapsed time since progress started
   * @returns Elapsed time in milliseconds
   */
  getElapsed() {
    return (this.stopped ?? Date.now()) - this.started;
  }

  /**
   * Start the progress animation
   * Hides cursor and begins spinner interval
   */
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

  /**
   * Update the progress value and re-render
   * @param value - New progress value
   */
  update(value) {
    this.current = value;
    this.render();
  }

  /**
   * Stop the progress animation
   * Clears the interval, clears the line, and shows cursor
   */
  stop() {
    clearInterval(this.interval);
    this.interval = undefined;
    this.clear();
    this.showCursor();
    this.stopped = Date.now();
  }

  /**
   * Render the current progress state to the terminal
   * Handles both indeterminate (spinner only) and determinate (progress bar) modes
   */
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
      } else {
        break;
      }
    }
    this.stream.write(`\x1b[${this.lastValue.substring(start).length}D` + str.substring(start));
    this.lastValue = str;
  }
}

/**
 * Interactive console logger with spinner animations and progress bars
 * Automatically switches to basic ConsoleLogger when not in a TTY
 *
 * @example
 * ```typescript
 * const output = new WorkerOutput();
 * new InteractiveConsoleLogger(output);
 * output.startActivity("Processing");
 * await doWork();
 * output.stopActivity("success", "Done!");
 * ```
 */
export class InteractiveConsoleLogger extends ConsoleLogger {
  /** Active inquirer prompt promise (with cancellation support) */
  input: Promise<string> & {
    cancel: () => void;
  };
  /** Active spinner/progress indicator */
  spinner: SimpleProgress;

  /**
   * Create a new interactive console logger
   * @param output - WorkerOutput instance to listen to
   * @param level - Minimum log level to display (default: LOG_LEVEL env var or "INFO")
   * @param format - sprintf format string for log lines
   */
  constructor(output: WorkerOutput, level: WorkerLogLevel = isWorkerLogLevel(process.env.LOG_LEVEL) ? process.env.LOG_LEVEL : "INFO", format: string = ConsoleLogger.defaultFormat) {
    super(output, level, format);
    // Set interactive based on TTY status and --no-tty flag
    output.setInteractive(process.stdout.isTTY && !process.argv.includes("--no-tty"));
  }

  /**
   * Route a WorkerOutput message to the appropriate handler
   * Falls back to the basic ConsoleLogger when not running in an interactive TTY
   * @param msg - The message to handle
   * @override
   */
  onMessage(msg: WorkerMessage): void {
    // If not interactive, fallback to normal console logger
    if (!this.output.interactive) {
      super.onMessage(msg);
      return;
    }
    if (msg.type === "input.request") {
      this.onInput(msg);
    } else if (msg.type === "input.timeout") {
      this.input?.cancel();
    } else if (msg.type.startsWith("progress.")) {
      this.onProgress(msg);
    } else if (msg.type === "log" && LogFilter(msg.log.level, this.level())) {
      this.spinner?.clear();
      ConsoleLogger.display(msg, this.format);
      this.spinner?.render();
    }
  }

  /**
   * Handle progress-related messages (start, update, stop)
   * Manages spinner animation and displays completion status with duration
   * @param msg - Progress message to handle
   */
  async onProgress(msg: WorkerMessage) {
    if (msg.type === "progress.start") {
      this.spinner ??= new SimpleProgress();
      this.spinner.title = msg.progresses[msg.currentProgress].title;
      this.spinner.total = msg.progresses[msg.currentProgress].total;
      this.spinner.start();
    } else if (msg.type === "progress.stop") {
      this.spinner.stop();
      if (msg.status) {
        let level: WorkerLogLevel = "INFO";
        if (msg.status === "error") {
          level = "ERROR";
        } else if (msg.status === "warning") {
          level = "WARN";
        }
        ConsoleLogger.display(
          new WorkerMessage("log", this.output, {
            log: new WorkerLog(
              level,
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

  /**
   * Import the inquirer module (extracted for testability)
   */
  protected importInquirer(): Promise<any> {
    return import("@inquirer/prompts");
  }

  /**
   * Handle input request messages using @inquirer/prompts
   * Creates an interactive prompt with validation
   * @param msg - Input request message
   * @throws Error if @inquirer/prompts is not installed
   */
  async onInput(msg: WorkerMessage) {
    try {
      const inquirer = await this.importInquirer();
      if (!inquirer.input) {
        throw new Error("Inquirer is not available, please install it with npm install @inquirer/prompts");
      }
      this.input = inquirer.input({
        message: msg.input.title,
        validate: (value: string) => {
          return msg.input.validate(value);
        }
      }) as any;
      this.input
        .then((value: string) => {
          this.output.returnInput(msg.input.uuid, value);
        })
        .catch(err => {
          // Ignore the error for now
        });
    } catch (err) {
      throw new Error("Inquirer is not available, please install it with npm install @inquirer/prompts");
    }
  }
}
