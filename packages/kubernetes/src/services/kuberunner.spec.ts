import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "@webda/core/lib/test";
import KubeRunner from "./kuberunner";
import { AsyncAction } from "@webda/async";
import { stub } from "sinon";

@suite
class KubeRunnerTest extends WebdaTest {
  @test
  cov() {
    assert.throws(() => new KubeRunner(this.webda, "runner", {}), /Either jobImage or jobResources need/);
    // COV Only
    KubeRunner.getModda();
  }

  @test
  loadResource() {
    let runner = new KubeRunner(this.webda, "runner", { jobResources: "./test/resource-fake.yml" });
    runner.resolve();

    assert.deepStrictEqual(runner.getParameters().jobResources, { fake: true });
  }

  getJobInfo(action: AsyncAction) {
    return {
      JOB_HOOK: "hook",
      JOB_ID: "uuid",
      JOB_ORCHESTRATOR: "test",
      JOB_SECRET_KEY: "mykey"
    };
  }

  @test
  async launchAction() {
    let runner = new KubeRunner(this.webda, "runner", { jobImage: "webda.io/runner" });
    runner.resolve();
    const kube = stub(runner.client, "create").returns({
      body: {
        spec: true,
        metadata: "fake",
        apiVersion: "1.0",
        kind: "Job"
      }
    });
    const action = new AsyncAction();
    try {
      let result = await runner.launchAction(action, this.getJobInfo(action));
      assert.deepStrictEqual(result, {
        metadata: "fake",
        apiVersion: "1.0",
        kind: "Job"
      });
      const envs = [
        { name: "JOB_HOOK", value: "hook" },
        { name: "JOB_ID", value: "uuid" },
        { name: "JOB_ORCHESTRATOR", value: "test" },
        { name: "JOB_SECRET_KEY", value: "mykey" }
      ];
      assert.deepStrictEqual(kube.getCall(0).args[0].spec.template.spec.containers[0].env, envs);
      kube.resetHistory();
      runner.getParameters().jobResources = {
        spec: {
          template: {
            spec: {
              containers: [
                {},
                {
                  env: [
                    {
                      name: "TEST",
                      value: "test"
                    }
                  ]
                }
              ]
            }
          }
        }
      };
      result = await runner.launchAction(action, this.getJobInfo(action));
      assert.deepStrictEqual(kube.getCall(0).args[0].spec.template.spec.containers[0].env, envs);
      assert.deepStrictEqual(kube.getCall(0).args[0].spec.template.spec.containers[1].env, [
        {
          name: "TEST",
          value: "test"
        },
        ...envs
      ]);
      // COV parts
      runner.getParameters().jobResources = {};
      await runner.launchAction(action, this.getJobInfo(action));
      runner.getParameters().jobResources = { spec: {} };
      await runner.launchAction(action, this.getJobInfo(action));
      runner.getParameters().jobResources = { spec: { template: {} } };
      await runner.launchAction(action, this.getJobInfo(action));
      runner.getParameters().jobResources = { spec: { template: { spec: {} } } };
      await runner.launchAction(action, this.getJobInfo(action));
    } finally {
      kube.restore();
    }
  }
}
