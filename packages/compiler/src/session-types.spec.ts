import { suite, test } from "@webda/test";
import * as assert from "assert";
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateSessionTypes } from "./session-types.js";

@suite
class GenerateSessionTypesTest {
  tmp!: string;

  beforeEach() {
    this.tmp = mkdtempSync(join(tmpdir(), "session-types-"));
  }

  afterEach() {
    rmSync(this.tmp, { recursive: true, force: true });
  }

  /**
   * Write a JSON file to the temp project root, creating any missing parent
   * directories first.
   * @param rel - relative path under the temp root
   * @param value - object to serialize
   */
  writeJson(rel: string, value: unknown) {
    const full = join(this.tmp, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, JSON.stringify(value, null, 2));
  }

  @test
  doesNothingWhenNoSessionField() {
    this.writeJson("webda.config.json", { version: 3, services: {} });
    this.writeJson("webda.module.json", { models: {} });

    generateSessionTypes(this.tmp);

    assert.strictEqual(existsSync(join(this.tmp, ".webda/session-types.d.ts")), false);
  }

  @test
  emitsSessionTypesWhenSessionIsConfigured() {
    this.writeJson("webda.config.json", { version: 3, session: "MyApp/Session" });
    this.writeJson("webda.module.json", {
      models: {
        list: { "MyApp/Session": "src/models/session.ts:Session" }
      }
    });

    generateSessionTypes(this.tmp);

    const out = readFileSync(join(this.tmp, ".webda/session-types.d.ts"), "utf-8");
    assert.ok(out.includes('declare module "@webda/core"'));
    assert.ok(out.includes("interface WebdaSessionRegistry"));
    assert.ok(out.includes("session: __ResolvedSession"));
    assert.match(out, /import type \{ Session as __ResolvedSession \} from ".*src\/models\/session/);
  }

  @test
  throwsWhenSessionModelIsNotDeclared() {
    this.writeJson("webda.config.json", { version: 3, session: "MyApp/Missing" });
    this.writeJson("webda.module.json", { models: { list: {} } });

    assert.throws(() => generateSessionTypes(this.tmp), /MyApp\/Missing/);
  }

  @test
  supportsNamespacelessModelId() {
    this.writeJson("webda.config.json", { version: 3, session: "Session" });
    this.writeJson("webda.module.json", {
      models: {
        list: { "MyApp/Session": "src/models/session.ts:Session" }
      }
    });

    generateSessionTypes(this.tmp);

    const out = readFileSync(join(this.tmp, ".webda/session-types.d.ts"), "utf-8");
    assert.ok(out.includes("Session as __ResolvedSession"));
  }
}

@suite
class GenerateSessionTypesModuleGeneratorIntegrationTest {
  tmp!: string;

  beforeEach() {
    this.tmp = mkdtempSync(join(tmpdir(), "session-types-int-"));
  }

  afterEach() {
    rmSync(this.tmp, { recursive: true, force: true });
  }

  @test
  runningAfterModuleGenerationLeavesBothFilesInWebdaDir() {
    // Simulate state at the end of generateTypescriptLibrary: webda.module.json
    // already exists, webda.config.json has session.
    mkdirSync(join(this.tmp, ".webda"), { recursive: true });
    writeFileSync(join(this.tmp, ".webda/module.d.ts"), "// existing");
    writeFileSync(
      join(this.tmp, "webda.config.json"),
      JSON.stringify({
        version: 3,
        session: "WebdaSample/Session"
      })
    );
    writeFileSync(
      join(this.tmp, "webda.module.json"),
      JSON.stringify({
        models: { list: { "WebdaSample/Session": "src/models/session.ts:Session" } }
      })
    );

    generateSessionTypes(this.tmp);

    // module.d.ts is preserved (we don't overwrite); session-types.d.ts is added.
    assert.strictEqual(readFileSync(join(this.tmp, ".webda/module.d.ts"), "utf-8"), "// existing");
    assert.strictEqual(existsSync(join(this.tmp, ".webda/session-types.d.ts")), true);
  }
}
