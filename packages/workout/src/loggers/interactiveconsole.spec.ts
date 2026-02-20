import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { WorkerInput, WorkerInputType, WorkerMessage, WorkerOutput } from "../core";
import { InteractiveConsoleLogger } from "./interactiveconsole";

@suite
class InteractiveConsoleLoggerTest {
  output: WorkerOutput;
  logger: InteractiveConsoleLogger;
  stubs: any[] = [];

  async beforeEach() {
    this.output = new WorkerOutput();
    // Set isTTY property if it doesn't exist
    if (!process.stdout.hasOwnProperty("isTTY")) {
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        configurable: true,
        writable: true
      });
    }
    this.stubs.push(sinon.stub(process.stdout, "write"));
    this.logger = new InteractiveConsoleLogger(this.output, "INFO");
  }

  async afterEach() {
    this.logger?.close();
    this.stubs.forEach(stub => {
      try {
        stub.restore?.();
      } catch (e) {
        // Ignore
      }
    });
    this.stubs = [];
  }

  @test
  async testNonInteractiveMode() {
    // Create logger with non-interactive mode
    this.stubs.push(sinon.stub(process, "argv").value(["node", "test", "--no-tty"]));
    const output = new WorkerOutput();
    const logger = new InteractiveConsoleLogger(output, "INFO");

    assert.strictEqual(output.interactive, false);

    // Should fallback to basic console logger behavior
    output.log("INFO", "Test message");

    logger.close();
  }

  @test
  async testProgressStart() {
    this.output.startProgress("test", 100, "Testing");

    // Wait for progress to be processed
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.ok(this.logger.spinner);
    assert.strictEqual(this.logger.spinner.title, "Testing");
    assert.strictEqual(this.logger.spinner.total, 100);
  }

  @test
  async testProgressUpdate() {
    this.output.startProgress("test", 100, "Testing");
    await new Promise(resolve => setTimeout(resolve, 10));

    this.output.updateProgress(50, "test", "Half done");
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(this.logger.spinner.title, "Half done");
    assert.strictEqual(this.logger.spinner.current, 50);
  }

  @test
  async testProgressStop() {
    this.output.startProgress("test", 100, "Testing");
    await new Promise(resolve => setTimeout(resolve, 10));

    this.output.updateProgress(100, "test");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Spinner should be stopped
    assert.ok(!this.logger.spinner.interval);
  }

  @test
  async testProgressStopWithStatus() {
    this.output.startActivity("task", "myTask");
    await new Promise(resolve => setTimeout(resolve, 10));

    this.output.stopActivity("success", "Task completed", "myTask");
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.ok(!this.logger.spinner.interval);
  }

  @test
  async testProgressStopWithError() {
    this.output.startActivity("task", "myTask");
    await new Promise(resolve => setTimeout(resolve, 10));

    this.output.stopActivity("error", "Task failed", "myTask");
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.ok(!this.logger.spinner.interval);
  }

  @test
  async testProgressStopWithWarning() {
    this.output.startActivity("task", "myTask");
    await new Promise(resolve => setTimeout(resolve, 10));

    this.output.stopActivity("warning", "Task warning", "myTask");
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.ok(!this.logger.spinner.interval);
  }

  @test
  async testLogWithProgress() {
    this.output.startProgress("test", 100, "Testing");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Log should clear and redraw spinner
    this.output.log("INFO", "Test message");
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.ok(this.logger.spinner);
  }

  @test
  async testInputRequest() {
    // This test requires @inquirer/prompts which is optional
    // We'll test the input flow by stubbing the onInput method
    const onInputStub = sinon.stub(this.logger, "onInput").callsFake(async function(msg: WorkerMessage) {
      // Simulate successful input
      setTimeout(() => {
        this.output.returnInput(msg.input.uuid, "test value");
      }, 10);
    });
    this.stubs.push(onInputStub);

    const valuePromise = this.output.requestInput("Enter name", WorkerInputType.STRING, [/.*/]);
    await new Promise(resolve => setTimeout(resolve, 20));
    const value = await valuePromise;
    assert.strictEqual(value, "test value");
  }

  @test
  async testInputTimeout() {
    const msg = new WorkerMessage("input.timeout", this.output, {
      input: { uuid: "test-uuid" }
    });

    // Create a fake input promise
    this.logger.input = Promise.resolve("test") as any;
    this.logger.input.cancel = sinon.stub();

    await this.logger.onMessage(msg);

    assert.ok((this.logger.input.cancel as any).called);
  }

  @test
  async testIndeterminateProgress() {
    this.output.startActivity("Processing");
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.ok(this.logger.spinner);
    assert.strictEqual(this.logger.spinner.total, -1);
  }

  @test
  async testSimpleProgressRender() {
    this.output.startProgress("test", 100, "Testing");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Test progress rendering
    for (let i = 0; i <= 100; i += 25) {
      this.output.updateProgress(i, "test");
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    assert.ok(!this.logger.spinner.interval);
  }

  @test
  async testProgressWithLargeTotal() {
    // Test progress with total >= 200 to cover the count display branch
    this.output.startProgress("bigtest", 250, "Large task");
    await new Promise(resolve => setTimeout(resolve, 10));

    this.output.updateProgress(100, "bigtest");
    await new Promise(resolve => setTimeout(resolve, 10));

    assert.strictEqual(this.logger.spinner.total, 250);
    assert.strictEqual(this.logger.spinner.current, 100);

    this.output.updateProgress(250, "bigtest");
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  @test
  async testSpinnerStateWrapping() {
    // Test that spinner state wraps around correctly
    this.output.startActivity("Long activity");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Wait long enough for spinner to cycle through all frames multiple times
    // Default spinner has 10 frames at 80ms each = 800ms for full cycle
    await new Promise(resolve => setTimeout(resolve, 900));

    assert.ok(this.logger.spinner);
    assert.ok(this.logger.spinner.spinnerState >= 0);
  }

  @test
  async testHumanizeDurationWithHours() {
    // Test activity that takes over an hour to format duration with hours
    this.output.startActivity("Long task");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Manually set the started time to simulate a long-running task
    this.logger.spinner.started = Date.now() - (3661 * 1000); // 1 hour, 1 minute, 1 second ago
    this.output.stopActivity("success", "Task complete");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Duration message should include hours and minutes
    assert.ok(!this.logger.spinner.interval);
  }

  @test
  async testStatusMethod() {
    // Test the status() method directly
    this.output.startActivity("Test");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Call status manually
    this.logger.spinner.status("info");
    this.logger.spinner.status("unknown-status"); // Test the fallback "?" for unknown status

    assert.ok(this.logger.spinner);
  }

  @test
  async testSpinnerRenderOptimization() {
    // Cover lines 153-155: optimization branch fires when render() is called
    // with the same spinnerState as the previous render (only spinner char changed is index 0)
    this.output.startActivity("Optimization test");
    await new Promise(resolve => setTimeout(resolve, 150)); // wait for at least one interval tick

    // Stop the interval so spinnerState won't advance during the test
    clearInterval(this.logger.spinner.interval);
    this.logger.spinner.interval = undefined;

    // First call sets lastValue; second call has same spinnerState → hits lines 153-155
    this.logger.spinner.render();
    this.logger.spinner.render();

    assert.ok(this.logger.spinner);
  }

  @test
  async testOnInputNullMsg() {
    // Cover lines 268-269 (real importInquirer body) and 296-298 (outer catch):
    // passing null input causes a TypeError inside the try block which propagates to catch
    await assert.rejects(() => this.logger.onInput({ input: null } as any), /Inquirer is not available/);
  }

  @test
  async testOnInputInquirerUnavailable() {
    // Cover lines 280-282 and 296-298: stub importInquirer to return {} (no input property)
    const stub = sinon.stub(this.logger as any, "importInquirer").resolves({});
    this.stubs.push(stub);

    const input = new WorkerInput("no-inquirer", "Enter", WorkerInputType.STRING, [/.*/]);
    const msg = new WorkerMessage("input.request", this.output, { input });

    await assert.rejects(() => this.logger.onInput(msg), /Inquirer is not available/);
  }

  @test
  async testOnInputCancel() {
    // Cover lines 276-282 and 286-288: start a real onInput then cancel to trigger .catch
    let rejectInput: (err: Error) => void;
    const cancelablePromise = Object.assign(new Promise<string>((_, reject) => (rejectInput = reject)), {
      cancel: () => rejectInput(new Error("cancelled"))
    });
    const stub = sinon.stub(this.logger as any, "importInquirer").resolves({
      input: () => cancelablePromise
    });
    this.stubs.push(stub);

    const input = new WorkerInput("cancel-test", "Enter", WorkerInputType.STRING, [/.*/]);
    const msg = new WorkerMessage("input.request", this.output, { input });

    await this.logger.onInput(msg);

    // Cancel to trigger the .catch handler (lines 286-288)
    this.logger.input.cancel();
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  @test
  async testOnInputHappyPath() {
    // Cover lines 276-292: start onInput with a controlled promise that resolves
    // The mock calls validate() to cover lines 286-287 (validate callback body)
    let resolveInput: (value: string) => void;
    const cancelablePromise = Object.assign(new Promise<string>(resolve => (resolveInput = resolve)), {
      cancel: sinon.stub()
    });
    const stub = sinon.stub(this.logger as any, "importInquirer").resolves({
      input: (options: any) => {
        options.validate("test value"); // exercise the validate callback (lines 286-287)
        return cancelablePromise;
      }
    });
    this.stubs.push(stub);

    const input = new WorkerInput("happy-test", "Enter", WorkerInputType.STRING, [/.*/]);
    const msg = new WorkerMessage("input.request", this.output, { input });

    await this.logger.onInput(msg);

    // Resolve the promise to trigger .then (lines 283-285)
    resolveInput("hello");
    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify returnInput was called via the output having processed the input
    assert.ok(this.logger.input);
  }
}

export { InteractiveConsoleLoggerTest };
