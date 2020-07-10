import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import * as path from "path";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { DeployerTest } from "./deployer.spec";
import { Docker, DockerResources } from "./docker";

@suite
class DockerDeployerTest extends DeployerTest<Docker<DockerResources>> {
  async getDeployer(manager: DeploymentManager) {
    return new Docker(manager, {
      name: "deployer",
      type: "DockerDeployer",
      tag: "webda-deployer:test"
    });
  }

  @test
  async deploy() {
    this.deployer.execute = this.mockExecute;
    await this.deployer.deploy();
    assert.equal(this.execs.length, 1);
    assert.equal(this.execs[0][0], "docker build --tag webda-deployer:test --file - .");
    this.execs = [];
    this.deployer.resources.push = true;
    this.deployer.resources.Dockerfile = "./testor";
    await this.deployer.deploy();
    assert.equal(this.execs.length, 2);
    assert.equal(this.execs[0][0], "docker build --tag webda-deployer:test --file ./testor .");
    assert.deepEqual(this.execs[1], ["docker push webda-deployer:test"]);
  }

  @test
  testGetDockerfileWebdaShell() {
    let tag = require(__dirname + "/../../package.json").version;
    assert.equal(
      this.deployer.getDockerfileWebdaShell(),
      `# Install current @webda/shell version\nRUN yarn global add @webda/shell@${tag}\n\n`
    );
    process.env.WEBDA_SHELL_DEV = path.resolve(path.join(__dirname, "/../../"));
    assert.deepEqual(this.deployer.getDockerfileWebdaShell().split("\n"), [
      "# Use development Webda Shell version",
      "ADD .webda-shell /devshell",
      "ADD .webda-shell/node_modules /devshell/node_modules/",
      "ADD .webda-shell/node_modules /webda/node_modules/",
      "ENV PATH=${PATH}:/devshell/packages/shell/bin",
      "",
      ""
    ]);
    process.env.WEBDA_SHELL_DEPLOY_VERSION = "0.1.0";
    assert.equal(
      this.deployer.getDockerfileWebdaShell(),
      "# Install enforced @webda/shell version\nRUN yarn global add @webda/shell@0.1.0\n\n"
    );
  }
}
