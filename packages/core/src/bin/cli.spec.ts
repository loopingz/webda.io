import { suite, test } from "@webda/test";
import * as assert from "assert";
import type { JSONSchema7 } from "json-schema";
import { CancelablePromise } from "@webda/utils";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";
import { vi } from "vitest";
import {
  buildCli,
  createCommandShutdown,
  exitAfterFlush,
  onInterrupt,
  reportServiceCommand,
  settleServiceCommand,
  ensureCommandServices,
  extractDeploymentArgument,
  prepareDeploymentUnits,
  loadOperations,
  addServiceCommandsToCli,
  resolveLogStream,
  shouldPatchConsole,
  type OperationsFile,
  type OperationCall,
  type OperationEntry
} from "./cli.js";

/**
 * Helper to create a minimal OperationsFile for testing
 */
function makeOps(
  operations: Record<string, OperationEntry>,
  schemas: Record<string, JSONSchema7> = {}
): OperationsFile {
  return { operations, schemas };
}

@suite
class CliSchemaToOptionsTest {
  /**
   * We test schemaToOptions indirectly through buildCli since it's not exported.
   * The help output reflects how yargs options were configured.
   */

  @test
  async buildCliGroupsOperationsByPrefix() {
    const ops = makeOps({
      "Task.Create": { id: "Task.Create", input: "Task.Create.input" },
      "Task.Get": { id: "Task.Get", input: "uuidRequest" },
      "Task.Delete": { id: "Task.Delete", input: "uuidRequest" }
    });

    const calls: OperationCall[] = [];
    const cli = buildCli(ops, async call => {
      calls.push(call);
    });

    // Parse a create command
    await cli.parseAsync(["task", "create", "--json", '{"title":"Test"}']);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].id, "Task.Create");
    assert.deepStrictEqual(calls[0].input, { title: "Test" });
  }

  @test
  async buildCliExtractsUuidParameter() {
    const ops = makeOps({
      "Task.Get": { id: "Task.Get", input: "uuidRequest", output: "Task" }
    });

    const calls: OperationCall[] = [];
    const cli = buildCli(ops, async call => {
      calls.push(call);
    });

    await cli.parseAsync(["task", "get", "abc-123"]);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].id, "Task.Get");
    assert.strictEqual(calls[0].parameters.uuid, "abc-123");
  }

  @test
  async buildCliHandlesCaseInsensitiveCommands() {
    const ops = makeOps({
      "Task.Create": { id: "Task.Create" }
    });

    const calls: OperationCall[] = [];
    // buildCli normalizes argv internally, so pass uppercase via the argv parameter
    const cli = buildCli(
      ops,
      async call => {
        calls.push(call);
      },
      ["Task", "Create"]
    );

    await cli.parseAsync();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].id, "Task.Create");
  }

  @test
  async buildCliExtractsInputFromCliOptions() {
    const ops = makeOps(
      {
        "Svc.Run": {
          id: "Svc.Run",
          input: "Svc.Run.input"
        }
      },
      {
        "Svc.Run.input": {
          type: "object",
          properties: {
            count: { type: "number" },
            name: { type: "string" }
          },
          required: ["count"]
        }
      }
    );

    const calls: OperationCall[] = [];
    const cli = buildCli(ops, async call => {
      calls.push(call);
    });

    await cli.parseAsync(["svc", "run", "--count", "5", "--name", "test"]);
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0].input, { count: 5, name: "test" });
  }

  @test
  async buildCliJsonInputOverridesCliOptions() {
    const ops = makeOps(
      {
        "Svc.Run": { id: "Svc.Run", input: "Svc.Run.input" }
      },
      {
        "Svc.Run.input": {
          type: "object",
          properties: { count: { type: "number" } }
        }
      }
    );

    const calls: OperationCall[] = [];
    const cli = buildCli(ops, async call => {
      calls.push(call);
    });

    // --json should take precedence
    await cli.parseAsync(["svc", "run", "--json", '{"count":99}']);
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0].input, { count: 99 });
  }

  @test
  async buildCliInputNotRequiredByYargsWhenJsonAvailable() {
    // Input schema properties should NOT be demandOption in yargs
    // because --json or --file can provide them instead
    const ops = makeOps(
      {
        "Svc.Run": { id: "Svc.Run", input: "Svc.Run.input" }
      },
      {
        "Svc.Run.input": {
          type: "object",
          properties: { count: { type: "number" } },
          required: ["count"]
        }
      }
    );

    const calls: OperationCall[] = [];
    const cli = buildCli(ops, async call => {
      calls.push(call);
    });

    // Using --json should work even though --count is not provided
    await cli.parseAsync(["svc", "run", "--json", '{"count":1}']);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].input.count, 1);
  }

  @test
  async buildCliCustomParameterSchema() {
    const ops = makeOps(
      {
        "Svc.Run": { id: "Svc.Run", input: "customParams" }
      },
      {
        customParams: {
          type: "object",
          properties: {
            region: { type: "string" },
            limit: { type: "number" }
          },
          required: ["region"]
        }
      }
    );

    const calls: OperationCall[] = [];
    const cli = buildCli(ops, async call => {
      calls.push(call);
    });

    await cli.parseAsync(["svc", "run", "--region", "us-east-1", "--limit", "10"]);
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0].input, { region: "us-east-1", limit: 10 });
  }

  @test
  async buildCliSearchRequestParameter() {
    const ops = makeOps({
      "Tasks.Query": { id: "Tasks.Query", input: "searchRequest" }
    });

    const calls: OperationCall[] = [];
    const cli = buildCli(ops, async call => {
      calls.push(call);
    });

    await cli.parseAsync(["tasks", "query", "-q", "status = 'active'"]);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].parameters.query, "status = 'active'");
  }

  @test
  async buildCliMultipleGroups() {
    const ops = makeOps({
      "Task.Create": { id: "Task.Create" },
      "Task.Get": { id: "Task.Get", input: "uuidRequest" },
      "User.Login": { id: "User.Login", input: "User.Login.input" }
    });

    const calls: OperationCall[] = [];
    const cli = buildCli(ops, async call => {
      calls.push(call);
    });

    await cli.parseAsync(["task", "create"]);
    assert.strictEqual(calls[0].id, "Task.Create");

    await cli.parseAsync(["user", "login"]);
    assert.strictEqual(calls[1].id, "User.Login");
  }
}

