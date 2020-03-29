import { Deployer } from "./deployer";

export default class ShellDeployer extends Deployer {
  async deploy() {
    this.resources.scripts = this.resources.scripts || [];
    for (let i in this.resources.scripts) {
      await this.execute(this.resources.scripts[i]);
    }
  }
}

export { ShellDeployer };
