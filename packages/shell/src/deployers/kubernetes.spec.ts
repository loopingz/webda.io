import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import * as path from "path";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { DeployerTest } from "./deployer.spec";
import { Kubernetes, KubernetesObjectToURI, KubernetesResources } from "./kubernetes";
import * as kubeModule from "@webda/kubernetes";
import * as sinon from "sinon";

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
  getCronId() {
    // @ts-ignore
    assert.strictEqual(this.deployer.getCronId({}), "56a5f2e2");
  }

  @test
  async deploy() {
    await this.deployer.loadDefaults();
    this.deployer.resources.resourcesFiles = ["plop.te"];
    await assert.rejects(() => this.deployer.deploy(), /f/);
    this.deployer.resources.resourcesFiles = ["plop.json"];
    await assert.rejects(() => this.deployer.deploy(), /f/);
    this.deployer.resources.resourcesFiles = ["./test/myres.yml", "./test/myotherres.json"];
    let runner = sinon.stub(this.deployer.manager, "run").callsFake(async () => {});
    let client = sinon.stub(this.deployer, "getClient").callsFake(api => {
      if (api) {
        return {
          listNamespacedCronJob: async () => ({ body: { items: [] } })
        };
      } else {
        return {
          read: async () => ({ body: {} }),
          patch: async () => ({})
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
    } finally {
      client.restore();
      runner.restore();
    }
  }
}
