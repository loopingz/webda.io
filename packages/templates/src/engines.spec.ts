import { suite, test } from "@webda/test";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";
import * as assert from "assert";
import { getEngineForExtension, getTemplateEngine, listTemplateEngines, registerTemplateEngine } from "./index.js";
import type { TemplateEngine } from "./index.js";

/**
 * Build a fake engine
 * @param extensions - handled extensions
 * @returns the engine
 */
function fake(...extensions: string[]): TemplateEngine {
  return { extensions, compile: () => () => "" };
}

@suite
class EnginesTest {
  @test
  registerAndGet() {
    const e = fake("fake");
    registerTemplateEngine("fake", e);
    assert.strictEqual(getTemplateEngine("fake"), e);
    assert.ok(listTemplateEngines().includes("mustache"));
    assert.ok(listTemplateEngines().includes("fake"));
  }

  @test
  rejectsInvalidName() {
    assert.throws(() => registerTemplateEngine("a b", fake("x")), /Invalid template engine name 'a b'/);
  }

  @test
  warnsOnReplace() {
    const logger = new MemoryLogger(useWorkerOutput(), "TRACE", 2000, true);
    try {
      registerTemplateEngine("dup", fake("d"));
      registerTemplateEngine("dup", fake("d"));
    } finally {
      logger.close();
    }
    const warns = logger
      .getMessages()
      .filter(m => JSON.stringify(m).includes("dup") && JSON.stringify(m).includes("WARN"));
    assert.strictEqual(warns.length, 1);
  }

  @test
  extensionTieBreak() {
    registerTemplateEngine("first", fake("x"));
    registerTemplateEngine("second", fake("x"));
    assert.strictEqual(getEngineForExtension("x")?.name, "first");
    assert.strictEqual(getEngineForExtension("x", "second")?.name, "second");
    assert.strictEqual(getEngineForExtension("nope"), undefined);
  }

  @test
  async mustacheCompile() {
    const compiled = await getTemplateEngine("mustache")!.compile("Hi {{name}} {{>p}}", { partials: { p: "!" } });
    assert.strictEqual(await compiled({ name: "a&b" }), "Hi a&amp;b !");
  }
}
