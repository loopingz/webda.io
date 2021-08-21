import * as merge from "merge";
import { Deployer } from "./deployer";
import { WebdaError, DeployerResources } from "@webda/core";

export interface ChainDeployerResources extends DeployerResources {
  chain: string | string[];
  [x: string]: any;
}

/**
 * Run a list of Deployer
 */
export default class ChainDeployer extends Deployer<ChainDeployerResources> {
  /**
   *
   * @returns current chain
   */
  getChain(): string[] {
    if (typeof this.resources.chain === "string") {
      return this.resources.chain.split(",");
    }
    return this.resources.chain || [];
  }

  /**
   * Deploy each deployer from the chain, adding any results sent by previous
   * deployers to the next one
   */
  async deploy() {
    let deployers = this.getChain();
    deployers.forEach(d => {
      if (!this.manager.deployersDefinition[d.toLowerCase()]) {
        throw new WebdaError("DEPLOYER_UNKNOWN", "Deployer " + d + " is unknown");
      }
    });
    // Duplicate object
    let resources = JSON.parse(JSON.stringify(this.resources));
    // Run all deployers one after the other
    for (let i in deployers) {
      let result = (await this.manager.run(deployers[i], resources)) || {};
      resources = merge.recursive(resources, this.replaceVariables(result));
    }
  }
}

export { ChainDeployer };
