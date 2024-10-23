import chalk from "yoctocolors";
import { constants } from "os";
import * as readline from "readline";
import * as util from "util";

import { ConsoleLogger } from "../loggers/console";
import {
  LogFilter,
  WorkerInput,
  WorkerInputType,
  WorkerLogLevel,
  WorkerMessage,
  WorkerOutput,
  WorkerProgress
} from "../core";

/*
We could use terminal-kit to simplify
*/

export class Terminal {
  tty: boolean;
  wo: WorkerOutput;
  height: number = process.stdout.rows;
  width: number = process.stdout.columns;
  history: string[] = [];
  historySize: number = 2000;
  scrollY: number = -1;
  level: WorkerLogLevel;
  hasProgress: boolean = false;
  progresses: { [key: string]: WorkerProgress } = {};
  title: string = "";
  format?: string;
  inputs: WorkerInput[] = [];
  inputValue: string = "";
  rl?: readline.Interface;
  reset: boolean = false;
  inputValid: boolean = true;
  progressChar: number = 0;
  progressChars = ["\u287F", "\u28BF", "\u28FB", "\u28FD", "\u28FE", "\u28F7", "\u28EF", "\u28DF"].map(c =>
    chalk.bold(chalk.yellow(c))
  );
  logo: string[] = [];
  logoWidth: number = 0;
  /**
   * Contains the WorkerOutput listener
   */
  listener: (msg: WorkerMessage) => void;
  _refresh?: NodeJS.Timeout;
  static refreshSpeed = 300;

  constructor(wo: WorkerOutput, level?: WorkerLogLevel, format?: string, tty: boolean = process.stdout.isTTY) {
    this.wo = wo;
    this.tty = tty;
    this.format = format;
    this.level = level ? level : <any>process.env.LOG_LEVEL || "INFO";
    // Fallback on basic ConsoleLogger if no tty
    if (!this.tty) {
      this.listener = async msg => {
        ConsoleLogger.handleMessage(msg, this.level, this.format);
      };
      this.wo.on("message", this.listener);
      return;
    }
    this.listener = async msg => this.router(msg);
    this.wo.on("message", this.listener);
    this.resize();

    // Reset term
    process.stdout.write("\x1B[?12l\x1B[?47h\x1B[?25l");

    // Ensure we restore terminal on quit
    /* c8 ignore next  */
    process.on("beforeExit", () => this.resetTerm);
    this._refresh = setInterval(() => {
      this.progressChar++;
      if (this.progressChar >= this.progressChars.length) {
        this.progressChar = 0;
      }
      this.displayScreen();
    }, Terminal.refreshSpeed);

    // Update on terminal resize
    process.stdout.on("resize", this.resize.bind(this));

    // Manage input if any stdin
    /* c8 ignore next 3 */
    if (!process.stdin || !process.stdin.setRawMode) {
      return;
    }
    this.wo.setInteractive(true);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    process.stdin.setRawMode(true);
    process.stdin.on("data", this.onData.bind(this));
  }

  onData(data: Buffer | string): void {
    const str = data.toString();
    /* c8 ignore next 3 */
    if (str.charCodeAt(0) === 3) {
      process.kill(process.pid, constants.signals.SIGINT);
      return;
    } else if (str.charCodeAt(0) === 127) {
      if (this.inputValue.length) {
        this.inputValue = this.inputValue.substring(0, this.inputValue.length - 1);
      }
    } else if (str === "\u001B\u005B\u0035\u007e") {
      // PageUp
      this.scrollUp(this.height);
    } else if (str === "\u001B\u005B\u0036\u007e") {
      // PageDown
      this.scrollDown(this.height);
    } else if (str === "\u001B\u005B\u0042") {
      // Down
      this.scrollDown(1);
    } else if (str === "\u001B\u005B\u0041") {
      // Up
      this.scrollUp(1);
    } else if (this.inputs.length) {
      if (str.charCodeAt(0) === 13) {
        // validate input
        if (this.inputs[0].validate(this.inputValue)) {
          this.wo.returnInput(this.inputs[0].uuid, this.inputValue);
          this.inputValue = "";
          this.inputs.shift();
          if (!this.inputs.length) {
            process.stdout.write("\x1B[?25l");
          }
        } else {
          this.inputValid = false;
        }
      } else {
        this.inputValid = true;
        this.inputValue += str;
      }
    }
    this.displayScreen();
  }

