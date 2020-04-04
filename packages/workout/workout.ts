import * as colors from "colors";
import { EventEmitter } from "events";
import * as readline from "readline";
var error = colors.red;
() => {
  readline.clearScreenDown(process.stdout);
};
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  crlfDelay: Infinity,
});

class WorkerTerminal {
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
    }
  }

  log(groups, level: WorkerLogLevelEnum, ...args) {
    if (level > this.level) {
      return;
    }
    let levelColor = WorkerLogLevelEnum[level].padStart(5);
    if (level === WorkerLogLevelEnum.ERROR) {
      levelColor = colors.red(WorkerLogLevelEnum[level].padStart(5));
    } else if (level === WorkerLogLevelEnum.WARN) {
      levelColor = colors.yellow(WorkerLogLevelEnum[level].padStart(5));
    } else if (level === WorkerLogLevelEnum.TRACE) {
      levelColor = colors.grey(WorkerLogLevelEnum[level].padStart(5));
    }
    let groupsPart = "";
    if (groups.length) {
      groupsPart = `[${groups.map((g) => `${g}`).join(colors.grey(">"))}] `;
    }
    let line = `[${levelColor}] ${groupsPart}${args.map((o) => o.toString()).join(" ")}`;
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

class WorkerProgress {
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

enum WorkerLogLevelEnum {
  ERROR,
  WARN,
  INFO,
  DEBUG,
  TRACE,
}
type WorkerLogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE";

class WorkerLog {
  level: WorkerLogLevel;
  args: any[];
  constructor(level: WorkerLogLevel, ...args) {
    this.level = level;
    this.args = args;
  }
}

type WorkerMessageType =
  | "progress.start"
  | "progress.stop"
  | "progress.update"
  | "group.open"
  | "group.close"
  | "log"
  | "input.request"
  | "input.received"
  | "title.set";

class WorkerMessage {
  groups: string[];
  type: WorkerMessageType;
  progresses: { [key: string]: WorkerProgress } = {};
  currentProgress: string;
  log: WorkerLog = undefined;
  [key: string]: any;

  constructor(type: WorkerMessageType, workout: WorkerOutput, infos: any = {}) {
    if (workout) {
      this.groups = workout.groups;
      this.type = type;
      this.progresses = workout.progresses;
      this.currentProgress = workout.currentProgress;
    }
    for (let i in infos) {
      this[i] = infos[i];
    }
  }
}

class WorkerOutput extends EventEmitter {
  title: string;
  groups: string[] = [];
  progresses: { [key: string]: WorkerProgress } = {};
  currentProgress: string;

  emitMessage(event: WorkerMessageType, infos: any = {}) {
    this.emit("message", new WorkerMessage(event, this, infos));
  }

  setTitle(title: string) {
    this.emitMessage("title.set", { title });
  }

  startProgress(uid: string, total: number, title: string = undefined) {
    this.currentProgress = uid;
    this.progresses[uid] = new WorkerProgress(uid, total, this.groups, title);
    this.emitMessage("progress.start", { progress: uid });
  }

  incrementProgress(inc = 1, uid: string = undefined) {
    if (!uid) {
      uid = this.currentProgress;
    }
    if (!this.progresses[uid]) {
      throw new Error("Unknown progress");
    }
    this.updateProgress(this.progresses[uid].current + inc, uid);
  }

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
      this.emitMessage("progress.stop", { progress: uid });
      delete this.progresses[uid];
      this.currentProgress = undefined;
    }
  }

  openGroup(name: string = "") {
    this.groups.push(name);
    this.emitMessage("group.open", { group: name });
  }

  closeGroup() {
    let name = this.groups.pop();
    this.emitMessage("group.open", { group: name });
  }

  log(level: WorkerLogLevel, ...args) {
    this.emitMessage("log", { log: new WorkerLog(level, ...args) });
  }

  async requestInput(title: string, regexp: string, waitFor: boolean = true) {
    this.emitMessage("input.request", { input: {} });
  }

  async waitForInput(uuid: string) {}

  returnInput(uuid: string, value: string) {}
}

let output = new WorkerOutput();
new WorkerTerminal(output);
let i = 1;
output.setTitle("Webda Deployer");
output.openGroup("MyGroup");
output.startProgress("transfer1", 100);
output.startProgress("transfer2", 100);
output.startProgress("transfer3", 100);
let interval = setInterval(() => {
  let keys = Object.keys(output.progresses);
  if (!keys || keys.length === 0) {
    clearInterval(interval);
    return;
  }
  output.incrementProgress(Math.random() * 15, output.progresses[keys[Math.floor(Math.random() * keys.length)]].uid);
}, 300);
output.openGroup("Subgroup");
output.closeGroup();
let interval2 = setInterval(() => {
  output.log(<any>WorkerLogLevelEnum[Math.floor(Math.random() * 5)], "This is my log " + i++);
}, 500);
setTimeout(() => output.closeGroup(), 5600);
setTimeout(() => {
  clearInterval(interval);
  clearInterval(interval2);
  rl.close();
}, 90000);