@suite
class CliAddServiceCommandsTest {
  @test
  async addServiceCommandsSimple() {
    const { default: yargs } = await import("yargs");
    const cli = yargs([]).scriptName("webda");

    const serviceCommands = {
      serve: {
        description: "Start the HTTP server",
        services: [{ name: "Webda/HttpServer", method: "serve", type: "Webda/HttpServer" }],
        args: {
          port: { type: "number" as const, default: 18080, alias: "p", description: "Port to listen on" }
        }
      }
    };

    const calls: { name: string; args: Record<string, any> }[] = [];
    addServiceCommandsToCli(cli, serviceCommands, async (name, args) => {
      calls.push({ name, args });
    });

    await cli.parseAsync(["serve", "--port", "3000"]);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].name, "serve");
    assert.strictEqual(calls[0].args.port, 3000);
  }

  @test
  async addServiceCommandsSubcommands() {
    const { default: yargs } = await import("yargs");
    const cli = yargs([]).scriptName("webda");

    const serviceCommands = {
      "aws s3": {
        description: "S3 operations",
        services: [{ name: "Webda/S3", method: "s3", type: "Webda/S3" }],
        args: {}
      },
      "aws lambda": {
        description: "Lambda operations",
        services: [{ name: "Webda/Lambda", method: "lambda", type: "Webda/Lambda" }],
        args: {}
      }
    };

    const calls: { name: string }[] = [];
    addServiceCommandsToCli(cli, serviceCommands, async (name, _args) => {
      calls.push({ name });
    });

    await cli.parseAsync(["aws", "s3"]);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].name, "aws s3");

    await cli.parseAsync(["aws", "lambda"]);
    assert.strictEqual(calls[1].name, "aws lambda");
  }
}

@suite
class CliLoadOperationsTest {
  @test
  loadOperationsThrowsWhenMissing() {
    assert.throws(() => loadOperations("/nonexistent/path"), /Operations not found/);
  }
}

