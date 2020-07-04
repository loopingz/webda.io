import * as colors from "colors";
import * as readline from "readline";
import {
  LogFilter,
  WorkerLogLevel,
  WorkerMessage,
  WorkerOutput,
  WorkerProgress,
  WorkerInput,
  WorkerInputType
} from "..";
import { ConsoleLogger } from "../loggers/console";
import * as util from "util";
import { SIGINT } from "constants";
import { fstat } from "fs";

export class Terminal {
  tty: boolean;
  wo: WorkerOutput;
  height: number;
  history: string[] = [];
  historySize: number = 2000;
  scrollY: number = -1;
  level: WorkerLogLevel;
  hasProgress: boolean;
  progresses: { [key: string]: WorkerProgress } = {};
  title: string = "";
  format: string;
  inputs: WorkerInput[] = [];
  inputValue: string = "";
  rl: readline.Interface;
  reset: boolean = false;
  inputValid: boolean = true;
  progressChar: number = 0;
  progressChars = ["\u287F", "\u28BF", "\u28FB", "\u28FD", "\u28FE", "\u28F7", "\u28EF", "\u28DF"].map(c =>
    colors.bold(colors.yellow(c))
  );
  logo: string[] = [];
  logoWidth: number = 0;
  _refresh: NodeJS.Timeout;

