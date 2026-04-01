import { describe, it, beforeEach, afterEach } from "vitest";
import * as assert from "assert";
import * as sinon from "sinon";
import { WorkerInput, WorkerInputType, WorkerMessage, WorkerOutput } from "../core.js";
import { InteractiveConsoleLogger } from "./interactiveconsole.js";

describe("InteractiveConsoleLoggerTest", () => {
  let output: WorkerOutput;
  let logger: InteractiveConsoleLogger;
  let stubs: any[] = [];

  beforeEach(async () => {
    output = new WorkerOutput();
    // Set isTTY property if it doesn't exist
    if (!process.stdout.hasOwnProperty("isTTY")) {
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        configurable: true,
        writable: true
      });
    }
    stubs.push(sinon.stub(process.stdout, "write"));
    logger = new InteractiveConsoleLogger(output, "INFO");
  });

  afterEach(async () => {
    logger?.close();
    stubs.forEach(stub => {
      try {
        stub.restore?.();
      } catch (e) {
        // Ignore
      }
    });
    stubs = [];
  });

  it("testNonInteractiveMode", async () => {
    // Create logger with non-interactive mode
    stubs.push(sinon.stub(process, "argv").value(["node", "test", "--no-tty"]));
    const out = new WorkerOutput();
    const lgr = new InteractiveConsoleLogger(out, "INFO");

    assert.strictEqual(out.interactive, false);

    // Should fallback to basic console logger behavior
    out.log("INFO", "Test message");

    lgr.close();
  });

  it("testProgressStart", async () => {
    output.startProgress("test", 100, "Testing");

    // Wait for progress to be processed
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.ok(logger.spinner);
    assert.strictEqual(logger.spinner.title, "Testing");
    assert.strictEqual(logger.spinner.total, 100);
  });

  it("testProgressUpdate", async () => {
    output.startProgress("test", 100, "Testing");
    await new Promise(resolve => setTimeout(resolve, 10));

    output.updateProgress(50, "test", "Half done");
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(logger.spinner.title, "Half done");
    assert.strictEqual(logger.spinner.current, 50);
  });

  it("testProgressStop", async () => {
    output.startProgress("test", 100, "Testing");
    await new Promise(resolve => setTimeout(resolve, 10));

    output.updateProgress(100, "test");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Spinner should be stopped
    assert.ok(!logger.spinner.interval);
  });

  it("testProgressStopWithStatus", async () => {
    output.startActivity("task", "myTask");
    await new Promise(resolve => setTimeout(resolve, 10));

    output.stopActivity("success", "Task completed", "myTask");
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.ok(!logger.spinner.interval);
  });

  it("testProgressStopWithError", async () => {
    output.startActivity("task", "myTask");
    await new Promise(resolve => setTimeout(resolve, 10));

    output.stopActivity("error", "Task failed", "myTask");
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.ok(!logger.spinner.interval);
  });

  it("testProgressStopWithWarning", async () => {
    output.startActivity("task", "myTask");
    await new Promise(resolve => setTimeout(resolve, 10));

    output.stopActivity("warning", "Task warning", "myTask");
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.ok(!logger.spinner.interval);
  });

  it("testLogWithProgress", async () => {
    output.startProgress("test", 100, "Testing");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Log should clear and redraw spinner
    output.log("INFO", "Test message");
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.ok(logger.spinner);
  });

  it("testInputRequest", async () => {
    // This test requires @inquirer/prompts which is optional
    // We'll test the input flow by stubbing the onInput method
    const onInputStub = sinon.stub(logger, "onInput").callsFake(async function (msg: WorkerMessage) {
      // Simulate successful input
      setTimeout(() => {
        this.output.returnInput(msg.input.uuid, "test value");
      }, 10);
    });
    stubs.push(onInputStub);

    const valuePromise = output.requestInput("Enter name", WorkerInputType.STRING, [/.*/]);
    await new Promise(resolve => setTimeout(resolve, 20));
    const value = await valuePromise;
    assert.strictEqual(value, "test value");
  });

  it("testInputTimeout", async () => {
    const msg = new WorkerMessage("input.timeout", output, {
      input: { uuid: "test-uuid" }
    });

    // Create a fake input promise
    logger.input = Promise.resolve("test") as any;
    logger.input.cancel = sinon.stub();

    await logger.onMessage(msg);

    assert.ok((logger.input.cancel as any).called);
  });

  it("testIndeterminateProgress", async () => {
    output.startActivity("Processing");
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.ok(logger.spinner);
    assert.strictEqual(logger.spinner.total, -1);
  });

  it("testSimpleProgressRender", async () => {
    output.startProgress("test", 100, "Testing");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Test progress rendering
    for (let i = 0; i <= 100; i += 25) {
      output.updateProgress(i, "test");
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    assert.ok(!logger.spinner.interval);
  });

  it("testProgressWithLargeTotal", async () => {
    // Test progress with total >= 200 to cover the count display branch
    output.startProgress("bigtest", 250, "Large task");
    await new Promise(resolve => setTimeout(resolve, 10));

    output.updateProgress(100, "bigtest");
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(logger.spinner.total, 250);
    assert.strictEqual(logger.spinner.current, 100);

    output.updateProgress(250, "bigtest");
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  it("testSpinnerStateWrapping", async () => {
    // Test that spinner state wraps around correctly
    output.startActivity("Long activity");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Wait long enough for spinner to cycle through all frames multiple times
    // Default spinner has 10 frames at 80ms each = 800ms for full cycle
    await new Promise(resolve => setTimeout(resolve, 900));

    assert.ok(logger.spinner);
    assert.ok(logger.spinner.spinnerState >= 0);
  });

  it("testHumanizeDurationWithHours", async () => {
    // Test activity that takes over an hour to format duration with hours
    output.startActivity("Long task");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Manually set the started time to simulate a long-running task
    logger.spinner.started = Date.now() - 3661 * 1000; // 1 hour, 1 minute, 1 second ago
    output.stopActivity("success", "Task complete");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Duration message should include hours and minutes
    assert.ok(!logger.spinner.interval);
  });

  it("testStatusMethod", async () => {
    // Test the status() method directly
    output.startActivity("Test");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Call status manually
    logger.spinner.status("info");
    logger.spinner.status("unknown-status"); // Test the fallback "?" for unknown status

    assert.ok(logger.spinner);
  });

  it("testSpinnerRenderOptimization", async () => {
    // Cover lines 153-155: optimization branch fires when render() is called
    // with the same spinnerState as the previous render (only spinner char changed is index 0)
    output.startActivity("Optimization test");
    await new Promise(resolve => setTimeout(resolve, 150)); // wait for at least one interval tick

    // Stop the interval so spinnerState won't advance during the test
    clearInterval(logger.spinner.interval);
    logger.spinner.interval = undefined;

    // First call sets lastValue; second call has same spinnerState → hits lines 153-155
    logger.spinner.render();
    logger.spinner.render();

    assert.ok(logger.spinner);
  });

  it("testOnInputNullMsg", async () => {
    // Cover lines 268-269 (real importInquirer body) and 296-298 (outer catch):
    // passing null input causes a TypeError inside the try block which propagates to catch
    await assert.rejects(() => logger.onInput({ input: null } as any), /Inquirer is not available/);
  });

  it("testOnInputInquirerUnavailable", async () => {
    // Cover lines 280-282 and 296-298: stub importInquirer to return {} (no input property)
    const stub = sinon.stub(logger as any, "importInquirer").resolves({});
    stubs.push(stub);

    const input = new WorkerInput("no-inquirer", "Enter", WorkerInputType.STRING, [/.*/]);
    const msg = new WorkerMessage("input.request", output, { input });

    await assert.rejects(() => logger.onInput(msg), /Inquirer is not available/);
  });

  it("testOnInputCancel", async () => {
    // Cover lines 276-282 and 286-288: start a real onInput then cancel to trigger .catch
    let rejectInput: (err: Error) => void;
    const cancelablePromise = Object.assign(new Promise<string>((_, reject) => (rejectInput = reject)), {
      cancel: () => rejectInput(new Error("cancelled"))
    });
    const stub = sinon.stub(logger as any, "importInquirer").resolves({
      input: () => cancelablePromise
    });
    stubs.push(stub);

    const input = new WorkerInput("cancel-test", "Enter", WorkerInputType.STRING, [/.*/]);
    const msg = new WorkerMessage("input.request", output, { input });

    await logger.onInput(msg);

    // Cancel to trigger the .catch handler (lines 286-288)
    logger.input.cancel();
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  it("testOnInputHappyPath", async () => {
    // Cover lines 276-292: start onInput with a controlled promise that resolves
    // The mock calls validate() to cover lines 286-287 (validate callback body)
    let resolveInput: (value: string) => void;
    const cancelablePromise = Object.assign(new Promise<string>(resolve => (resolveInput = resolve)), {
      cancel: sinon.stub()
    });
    const stub = sinon.stub(logger as any, "importInquirer").resolves({
      input: (options: any) => {
        options.validate("test value"); // exercise the validate callback (lines 286-287)
        return cancelablePromise;
      }
    });
    stubs.push(stub);

    const input = new WorkerInput("happy-test", "Enter", WorkerInputType.STRING, [/.*/]);
    const msg = new WorkerMessage("input.request", output, { input });

    await logger.onInput(msg);

    // Resolve the promise to trigger .then (lines 283-285)
    resolveInput("hello");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify returnInput was called via the output having processed the input
    assert.ok(logger.input);
  });
});
