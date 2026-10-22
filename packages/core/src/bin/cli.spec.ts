import { suite, test } from "@webda/test";
import * as assert from "assert";
import type { JSONSchema7 } from "json-schema";
import { CancelablePromise } from "@webda/utils";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";
import { vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  applyDefaultCommand,
  buildCli,
  createCommandShutdown,
  exitAfterFlush,
  onInterrupt,
  reportServiceCommand,
  settleServiceCommand,
  ensureCommandServices,
  extractDeploymentArgument,
  isPackagedApplication,
  loadApplication,
  prepareDeploymentUnits,
  loadOperations,
  addServiceCommandsToCli,
  resolveLogStream,
  runCli,
  shouldPatchConsole,
  unknownCommandMessage,
  type OperationsFile,
  type OperationCall,
  type OperationEntry
} from "./cli.js";
import { Application } from "../application/application.js";
import { UnpackedApplication } from "../application/unpackedapplication.js";
import { getDeployedConfiguration } from "../deployers/packager.js";
import { runWithInstanceStorage } from "../core/instancestorage.js";

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
  async buildCliInstanceActionTakesTheUuidPositional() {
    // An instance action's request schema: the object uuid then the action parameters
    const ops = makeOps(
      { "Task.Rename": { id: "Task.Rename", input: "MyApp/Task.rename.request" } },
      {
        "MyApp/Task.rename.request": {
          type: "object",
          properties: { uuid: { type: "string" }, name: { type: "string" } },
          required: ["uuid", "name"],
          "x-webda-arguments": ["uuid", "name"]
        } as any
      }
    );
    const calls: OperationCall[] = [];
    const cli = buildCli(ops, async call => {
      calls.push(call);
    });
    await cli.parseAsync(["task", "rename", "abc-123", "--name", "x"]);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].parameters.uuid, "abc-123");
    assert.deepStrictEqual(calls[0].input, { name: "x" });
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
    assert.strictEqual(calls[0].parameters.count, undefined);
    await cli.parseAsync(["tasks", "query", "-q", "status = 'active'", "--count"]);
    assert.strictEqual(calls[1].parameters.count, true);
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

  @test
  async addServiceCommandsNestedSubcommands() {
    const { default: yargs } = await import("yargs");
    const service = [{ name: "CryptoService", method: "m", type: "Webda/CryptoService" }];
    const serviceCommands = {
      "config encrypt": {
        description: "Encrypt",
        services: service,
        args: { file: { type: "string", required: true } }
      },
      "config pki generate": {
        description: "Generate",
        services: service,
        args: { kid: { type: "string", required: true } }
      },
      "config pki list": { description: "List", services: service, args: { file: { type: "string", required: true } } }
    };
    const calls: { name: string; args: any }[] = [];
    const parse = async (argv: string[]) => {
      const cli = yargs([]).scriptName("webda").exitProcess(false).fail(false);
      addServiceCommandsToCli(cli, <any>serviceCommands, async (name, args) => {
        calls.push({ name, args });
      });
      return cli.parseAsync(argv);
    };

    await parse(["config", "pki", "generate", "--kid", "k1"]);
    await parse(["config", "pki", "list", "--file", "a.json"]);
    await parse(["config", "encrypt", "--file", "b.json"]);
    assert.deepStrictEqual(
      calls.map(c => [c.name, c.args.kid ?? c.args.file]),
      [
        ["config pki generate", "k1"],
        ["config pki list", "a.json"],
        ["config encrypt", "b.json"]
      ]
    );
    // Each subcommand keeps its own required arguments
    await assert.rejects(() => parse(["config", "pki", "generate"]), /Missing required argument: kid/);
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

@suite
class CliUnknownCommandTest {
  @test
  namesTheCommandAndListsTheAvailableOnes() {
    const message = unknownCommandMessage("nosuchcommand", ["serve", "auth", "openapi"]);
    assert.ok(message.includes("Unknown command 'nosuchcommand'"), message);
    assert.ok(message.includes("Available commands: auth, openapi, serve"), message);
    assert.ok(message.includes("webda --help"), message);
    assert.ok(!message.includes("provided by"), "no package hint for an unknown name");
  }

  @test
  pointsToThePackageProvidingAKnownCommand() {
    const message = unknownCommandMessage("debug", ["serve"]);
    assert.ok(message.includes("Unknown command 'debug'"), message);
    assert.ok(message.includes("'webda debug' is provided by @webda/debug"), message);
    assert.ok(message.includes("pnpm add -D @webda/debug"), message);
  }

  @test
  pointsToEveryPackageProvidingASharedCommand() {
    const message = unknownCommandMessage("deploy", []);
    assert.ok(message.includes("@webda/aws or @webda/oci"), message);
  }
}

@suite
class CliRunCliTest {
  @test
  defaultCommandOnlyWhenNoneIsGiven() {
    const commands = ["serve", "debug", "task", "completion"];
    assert.deepStrictEqual(applyDefaultCommand([], "serve", commands), ["serve"]);
    assert.deepStrictEqual(applyDefaultCommand(["--port", "3000"], "serve", commands), ["serve", "--port", "3000"]);
    assert.deepStrictEqual(applyDefaultCommand(["--port=3000", "-w"], "serve", commands), [
      "serve",
      "--port=3000",
      "-w"
    ]);
    // A command is given, known or not
    assert.deepStrictEqual(applyDefaultCommand(["debug"], "serve", commands), ["debug"]);
    assert.deepStrictEqual(applyDefaultCommand(["--log-stream", "stderr", "task", "get"], "serve", commands), [
      "--log-stream",
      "stderr",
      "task",
      "get"
    ]);
    assert.deepStrictEqual(applyDefaultCommand(["unknown"], "serve", commands), ["unknown"]);
    // --help and --version keep the global help and version
    assert.deepStrictEqual(applyDefaultCommand(["--help"], "serve", commands), ["--help"]);
    assert.deepStrictEqual(applyDefaultCommand(["--version"], "serve", commands), ["--version"]);
    assert.deepStrictEqual(applyDefaultCommand(["serve", "--help"], "serve", commands), ["serve", "--help"]);
    // Without a default command, or after "--", nothing changes
    assert.deepStrictEqual(applyDefaultCommand(["--port", "3000"], undefined, commands), ["--port", "3000"]);
    assert.deepStrictEqual(applyDefaultCommand(["--", "x"], "serve", commands), ["serve", "--", "x"]);
    // Subcommand as default
    assert.deepStrictEqual(applyDefaultCommand([], "auth migrate", commands), ["auth", "migrate"]);
  }

  @test
  defaultCommandWithoutCommandList() {
    // Without the command list a bare word is a command, unless it is a global option value
    assert.deepStrictEqual(applyDefaultCommand(["-w"], "serve"), ["serve", "-w"]);
    assert.deepStrictEqual(applyDefaultCommand(["--port", "3000"], "serve"), ["--port", "3000"]);
    assert.deepStrictEqual(applyDefaultCommand(["--service", "HttpServer"], "serve"), [
      "serve",
      "--service",
      "HttpServer"
    ]);
  }

  @test
  async importingDoesNotRunTheCli() {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as any);
    try {
      const mod = await import("./cli.js");
      assert.strictEqual(typeof mod.runCli, "function");
      assert.strictEqual(exit.mock.calls.length, 0);
    } finally {
      exit.mockRestore();
    }
    // The compiled module, imported by an application executable, in a real node process
    const lib = fileURLToPath(new URL("../../lib/bin/cli.js", import.meta.url));
    if (!existsSync(lib)) {
      return;
    }
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "const m = await import(process.env.WEBDA_CLI); console.log(typeof m.runCli, typeof m.applyDefaultCommand)"
      ],
      {
        env: { ...process.env, WEBDA_CLI: pathToFileURL(lib).href, WEBDA_APP_PATH: "/nonexistent" },
        encoding: "utf-8",
        timeout: 30000
      }
    );
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stdout.trim(), "function function");
  }

  @test
  async importingWithoutAScriptPathDoesNotRunTheCli() {
    const originalArgv = process.argv;
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as any);
    try {
      process.argv = [process.execPath, "/nonexistent/webda-cli"];
      vi.resetModules();
      const mod = await import("./cli.js");
      assert.strictEqual(typeof mod.runCli, "function");
      assert.strictEqual(exit.mock.calls.length, 0);
    } finally {
      exit.mockRestore();
      process.argv = originalArgv;
      vi.resetModules();
    }
  }
}

