import { describe, it, beforeEach } from "vitest";
import * as assert from "assert";
import { useLog, WorkerInput, WorkerInputType, WorkerOutput, WorkerProgress } from "./core.js";

function mapper([msg]) {
  const res = {};

  ["type", "group", "groups", "currentProgress", "progresses", "log", "input", "progress"].forEach(a => {
    if (msg[a] !== undefined) {
      res[a] = msg[a];
    }
  });
  return res;
}

describe("WorkerOutputTest", () => {
  let output: WorkerOutput;
  let calls: any[];
  beforeEach(async () => {
    output = new WorkerOutput();
    calls = [];
    output.on("message", (...args) => {
      calls.push(JSON.parse(JSON.stringify(args)));
    });
  });

  it("testLog", async () => {
    output.log("WARN", "Test", "plop");
    assert.deepStrictEqual(calls.map(mapper), [
      { type: "log", groups: [], progresses: {}, log: { level: "WARN", args: ["Test", "plop"] } }
    ]);
  });

  it("testLogWithLines", async () => {
    output.addLogProducerLine = true;
    output.log("WARN", "Test", "plop", 1);
    const ctx = calls[0][0].context;
    // Context should have file, line, and function properties
    assert.ok(typeof ctx.file === "string", `Expected file to be a string but got: ${typeof ctx.file}`);
    assert.ok(typeof ctx.line === "number");
    assert.ok(typeof ctx.function === "string");
    output.addLogProducerLine = false;
  });

  it("bunyan", async () => {
    const logger = output.getBunyanLogger();
    let err;
    try {
      calls[10].plop();
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
    assert.deepStrictEqual(calls.map(mapper), [
      { type: "log", groups: [], progresses: {}, log: { level: "ERROR", args: [""] } },
      { type: "log", groups: [], progresses: {}, log: { level: "INFO", args: ["Test 12 ok"] } },
      { type: "log", groups: [], progresses: {}, log: { level: "WARN", args: ["Warn"] } },
      { type: "log", groups: [], progresses: {}, log: { level: "TRACE", args: ["trace"] } },
      { type: "log", groups: [], progresses: {}, log: { level: "DEBUG", args: ["debug"] } },
      { type: "log", groups: [], progresses: {}, log: { level: "ERROR", args: ["fatal"] } }
    ]);
    assert.strictEqual(logger.fatal(), true);
    assert.strictEqual(logger.trace(), true);
  });

  it("testValidator", async () => {
    const input = new WorkerInput("myId", "title");
    assert.ok(input.validate("test"));
    input.validators = [new RegExp(/nop/), new RegExp(/n.*/)];
    assert.ok(input.validate("net"));
    assert.ok(!input.validate("let"));
  });

  it("testGroup", async () => {
    output.openGroup("Group1");
    output.log("WARN", "Test", "plop");
    output.openGroup("Group2");
    output.log("WARN", "Test", "plop");
    output.closeGroup();
    output.log("WARN", "Test", "plop");
    output.closeGroup();
    output.closeGroup();
    assert.deepStrictEqual(calls.map(mapper), [
      { type: "group.open", group: "Group1", groups: ["Group1"], progresses: {} },
      { type: "log", groups: ["Group1"], progresses: {}, log: { level: "WARN", args: ["Test", "plop"] } },
      { type: "group.open", group: "Group2", groups: ["Group1", "Group2"], progresses: {} },
      { type: "log", groups: ["Group1", "Group2"], progresses: {}, log: { level: "WARN", args: ["Test", "plop"] } },
      { type: "group.close", group: "Group2", groups: ["Group1"], progresses: {} },
      { type: "log", groups: ["Group1"], progresses: {}, log: { level: "WARN", args: ["Test", "plop"] } },
      { type: "group.close", group: "Group1", groups: [], progresses: {} }
    ]);
  });

  it("testProgress", async () => {
    output.startProgress("plop", 50, "Plop");
    output.updateProgress(10);
    output.log("WARN", "Test", "plop");
    output.openGroup("group1");
    output.startProgress("plop2", 50, "Plop");
    output.updateProgress(20);
    output.log("WARN", "Test", "plop");
    output.closeGroup();
    output.updateProgress(30, "plop");
    output.updateProgress(50, "plop");
    output.log("WARN", "Test", "plop");
    output.incrementProgress(15);
    output.incrementProgress(15, "plop2");
    assert.throws(() => output.incrementProgress(1, "nope"), /Unknown progress/g);
    assert.throws(() => output.updateProgress(1, "nope"), /Unknown progress/g);
    assert.deepStrictEqual(calls.map(mapper), [
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
  });

  it("testCOV", () => {
    // Setters
    output.setTitle("test");
    output.setInteractive(true);
    const ratio = new WorkerProgress("yop", 100, []);
    ratio.incrementProgress(10);
    assert.strictEqual(ratio.getRatio(), 0.1);
    ratio.incrementProgress(40);
    assert.strictEqual(ratio.getRatio(), 0.5);
    assert.deepStrictEqual(calls.map(mapper), [{ type: "title.set", groups: [], progresses: {} }]);
  });

  it("testInputs", async () => {
    await assert.rejects(
      () => output.requestInput("My Question", WorkerInputType.STRING, ["\\d+"], false, 20),
      /No interactive session registered/g
    );
    await assert.rejects(() => output.waitForInput("plop"), /No interactive session registered/g);
    output.setInteractive(true);
    await assert.rejects(() => output.waitForInput("plop"), /Unknown input/g);
    assert.throws(() => output.returnInput("plop", "value"), /Unknown input/g);
    await assert.rejects(
      async () => output.requestInput("My Question", WorkerInputType.STRING, ["\\d+"], true, 20),
      /Request input timeout/g
    );
    const input = await output.requestInput("My Question", WorkerInputType.STRING, ["\\d+"], false, 200);
    const ok = output.waitForInput(input);
    output.returnInput(input, "test");
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
    const received: any[] = calls.map(mapper);
    received.forEach(e => delete e.input.uuid);
    assert.deepStrictEqual(received, events);

    // Test default not super valuable
    let value = "";
    output.waitForInput = async uuid => {
      value = uuid;
      return value;
    };
    const testDefault = await output.requestInput("My Question");
    assert.strictEqual(await testDefault, value);
  });

  it("testWorkerMessageFromJSON", async () => {
    // Test log message
    const { WorkerMessage } = await import("./core");
    const logMsg = { type: "log", pid: 123, timestamp: Date.now(), log: { level: "INFO", args: ["test"] } };
    const parsed1 = WorkerMessage.fromJSON(JSON.stringify(logMsg));
    assert.strictEqual(parsed1.type, "log");
    assert.strictEqual(parsed1.pid, 123);
    assert.strictEqual(parsed1.log.level, "INFO");
    assert.deepStrictEqual(parsed1.log.args, ["test"]);

    // Test input.request message
    const inputMsg = {
      type: "input.request",
      pid: 123,
      timestamp: Date.now(),
      input: { uuid: "test-uuid", title: "Test", type: 0, validators: ["\\d+"], value: undefined }
    };
    const parsed2 = WorkerMessage.fromJSON(JSON.stringify(inputMsg));
    assert.strictEqual(parsed2.type, "input.request");
    assert.strictEqual(parsed2.input.uuid, "test-uuid");
    assert.ok(parsed2.input.validators[0] instanceof RegExp);

    // Test input.received message
    inputMsg.type = "input.received";
    inputMsg.input.value = "123";
    const parsed3 = WorkerMessage.fromJSON(JSON.stringify(inputMsg));
    assert.strictEqual(parsed3.type, "input.received");
    assert.strictEqual(parsed3.input.value, "123");

    // Test input.timeout message
    inputMsg.type = "input.timeout";
    const parsed4 = WorkerMessage.fromJSON(JSON.stringify(inputMsg));
    assert.strictEqual(parsed4.type, "input.timeout");

    // Test other message type
    const otherMsg = { type: "progress.start", pid: 123, timestamp: Date.now() };
    const parsed5 = WorkerMessage.fromJSON(JSON.stringify(otherMsg));
    assert.strictEqual(parsed5.type, "progress.start");
    assert.strictEqual(parsed5.pid, 123);
  });

  it("testForwardEvent", async () => {
    const output1 = new WorkerOutput();
    const output2 = new WorkerOutput();
    const fwdCalls: any[] = [];

    output2.on("message", msg => fwdCalls.push(msg));

    // Create a message from output1
    const messages: any[] = [];
    output1.on("message", msg => messages.push(msg));
    output1.log("WARN", "Test message");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Forward the event (change PID to simulate remote)
    const remoteMsg = { ...messages[0], pid: 99999 };
    output2.forwardEvent(JSON.stringify(remoteMsg));
    await new Promise(resolve => setTimeout(resolve, 10));

    // Should have forwarded the message
    assert.strictEqual(fwdCalls.length, 1);
    assert.strictEqual(fwdCalls[0].type, "log");

    // Test forwarding from same PID (should be ignored)
    const sameMsg = { ...messages[0], pid: process.pid };
    const beforeCount = fwdCalls.length;
    output2.forwardEvent(JSON.stringify(sameMsg));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.strictEqual(fwdCalls.length, beforeCount); // No new message
  });

  it("testActivityWithStatus", async () => {
    output.startActivity("Processing");
    await new Promise(resolve => setTimeout(resolve, 10));
    output.stopActivity("info", "Processing complete");
    await new Promise(resolve => setTimeout(resolve, 10));

    const events: any[] = calls.map(mapper);
    assert.strictEqual(events[0].type, "progress.start");
    assert.strictEqual(events[events.length - 1].type, "progress.stop");
  });

  it("testProgressUpdateWithTitle", async () => {
    output.startProgress("test", 100);
    output.updateProgress(50, "test", "Half way");

    const events: any[] = calls.map(mapper);
    assert.strictEqual(events[1].progresses.test.title, "Half way");
    assert.strictEqual(events[1].progresses.test.current, 50);
  });

  it("testIncrementProgressWithTitle", async () => {
    output.startProgress("test", 100);
    output.incrementProgress(25, "test", "Quarter done");

    const events: any[] = calls.map(mapper);
    assert.strictEqual(events[1].progresses.test.title, "Quarter done");
    assert.strictEqual(events[1].progresses.test.current, 25);
  });

  it("testUseLog", async () => {
    // moduleOutput is null at this point (no prior test has set it), so ??= creates a new WorkerOutput
    // This covers lines 39-42 in core.ts
    useLog("INFO", "Test useLog message");
  });

  it("testUseLogWithContext", async () => {
    const { useLogWithContext, useWorkerOutput } = await import("./core");
    const out = useWorkerOutput(new WorkerOutput());
    const logCalls: any[] = [];
    out.on("message", msg => logCalls.push(msg));

    useLogWithContext("INFO", { custom: "field" }, "Test message");
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(logCalls.length, 1);
    assert.strictEqual(logCalls[0].type, "log");
    assert.strictEqual(logCalls[0].context.custom, "field");

    // Test with addLogProducerLine
    useLogWithContext("DEBUG", { addLogProducerLine: true }, "Debug message");
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(logCalls.length, 2);
    assert.ok(typeof logCalls[1].context.file === "string");
    assert.ok(typeof logCalls[1].context.line === "number");
  });

  it("testWorkerInputValidatorConversion", async () => {
    // Test string validator conversion
    const input = new WorkerInput("test", "title", WorkerInputType.STRING, ["\\d+", "^test"]);
    assert.ok(input.validators[0] instanceof RegExp);
    assert.ok(input.validators[1] instanceof RegExp);
    assert.strictEqual(input.validators[0].source, "^\\d+$");
    assert.strictEqual(input.validators[1].source, "^test$");
  });

  it("testWorkerInputToJSON", async () => {
    const input = new WorkerInput("test-uuid", "My Question", WorkerInputType.PASSWORD, [/^\d+$/]);
    input.value = "secret";

    const json = input.toJSON();
    assert.strictEqual(json.uuid, "test-uuid");
    assert.strictEqual(json.title, "My Question");
    assert.strictEqual(json.type, WorkerInputType.PASSWORD);
    assert.strictEqual(json.value, "secret");
    assert.strictEqual(json.validators.length, 1);
    assert.strictEqual(typeof json.validators[0], "string");
  });

  it("testWorkerInputToMessage", async () => {
    // Test toMessage() method
    const input = new WorkerInput("test-uuid", "Question", WorkerInputType.STRING, [/.*/]);
    const message = input.toMessage();
    assert.strictEqual(message, input); // toMessage returns itself
  });

  it("testStartActivityOnExistingProgress", async () => {
    // Test startActivity when progress already exists (line 443)
    output.startProgress("activity", 100, "Initial");
    output.startActivity("Updated", "activity");

    const events: any[] = calls.map(mapper);
    // Should update the existing progress, not create a new one
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].type, "progress.update");
    assert.strictEqual(events[1].progresses.activity.title, "Updated");
  });

  it("testForwardEventWithInput", async () => {
    // Test forwardEvent with input (lines 668-669)
    const output2 = new WorkerOutput();
    output2.setInteractive(true);
    const calls2: any[] = [];
    output2.on("message", msg => calls2.push(msg));

    // Create a message with input using toJSON to properly serialize
    const input = new WorkerInput("test-123", "Test", WorkerInputType.STRING, [/.*/]);
    const inputMsg = {
      type: "input.request",
      pid: 99999, // Different PID to ensure it's not filtered
      groups: [],
      progresses: {},
      timestamp: Date.now(),
      input: input.toJSON()
    };

    // Forward it to output2
    output2.forwardEvent(JSON.stringify(inputMsg));

    // The input should be stored
    assert.ok(output2.inputs["test-123"]);
    assert.strictEqual(output2.inputs["test-123"].uuid, "test-123");
  });
});
