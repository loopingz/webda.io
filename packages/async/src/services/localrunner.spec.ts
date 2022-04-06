import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "@webda/core/lib/test";
import LocalRunner from "./localrunner";
import { Runner } from "./runner";
import models, { AsyncAction } from "../models";
import { Store } from "@webda/core";
import { stub } from "sinon";
import * as child_process from "child_process";
import * as EventEmitter from "events";
import { nextTick } from "process";

class FakeRunner extends Runner {
  launchAction(action: models): Promise<any> {
    throw new Error("Method not implemented.");
  }
}

class FakeChildProcess extends EventEmitter {
  pid: number = 666;
  stdout: EventEmitter = new EventEmitter();
  stderr: EventEmitter = new EventEmitter();

  send(type: string, ...args: any[]) {
    this.emit(type, ...args);
  }
}

@suite
class LocalRunnerTest extends WebdaTest {
  @test
  cov() {
    new LocalRunner(this.webda, "runner", {});
    let runner = new LocalRunner(this.webda, "runner", { actions: ["plop"], options: { env: { OK: "test" } } });
    assert.strictEqual(runner.handleType("plop"), true);
    assert.strictEqual(runner.handleType("plop2"), false);
    new LocalRunner(this.webda, "runner", { options: { env: { OK: "test" } } });
    // Just for loadParameters
    new FakeRunner(this.webda, "fake", {});
  }

  getJobInfo(action: AsyncAction) {
    return {
      JOB_HOOK: "",
      JOB_ID: action.getUuid(),
      JOB_ORCHESTRATOR: "test",
      JOB_SECRET_KEY: action.__secretKey
    };
  }

  @test
  async launchAction() {
    // @ts-expect-error
    const spawn = stub(child_process, "spawn").returns({ pid: "fake" });
    try {
      const runner = new LocalRunner(this.webda, "runner", {});
      const action = await this.getService<Store<AsyncAction>>("AsyncJobs").save({ status: "STARTING", logs: [] });

      let job = await runner.launchAction(action, this.getJobInfo(action));

      assert.strictEqual(spawn.calledOnce, true);
      assert.strictEqual(job.pid, "fake");
      await action.refresh();
      assert.strictEqual(action.status, "STARTING");
    } finally {
      spawn.restore();
    }
  }

  @test
  async launchActionAutoStatus() {
    const child = new FakeChildProcess();
    // @ts-expect-error
    const spawn = stub(child_process, "spawn").returns(child);
    try {
      const runner = new LocalRunner(this.webda, "runner", { autoStatus: true });
      const action = await this.getService<Store<AsyncAction>>("AsyncJobs").save({ status: "STARTING", logs: [] });

      let job = await runner.launchAction(action, this.getJobInfo(action));

      assert.strictEqual(spawn.calledOnce, true);
      assert.strictEqual(job.pid, 666);

      await action.refresh();
      assert.strictEqual(action.status, "RUNNING");
      assert.deepStrictEqual(action.logs, []);
      child.stdout.emit("data", "stdout output");
      child.stderr.emit("data", "stderr output");
      await new Promise(resolve => nextTick(resolve));
      await this.sleep(1000);
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
