import { suite, test } from "@webda/test";
import * as assert from "assert";
import { getFileAndLine, WorkerInput, WorkerInputType, WorkerOutput, WorkerProgress } from "./core";

function mapper([msg]) {
  const res = {};

  ["type", "group", "groups", "currentProgress", "progresses", "log", "input", "progress"].forEach(a => {
    if (msg[a] !== undefined) {
      res[a] = msg[a];
    }
  });
  return res;
}

@suite
class WorkerOutputTest {
  output: WorkerOutput;
  calls: any[];
  async beforeEach() {
    this.output = new WorkerOutput();
    this.calls = [];
    this.output.on("message", (...args) => {
      this.calls.push(JSON.parse(JSON.stringify(args)));
    });
  }

  @test
  async testLog() {
    this.output.log("WARN", "Test", "plop");
    assert.deepStrictEqual(this.calls.map(mapper), [
      { type: "log", groups: [], progresses: {}, log: { level: "WARN", args: ["Test", "plop"] } }
    ]);
  }

  @test
  async testLogWithLines() {
    this.output.addLogProducerLine = true;
    this.output.log("WARN", "Test", "plop", 1);
    const ctx = this.calls[0][0].context;
    // When @webda/test update this might change
    assert.ok(ctx.file.endsWith("lib/core.js"));
    // Careful, line number might change
    assert.strictEqual(ctx.line, 239);
    assert.strictEqual(ctx.function, "testExecutor");
    this.output.addLogProducerLine = false;
  }

  @test
  async bunyan() {
    const logger = this.output.getBunyanLogger();
    let err;
    try {
      this.calls[10].plop();
    } catch (err2) {
      err = err2;
      logger.error(err);
    }
    logger.info("Test %s ok", 12);
    logger.warn({ field1: "test" }, "Warn");
    logger.trace({ field1: "test", err }, "trace");
    err.cause = () => new Error("plop");
    logger.debug(err, "debug");
    logger.fatal("fatal");
    assert.deepStrictEqual(this.calls.map(mapper), [
      { type: "log", groups: [], progresses: {}, log: { level: "ERROR", args: [""] } },
      { type: "log", groups: [], progresses: {}, log: { level: "INFO", args: ["Test 12 ok"] } },
      { type: "log", groups: [], progresses: {}, log: { level: "WARN", args: ["Warn"] } },
      { type: "log", groups: [], progresses: {}, log: { level: "TRACE", args: ["trace"] } },
      { type: "log", groups: [], progresses: {}, log: { level: "DEBUG", args: ["debug"] } },
      { type: "log", groups: [], progresses: {}, log: { level: "ERROR", args: ["fatal"] } }
    ]);
    assert.strictEqual(logger.fatal(), true);
    assert.strictEqual(logger.trace(), true);
  }

  @test
  async testValidator() {
    const input = new WorkerInput("myId", "title");
    assert.ok(input.validate("test"));
    input.validators = [new RegExp(/nop/), new RegExp(/n.*/)];
    assert.ok(input.validate("net"));
    assert.ok(!input.validate("let"));
  }

  @test
  async testGroup() {
    this.output.openGroup("Group1");
    this.output.log("WARN", "Test", "plop");
    this.output.openGroup("Group2");
    this.output.log("WARN", "Test", "plop");
    this.output.closeGroup();
    this.output.log("WARN", "Test", "plop");
    this.output.closeGroup();
    this.output.closeGroup();
    assert.deepStrictEqual(this.calls.map(mapper), [
      { type: "group.open", group: "Group1", groups: ["Group1"], progresses: {} },
      { type: "log", groups: ["Group1"], progresses: {}, log: { level: "WARN", args: ["Test", "plop"] } },
      { type: "group.open", group: "Group2", groups: ["Group1", "Group2"], progresses: {} },
      { type: "log", groups: ["Group1", "Group2"], progresses: {}, log: { level: "WARN", args: ["Test", "plop"] } },
      { type: "group.close", group: "Group2", groups: ["Group1"], progresses: {} },
      { type: "log", groups: ["Group1"], progresses: {}, log: { level: "WARN", args: ["Test", "plop"] } },
      { type: "group.close", group: "Group1", groups: [], progresses: {} }
    ]);
  }

