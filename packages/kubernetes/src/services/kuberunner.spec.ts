import { suite, test } from "@webda/test";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import * as assert from "assert";
import { vi } from "vitest";
import { AsyncAction } from "@webda/async";
import { FAKE_KUBECONFIG } from "../../test/fixture.js";
import { KubeRunner, KubeRunnerParameters } from "./kuberunner.service.js";

@suite
class KubeRunnerTest extends WebdaApplicationTest {
  /**
   * Create a resolved KubeRunner on a fake cluster
   * @param params - the runner parameters
   * @returns the runner
   */
  newRunner(params: any): KubeRunner {
    return new KubeRunner("runner", new KubeRunnerParameters().load({ config: FAKE_KUBECONFIG, ...params })).resolve();
  }

  @test
  cov() {
    assert.throws(() => new KubeRunnerParameters().load({}), /Either jobImage or jobResources need/);
  }

  @test
  loadResource() {
    const runner = this.newRunner({ jobResources: "./test/resource-fake.yml" });
    assert.deepStrictEqual(runner.getParameters().jobResources, { fake: true });
  }

  getJobInfo() {
    return {
      JOB_HOOK: "hook",
      JOB_ID: "uuid",
      JOB_ORCHESTRATOR: "test",
      JOB_SECRET_KEY: "mykey"
    };
  }

  @test
  async launchAction() {
    const runner = this.newRunner({ jobImage: "webda.io/runner" });
    const kube = vi.spyOn(runner.client, "create").mockResolvedValue(<any>{
      spec: true,
      metadata: "fake",
      apiVersion: "1.0",
      kind: "Job"
    });
    const action = new AsyncAction({ uuid: "uuid" });
    let result = await runner.launchAction(action, this.getJobInfo());
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
    let job: any = kube.mock.calls[0][0];
    assert.strictEqual(job.metadata.name, "runner-uuid");
    assert.strictEqual(job.spec.template.spec.containers[0].image, "webda.io/runner");
    assert.deepStrictEqual(job.spec.template.spec.containers[0].env, envs);
    kube.mockClear();
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
    result = await runner.launchAction(action, this.getJobInfo());
    job = kube.mock.calls[0][0];
    assert.deepStrictEqual(job.spec.template.spec.containers[0].env, envs);
    assert.deepStrictEqual(job.spec.template.spec.containers[1].env, [
      {
        name: "TEST",
        value: "test"
      },
      ...envs
    ]);
    // COV parts
    for (const jobResources of [{}, { spec: {} }, { spec: { template: {} } }, { spec: { template: { spec: {} } } }]) {
      runner.getParameters().jobResources = jobResources;
      await runner.launchAction(action, this.getJobInfo());
    }
    assert.strictEqual(kube.mock.calls.length, 5);
  }
}
