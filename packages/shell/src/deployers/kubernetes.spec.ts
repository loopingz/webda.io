import { suite, test } from "@testdeck/mocha";
import { YAMLUtils } from "@webda/core";
import * as assert from "assert";
import * as sinon from "sinon";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { DeployerTest } from "./deployertest";
import { Kubernetes, KubernetesObjectToURI } from "./kubernetes";

@suite
class KubernetesDeployerTest extends DeployerTest<Kubernetes> {
  async getDeployer(manager: DeploymentManager) {
    return new Kubernetes(manager, {
      name: "deployer",
      type: "KubernetesDeployer",
      tag: "webda-deployer:test"
    });
  }

  @test
  async addAnnotation() {
    const spec = { metadata: { annotations: {} } };
    this.deployer.addAnnotation(spec);
    assert.strictEqual(Object.keys(spec.metadata.annotations).length, 5);
  }

  @test
  async loadDefaults() {
    await this.deployer.loadDefaults();
    assert.strictEqual(this.deployer.resources.defaultNamespace, "default");
    assert.strictEqual(this.deployer.resources.resourcesFiles.length, 0);
    this.deployer.resources.resourcesFile = "plop.yml";
    await this.deployer.loadDefaults();
    assert.strictEqual(this.deployer.resources.defaultNamespace, "default");
    assert.strictEqual(this.deployer.resources.resourcesFiles.length, 1);
    this.deployer.resources.resourcesFile = "plop.yml";
    await this.deployer.loadDefaults();
    assert.strictEqual(this.deployer.resources.resourcesFiles.length, 1);
  }

  @test
  async completeResource() {
    let resource: any = {};
    assert.strictEqual(this.deployer.completeResource(resource), false);
    resource.kind = "custom";
    assert.strictEqual(this.deployer.completeResource(resource), false);
    resource.metadata = {};
    assert.strictEqual(this.deployer.completeResource(resource), false);
    resource.metadata.name = "plop";
    resource.apiVersion = "v1";
    assert.strictEqual(this.deployer.completeResource(resource), true);

    resource = { kind: "none", metadata: { name: "p" } };
    assert.strictEqual(this.deployer.completeResource(resource), true);
    assert.strictEqual(resource.apiVersion, "v1");
    resource = { kind: "Deployment", metadata: { name: "p", namespace: "x" } };
    assert.strictEqual(this.deployer.completeResource(resource), true);
    assert.strictEqual(resource.apiVersion, "apps/v1");
    assert.strictEqual(KubernetesObjectToURI(resource), "apps/v1/x/deployments/p");
    // @ts-ignore
    assert.strictEqual(KubernetesObjectToURI({ kind: "PLOP", metadata: { name: "a" } }), "v1/default/plops/a");
  }

