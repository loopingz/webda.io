import { suite, test } from "@testdeck/mocha";
import * as sinon from "sinon";
import { WorkerLogLevelEnum, WorkerOutput } from "..";
import { Terminal } from "./terminal";
import * as assert from "assert";
import { WorkerInputType } from "@webda/workout";

@suite
class TerminalTest {
  output: WorkerOutput;
  terminal: Terminal;
  stubs: { [key: string]: any } = {};

  before() {
    this.stubs["process.on"] = sinon.stub(process, "on");
    this.stubs["process.stdout.on"] = sinon.stub(process.stdout, "on");
    this.stubs["process.stdout.write"] = sinon.stub(process.stdout, "write");
    this.output = new WorkerOutput();
    // By default will fallback
    this.terminal = new Terminal(this.output, "INFO", "", true);
    this.stubs["clearScreen"] = sinon.stub(this.terminal, "clearScreen");
  }

  after() {
    for (let i in this.stubs) {
      try {
        this.stubs[i].restore();
      } catch (e) {}
    }
  }

  @test
  async testColorDisplayStripping() {
    let str =
      "[[33m WARN[39m] [33mCannot resolve require /datas/git/lib/handlers/batch_idents.js Not a webda application folder or webda.config.json file: ../webda.config.json[39m";
    let res = this.terminal.displayString(str, 40);
    assert.strictEqual(res.endsWith("...[39m"), true);
  }

  @test
  async testFallback() {
    this.terminal = new Terminal(this.output, "INFO", "", false);
  }

  @test
  async testHistory() {
    this.output.log("WARN", "coucou");
    this.output.openGroup("group1");
    this.output.log("WARN", "coucou2");
    this.output.log("TRACE", "coucou3");
    let res = this.terminal.displayHistory(12);
  }

  @test
  testDisplayString() {
    let test = this.terminal.displayString("Test" + "plop" + " " + "yep", 50);
    assert.strictEqual(test.length, 50);
    test = this.terminal.displayString("Test" + "plop".yellow + " " + "yep".blue, 50);
    assert.strictEqual(test.length, 70);
  }

  @test
  async testFooter() {
    let res = this.terminal.displayFooter();
    this.output.setTitle("Plop");
    res = this.terminal.displayFooter();
    this.output.startProgress("progress1", 100);
    res = this.terminal.displayFooter();
    this.output.updateProgress(34);
    this.output.startProgress("progress2", 100);
    res = this.terminal.displayFooter();
  }

  async visu() {
    return new Promise<void>(async resolve => {
      let output = new WorkerOutput();
      let terminal = new Terminal(output);
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
        output.incrementProgress(
          Math.random() * 15,
          output.progresses[keys[Math.floor(Math.random() * keys.length)]].uid
        );
      }, 300);
      output.openGroup("Subgroup");
      output.closeGroup();
      let interval2 = setInterval(() => {
        output.log(<any>WorkerLogLevelEnum[Math.floor(Math.random() * 5)], "This is my log " + i++);
      }, 500);

      await output.requestInput("What is?", WorkerInputType.STRING, ["\\d+"], true);
      setTimeout(() => output.closeGroup(), 5600);
      setTimeout(() => {
        clearInterval(interval);
        clearInterval(interval2);
        resolve();
      }, 90000);
    });
  }

  @test
  title() {
    this.terminal.setTitle();
    assert.strictEqual(this.terminal.title, "");
    this.terminal.setTitle("plop");
    assert.strictEqual(this.terminal.title, "plop");
  }

  @test
  logos() {
    this.terminal.setLogo(undefined);
    assert.deepStrictEqual(this.terminal.getLogo(), []);
    assert.strictEqual(this.terminal.logoWidth, 0);
    this.terminal.setLogo(["ADB".yellow, "B"]);
    assert.strictEqual(this.terminal.logoWidth, 3);
  }

  @test
  position() {
    this.terminal.clearScreen();
    this.terminal.scrollUp(1);
    this.terminal.scrollDown(1);
    this.terminal.scrollUp(-1);
    this.terminal.scrollDown(-1);
  }
}
