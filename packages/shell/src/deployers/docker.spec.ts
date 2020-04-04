import * as assert from "assert";
import { suite, test } from "mocha-typescript";
import * as path from "path";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { DeployerTest } from "./deployer.spec";
import { Docker } from "./docker";

@suite
class DockerDeployerTest extends DeployerTest<Docker> {
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
    assert.equal(
      this.execs[0][0],
      "docker build --tag webda-deployer:test --file - ."
    );
    this.execs = [];
    this.deployer.resources.push = true;
    this.deployer.resources.file = "./testor";
    await this.deployer.deploy();
    assert.equal(this.execs.length, 2);
    assert.equal(
      this.execs[0][0],
      "docker build --tag webda-deployer:test --file ./testor ."
    );
    assert.deepEqual(this.execs[1], ["docker push webda-deployer:test"]);
  }

  @test
  testGetDockerfileWebdaShell() {
    let tag = require(__dirname + "/../../package.json").version;
    assert.equal(
      this.deployer.getDockerfileWebdaShell(),
      `RUN yarn global add @webda/shell@${tag}\n`
    );
    process.env.WEBDA_SHELL_DEV = path.resolve(path.join(__dirname, "/../../"));
    assert.deepEqual(this.deployer.getDockerfileWebdaShell().split("\n"), [
      "RUN mkdir -p /webda/node_modules/@webda/shell/node_modules/",
      "ADD ./dist/webda-shell/node_modules /webda/node_modules/@webda/shell/node_modules/",
      "RUN mkdir -p /webda/node_modules/@webda/shell/",
      "ADD ./dist/webda-shell/package.json /webda/node_modules/@webda/shell/package.json",
      "RUN mkdir -p /webda/node_modules/@webda/shell/lib/",
      "ADD ./dist/webda-shell/lib /webda/node_modules/@webda/shell/lib/",
      "RUN mkdir -p /webda/node_modules/@webda/shell/bin/",
      "ADD ./dist/webda-shell/bin/webda /webda/node_modules/@webda/shell/bin/webda",
      "RUN rm /webda/node_modules/.bin/webda",
      "RUN ln -s /webda/node_modules/@webda/shell/bin/webda /webda/node_modules/.bin/webda",
      ""
    ]);
    process.env.WEBDA_SHELL_DEPLOY_VERSION = "0.1.0";
    assert.equal(
      this.deployer.getDockerfileWebdaShell(),
      "RUN yarn global add @webda/shell@0.1.0\n"
    );
  }
}
