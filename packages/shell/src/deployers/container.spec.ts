import { suite, test } from "@testdeck/mocha";
import { FileUtils, getCommonJS, JSONUtils } from "@webda/core";
import * as assert from "assert";
import fs from "fs-extra";
import * as path from "path";
import * as sinon from "sinon";
import { DeploymentManager } from "../handlers/deploymentmanager";
import { WebdaSampleApplication } from "../index.spec";
import { Container, ContainerResources } from "./container";
import { DeployerTest } from "./deployertest";
import { WorkspaceTestApplication } from "./packager.spec";
const { __dirname } = getCommonJS(import.meta.url);

@suite
class ContainerDeployerTest extends DeployerTest<Container<ContainerResources>> {
  async before() {
    await super.before();
    try {
      fs.mkdirSync(WebdaSampleApplication.getAppPath("node_modules/@webda"), { recursive: true });
      fs.symlinkSync(
        path.join(__dirname, "../../../aws"),
        WebdaSampleApplication.getAppPath("node_modules/@webda/aws")
      );
    } catch (err) {}
  }

  after() {
    FileUtils.clean("./test/fakeworkspace/app1/testDebugDocker", "./test/fakeworkspace/testDebugDocker");
  }

  async getDeployer(manager: DeploymentManager) {
    return new Container(manager, {
      name: "deployer",
      type: "DockerDeployer",
      tag: "webda-deployer:test"
    });
  }

  @test
  cov() {
    this.deployer.manager.getDeploymentName = () => "";
    assert.strictEqual(this.deployer.addDeploymentToImage(), "");
  }

  @test
  async deploy() {
    this.deployer.execute = this.mockExecute;
    await this.deployer.loadDefaults();
    await this.deployer.deploy();
    assert.strictEqual(this.execs.length, 1);
    assert.strictEqual(this.execs[0][0], "docker build --tag webda-deployer:test --file - .");
    this.execs = [];
    this.deployer.resources.push = true;
    this.deployer.resources.Dockerfile = "./testor";
    await this.deployer.deploy();
    assert.strictEqual(this.execs.length, 2);
    assert.strictEqual(this.execs[0][0], "docker build --tag webda-deployer:test --file ./testor .");
    assert.deepStrictEqual(this.execs[1], ["docker push webda-deployer:test"]);
  }

  @test
  async deployBuildah() {
    this.deployer.execute = this.mockExecute;
    this.deployer.resources.containerClient = "buildah";
    await this.deployer.loadDefaults();
    await this.deployer.deploy();
    assert.strictEqual(this.execs.length, 1);
    assert.strictEqual(this.execs[0][0], "cat | buildah bud --format=docker -f - -t webda-deployer:test .");
    this.execs = [];
    this.deployer.resources.push = true;
    this.deployer.resources.Dockerfile = "./testor";
    await this.deployer.deploy();
    assert.strictEqual(this.execs.length, 2);
    assert.strictEqual(this.execs[0][0], "buildah bud --format=docker -f ./testor -t webda-deployer:test .");
    assert.deepStrictEqual(this.execs[1], ["buildah push webda-deployer:test"]);
  }

  @test
  async params() {
    // @ts-ignore
    this.deployer.resources.containerClient = "bouzouf";
    await assert.rejects(
      () => this.deployer.loadDefaults(),
      /Client profile 'bouzouf' does not exist for ContainerClient/
    );
    this.deployer.resources.includeWorkspaces = true;
    this.deployer.resources.containerClient = "docker";
    await this.deployer.loadDefaults();
  }