  resize(): void {
    this.height = process.stdout.rows;
    this.width = process.stdout.columns;
    if (this.hasProgress) {
      this.displayScreen();
    }
  }

  scrollUp(increment: number): void {
    if (this.scrollY === -1) {
      this.scrollY = this.history.length - this.height;
    }
    this.scrollY -= increment;
    if (this.scrollY < 0) {
      this.scrollY = 0;
    }
  }

  scrollDown(increment: number): void {
    if (this.scrollY === -1) {
      this.scrollY = this.history.length - this.height;
    }
    this.scrollY += increment;
    if (this.scrollY >= this.history.length - this.height - 1) {
      this.scrollY = -1;
    }
  }

  setTitle(title: string = ""): void {
    this.title = title;
  }

  resetTerm(): void {
    if (this.reset) {
      return;
    }
    this.reset = true;
    process.stdout.write("\x1B[?47l\x1B[?25h");
    process.stdout.write(this.displayHistory(this.height, false));
  }

  close(): void {
    clearInterval(this._refresh);
    this.resetTerm();
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
    this.wo.removeListener("message", this.listener);
  }

  pushHistory(line: string): void {
    this.history.push(line);
    if (this.history.length > this.historySize) {
      this.history.shift();
    }
  }

  async router(msg: WorkerMessage): Promise<void> {
    switch (msg.type) {
      case "log":
        return this.log(msg.groups, msg.log.level, ...msg.log.args);
      case "progress.stop":
      case "progress.start":
        this.hasProgress = Object.keys(msg.progresses)
          .map(i => msg.progresses[i].running)
          .reduce((prev, cur) => cur || prev, false);
      case "progress.update":
        this.progresses = msg.progresses;
        this.displayScreen();
        break;
      case "title.set":
        this.handleTitleMessage(msg);
        break;
      case "input.request":
        this.inputs.push(msg.input);
        this.displayScreen();
        break;
      case "input.received":
        this.inputs = this.inputs.filter(m => msg.input?.uuid !== m.uuid);
        this.displayScreen();
        break;
    }
  }

  handleTitleMessage(msg: WorkerMessage): void {
    this.title = msg.title;
    this.log(msg.groups, "INFO", [msg.title || ""]);
    this.displayScreen();
  }

  log(groups: any[], level: WorkerLogLevel, ...args: any[]): void {
    if (!LogFilter(level, this.level)) {
      return;
    }
    const getLevelColor: (lvl: string) => string = ConsoleLogger.getColor(level);
    const levelColor = level.padStart(5);
    let groupsPart = "";
    if (groups.length) {
      groupsPart = `[${groups.map(g => getLevelColor(g)).join(chalk.gray(">"))}] `;
    }
    args
      .map(a => (typeof a === "object" ? util.inspect(a) : a.toString()))
      .join(" ")
      .split("\n")
      .forEach(info => {
        const line = `[${getLevelColor(levelColor)}] ${groupsPart}${getLevelColor(info)}`;
        this.pushHistory(line);
      });
    this.displayScreen();
  }

  getFooterSize(): number {
    let size = Object.keys(this.progresses).length + 1 + this.title ? 1 : 0;
    if (this.inputs.length) {
      size += 1;
    }
    if (size) {
      size++;
    }
    return size;
  }

