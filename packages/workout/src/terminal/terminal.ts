import * as colors from "colors";
import * as readline from "readline";
import { WorkerLogLevelEnum, WorkerMessage, WorkerOutput, WorkerProgress } from "..";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  crlfDelay: Infinity,
});

export class WorkerTerminal {
  tty: boolean;
  wo: WorkerOutput;
  height: number;
  history: string[] = [];
  level: WorkerLogLevelEnum = process.env.WEBDA_LOG_LEVEL
    ? WorkerLogLevelEnum[process.env.WEBDA_LOG_LEVEL]
    : WorkerLogLevelEnum.INFO || WorkerLogLevelEnum.INFO;
  hasProgress: boolean;
  progresses: { [key: string]: WorkerProgress } = {};
  title: string = "";
  inputs: any[] = [];

  constructor(wo: WorkerOutput) {
    this.wo = wo;
    this.tty = process.stdout.isTTY;
    this.wo.on("message", async (msg) => this.router(msg));
    this.height = process.stdout.rows;
    process.stdout.write("\x1B[?12l\x1B[?47h");
    let resetTerm = () => {
      process.stdout.write("\x1B[?47l");
      process.stdout.write(this.displayHistory(50, false));
    };
    process.on("beforeExit", resetTerm);
    process.on("SIGTERM", resetTerm);
    process.on("SIGINT", () => {
      resetTerm();
      process.exit(0);
    });
    process.stdout.on("resize", (size) => {
      this.height = process.stdout.rows;
      if (this.hasProgress) {
        this.displayScreen();
      }
    });
  }

  close() {
    rl.close();
  }

  pushHistory(line) {
    this.history.push(line);
    if (this.history.length > 100) {
      this.history.shift();
    }
  }

  async router(msg: WorkerMessage) {
    switch (msg.type) {
      case "log":
        return this.log(msg.groups, WorkerLogLevelEnum[msg.log.level], ...msg.log.args);
      case "progress.stop":
      case "progress.start":
        this.hasProgress = Object.keys(msg.progresses)
          .map((i) => msg.progresses[i].running)
          .reduce((prev, cur) => cur || prev, false);
      case "progress.update":
        this.progresses = msg.progresses;
        this.displayScreen();
        break;
      case "title.set":
        this.title = msg.title;
        this.displayScreen();
        break;
      case "input.request":
        this.inputs.push(msg.input);
        break;
      case "input.received":
        this.inputs = this.inputs.filter((m) => msg.input.id !== m.id);
        break;
    }
  }

  log(groups, level: WorkerLogLevelEnum, ...args) {
    if (level > this.level) {
      return;
    }
    let color = (s) => s;
    let levelColor = WorkerLogLevelEnum[level].padStart(5);
    if (level === WorkerLogLevelEnum.ERROR) {
      color = colors.red;
    } else if (level === WorkerLogLevelEnum.WARN) {
      color = colors.yellow;
    } else if (level === WorkerLogLevelEnum.TRACE) {
      color = colors.grey;
    }
    let groupsPart = "";
    if (groups.length) {
      groupsPart = `[${groups.map((g) => `${color(g)}`).join(colors.grey(">"))}] `;
    }
    let line = `[${color(levelColor)}] ${groupsPart}${color(args.map((o) => o.toString()).join(" "))}`;
    this.pushHistory(line);
    this.displayScreen();
  }

  getFooterSize() {
    return Object.keys(this.progresses).length + 1 + this.title ? 1 : 0;
  }

  displayString(str, limit) {
    if (str.length > limit) {
      return str.substr(0, limit);
    }
    return str.padEnd(limit - str.length);
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
    return `[${colors.green("=".repeat(barFill))}${colors.grey("-".repeat(barEmpty))}]`;
  }

  displayTitle() {
    let pads = (process.stdout.columns - this.title.length - 4) / 2;
    return `${" ".repeat(pads)}${colors.bold(this.title)}${" ".repeat(pads)}\n`;
  }

  displayProgress(p: WorkerProgress) {
    let bar = this.displayBar(p.getRatio(), 40);
    // @ts-ignore
    let percent = Number(p.getRatio() * 100)
      .toFixed(2)
      .padStart(5);
    let numberLength = p.total.toString().length;
    let line = `${bar} ${Math.floor(p.current)
      .toString()
      .padStart(numberLength)}/${p.total} ${p.title || ""}`.padEnd(process.stdout.columns - 2);
    if (line.length > process.stdout.columns - 2) {
      line = line.substr(0, process.stdout.columns - 2);
    }
    return `${line}`;
  }

  displayFooter() {
    // Separator

    let res = "\u2015".repeat(process.stdout.columns) + "\n";
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

  displayHistory(lines: number, complete: boolean = true) {
    let res = "";
    let j = this.history.length - lines;
    if (!complete && j < 0) {
      j = 0;
    }
    while (j++ < 0) {
      res += " ".repeat(process.stdout.columns) + "\n";
    }
    for (; j < this.history.length; j++) {
      let line = this.history[j].padEnd(process.stdout.columns);
      res += `${line}\n`;
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
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
    rl.write(screen);
  }
}