  @test
  async testProgress() {
    this.output.startProgress("plop", 50, "Plop");
    this.output.updateProgress(10);
    this.output.log("WARN", "Test", "plop");
    this.output.openGroup("group1");
    this.output.startProgress("plop2", 50, "Plop");
    this.output.updateProgress(20);
    this.output.log("WARN", "Test", "plop");
    this.output.closeGroup();
    this.output.updateProgress(30, "plop");
    this.output.updateProgress(50, "plop");
    this.output.log("WARN", "Test", "plop");
    this.output.incrementProgress(15);
    this.output.incrementProgress(15, "plop2");
    assert.throws(() => this.output.incrementProgress(1, "nope"), /Unknown progress/g);
    assert.throws(() => this.output.updateProgress(1, "nope"), /Unknown progress/g);
    assert.deepStrictEqual(this.calls.map(mapper), [
      {
        type: "progress.start",
        groups: [],
        currentProgress: "plop",
        progresses: { plop: { groups: [], current: 0, running: true, uid: "plop", total: 50, title: "Plop" } },
        progress: "plop"
      },
      {
        type: "progress.update",
        groups: [],
        currentProgress: "plop",
        progresses: { plop: { groups: [], current: 10, running: true, uid: "plop", total: 50, title: "Plop" } },
        progress: "plop"
      },
      {
        type: "log",
        groups: [],
        currentProgress: "plop",
        progresses: { plop: { groups: [], current: 10, running: true, uid: "plop", total: 50, title: "Plop" } },
        log: { level: "WARN", args: ["Test", "plop"] }
      },
      {
        type: "group.open",
        group: "group1",
        groups: ["group1"],
        currentProgress: "plop",
        progresses: { plop: { groups: [], current: 10, running: true, uid: "plop", total: 50, title: "Plop" } }
      },
      {
        type: "progress.start",
        groups: ["group1"],
        currentProgress: "plop2",
        progresses: {
          plop: { groups: [], current: 10, running: true, uid: "plop", total: 50, title: "Plop" },
          plop2: { groups: ["group1"], current: 0, running: true, uid: "plop2", total: 50, title: "Plop" }
        },
        progress: "plop2"
      },
      {
        type: "progress.update",
        groups: ["group1"],
        currentProgress: "plop2",
        progresses: {
          plop: { groups: [], current: 10, running: true, uid: "plop", total: 50, title: "Plop" },
          plop2: { groups: ["group1"], current: 20, running: true, uid: "plop2", total: 50, title: "Plop" }
        },
        progress: "plop2"
      },
      {
        type: "log",
        groups: ["group1"],
        currentProgress: "plop2",
        progresses: {
          plop: { groups: [], current: 10, running: true, uid: "plop", total: 50, title: "Plop" },
          plop2: { groups: ["group1"], current: 20, running: true, uid: "plop2", total: 50, title: "Plop" }
        },
        log: { level: "WARN", args: ["Test", "plop"] }
      },
      {
        type: "group.close",
        group: "group1",
        groups: [],
        currentProgress: "plop2",
        progresses: {
          plop: { groups: [], current: 10, running: true, uid: "plop", total: 50, title: "Plop" },
          plop2: { groups: ["group1"], current: 20, running: true, uid: "plop2", total: 50, title: "Plop" }
        }
      },
      {
        type: "progress.update",
        groups: [],
        currentProgress: "plop2",
        progresses: {
          plop: { groups: [], current: 30, running: true, uid: "plop", total: 50, title: "Plop" },
          plop2: { groups: ["group1"], current: 20, running: true, uid: "plop2", total: 50, title: "Plop" }
        },
        progress: "plop"
      },
      {
        type: "progress.stop",
        groups: [],
        currentProgress: "plop2",
        progresses: {
          plop2: { groups: ["group1"], current: 20, running: true, uid: "plop2", total: 50, title: "Plop" }
        },
        progress: "plop"
      },
      {
        type: "log",
        groups: [],
        currentProgress: "plop2",
        progresses: {
          plop2: { groups: ["group1"], current: 20, running: true, uid: "plop2", total: 50, title: "Plop" }
        },
        log: { level: "WARN", args: ["Test", "plop"] }
      },
      {
        type: "progress.update",
        groups: [],
        currentProgress: "plop2",
        progresses: {
          plop2: { groups: ["group1"], current: 35, running: true, uid: "plop2", total: 50, title: "Plop" }
        },
        progress: "plop2"
      },
      {
        type: "progress.stop",
        groups: [],
        progresses: {},
        progress: "plop2"
      }
    ]);
  }