  stripColorString(str: string, limit: number = -1): string {
    let match;
    const regexp =
      /(?<before>[^\u001b]+)|(?<cmd>[\u001b\u009b][[()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nqry=><])/gm;
    let originalString = "";
    let fullString = "";
    let noMore = false;
    while ((match = regexp.exec(str))) {
      match.groups ??= {};
      match.groups.before ??= "";
      match.groups.cmd ??= "";
      if (limit > 0 && originalString.length + match.groups.before.length >= limit) {
        fullString += match.groups.before.substring(0, limit - originalString.length - 3) + "...";
        noMore = true;
        continue;
      }
      originalString += match.groups.before;
      if (!noMore) {
        fullString += match.groups.before;
      }
      // Still pilling all commands
      fullString += match.groups.cmd;
    }
    return fullString;
  }

  displayString(str: string, limit: number = this.width): string {
    const len = this.getTrueLength(str);
    if (len > limit) {
      return this.stripColorString(str, limit);
    }
    // Strip colors for our calculation
    limit += str.length - len;
    return str.padEnd(limit);
  }

  getTrueLength(str: string): number {
    return str.replace(/(\u001b\[[\d;]+m)/gm, "").length;
  }

  displayBar(ratio: number, barlen: number): string {
    let barFill = Math.floor(ratio * barlen);
    let barEmpty = Math.floor((1 - ratio) * barlen);
    if (barFill + barEmpty >= barlen) {
      if (barFill) {
        barFill--;
      } else {
        barEmpty--;
      }
    }
    return this.getBar(barFill, true) + this.getBar(barEmpty, false);
  }

  getBar(size: number, complete: boolean): string {
    if (complete) {
      return "[" + chalk.green("=".repeat(size));
    } else {
      return chalk.gray("-".repeat(size)) + "]";
    }
  }

  displayTitle() {
    let pads = (this.width - this.title.length - 4) / 2;
    if (pads < 0) {
      pads = 0;
    }
    return `${" ".repeat(pads)}${chalk.bold(this.title)}${" ".repeat(pads)}\n`;
  }

  displayProgress(p: WorkerProgress) {
    const bar = this.displayBar(p.getRatio(), 40);
    // @ts-ignore
    const percent = Number(p.getRatio() * 100)
      .toFixed(2)
      .padStart(5);
    const numberLength = p.total.toString().length;
    let line = this.displayString(
      `${bar} ${Math.floor(p.current).toString().padStart(numberLength)}/${p.total} ${percent}% ${
        p.title || ""
      }`.padEnd(this.width - 2)
    );
    if (line.length > this.width - 2) {
      line = line.substring(0, this.width - 2);
    }
    return `${line}\n`;
  }

  displayFooter() {
    // Separator

    let res = this.progressChars[this.progressChar] + " " + "\u2015".repeat(this.width - 2) + "\n";
    const values = Object.values(this.progresses);
    let k = values.length;
    if (this.title) {
      res += this.displayTitle();
    }
    if (this.inputs.length) {
      k++;
    }
    for (const i in this.progresses) {
      res += this.displayProgress(this.progresses[i]);
      if (--k > 0) {
        res += `\r`;
      }
    }
    return res;
  }

  /**
   * Set the logo to display
   *
   * How to create logo:
   *
   * @param logo to display
   */
  setLogo(logo: string[]) {
    this.logo = logo;
    if (this.logo) {
      this.logoWidth = Math.max(...this.logo.map(this.getTrueLength));
    } else {
      this.logo = [];
      this.logoWidth = 0;
    }
  }

  /**
   * Retrieve current logo
   *
   * Usefull to add some versions
   */
  getLogo(): string[] {
    return this.logo;
  }

  displayHistory(lines: number, complete: boolean = true) {
    let res = "";
    let start = this.scrollY < 0 ? this.history.length - lines : this.scrollY;
    if (start < 0) {
      start = 0;
    }
    const history = this.history.slice(start, start + lines);
    let j = history.length - lines;
    complete = complete || this.logo.length !== 0;
    if (!complete && j < 0) {
      j = 0;
    }
    while (j < 0) {
      res += " ".repeat(this.width) + "\n";
      j++;
    }
    for (; j < history.length; j++) {
      const line = this.displayString(history[j].padEnd(this.width));
      res += `${line}\n`;
    }
    // Inserting logo
    if (this.height > 30 && this.width > 50 && this.logo.length) {
      const linesData = res.split("\n");
      let i = 0;
      for (const y in this.logo) {
        i = parseInt(y) + this.getFooterSize();
        /* c8 ignore next 3  */
        if (!linesData[i]) {
          continue;
        }
        linesData[i] =
          this.displayString(linesData[i].trim(), this.width - this.logoWidth - 1) +
          this.logo[y].padEnd(this.logoWidth) +
          " ";
      }
      return linesData.join("\n");
    }
    return res;
  }

  async displayScreen() {
    // Reset terminal
    let screen = ""; //"\x1Bc";
    screen += this.displayHistory(this.height - this.getFooterSize());

    // Display footer
    if (this.hasProgress || this.title) {
      screen += this.displayFooter();
    }
    readline.cursorTo(process.stdout, 0, 0);
    process.stdout.write(screen);
    // Display input
    if (this.inputs.length) {
      process.stdout.write(
        "\x1B[?25h" +
          chalk.bold(this.inputs[0].title + ": ") +
          (this.inputs[0].type === WorkerInputType.PASSWORD ? "*".repeat(this.inputValue.length) : this.inputValue)
      );
    }
  }

  /* we do not want flickering on unit test */
  /* c8 ignore next 4 */
  clearScreen() {
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
  }
}