  constructor(
    wo: WorkerOutput,
    level: WorkerLogLevel = undefined,
    format: string = undefined,
    tty: boolean = process.stdout.isTTY
  ) {
    this.wo = wo;
    this.tty = tty;
    this.format = format;
    this.level = level ? level : <any>process.env.LOG_LEVEL || "INFO";
    // Fallback on basic ConsoleLogger if no tty
    if (!this.tty) {
      this.wo.on("message", async msg => {
        ConsoleLogger.handleMessage(msg, this.level, this.format);
      });
      return;
    }
    this.wo.on("message", async msg => this.router(msg));
    this.height = process.stdout.rows;

    // Reset term
    process.stdout.write("\x1B[?12l\x1B[?47h\x1B[?25l");

    // Ensure we restore terminal on quit
    process.on("beforeExit", () => this.resetTerm);
    this._refresh = setInterval(() => {
      this.progressChar++;
      if (this.progressChar >= this.progressChars.length) {
        this.progressChar = 0;
      }
      this.displayScreen();
    }, 300);

    // Update on terminal resize
    process.stdout.on("resize", size => {
      this.height = process.stdout.rows;
      if (this.hasProgress) {
        this.displayScreen();
      }
    });

    // Manage input if any stdin
    if (!process.stdin || !process.stdin.setRawMode) {
      return;
    }
    this.wo.setInteractive(true);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    process.stdin.setRawMode(true);
    process.stdin.on("data", data => {
      let str = data.toString();
      if (str.charCodeAt(0) === 3) {
        process.kill(process.pid, SIGINT);
        return;
      } else if (str.charCodeAt(0) === 127) {
        if (this.inputValue.length) {
          this.inputValue = this.inputValue.substr(0, this.inputValue.length - 1);
        }
      } else if (this.inputs.length) {
        if (str === "\u001B\u005B\u0035\u007e") {
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
        } else if (str.charCodeAt(0) === 13) {
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
    });
  }

  scrollUp(increment: number) {
    if (this.scrollY === -1) {
      this.scrollY = this.history.length - this.height;
    }
    this.scrollY -= increment;
    if (this.scrollY < 0) {
      this.scrollY = 0;
    }
  }

  scrollDown(increment: number) {
    if (this.scrollY === -1) {
      this.scrollY = this.history.length - this.height;
    }
    this.scrollY += increment;
    if (this.scrollY >= this.history.length - this.height - 1) {
      this.scrollY = -1;
    }
  }

  setTitle(title: string = "") {
    this.title = title;
  }

  resetTerm(...args) {
    if (this.reset) {
      return;
    }
    this.reset = true;
    process.stdout.write("\x1B[?47l\x1B[?25h");
    process.stdout.write(this.displayHistory(this.height, false));
  }

  close() {
    clearInterval(this._refresh);
    this.resetTerm();
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  }

  pushHistory(line) {
    this.history.push(line);
    if (this.history.length > this.historySize) {
      this.history.shift();
    }
  }

  async router(msg: WorkerMessage) {
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
        this.inputs = this.inputs.filter(m => msg.input.uuid !== m.uuid);
        this.displayScreen();
        break;
    }
  }

  handleTitleMessage(msg: WorkerMessage) {
    this.title = msg.title;
    this.log(msg.groups, "INFO", [msg.title || ""]);
    this.displayScreen();
  }

  log(groups, level: WorkerLogLevel, ...args) {
    if (!LogFilter(level, this.level)) {
      return;
    }
    let color = ConsoleLogger.getColor(level);
    let levelColor = level.padStart(5);
    let groupsPart = "";
    if (groups.length) {
      groupsPart = `[${groups.map(g => `${color(g)}`).join(colors.grey(">"))}] `;
    }
    let line = `[${color(levelColor)}] ${groupsPart}${color(
      args.map(a => (typeof a === "object" ? util.inspect(a) : a.toString())).join(" ")
    )}`;
    this.pushHistory(line);
    this.displayScreen();
  }

  getFooterSize() {
    let size = Object.keys(this.progresses).length + 1 + this.title ? 1 : 0;
    if (this.inputs.length) {
      size += 1;
    }
    if (size) {
      size++;
    }
    return size;
  }

  stripColorString(str, limit: number) {
    let match;
    let regexp = /(?<before>[^\u001b]+)|(?<cmd>\u001b\[[\d;]+m)/gm;
    let originalString = "";
    let fullString = "";
    let noMore = false;
    while ((match = regexp.exec(str))) {
      match.groups.before = match.groups.before || "";
      match.groups.cmd = match.groups.cmd || "";
      if (originalString.length + match.groups.before.length >= limit) {
        fullString += match.groups.before.substr(0, limit - originalString.length - 3) + "...";
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

  displayString(str, limit: number = undefined) {
    if (!limit) {
      limit = process.stdout.columns;
    }
    let len = this.getTrueLength(str);
    if (len > limit) {
      return this.stripColorString(str, limit);
    }
    // Strip colors for our calculation
    limit += str.length - len;
    return str.padEnd(limit);
  }

  getTrueLength(str): number {
    return str.replace(/(\u001b\[[\d;]+m)/gm, "").length;
  }

  displayBar(ratio, barlen) {
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

  getBar(size: number, complete: boolean) {
    if (complete) {
      return "[" + colors.green("=".repeat(size));
    } else {
      return colors.grey("-".repeat(size)) + "]";
    }
  }

  displayTitle() {
    let pads = (process.stdout.columns - this.title.length - 4) / 2;
    if (pads < 0) {
      pads = 0;
    }
    return `${" ".repeat(pads)}${colors.bold(this.title)}${" ".repeat(pads)}\n`;
  }

  displayProgress(p: WorkerProgress) {
    let bar = this.displayBar(p.getRatio(), 40);
    // @ts-ignore
    let percent = Number(p.getRatio() * 100)
      .toFixed(2)
      .padStart(5);
    let numberLength = p.total.toString().length;
    let line = this.displayString(
      `${bar} ${Math.floor(p.current).toString().padStart(numberLength)}/${p.total} ${p.title || ""}`.padEnd(
        process.stdout.columns - 2
      )
    );
    if (line.length > process.stdout.columns - 2) {
      line = line.substr(0, process.stdout.columns - 2);
    }
    return `${line}\n`;
  }

  displayFooter() {
    // Separator

    let res = this.progressChars[this.progressChar] + " " + "\u2015".repeat(process.stdout.columns - 2) + "\n";
    let values = Object.values(this.progresses);
    let k = values.length;
    if (this.title) {
      res += this.displayTitle();
    }
    if (this.inputs.length) {
      k++;
    }
    for (let i in this.progresses) {
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
   * @param logo to display
   */
  setLogo(logo: string[]) {
    this.logo = logo;
    this.logoWidth = Math.max(...this.logo.map(this.getTrueLength));
  }

  displayHistory(lines: number, complete: boolean = true) {
    let res = "";
    let start = this.scrollY < 0 ? this.history.length - lines : this.scrollY;
    if (start < 0) {
      start = 0;
    }
    let history = this.history.slice(start, start + lines);
    let j = history.length - lines;
    complete = complete || this.logo.length !== 0;
    if (!complete && j < 0) {
      j = 0;
    }
    while (j < 0) {
      res += " ".repeat(process.stdout.columns) + "\n";
      j++;
    }
    for (; j < history.length; j++) {
      let line = this.displayString(history[j].padEnd(process.stdout.columns));
      res += `${line}\n`;
    }
    // Inserting logo
    if (this.height > 30 && process.stdout.columns > 50 && this.logo.length) {
      let lines = res.split("\n");
      let i = 0;
      for (let y in this.logo) {
        i = parseInt(y) + this.getFooterSize();
        if (!lines[i]) {
          continue;
        }
        lines[i] =
          this.displayString(lines[i].trim(), process.stdout.columns - this.logoWidth - 1) +
          this.logo[y].padEnd(this.logoWidth) +
          " ";
      }
      return lines.join("\n");
    }
    return res;
  }

  async displayScreen() {
    // Reset terminal
    let screen = ""; //"\x1Bc";
    let footer = this.getFooterSize();
    // Calculate where to start
    let start = this.height - this.history.length + footer;
    if (start < 0) {
      start = 0;
    }
    //readline.cursorTo(process.stdout, 0, start);
    screen += this.displayHistory(this.height - this.getFooterSize());

    // Display footer
    if (this.hasProgress || this.title) {
      screen += this.displayFooter();
    }
    this.clearScreen();
    process.stdout.write(screen);
    // Display input
    if (this.inputs.length) {
      process.stdout.write(
        "\x1B[?25h" +
          colors.bold(this.inputs[0].title + ": ") +
          (this.inputs[0].type === WorkerInputType.PASSWORD ? "*".repeat(this.inputValue.length) : this.inputValue)
      );
    }
  }

  clearScreen() {
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
  }
}