  @test
  testCOV() {
    // Setters
    this.output.setTitle("test");
    this.output.setInteractive(true);
    const ratio = new WorkerProgress("yop", 100, []);
    ratio.incrementProgress(10);
    assert.strictEqual(ratio.getRatio(), 0.1);
    ratio.incrementProgress(40);
    assert.strictEqual(ratio.getRatio(), 0.5);
    assert.deepStrictEqual(this.calls.map(mapper), [{ type: "title.set", groups: [], progresses: {} }]);
  }

  @test
  async testInputs() {
    await assert.rejects(
      () => this.output.requestInput("My Question", WorkerInputType.STRING, ["\\d+"], false, 20),
      /No interactive session registered/g
    );
    await assert.rejects(() => this.output.waitForInput("plop"), /No interactive session registered/g);
    this.output.setInteractive(true);
    await assert.rejects(() => this.output.waitForInput("plop"), /Unknown input/g);
    await assert.throws(() => this.output.returnInput("plop", "value"), /Unknown input/g);
    await assert.rejects(
      async () => this.output.requestInput("My Question", WorkerInputType.STRING, ["\\d+"], true, 20),
      /Request input timeout/g
    );
    const input = await this.output.requestInput("My Question", WorkerInputType.STRING, ["\\d+"], false, 200);
    const ok = this.output.waitForInput(input);
    this.output.returnInput(input, "test");
    assert.strictEqual(await ok, "test");
    const events = [
      {
        type: "input.request",
        groups: [],
        progresses: {},
        input: { uuid: "8341a002-c5b6-4290-8064-779eac138661", title: "My Question", type: 0, validators: ["^\\d+$"] }
      },
      {
        type: "input.timeout",
        groups: [],
        progresses: {},
        input: { uuid: "8341a002-c5b6-4290-8064-779eac138661", title: "My Question", type: 0, validators: ["^\\d+$"] }
      },
      {
        type: "input.request",
        groups: [],
        progresses: {},
        input: { uuid: "e682dfb5-3a87-432f-83b9-c660bcf02fa1", title: "My Question", type: 0, validators: ["^\\d+$"] }
      },
      {
        type: "input.received",
        groups: [],
        progresses: {},
        input: { uuid: "e682dfb5-3a87-432f-83b9-c660bcf02fa1", title: "My Question", type: 0, validators: ["^\\d+$"] }
      }
    ];
    events.forEach(e => delete e.input.uuid);
    const received: any[] = this.calls.map(mapper);
    received.forEach(e => delete e.input.uuid);
    assert.deepStrictEqual(received, events);

    // Test default not super valuable
    let value = "";
    this.output.waitForInput = async uuid => {
      value = uuid;
      return value;
    };
    const testDefault = await this.output.requestInput("My Question");
    assert.strictEqual(await testDefault, value);
  }
}
