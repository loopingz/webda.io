import { suite, test } from "@webda/test";
import * as assert from "assert";
import { EventEmitter } from "node:events";
import { nextTick } from "node:process";
import { stub } from "sinon";
import { AsyncTest } from "../../test/fixture.js";
import { AsyncAction } from "../asyncaction.model.js";
import { LocalRunner, LocalRunnerParameters } from "./localrunner.service.js";
import { Runner, RunnerParameters } from "./runner.service.js";

/**
 * Runner without implementation
 */
class FakeRunner extends Runner {
  /**
   * @returns never
   */
  launchAction(): Promise<any> {
    throw new Error("Method not implemented.");
  }
}

/**
 * Fake child process
 */
class FakeChildProcess extends EventEmitter {
  pid: number = 666;
  stdout: EventEmitter = new EventEmitter();
  stderr: EventEmitter = new EventEmitter();

  send(type: string, ...args: any[]) {
    this.emit(type, ...args);
  }
}

@suite
class LocalRunnerTest extends AsyncTest {
  /**
   * Create a LocalRunner
   * @param params - the parameters
   * @returns the runner
   */
  newRunner(params: any = {}): LocalRunner {
    return new LocalRunner("runner", new LocalRunnerParameters().load(params));
  }

  /**
   * Create a stored action
   * @returns the action
   */
  async newAction(): Promise<AsyncAction> {
    return new AsyncAction({ status: "STARTING", logs: [] }).save();
  }

  @test
  cov() {
    const empty = this.newRunner();
    assert.deepStrictEqual(empty.getParameters().options, { env: {} });
    const runner = this.newRunner({ actions: ["plop"], options: { env: { OK: "test" } } });
    assert.strictEqual(runner.handleType("plop"), true);
    assert.strictEqual(runner.handleType("plop2"), false);
    const fake = new FakeRunner("fake", new RunnerParameters().load({}));
    assert.deepStrictEqual(fake.getParameters().actions, []);
    assert.strictEqual(fake.handleType("plop"), false);
  }

  getJobInfo(action: AsyncAction) {
    return {
      JOB_HOOK: "",
      JOB_ID: action.uuid,
      JOB_ORCHESTRATOR: "test",
      JOB_SECRET_KEY: action.__secretKey
    };
  }

  @test
  async launchAction() {
    const runner = this.newRunner();
    // @ts-expect-error
    const spawn = stub(runner, "spawn").returns({ pid: "fake" });
    try {
      const action = await this.newAction();

      const job = await runner.launchAction(action, this.getJobInfo(action));

      assert.strictEqual(spawn.calledOnce, true);
      assert.strictEqual(job.pid, "fake");
      await action.refresh();
      assert.strictEqual(action.status, "STARTING");
      runner.getParameters().args = ["test"];
      await runner.launchAction(action, this.getJobInfo(action));
    } finally {
      spawn.restore();
    }
  }

  @test
  async launchActionAutoStatus() {
    const child = new FakeChildProcess();
    const runner = this.newRunner({ autoStatus: true });
    // @ts-expect-error
    const spawn = stub(runner, "spawn").returns(child);
    try {
      const action = await this.newAction();

      const job = await runner.launchAction(action, this.getJobInfo(action));

      assert.strictEqual(spawn.calledOnce, true);
      assert.strictEqual(job.pid, 666);

      await action.refresh();
      assert.strictEqual(action.status, "RUNNING");
      assert.deepStrictEqual(action.logs, []);
      child.stdout.emit("data", "stdout output");
      child.stderr.emit("data", "stderr output");
      await new Promise(resolve => nextTick(resolve));
      await this.sleep(10);
      await action.refresh();
      assert.strictEqual(action.status, "RUNNING");
      assert.deepStrictEqual(action.logs, ["stdout output", "stderr output"]);
      child.emit("exit", 1);
      await new Promise(resolve => nextTick(resolve));
      await action.refresh();
      assert.strictEqual(action.status, "ERROR");
      child.emit("exit", 0);
      await new Promise(resolve => nextTick(resolve));
      await action.refresh();
      assert.strictEqual(action.status, "SUCCESS");
    } finally {
      spawn.restore();
    }
  }
}
