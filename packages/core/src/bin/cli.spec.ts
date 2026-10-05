import { suite, test } from "@webda/test";
import * as assert from "assert";
import type { JSONSchema7 } from "json-schema";
import { CancelablePromise } from "@webda/utils";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";
import { vi } from "vitest";
import {
  buildCli,
  createCommandShutdown,
  onInterrupt,
  reportServiceCommand,
  settleServiceCommand,
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
function makeOps(operations: Record<string, OperationEntry>, schemas: Record<string, JSONSchema7> = {}): OperationsFile {
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