@suite
class CliLoggingOptionsTest {
  @test
  logStreamAutoDetectsTTY() {
    assert.strictEqual(resolveLogStream([], true), "stdout");
    assert.strictEqual(resolveLogStream([], false), "stderr");
    assert.strictEqual(resolveLogStream(["openapi", "--log-stream=auto"], false), "stderr");
  }

  @test
  logStreamExplicitDisablesDetection() {
    assert.strictEqual(resolveLogStream(["--log-stream=stdout"], false), "stdout");
    assert.strictEqual(resolveLogStream(["--log-stream", "stdout"], false), "stdout");
    assert.strictEqual(resolveLogStream(["--log-stream=stderr"], true), "stderr");
    assert.strictEqual(resolveLogStream(["serve", "--log-stream", "stderr"], true), "stderr");
  }

  @test
  logStreamUnknownValueFallsBackToAuto() {
    // yargs rejects the value later; until then, behave as auto
    assert.strictEqual(resolveLogStream(["--log-stream=bogus"], false), "stderr");
    assert.strictEqual(resolveLogStream(["--log-stream"], true), "stdout");
  }

  @test
  consolePatchCanBeDisabled() {
    assert.strictEqual(shouldPatchConsole([]), true);
    assert.strictEqual(shouldPatchConsole(["serve"]), true);
    assert.strictEqual(shouldPatchConsole(["serve", "--no-console-patch"]), false);
    assert.strictEqual(shouldPatchConsole(["--console-patch=false"]), false);
  }
}

@suite
class CliCommandShutdownTest {
  @test
  async exitWaitsForStdoutFlush() {
    // A piped stdout is asynchronous: exiting before it drains truncates large outputs
    const calls: string[] = [];
    let flush: () => void;
    const stdout = {
      write: (chunk: string, callback: () => void) => {
        calls.push(`write '${chunk}'`);
        flush = callback;
        return false;
      }
    };
    exitAfterFlush(0, stdout as any, code => void calls.push(`exit ${code}`));
    assert.deepStrictEqual(calls, ["write ''"], "no exit while stdout is pending");
    flush();
    assert.deepStrictEqual(calls, ["write ''", "exit 0"]);
  }

  @test
  async stopsCoreThenExitsOnce() {
    const calls: string[] = [];
    const core = { stop: async () => void calls.push("stop") };
    const { shutdown } = createCommandShutdown(core, code => void calls.push(`exit ${code}`));
    // The command finishing and a signal can both ask for shutdown: only the first one counts
    await Promise.all([shutdown(0), shutdown(2)]);
    assert.deepStrictEqual(calls, ["stop", "exit 0"]);
  }

  @test
  async failedStopExitsNonZero() {
    const codes: number[] = [];
    const core = {
      stop: async () => {
        throw new Error("STOP_FAILED");
      }
    };
    await createCommandShutdown(core, code => void codes.push(code)).shutdown(0);
    assert.deepStrictEqual(codes, [1]);
  }

  @test
  async interruptCancelsRunningCommandsAndExits0() {
    const calls: string[] = [];
    const serving = new CancelablePromise(
      () => {},
      async () => void calls.push("cancel")
    );
    const settled = serving.catch(err => err);
    const core = { stop: async () => void calls.push("stop") };
    await createCommandShutdown(core, code => void calls.push(`exit ${code}`)).interrupt();
    assert.strictEqual(await settled, "Cancelled");
    assert.deepStrictEqual(calls, ["cancel", "stop", "exit 0"]);
  }

  @test
  async defaultExitIsProcessExit() {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as any);
    try {
      await createCommandShutdown({ stop: async () => {} }).shutdown(3);
      // The exit happens once stdout is flushed
      await new Promise<void>(resolve => process.stdout.write("", () => resolve()));
      assert.deepStrictEqual(exit.mock.calls, [[3]]);
    } finally {
      exit.mockRestore();
    }
  }

  @test
  async interruptStillStopsWhenCancelFails() {
    const cancelAll = vi.spyOn(CancelablePromise, "cancelAll").mockRejectedValue(new Error("CANCEL_FAILED"));
    const calls: string[] = [];
    try {
      const logs = await captureLogs(() =>
        createCommandShutdown(
          { stop: async () => void calls.push("stop") },
          code => void calls.push(`exit ${code}`)
        ).interrupt()
      );
      assert.deepStrictEqual(calls, ["stop", "exit 0"]);
      assert.ok(logs.some(l => l.includes("Cannot cancel running processes")));
    } finally {
      cancelAll.mockRestore();
    }
  }
}