  @test
  testGetDockerfileWebdaShell() {
    const tag = JSONUtils.loadFile("package.json").version;
    assert.strictEqual(
      this.deployer.getDockerfileWebdaShell(),
      `# Install current @webda/shell version\nRUN yarn -W add @webda/shell@${tag}\n\n`
    );
    process.env.WEBDA_SHELL_DEV = path.resolve(path.join(__dirname, "/../../"));
    // Do not really care if they fail or not
    fs.mkdirSync(".webda-shell", { recursive: true });
    fs.writeFileSync(".webda-shell/hash", "badhash");
    assert.deepStrictEqual(this.deployer.getDockerfileWebdaShell().split("\n"), [
      "# Use development Webda Shell version",
      "ADD .webda-shell /devshell",
      "ADD .webda-shell/node_modules /devshell/node_modules/",
      "ADD .webda-shell/node_modules /webda/node_modules/",
      "ENV PATH=${PATH}:/devshell/packages/shell/bin",
      "",
      ""
    ]);
    process.env.WEBDA_SHELL_DEPLOY_VERSION = "0.1.0";
    assert.strictEqual(
      this.deployer.getDockerfileWebdaShell(),
      "# Install enforced @webda/shell version\nRUN yarn -W add @webda/shell@0.1.0\n\n"
    );
  }

  @test
  async testWorkspaceDockerfile() {
    await this.deployer.loadDefaults();
    assert.strictEqual(
      this.deployer
        .getWorkspacesDockerfile()
        .trim()
        .replace(/GIT_INFO=[^\W=]+=*/g, "GIT_INFO=...")
        .replace(/shell@\d+\.\d+.\d+/g, "shell@x.x.x")
        .replace(/enforced/g, "current"),
      `FROM docker.io/library/node:lts-alpine
LABEL webda.io/deployer=undefined
LABEL webda.io/deployment=Production
LABEL webda.io/version=${this.deployer.getApplication().getWebdaVersion()}
LABEL webda.io/application=@webda/sample-app
LABEL webda.io/application/version=${this.deployer.getApplication().getPackageDescription().version}
EXPOSE 18080
RUN mkdir -p /webda
WORKDIR /webda
ADD package.json /webda/

RUN yarn install --production

# Copy all packages content

# Install current @webda/shell version
RUN yarn -W add @webda/shell@x.x.x

# Update WORKDIR to project
WORKDIR /sample-app

# Add deployment
COPY ../../sample-app/deployments /sample-app/deployments
RUN GIT_INFO=... /webda/node_modules/.bin/webda -d Production config --noCompile webda.config.jsonc
RUN rm -rf deployments

# Change user
USER 1000
# Launch webda
ENV WEBDA_COMMAND='serve'
CMD /webda/node_modules/.bin/webda --noCompile $WEBDA_COMMAND`.trim()
    );
  }

  @test
  async includeLinkModules() {
    let stub;
    const cwd = process.cwd();
    const workspaceApp = await WorkspaceTestApplication.init();
    try {
      this.deployer.app = workspaceApp;
      process.chdir(workspaceApp.getAppPath());

      // @ts-ignore
      stub = sinon.stub(this.deployer, "execute").callsFake(() => {});
      this.deployer.resources.includeLinkModules = true;
      this.deployer.resources.includeWorkspaces = true;
      await this.deployer.loadDefaults();
      this.deployer.resources.debugDockerfilePath = "./testDebugDocker";
      this.deployer.getDockerfile();
      const src = this.deployer.getWorkspacesDockerfile();
      assert.ok(src.includes("ADD link_modules /webda/node_modules"));
      assert.strictEqual(src, fs.readFileSync(this.deployer.resources.debugDockerfilePath).toString());
      this.deployer.resources.logFile = "mylog";
      this.deployer.resources.errorFile = "myerror";
      this.deployer.resources.excludePackages = ["package1"];
      await this.deployer.deploy();

      const res = this.deployer.copyPackageFilesTo(path.join(workspaceApp.getAppPath(), ".."), "");
      assert.deepStrictEqual(res.split("\n").slice(2, 6), [
        "RUN rm -rf /node_modules/@webda/aws && rm -rf /webda/node_modules/@webda/aws",
        "RUN rm -rf /node_modules/@webda/core && rm -rf /webda/node_modules/@webda/core",
        "RUN rm -rf /node_modules/package1 && rm -rf /webda/node_modules/package1",
        "RUN rm -rf /node_modules/package2 && rm -rf /webda/node_modules/package2"
      ]);

      // Should return without doing anything
      this.deployer.copyPackageToLinkModules(workspaceApp.getAppPath());
    } finally {
      fs.emptyDirSync("./link_modules");
      fs.rmdirSync("./link_modules");
      process.chdir(cwd);
      stub.restore();
      workspaceApp.clean();
    }
  }
}
