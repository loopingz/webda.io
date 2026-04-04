import { describe, it, beforeEach, afterEach } from "vitest";
import * as assert from "assert";
import chalk from "yoctocolors";
import { stdin } from "mock-stdin";
import { nextTick } from "process";
import * as sinon from "sinon";
import { WorkerLogLevelEnum, WorkerOutput, WorkerProgress, WorkerInputType } from "../core.js";
import { Terminal } from "./terminal.js";

// This is needed to trigger stdin within github-actions
const mockStdin = stdin();

describe("TerminalTest", () => {
  let output: WorkerOutput;
  let terminal: Terminal;
  const stubs: { [key: string]: any } = {};

  beforeEach(async () => {
    Terminal.refreshSpeed = 10;
    stubs["process.on"] = sinon.stub(process, "on");
    stubs["process.stdout.on"] = sinon.stub(process.stdout, "on");
    stubs["process.stdout.write"] = sinon.stub(process.stdout, "write");
    output = new WorkerOutput();
    // By default will fallback
    terminal = new Terminal(output, "INFO", "", true);
    stubs["clearScreen"] = sinon.stub(terminal, "clearScreen");
  });

  afterEach(async () => {
    for (const i in stubs) {
      try {
        stubs[i].restore();
      } catch (e) {}
    }
  });

  it("cov", async () => {
    new Terminal(output);
    new Terminal(output, undefined, undefined, false);
    output.setInteractive(true);
    output.log("INFO", "Test");

    terminal.height = 50;
    terminal.width = 100;

    terminal.setLogo(["LOOPZ", "LOOPZ", "LOOPZ", "LOOPZ", "LOOPZ"]);
    terminal.close();
    terminal.close();
    output.addListener("message", terminal.listener);
    terminal.resize();
    terminal.inputValue = "pl";
    terminal.onData("\x7f");
    assert.ok(terminal.inputValue === "p");
    terminal.onData("\u001B\u005B\u0035\u007e");
    terminal.onData("\u001B\u005B\u0036\u007e");
    terminal.onData("\u001B\u005B\u0042");
    terminal.onData("\u001B\u005B\u0041");
    const uuidP = output.requestInput("My Question", undefined, [new RegExp(/\d+/)], true);
    await new Promise(resolve => nextTick(resolve));
    assert.ok(terminal.inputs.length > 0, `Should have one input ${JSON.stringify(output.listeners)}`);
    terminal.onData("\x0d");
    terminal.onData("\x7f");
    terminal.displayFooter();
    terminal.onData("12");

    terminal.onData("\x0d");
    assert.ok((await uuidP) === "12");
    terminal.onData("\x0d");
    output.log("INFO", "Test4");
    terminal.height = 50;
    terminal.width = 100;
    terminal.setLogo([]);
    terminal.displayHistory(10000, false);

    terminal.historySize = 10;
    for (let i = 0; i < 12; i++) {
      terminal.pushHistory("plop");
    }

    assert.ok(terminal.history.length === 10);
    terminal.setTitle("plop".repeat(200));
    terminal.displayTitle();

    terminal.scrollY = 1;
    terminal.scrollUp(10);
    assert.ok(terminal.scrollY === 0);
    terminal.scrollY = -1;
    terminal.scrollDown(10);
    assert.strictEqual(terminal.scrollY, -1);
    terminal.scrollDown(10000);
    assert.strictEqual(terminal.scrollY, -1);

    terminal.width = 30;
    terminal.displayProgress(new WorkerProgress("uu", 100, [], "longtitle".repeat(100)));
  });

  it("progress", async () => {
    output.startProgress("mine", 100, "test");
    output.incrementProgress(10, "mine");
    await new Promise(resolve => setTimeout(resolve, 200));
    terminal.resize();
    output.incrementProgress(100, "mine");
  });

  it("testColorDisplayStripping", async () => {
    const str =
      "\u001b[33m WARN\u001b[39m] \u001b[33mCannot resolve require /datas/git/lib/handlers/batch_idents.js Not a webda application folder or webda.config.json file: ../webda.config.json\u001b[39m";
    const res = terminal.displayString(str, 40);
    assert.strictEqual(res.endsWith("...\u001b[39m"), true);
  });

  it("testFallback", async () => {
    terminal = new Terminal(output, "INFO", "", false);
  });

  it("testHistory", async () => {
    output.log("WARN", "coucou");
    output.openGroup("group1");
    output.log("WARN", "coucou2");
    output.log("TRACE", "coucou3");
    const res = terminal.displayHistory(12);
  });

  it("testDisplayString", () => {
    let test = terminal.displayString("Test" + "plop" + " " + "yep", 50);
    assert.strictEqual(test.length, 50);
    const coloredString = "Test" + chalk.yellow("plop") + " " + chalk.blue("yep");
    test = terminal.displayString(coloredString, 50);
    // The length depends on whether colors are enabled:
    // - Without colors: 50 (just padding)
    // - With yoctocolors: 60 (shorter escape codes than old chalk's 70)
    // Test that it's at least 50 (minimum) and matches the actual colored string length
    assert.ok(test.length >= 50);
    assert.strictEqual(test.length, 50 + coloredString.length - 12); // 12 is visible text length
  });

  it("testFooter", async () => {
    let res = terminal.displayFooter();
    output.setTitle("Plop");
    res = terminal.displayFooter();
    output.startProgress("progress1", 100);
    res = terminal.displayFooter();
    output.updateProgress(34);
    output.startProgress("progress2", 100);
    res = terminal.displayFooter();
  });

  it("title", () => {
    terminal.setTitle();
    assert.strictEqual(terminal.title, "");
    terminal.setTitle("plop");
    assert.strictEqual(terminal.title, "plop");
  });

  it("logos", () => {
    terminal.setLogo(undefined);
    assert.deepStrictEqual(terminal.getLogo(), []);
    assert.strictEqual(terminal.logoWidth, 0);
    terminal.setLogo([chalk.yellow("ADB"), "B"]);
    assert.strictEqual(terminal.logoWidth, 3);
  });

  it("position", () => {
    terminal.clearScreen();
    terminal.scrollUp(1);
    terminal.scrollDown(1);
    terminal.scrollUp(-1);
    terminal.scrollDown(-1);
  });
});
