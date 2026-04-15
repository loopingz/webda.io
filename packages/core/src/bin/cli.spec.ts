import { suite, test } from "@webda/test";
import * as assert from "assert";
import type { JSONSchema7 } from "json-schema";
import {
  buildCli,
  loadOperations,
  addServiceCommandsToCli,
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
