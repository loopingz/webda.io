import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Command } from "./command.js";
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