@suite
class CliApplicationConfigurationTest {
  @test
  async runCliLoadsApplicationConfigurationInProcess() {
    const app = mkdtempSync(join(tmpdir(), "webda-cli-app-"));
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("CLI test exit");
    });
    try {
      writeFileSync(
        join(app, "package.json"),
        JSON.stringify({ name: "mini", version: "1.0.0", type: "module", webda: { cli: { name: "mini-runner" } } })
      );
      writeFileSync(join(app, "webda.config.json"), JSON.stringify({ version: 4, services: {} }));
      writeFileSync(
        join(app, "webda.module.json"),
        JSON.stringify({ moddas: {}, beans: {}, deployers: {}, models: {}, schemas: {} })
      );
      await assert.rejects(runCli({ appPath: app, argv: ["unknown", "--console-patch=false"] }), /CLI test exit/);
      assert.ok(exit.mock.calls.length > 0);
    } finally {
      exit.mockRestore();
      rmSync(app, { recursive: true, force: true });
    }
  }

  @test
  async runCliUsesEnvironmentPathAndDiscoversOperations() {
    const app = mkdtempSync(join(tmpdir(), "webda-cli-app-"));
    const originalPath = process.env.WEBDA_APP_PATH;
    const originalArgv = process.argv;
    const originalCwd = process.cwd();
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("CLI test exit");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      writeFileSync(
        join(app, "package.json"),
        JSON.stringify({ name: "mini", version: "1.0.0", type: "module", webda: { cli: { name: "mini-runner" } } })
      );
      writeFileSync(join(app, "webda.config.json"), JSON.stringify({ version: 4, services: {} }));
      writeFileSync(join(app, "runner.js"), "export class Runner {}\n");
      writeFileSync(
        join(app, "webda.module.json"),
        JSON.stringify({
          $schema: "https://webda.io/schemas/webda.module.v4.json",
          moddas: {
            "Mini/Runner": {
              Import: "runner.js:Runner",
              commands: { hello: { method: "hello", description: "Say hello" } }
            }
          },
          beans: {},
          deployers: {},
          models: {},
          schemas: {}
        })
      );
      mkdirSync(join(app, ".webda"));
      writeFileSync(
        join(app, ".webda", "operations.json"),
        JSON.stringify({ operations: { "Task.Get": { id: "Task.Get", input: "void", output: "void" } }, schemas: {} })
      );
      process.env.WEBDA_APP_PATH = app;
      process.argv = [process.execPath, "webda", "unknown", "--console-patch=false"];
      await assert.rejects(runCli(), /CLI test exit/);
      delete process.env.WEBDA_APP_PATH;
      vi.mocked(process.cwd).mockReturnValue(app);
      await assert.rejects(runCli({ argv: ["unknown", "--console-patch=false"] }), /CLI test exit/);
      assert.ok(exit.mock.calls.length > 0);
      assert.ok(error.mock.calls.flat().join(" ").includes("Available commands: hello, task"));
    } finally {
      exit.mockRestore();
      error.mockRestore();
      vi.mocked(process.cwd).mockReturnValue(originalCwd);
      process.argv = originalArgv;
      if (originalPath === undefined) delete process.env.WEBDA_APP_PATH;
      else process.env.WEBDA_APP_PATH = originalPath;
      rmSync(app, { recursive: true, force: true });
    }
  }

  /**
   * Run the compiled CLI on a minimal application declaring `webda.cli`
   * @param script - module code run with `cli` (the compiled cli.js path) and `app` (the application folder)
   * @param args - arguments of the node process
   * @param cli - the `webda.cli` section of the application package.json
   * @param operations - operation ids written to `.webda/operations.json`, if any
   * @returns the output (stdout and stderr), undefined when the CLI is not compiled
   */
  run(
    script: string | undefined,
    args: string[] = [],
    cli: any = { name: "mini-runner", defaultCommand: "hello", exclude: ["ghost"] },
    operations?: string[]
  ): string | undefined {
    const lib = fileURLToPath(new URL("../../lib/bin/cli.js", import.meta.url));
    if (!existsSync(lib)) {
      return undefined;
    }
    const app = mkdtempSync(join(tmpdir(), "webda-cli-app-"));
    try {
      writeFileSync(
        join(app, "package.json"),
        JSON.stringify({
          name: "mini",
          version: "1.0.0",
          type: "module",
          webda: { cli }
        })
      );
      if (operations) {
        mkdirSync(join(app, ".webda"));
        writeFileSync(
          join(app, ".webda", "operations.json"),
          JSON.stringify({
            operations: Object.fromEntries(operations.map(id => [id, { id, input: "void", output: "void" }])),
            schemas: {}
          })
        );
      }
      writeFileSync(join(app, "webda.config.json"), JSON.stringify({ version: 4, services: {} }));
      writeFileSync(
        join(app, "webda.module.json"),
        JSON.stringify({
          $schema: "https://webda.io/schemas/webda.module.v4.json",
          moddas: {},
          beans: {},
          deployers: {},
          models: {},
          schemas: {}
        })
      );
      const nodeArgs = script === undefined ? [lib, ...args] : ["--input-type=module", "-e", script, ...args];
      const result = spawnSync(process.execPath, nodeArgs, {
        cwd: tmpdir(),
        env: { ...process.env, CLI: pathToFileURL(lib).href, APP: app, WEBDA_APP_PATH: app, FORCE_COLOR: "0" },
        encoding: "utf-8",
        timeout: 60000
      });
      return `${result.stdout}${result.stderr}`;
    } finally {
      rmSync(app, { recursive: true, force: true });
    }
  }

  @test
  runCliUsesTheApplicationNameAndDefaultCommand() {
    const help = this.run(
      "const { runCli } = await import(process.env.CLI); await runCli({ appPath: process.env.APP, argv: ['--help'] })"
    );
    if (help === undefined) return;
    assert.ok(help.includes("mini-runner <command> [options]"), help);
    // include/exclude apply: the unknown entry is reported
    assert.ok(help.includes("webda.cli.exclude: no command 'ghost'"), help);
    // No command given: the default one runs
    const run = this.run(
      "const { runCli } = await import(process.env.CLI); await runCli({ appPath: process.env.APP, argv: [] })"
    );
    assert.ok(run.includes("Unknown command 'hello'"), run);
    assert.ok(run.includes("Run 'mini-runner --help'"), run);
    // The options win over the configuration
    const options = this.run(
      "const { runCli } = await import(process.env.CLI); await runCli({ appPath: process.env.APP, argv: [], name: 'other', defaultCommand: 'bye' })"
    );
    assert.ok(options.includes("Unknown command 'bye'"), options);
    assert.ok(options.includes("Run 'other --help'"), options);
  }

  @test
  webdaCommandKeepsItsNameWithoutDefaultCommand() {
    const help = this.run(undefined, ["--help"]);
    if (help === undefined) return;
    assert.ok(help.includes("webda <command> [options]"), help);
    assert.ok(help.includes("webda.cli.exclude: no command 'ghost'"), help);
    const none = this.run(undefined, []);
    assert.ok(!none.includes("hello"), none);
    assert.ok(none.includes("Specify a command"), none);
  }

  @test
  includeAndExcludeSelectOperationGroups() {
    const operations = ["RunnerAuth.Login", "RunnerAuth.Status", "AcpRelay.Connect", "Task.Get"];
    const cli = { name: "mini-runner", include: ["runnerauth", "acprelay", "nope"], exclude: ["runnerauth status"] };
    const runCliScript = (argv: string[]) =>
      `const { runCli } = await import(process.env.CLI); await runCli({ appPath: process.env.APP, argv: ${JSON.stringify(argv)} })`;
    const help = this.run(runCliScript(["--help"]), [], cli, operations);
    if (help === undefined) return;
    assert.ok(/^\s+mini-runner runnerauth\b/m.test(help), help);
    assert.ok(/^\s+mini-runner acprelay\b/m.test(help), help);
    assert.ok(!/^\s+mini-runner task\b/m.test(help), help);
    // Only the entry matching neither a command nor an operation is reported
    assert.ok(help.includes("webda.cli.include: no command 'nope'"), help);
    assert.ok(!help.includes("no command 'runnerauth"), help);
    assert.ok(!help.includes("no command 'acprelay'"), help);
    // One operation of a group excluded
    const group = this.run(runCliScript(["runnerauth", "--help"]), [], cli, operations);
    assert.ok(group.includes("runnerauth login"), group);
    assert.ok(!group.includes("runnerauth status"), group);
    // A group left out is not runnable
    const task = this.run(runCliScript(["task", "get"]), [], cli, operations);
    assert.ok(task.includes("Unknown command 'task'"), task);
    // The webda command applies the same selection
    const webda = this.run(undefined, ["--help"], { exclude: ["task", "runnerauth login"] }, operations);
    assert.ok(/^\s+webda runnerauth\b/m.test(webda), webda);
    assert.ok(!/^\s+webda task\b/m.test(webda), webda);
    assert.ok(!webda.includes("webda.cli.exclude"), webda);
  }

  @test
  async directEntryUsesWebdaConfiguration() {
    const app = mkdtempSync(join(tmpdir(), "webda-cli-app-"));
    const originalArgv = process.argv;
    const originalPath = process.env.WEBDA_APP_PATH;
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("CLI test exit");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      writeFileSync(
        join(app, "package.json"),
        JSON.stringify({
          name: "mini",
          version: "1.0.0",
          type: "module",
          webda: { cli: { name: "mini-runner", defaultCommand: "hello" } }
        })
      );
      writeFileSync(join(app, "webda.config.json"), JSON.stringify({ version: 4, services: {} }));
      writeFileSync(
        join(app, "webda.module.json"),
        JSON.stringify({ moddas: {}, beans: {}, deployers: {}, models: {}, schemas: {} })
      );
      process.env.WEBDA_APP_PATH = app;
      process.argv = [
        process.execPath,
        fileURLToPath(new URL("./cli.ts", import.meta.url)),
        "unknown",
        "--console-patch=false"
      ];
      vi.resetModules();
      await assert.rejects(import("./cli.js"), /CLI test exit/);
      assert.ok(exit.mock.calls.length > 0);
      assert.ok(error.mock.calls.flat().join(" ").includes("Run 'webda --help' for details."));
    } finally {
      exit.mockRestore();
      error.mockRestore();
      process.argv = originalArgv;
      if (originalPath === undefined) delete process.env.WEBDA_APP_PATH;
      else process.env.WEBDA_APP_PATH = originalPath;
      vi.resetModules();
      rmSync(app, { recursive: true, force: true });
    }
  }
}

