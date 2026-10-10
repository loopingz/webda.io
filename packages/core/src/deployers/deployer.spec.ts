import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaAsyncStorageTest } from "../test/asyncstorage.js";
import { setApplication } from "../application/hooks.js";
import { getDeploymentVariables, resolveDeploymentVariables, runCommand } from "./deployer.js";

@suite
class DeploymentVariablesTest extends WebdaAsyncStorageTest {
  async beforeEach(): Promise<void> {
    process.env.GIT_INFO = Buffer.from(
      JSON.stringify({ commit: "abcdef", branch: "main", short: "abc", tag: "", tags: [], version: "1.0.1+snap" })
    ).toString("base64");
    process.env.DEPLOYER_TEST_SECRET = "secret";
    setApplication({
      applicationPath: "/app",
      getCurrentDeployment: () => "Production",
      getConfiguration: () => ({ services: { Stack: { type: "Webda/CloudFormationDeployer" } } }),
      getProjectInfo: () =>
        ({
          package: { name: "myapp", version: "1.0.0", description: "My app" },
          webda: { namespace: "MyApp" },
          deployment: { name: "Production" }
        }) as any
    } as any);
  }

  async afterEach(): Promise<void> {
    delete process.env.GIT_INFO;
    delete process.env.DEPLOYER_TEST_SECRET;
  }

  @test
  variables() {
    const deployer = { getName: () => "Stack", getParameters: () => ({ StackName: "${deployer.name}-stack" }) };
    const variables = getDeploymentVariables(deployer, { extra: "value" });
    assert.strictEqual(variables.deployment, "Production");
    assert.deepStrictEqual(variables.deployer, { name: "Stack", type: "Webda/CloudFormationDeployer" });
    assert.deepStrictEqual(variables.resources, { StackName: "${deployer.name}-stack" });
    assert.strictEqual(variables.package.name, "myapp");
    assert.strictEqual(variables.webda.namespace, "MyApp");
    assert.strictEqual(variables.git.commit, "abcdef");
    assert.strictEqual(variables.env.DEPLOYER_TEST_SECRET, "secret");
    assert.strictEqual(variables.extra, "value");
    assert.ok(variables.now > 0);
  }

  @test
  resolve() {
    const deployer = { getName: () => "Stack", getParameters: () => ({}) };
    const variables = getDeploymentVariables(deployer);
    const parameters = {
      StackName: "${deployer.name}-${deployment}",
      AssetsPrefix: "${deployment}/${deployer.name}/",
      Image: "registry/${package.name}:${git.version}",
      Secret: "${env.DEPLOYER_TEST_SECRET}",
      Nested: { list: ["${package.version}", 12, true], keep: "plain" }
    };
    assert.deepStrictEqual(resolveDeploymentVariables(parameters, variables), {
      StackName: "Stack-Production",
      AssetsPrefix: "Production/Stack/",
      Image: "registry/myapp:1.0.1+snap",
      Secret: "secret",
      Nested: { list: ["1.0.0", 12, true], keep: "plain" }
    });
    // The source is not modified
    assert.strictEqual(parameters.StackName, "${deployer.name}-${deployment}");
    assert.strictEqual(resolveDeploymentVariables("${package.description}", variables), "My app");
  }
}

// Relies on POSIX commands and shell expansion
@suite("RunCommandTest", { execution: process.platform === "win32" ? "skip" : "default" })
class RunCommandTest {
  @test
  async success() {
    const result = await runCommand("cat", { stdin: "hello" });
    assert.deepStrictEqual(result, { status: 0, output: "hello", error: "" });
    assert.strictEqual((await runCommand("pwd", { cwd: "/" })).output.trim(), "/");
    assert.strictEqual((await runCommand("echo $WEBDA_RUN_TEST", { env: { WEBDA_RUN_TEST: "ok" } })).output, "ok\n");
  }

  @test
  async failure() {
    await assert.rejects(
      () => runCommand("echo out; echo err >&2; exit 3"),
      (err: any) => err.status === 3 && err.output === "out\n" && err.error === "err\n"
    );
    assert.deepStrictEqual(await runCommand("exit 2", { resolveOnError: true }), { status: 2, output: "", error: "" });
  }
}