/**
 * Capture the logs emitted while running `fn`
 * @param fn - the code to run
 * @returns the log lines
 */
async function captureLogs(fn: () => Promise<any> | any): Promise<string[]> {
  const memoryLogger = new MemoryLogger(useWorkerOutput());
  try {
    await fn();
  } finally {
    memoryLogger.close();
  }
  return memoryLogger
    .getLogs()
    .map(l => l.log)
    .filter(l => l)
    .map(l => `${l.level} ${(l.args ?? []).map(a => (a instanceof Error ? a.message : a)).join(" ")}`);
}

@suite
class CliInterruptTest {
  /**
   * Register the handlers on a fake process.on and return them by signal
   * @returns the handlers registered per signal and the spy to restore
   */
  captureHandlers(): { handlers: Record<string, () => void>; restore: () => void } {
    const handlers: Record<string, () => void> = {};
    const on = vi.spyOn(process, "on").mockImplementation(((signal: string, handler: () => void) => {
      handlers[signal] = handler;
      return process;
    }) as any);
    return { handlers, restore: () => on.mockRestore() };
  }

  @test
  async sigintAndSigtermInterruptOnce() {
    const { handlers, restore } = this.captureHandlers();
    let interrupts = 0;
    try {
      onInterrupt(async () => void interrupts++);
    } finally {
      restore();
    }
    assert.deepStrictEqual(Object.keys(handlers).sort(), ["SIGINT", "SIGTERM"]);
    // On a terminal Ctrl+C reaches both the launcher (forwarded) and the CLI: later signals are ignored
    handlers.SIGTERM();
    handlers.SIGINT();
    handlers.SIGTERM();
    assert.strictEqual(interrupts, 1);
  }
}

@suite
class CliSettleServiceCommandTest {
  @test
  async exitsWithTheCommandCode() {
    const codes: number[] = [];
    await settleServiceCommand(
      "migrate",
      async () => 2,
      async code => void codes.push(code)
    );
    assert.deepStrictEqual(codes, [2]);
  }

  @test
  async failedCommandExits1() {
    const codes: number[] = [];
    const logs = await captureLogs(() =>
      settleServiceCommand(
        "migrate",
        async () => {
          throw new Error("MIGRATION_FAILED");
        },
        async code => void codes.push(code)
      )
    );
    assert.deepStrictEqual(codes, [1]);
    assert.ok(logs.some(l => l.startsWith("ERROR") && l.includes("Command 'migrate' failed MIGRATION_FAILED")));
  }

  @test
  async reportLogsFailuresOnly() {
    const logs = await captureLogs(async () => {
      reportServiceCommand("ok", Promise.resolve(0));
      reportServiceCommand("code", Promise.resolve(4));
      reportServiceCommand("boom", Promise.reject(new Error("BOOM")));
      // Let the reports settle
      await new Promise(resolve => setImmediate(resolve));
    });
    const errors = logs.filter(l => l.startsWith("ERROR"));
    assert.deepStrictEqual(errors, ["ERROR Command 'code' exited with code 4", "ERROR Command 'boom' failed BOOM"]);
  }
}

/**
 * Minimal application exposing modules, configuration and deployment
 * @param deployment - the selected deployment
 * @param services - configured application services
 * @returns a fake application
 */
function deploymentApp(deployment: any, services: any = {}): any {
  const config = { parameters: {}, services };
  return {
    config,
    getConfiguration: () => config,
    getDeployment: () => deployment,
    getCurrentDeployment: () => (deployment ? "Production" : undefined),
    completeNamespace: (type: string) => (type.includes("/") ? type : `Webda/${type}`),
    getModules: () => ({
      moddas: {
        "Webda/CloudFormationDeployer": { Import: "", capabilities: ["deployer"] },
        "Webda/ImageBuilder": { Import: "", capabilities: ["deployer"] },
        "Webda/HttpServer": { Import: "" }
      },
      beans: {}
    })
  };
}

