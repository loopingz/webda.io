import { Deployer } from "./deployer";
import { DeployerResources, Deployer as DeployerDefinition } from "@webda/core";

export interface ShellDeployerResources extends DeployerResources {
  scripts: string[];
}

@DeployerDefinition
export default class ShellDeployer extends Deployer<ShellDeployerResources> {
  async deploy() {
    this.resources.scripts = this.resources.scripts || [];
    for (let i in this.resources.scripts) {
      await this.execute(this.resources.scripts[i]);
    }
  }
}

export { ShellDeployer };