  @test
  async deploy() {
    let patchError = false;
    let completeStub;
    await this.deployer.loadDefaults();
    this.deployer.resources.resourcesFiles = ["plop.te"];
    await assert.rejects(() => this.deployer.deploy(), /f/);
    this.deployer.resources.resourcesFiles = ["plop.json"];
    await assert.rejects(() => this.deployer.deploy(), /f/);
    this.deployer.resources.resourcesFiles = ["./test/myres.yml", "./test/myotherres.json"];
    let runner = sinon.stub(this.deployer.manager, "run").callsFake(async () => {});
    // @ts-ignore
    let client = sinon.stub(this.deployer, "getClient").callsFake(api => {
      if (api) {
        return {
          deleteNamespacedCronJob: async () => {},
          listNamespacedCronJob: async () => ({
            body: {
              items: [
                {
                  spec: {
                    schedule: "10 * * * *"
                  },
                  metadata: {
                    name: "beanservice-cron-037b410f",
                    namespace: "default",
                    annotations: {
                      "webda.io/crondeployer": "e63d39145a743541c090bbc9f0869bd871ff6fa42a6d4e10387e2cf3762fe5e9",
                      "webda.io/cronid": "037b410f",
                      "webda.io/crondescription": "10 * * * *: beanservice.cron()",
                      "webda.io/deployer": undefined,
                      "webda.io/deployment": "Production",
                      "webda.io/version": "1.2.1",
                      "webda.io/application.name": "@webda/sample-app",
                      "webda.io/application.version": "1.0.14"
                    }
                  }
                }
              ]
            }
          })
        };
      } else {
        return {
          read: async () => ({ body: {} }),
          patch: async () => {
            if (patchError) {
              throw new Error();
            }
            return {};
          }
        };
      }
    });
    try {
      await this.deployer.deploy();
      this.deployer.resources.tag = "plop";
      this.deployer.resources.push = true;
      this.deployer.resources.cronTemplate = true;
      this.deployer.resources.patchResources = {
        plop: {
          kind: "Job",
          metadata: {
            name: "myJob",
            other: ""
          },
          patch: {
            "$.metadata.other": "bouzouf",
            "metadata.other2": "zouf"
          }
        },
        bad: {}
      };
      await this.deployer.deploy();
      this.deployer.resources.cronTemplate = "./test/myres.yml";
      patchError = true;
      await this.deployer.deploy();
      this.deployer.resources.cronTemplate = YAMLUtils.parse(`apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: \${cron.serviceName}-\${cron.method.toLowerCase()}-\${cron.cronId}
spec:
  concurrencyPolicy: Forbid
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - image: \${resources.tag}
              imagePullPolicy: Always
              name: scheduled-job
              resources: {}
          restartPolicy: Never
          securityContext: {}
          terminationGracePeriodSeconds: 30
  schedule: \${cron.cron}
  successfulJobsHistoryLimit: 3
`);
      completeStub = sinon.stub(this.deployer, "completeResource").callsFake(() => {
        return completeStub.callCount < 1;
      });
      // Errors are logged but do not fail whole deployment
      await this.deployer.deploy();
    } finally {
      client.restore();
      runner.restore();
      if (completeStub) {
        completeStub.restore();
      }
    }
  }

  @test
  async upsertKubernetesObject() {
    // @ts-ignore
    this.deployer.client = this.deployer.getClient();
    let patch = sinon.stub(this.deployer.client, "patch");
    let read = sinon.stub(this.deployer.client, "read");
    let create = sinon.stub(this.deployer.client, "create");
    // Test no update on certificate
    await this.deployer.upsertKubernetesObject({
      kind: "Certificate",
      apiVersion: "certmanager.k8s.io/v1alpha1",
      metadata: {
        name: "plop",
        namespace: "default"
      }
    });
    assert.strictEqual(read.callCount, 1);
    assert.strictEqual(patch.callCount, 0);
    assert.strictEqual(create.callCount, 0);
    read.resetHistory();

    // Test creation
    read.callsFake(async () => {
      throw new Error();
    });
    await this.deployer.upsertKubernetesObject({
      kind: "Certificate",
      apiVersion: "certmanager.k8s.io/v1alpha1",
      metadata: {
        name: "plop",
        namespace: "default"
      }
    });
    assert.strictEqual(read.callCount, 1);
    assert.strictEqual(patch.callCount, 0);
    assert.strictEqual(create.callCount, 1);
    read.resetHistory();
    create.resetHistory();

    // @ts-ignore
    read.callsFake(async () => {});
    patch.callsFake(async () => {
      throw new Error();
    });
    await this.deployer.upsertKubernetesObject({
      kind: "Deployment",
      apiVersion: "certmanager.k8s.io/v1alpha1",
      metadata: {
        name: "plop",
        namespace: "default"
      }
    });
    assert.strictEqual(read.callCount, 1);
    assert.strictEqual(patch.callCount, 1);
    assert.strictEqual(create.callCount, 0);
    read.resetHistory();
    patch.resetHistory();

    patch.callsFake(async () => {
      throw {
        body: {
          kind: "Status",
          message: "Error in kubernetes"
        }
      };
    });
    await this.deployer.upsertKubernetesObject({
      kind: "Deployment",
      apiVersion: "certmanager.k8s.io/v1alpha1",
      metadata: {
        name: "plop",
        namespace: "default"
      }
    });
    assert.strictEqual(read.callCount, 1);
    assert.strictEqual(patch.callCount, 1);
    assert.strictEqual(create.callCount, 0);
  }
}