/**
 * Write a file, creating its folders
 * @param file - the file path
 * @param content - the content, objects are written as JSON
 */
function write(file: string, content: any = "") {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
}

/**
 * A webda.module.json in the v4 format
 * @param moddas - the moddas of the module
 * @returns the module
 */
function webdaModule(moddas: Record<string, any>): any {
  return {
    $schema: "https://webda.io/schemas/webda.module.v4.json",
    moddas,
    beans: {},
    deployers: {},
    models: {},
    schemas: {}
  };
}

@suite
class CliPackagedApplicationTest {
  root: string;
  appPath: string;

  beforeEach() {
    this.root = realpathSync(mkdtempSync(join(tmpdir(), "webda-packaged-")));
    this.appPath = join(this.root, "app");
    mkdirSync(this.appPath);
  }

  afterEach() {
    rmSync(this.root, { recursive: true, force: true });
  }

  @test
  isPackaged() {
    assert.strictEqual(isPackagedApplication(this.appPath), false, "no configuration");
    write(join(this.appPath, "webda.config.json"), { version: 4, services: {} });
    assert.strictEqual(isPackagedApplication(this.appPath), false, "plain configuration");
    write(join(this.appPath, "webda.config.json"), { $packaged: { deployment: "Prod" }, version: 4, services: {} });
    assert.strictEqual(isPackagedApplication(this.appPath), true, "inline marker");
    write(join(this.appPath, "webda.config.json"), { version: 4, services: {} });
    write(join(this.appPath, ".webda/packaged.json"), { deployment: "Prod" });
    assert.strictEqual(isPackagedApplication(this.appPath), true, "marker file");
  }

