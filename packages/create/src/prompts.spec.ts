import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { OptionsError, parseCliArgs } from "./options.js";
import { Prompter, resolveOptions } from "./prompts.js";

/**
 * Prompter returning scripted answers and recording the questions asked
 */
class FakePrompter implements Prompter {
  asked: string[] = [];
  constructor(private answers: Record<string, any> = {}) {}
  async text(message: string, initial: string) {
    this.asked.push(message);
    return this.answers[message] ?? initial;
  }
  async select<T extends string>(message: string, _options: T[], initial: T) {
    this.asked.push(message);
    return this.answers[message] ?? initial;
  }
  async multiselect<T extends string>(message: string, _options: T[], initial: T[]) {
    this.asked.push(message);
    return this.answers[message] ?? initial;
  }
}

/**
 * Prompter simulating Ctrl-C
 */
class CancelPrompter implements Prompter {
  async text(): Promise<string> {
    throw new OptionsError("Cancelled");
  }
  async select<T extends string>(): Promise<T> {
    throw new OptionsError("Cancelled");
  }
  async multiselect<T extends string>(): Promise<T[]> {
    throw new OptionsError("Cancelled");
  }
}

@suite
class PromptsTest {
  @test
  async nonInteractiveNeverPrompts() {
    const prompter = new FakePrompter();
    const options = await resolveOptions(parseCliArgs(["my-app"]), {
      interactive: false,
      prompter,
      cwd: "/work",
      userAgent: "pnpm/10.32.0"
    });
    assert.deepStrictEqual(prompter.asked, []);
    assert.deepStrictEqual(options, {
      dir: "/work/my-app",
      store: "memory",
      transports: ["rest"],
      namespace: "MyApp",
      pm: "pnpm",
      install: true,
      git: true,
      linkWorkspace: undefined
    });
  }

  @test
  async nonInteractiveRequiresDir() {
    await assert.rejects(
      resolveOptions(parseCliArgs(["--yes"]), { interactive: false, prompter: new FakePrompter(), cwd: "/work" }),
      /directory/
    );
  }

  @test
  async interactivePromptsOnlyMissingValues() {
    const prompter = new FakePrompter({ "Which store?": "postgres" });
    const options = await resolveOptions(parseCliArgs(["--transports", "graphql"]), {
      interactive: true,
      prompter,
      cwd: "/work"
    });
    assert.deepStrictEqual(prompter.asked, ["Project directory", "Which store?"]);
    assert.strictEqual(options.dir, "/work/my-webda-app");
    assert.strictEqual(options.store, "postgres");
    assert.deepStrictEqual(options.transports, ["graphql"]);
  }

  @test
  async interactiveRejectsEmptyTransportSelection() {
    const prompter = new FakePrompter({ "Which transports?": [] });
    await assert.rejects(
      resolveOptions(parseCliArgs(["my-app", "--store", "memory"]), { interactive: true, prompter, cwd: "/work" }),
      OptionsError
    );
  }

  @test
  async currentDirectoryUsesItsBasename() {
    const options = await resolveOptions(parseCliArgs(["."]), {
      interactive: false,
      prompter: new FakePrompter(),
      cwd: "/work/My Shop"
    });
    assert.strictEqual(options.dir, "/work/My Shop");
    assert.strictEqual(options.namespace, "MyShop");
  }

  @test
  async cancellationPropagates() {
    await assert.rejects(
      resolveOptions(parseCliArgs([]), { interactive: true, prompter: new CancelPrompter(), cwd: "/work" }),
      /Cancelled/
    );
  }
}
