import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { DeploymentManager } from "../handlers/deploymentmanager";
import ChainDeployer from "./chaindeployer";
import { Deployer } from "./deployer";
import { DeployerTest } from "./deployer.spec";

class BouzoufDeployer extends Deployer<any> {
  static lastResources: any;

  constructor(manager, resources) {
    super(manager, resources);
    BouzoufDeployer.lastResources = resources;
  }

  async deploy() {
    return {
      plop: "bouzouf",
      bouzouf: {
        plop: 2
      }
    };
  }
}

@suite
class ChainDeployerTest extends DeployerTest<ChainDeployer> {
  async getDeployer(manager: DeploymentManager) {
    return new ChainDeployer(manager, {
      name: "deployer",
      type: "ChainDeployer",
      chain: []
    });
  }

  @test
  async getChain() {
    assert.deepEqual(this.deployer.getChain(), []);
    this.deployer.resources.chain = ["testA", "testB"];
    assert.deepEqual(this.deployer.getChain(), ["testA", "testB"]);
    this.deployer.resources.chain = ["testA", "testB"].join(",");
    assert.deepEqual(this.deployer.getChain(), ["testA", "testB"]);
  }

  @test
  async deployUnknown() {
    this.deployer.resources.chain = "BOuzouf,Plop";
    assert.rejects(this.deployer.deploy(), /Deployer BOuzouf is unknown/g);
  }

  @test
  async deploy() {
    this.manager.deployersDefinition["bouzouf"] = BouzoufDeployer;
    this.manager.deployersDefinition["plop"] = BouzoufDeployer;
    this.deployer.resources.chain = "BOuzouf,Plop";
    this.deployer.resources.bouzouf = { yop: "plop" };
    await this.deployer.deploy();
    assert.deepEqual(BouzoufDeployer.lastResources, {
      plop: "bouzouf",
      chain: "BOuzouf,Plop",
      name: "deployer",
      bouzouf: {
        plop: 2,
        yop: "plop"
      },
      type: "ChainDeployer"
    });
  }
}