  @test
  async shadowedInlineMarker() {
    // webda.config.jsonc takes precedence over the packaged webda.config.json
    write(join(this.appPath, "webda.config.json"), { $packaged: { deployment: "Prod" }, version: 4, services: {} });
    write(join(this.appPath, "webda.config.jsonc"), { version: 4, services: {} });
    let packaged: boolean;
    const logs = await captureLogs(() => (packaged = isPackagedApplication(this.appPath)));
    assert.strictEqual(packaged, false);
    assert.ok(
      logs.some(l => l.startsWith("WARN") && l.includes("webda.config.jsonc") && l.includes("$packaged")),
      logs.join("\n")
    );
  }

  @test
  async configOnlyOutputRuns() {
    // An application with a pnpm style dependency, both providing a modda
    const store = join(this.root, "node_modules/.pnpm/b@1.0.0/node_modules/b");
    write(join(store, "package.json"), { name: "b", version: "1.0.0", type: "module" });
    write(join(store, "webda.module.json"), webdaModule({ "B/Service": { Import: "lib/b:Service" } }));
    write(join(store, "lib/b.js"), "export class Service {}");
    write(join(this.appPath, "package.json"), {
      name: "app",
      version: "1.0.0",
      type: "module",
      dependencies: { b: "1" }
    });
    write(join(this.appPath, "webda.config.jsonc"), { version: 4, parameters: { apiUrl: "http://local" } });
    write(join(this.appPath, "deployments/Prod.json"), { parameters: { apiUrl: "https://prod" } });
    write(join(this.appPath, "webda.module.json"), webdaModule({ "App/Local": { Import: "lib/app:Local" } }));
    write(join(this.appPath, "lib/app.js"), "export class Local {}");
    mkdirSync(join(this.appPath, "node_modules"));
    symlinkSync(store, join(this.appPath, "node_modules/b"));
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.email=test@webda.io", "-c", "user.name=test", ...args], {
        cwd: this.root,
        stdio: "pipe"
      });
    git("init", "-q");
    git("add", "-A");
    git("commit", "-q", "-m", "init");

    // webda -d Prod package --config-only
    const configuration = await runWithInstanceStorage({}, async () => {
      const source = new UnpackedApplication(this.appPath);
      source.setCurrentDeployment("Prod");
      await source.load();
      return getDeployedConfiguration(source, { marker: true });
    });

    // Written as the webda.config.json of a copy keeping the build layout
    const copy = join(this.root, "copy");
    write(join(copy, "package.json"), { name: "app", version: "1.0.0", type: "module" });
    write(join(copy, "webda.config.json"), JSON.stringify(configuration, undefined, 2));
    symlinkSync(join(this.appPath, "lib"), join(copy, "lib"));
    symlinkSync(join(this.appPath, "node_modules"), join(copy, "node_modules"));
    assert.strictEqual(isPackagedApplication(copy), true);

    let app: Application;
    const logs = await captureLogs(() => (app = loadApplication(copy)));
    assert.ok(!(app instanceof UnpackedApplication), "loaded as packaged");
    assert.ok(
      logs.some(l => l.startsWith("INFO") && l.includes("$packaged")),
      "the inline marker is logged"
    );
    await runWithInstanceStorage({}, () => app.load());
    assert.strictEqual(app.getCurrentDeployment(), "Prod");
    assert.strictEqual(app.getConfiguration().parameters.apiUrl, "https://prod");
    // The git information baked at build time
    assert.ok(configuration.$packaged.git.commit);
    assert.deepStrictEqual(app.getGitInformation(), configuration.$packaged.git);
    // Every import resolves from the copy
    const modules: any = app.getModules();
    for (const section of ["moddas", "beans", "deployers", "models"]) {
      for (const [name, definition] of Object.entries<any>(modules[section] ?? {})) {
        assert.ok(existsSync(join(copy, definition.Import.split(":")[0] + ".js")), `${name}: ${definition.Import}`);
      }
    }
    assert.ok(app.getModda("App/Local"));
    assert.ok(app.getModda("B/Service"));
  }
}
