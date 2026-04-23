import { suite, test } from "@webda/test";
import * as assert from "assert";
import { BuildCommand, Command } from "./command.js";
import { Service } from "../index.js";

class MyService extends Service {
  @Command("serve", { description: "Serve the app" })
  async serve() {}

  @Command("aws s3", { description: "AWS S3 operations" })
  async awsS3() {}
}

class MultiCommandService extends Service {
  @Command("start", { description: "Start the service" })
  async start() {}

  @Command("stop", { description: "Stop the service" })
  async stop() {}

  @Command("restart", { description: "Restart the service" })
  async restart() {}
}

@suite
class CommandDecoratorTest {
  @test
  storesCommandMetadata() {
    const commands = (MyService as any)[Symbol.metadata]["webda.commands"] as any[];
    assert.ok(Array.isArray(commands), "webda.commands should be an array");

    const serveCmd = commands.find(c => c.name === "serve");
    assert.ok(serveCmd, "serve command should be registered");
    assert.strictEqual(serveCmd.description, "Serve the app");
    assert.strictEqual(serveCmd.method, "serve");
  }

  @test
  storesSubcommandNames() {
    const commands = (MyService as any)[Symbol.metadata]["webda.commands"] as any[];

    const s3Cmd = commands.find(c => c.name === "aws s3");
    assert.ok(s3Cmd, "aws s3 subcommand should be registered");
    assert.strictEqual(s3Cmd.description, "AWS S3 operations");
    assert.strictEqual(s3Cmd.method, "awsS3");
  }

  @test
  storesMultipleCommandsOnDifferentMethods() {
    const commands = (MultiCommandService as any)[Symbol.metadata]["webda.commands"] as any[];
    assert.ok(Array.isArray(commands), "webda.commands should be an array");
    assert.strictEqual(commands.length, 3, "Should have 3 commands");

    const names = commands.map(c => c.name);
    assert.ok(names.includes("start"), "start command should be registered");
    assert.ok(names.includes("stop"), "stop command should be registered");
    assert.ok(names.includes("restart"), "restart command should be registered");
  }

  @test
  phaseDefaultsToUndefinedWhenNotSpecified() {
    class Foo extends Service {
      @Command("foo", { description: "x" })
      async foo() {}
    }
    const commands = (Foo as any)[Symbol.metadata]["webda.commands"] as any[];
    const fooCmd = commands.find(c => c.name === "foo");
    assert.ok(fooCmd, "foo command should be registered");
    assert.strictEqual(fooCmd.phase, undefined);
  }

  @test
  storesResolvedPhaseWhenProvided() {
    class Bar extends Service {
      @Command("bar", { description: "x", phase: "resolved" })
      async bar() {}
    }
    const commands = (Bar as any)[Symbol.metadata]["webda.commands"] as any[];
    const barCmd = commands.find(c => c.name === "bar");
    assert.ok(barCmd, "bar command should be registered");
    assert.strictEqual(barCmd.phase, "resolved");
  }
}

@suite
class BuildCommandDecoratorTest {
  @test
  storesBuildCommandWithDescriptionAndResolvedPhase() {
    class GrpcService extends Service {
      @BuildCommand({ description: "Generate proto" })
      async build() {}
    }
    const commands = (GrpcService as any)[Symbol.metadata]["webda.commands"] as any[];
    assert.ok(Array.isArray(commands), "webda.commands should be an array");
    const buildCmd = commands.find(c => c.name === "build");
    assert.ok(buildCmd, "build command should be registered");
    assert.strictEqual(buildCmd.name, "build");
    assert.strictEqual(buildCmd.phase, "resolved");
    assert.strictEqual(buildCmd.description, "Generate proto");
    assert.strictEqual(buildCmd.method, "build");
  }

  @test
  preservesRequiresOption() {
    class SchemaService extends Service {
      @BuildCommand({ description: "x", requires: ["rest-domain"] })
      async build() {}
    }
    const commands = (SchemaService as any)[Symbol.metadata]["webda.commands"] as any[];
    const buildCmd = commands.find(c => c.name === "build");
    assert.ok(buildCmd, "build command should be registered");
    assert.deepStrictEqual(buildCmd.requires, ["rest-domain"]);
    assert.strictEqual(buildCmd.phase, "resolved");
  }

  @test
  worksWithNoOptions() {
    class MinimalService extends Service {
      @BuildCommand()
      async build() {}
    }
    const commands = (MinimalService as any)[Symbol.metadata]["webda.commands"] as any[];
    const buildCmd = commands.find(c => c.name === "build");
    assert.ok(buildCmd, "build command should be registered");
    assert.strictEqual(buildCmd.name, "build");
    assert.strictEqual(buildCmd.phase, "resolved");
  }
}
