import { Deployer, DeployerResources } from "./deployer";

export interface ShellDeployerResources extends DeployerResources {
  scripts: string[];
}

export default class ShellDeployer extends Deployer<ShellDeployerResources> {
  async deploy() {
    this.resources.scripts = this.resources.scripts || [];
    for (let i in this.resources.scripts) {
      await this.execute(this.resources.scripts[i]);
    }
  }
}

export { ShellDeployer };