@suite
class CliDeploymentTest {
  @test
  extractDeployment() {
    assert.deepStrictEqual(extractDeploymentArgument(["-d", "Production", "deploy", "-d"]), {
      deployment: "Production",
      argv: ["deploy", "-d"]
    });
    assert.deepStrictEqual(extractDeploymentArgument(["--log-stream", "stderr", "-dProduction", "deploy"]), {
      deployment: "Production",
      argv: ["--log-stream", "stderr", "deploy"]
    });
    assert.deepStrictEqual(extractDeploymentArgument(["--console-patch", "deploy", "-d", "x"]), {
      deployment: undefined,
      argv: ["--console-patch", "deploy", "-d", "x"]
    });
    // After the command name, -d belongs to the command
    assert.deepStrictEqual(extractDeploymentArgument(["deploy", "-d", "x"]), {
      deployment: undefined,
      argv: ["deploy", "-d", "x"]
    });
    // --deployment is accepted anywhere
    assert.deepStrictEqual(extractDeploymentArgument(["deploy", "--deployment=Dev"]), {
      deployment: "Dev",
      argv: ["deploy"]
    });
    assert.deepStrictEqual(extractDeploymentArgument(["deploy", "--deployment", "Dev", "--", "--deployment", "x"]), {
      deployment: "Dev",
      argv: ["deploy", "--", "--deployment", "x"]
    });
    assert.throws(() => extractDeploymentArgument(["-d"]), /requires a deployment name/);
  }

  @test
  mergesOnlyUnitsProvidingTheCommand() {
    const app = deploymentApp(
      {
        resources: { region: "eu-west-1" },
        units: [
          { name: "Stack", type: "CloudFormationDeployer" },
          { name: "Image", type: "ImageBuilder" }
        ]
      },
      { HttpServer: { type: "Webda/HttpServer" } }
    );
    const cmdInfo: any = {
      services: [{ name: "Webda/CloudFormationDeployer", method: "deploy", type: "Webda/CloudFormationDeployer" }]
    };
    assert.deepStrictEqual(prepareDeploymentUnits(app, "deploy", cmdInfo), ["Stack"]);
    assert.deepStrictEqual(app.config.services.Stack, { type: "Webda/CloudFormationDeployer", region: "eu-west-1" });
    assert.strictEqual(app.config.services.Image, undefined);
    // The deployer is provided by the unit: no default instance is injected
    ensureCommandServices(app, cmdInfo.services);
    assert.deepStrictEqual(Object.keys(app.config.services), ["HttpServer", "Stack"]);
  }

  @test
  appCommandsDoNotInstantiateUnits() {
    const app = deploymentApp({ units: [{ name: "Stack", type: "CloudFormationDeployer" }] });
    const cmdInfo: any = { services: [{ name: "Webda/HttpServer", method: "serve", type: "Webda/HttpServer" }] };
    assert.deepStrictEqual(prepareDeploymentUnits(app, "serve", cmdInfo), []);
    assert.strictEqual(app.config.services.Stack, undefined);
  }

  @test
  deployerCommandRequiresADeployment() {
    const cmdInfo: any = {
      services: [{ name: "Webda/CloudFormationDeployer", method: "deploy", type: "Webda/CloudFormationDeployer" }]
    };
    assert.throws(
      () => prepareDeploymentUnits(deploymentApp(undefined), "deploy", cmdInfo),
      /Command 'deploy' is run by deployers: select a deployment with -d <name>/
    );
    assert.throws(
      () =>
        prepareDeploymentUnits(deploymentApp({ units: [{ name: "Image", type: "ImageBuilder" }] }), "deploy", cmdInfo),
      /Deployment 'Production' has no unit of type Webda\/CloudFormationDeployer for command 'deploy'/
    );
    // Deployers are never injected by default
    const app = deploymentApp(undefined);
    ensureCommandServices(app, cmdInfo.services);
    assert.deepStrictEqual(app.config.services, {});
  }

  @test
  unitConflictsWithAppService() {
    const app = deploymentApp({ units: [{ name: "store", type: "CloudFormationDeployer" }] }, { store: { type: "X" } });
    const cmdInfo: any = {
      services: [{ name: "Webda/CloudFormationDeployer", method: "deploy", type: "Webda/CloudFormationDeployer" }]
    };
    assert.throws(
      () => prepareDeploymentUnits(app, "deploy", cmdInfo),
      /conflicts with the application service 'store'/
    );
  }
}
