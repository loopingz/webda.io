import { suite, test } from "@webda/test";
import * as assert from "assert";
import { execFile } from "child_process";
import { existsSync } from "fs";
import { mkdtemp, readFile, rm } from "fs/promises";
import { resolve } from "path";
import { pathToFileURL } from "url";
import { promisify } from "util";
import { importEmail } from "./loader.js";
import { legacyRender } from "../test/legacy-email-renderer.js";

/**
 * Run a module script with plain node: no loader, no vitest transform
 * @param script - the ES module source
 * @returns the process stdout
 */
async function runNode(script: string): Promise<string> {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], {
    cwd: resolve("."),
    env
  });
  return stdout;
}

/**
 * The compiled package (built by `pretest`) under plain node, as the `webda` and `webdac` launchers run it
 */
@suite
class PlainNodeTest {
  output: string;

  async afterEach() {
    if (this.output) {
      await rm(this.output, { recursive: true, force: true });
    }
  }

  @test
  async precompileTsxSources() {
    this.output = await mkdtemp(resolve("test/tmp-"));
    const lib = pathToFileURL(resolve("lib/precompile.js")).href;
    await runNode(
      `const { precompile } = await import(${JSON.stringify(lib)});\n` +
        `const result = await precompile({ source: "test/emails-precompile", output: ${JSON.stringify(this.output)} });\n` +
        `if (result.failed.length) process.exit(2);`
    );
    const legacy = await legacyRender(
      await importEmail(resolve("test/emails-precompile/event-confirmation/email.tsx"))
    );
    assert.strictEqual(await readFile(resolve(this.output, "event-confirmation/html.mustache"), "utf8"), legacy.html);
  }
}
