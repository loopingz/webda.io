import * as merge from "merge";
import { Deployer, DeployerResources } from "./deployer";

export interface ChainDeployerResources extends DeployerResources {
  chain: string | string[];
  [x: string]: any;
}

/**
 * Run a list of Deployer
 */
export default class ChainDeployer extends Deployer<ChainDeployerResources> {
  getChain(): string[] {
    if (typeof this.resources.chain === "string") {
      return this.resources.chain.split(",");
    }
    return this.resources.chain || [];
  }

  async deploy() {
    let deployers = this.getChain();
    deployers.forEach(d => {
      if (!this.manager.deployersDefinition[d.toLowerCase()]) {
        throw new Error("Deployer " + d + " is unknown");
      }
    });
    // Duplicate object
    let resources = JSON.parse(JSON.stringify(this.resources));
    // Run all deployers one after the other
    for (let i in deployers) {
      let result = (await this.manager.run(deployers[i], resources)) || {};
      resources = merge.recursive(resources, this.objectParameter(result));
    }
  }
}

export { ChainDeployer };
